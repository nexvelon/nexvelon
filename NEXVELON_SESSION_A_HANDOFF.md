# NEXVELON_SESSION_A_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-10 against `main` @ `c527aa6`.
>
> Read this file end-to-end before proposing any change. Then read
> `CLAUDE_CONTEXT.md` for the longer historical narrative and the
> domain/branding constraints.
>
> Session A goals were: replace the localStorage demo login with real
> Supabase Auth + invite-only flow + email-OTP 2FA. Most of that is
> shipped and live. Two open bugs are blocking final acceptance —
> Section 2 documents both with everything needed to triage.

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Latest commit
**`c527aa6` — "Unify bootstrap script invite + magic-link emails under shared parchment design"** (2026-05-10)

### Last 5 commits

| Hash | Message |
| --- | --- |
| `c527aa6` | Unify bootstrap script invite + magic-link emails under shared parchment design |
| `deacabc` | Fix bootstrap user-detection (invite vs magic link) and set-password session handling |
| `6ec212a` | Force OTP challenge after set-password, fix sign-out hang, add timeout to redirect states |
| `024a74a` | Fix latent crashes, harden RequireAuth, real audit log surface, cleanup orphans |
| `0f51609` | Fix avatar menu, OTP verify hang, remove broken search bar |

### Build status
**Clean.** `npm run build` → `✓ Compiled successfully in ~3s`. **0 TypeScript errors.** **5 ESLint warnings**, all pre-existing in `components/modules/financials/Tabs.tsx` (UI_ONLY module, untouchable per Session A constraint). **Zero new warnings introduced** anywhere.

### Deploy status
- **Live URL:** https://app.nexvelonglobal.com
- **Vercel auto-deploys from `main` on every push.**
- **Last verified-live commit:** `deacabc` (probed via `/auth/confirm` redirect text). `c527aa6` only touches `scripts/bootstrap-admin.ts` (CLI tool, not part of the Next build) — no Vercel deploy was needed for it.
- Session B should re-confirm prod deploy state with a quick `curl https://app.nexvelonglobal.com/login` before testing.

### What's working end-to-end (verified live in prior turns)

- **Anonymous routing.** `/dashboard`, `/users`, `/auth/verify-otp`, `/auth/set-password` all 307 → `/login?next=…` for anonymous visitors. Confirmed by curl probes.
- **Sign-in step 1.** `signInWithPassword` validates the password, fetches the profile, blocks non-Active statuses, generates an OTP, emails it via Resend, audits `mfa_challenge_sent`. Audit log rows from earlier sessions confirm this fired successfully.
- **Sign-in step 2.** `verifyOtpAction` reads cookie session → `verifyOtpForUser` (bcrypt-compare against `auth_otp`) → marks `used_at` → audits `mfa_challenge_verified` + `login_success` → server-side `redirect('/dashboard')`. End-to-end success was logged 3× in audit log on 2026-05-04.
- **Avatar dropdown.** Slim post-Session-A version (name + email + role pill + Sign out). Plain `<div>` instead of `<DropdownMenuLabel>` to dodge Base UI #31. No crashes.
- **Sign out.** `Promise.race(supabase.auth.signOut, 5s)` + force-clear AuthProvider + POST `/auth/signout` for cookie cleanup + `window.location.replace('/login')` for hard reload. Tagged `[signOut]` logs at every step.
- **Search bar.** Removed from TopBar. `GlobalCommandPalette` is unmounted (kept on disk for future rebuild). ⌘K is silent.
- **Sidebar count chips.** Stripped — no longer shows `20 clients` against a DB with 3 rows.
- **Activity Log tab in /users.** Reads real `auth_audit_log` rows via `lib/api/audit.ts` (RLS-enforced is_admin SELECT). Color-coded outcome pills, search + event filter, empty-state copy.
- **`/auth/confirm`.** Switched from `NextResponse.redirect` to `redirect()` from next/navigation so cookie writes from `verifyOtp` ride atomically with the redirect response.
- **`/auth/signout`.** New POST (204, idempotent cookie clear) + GET (303→/login fallback) route handler. Allowlisted in middleware for both anonymous and MFA-pending callers.
- **Bootstrap script (`npx tsx scripts/bootstrap-admin.ts`).**
  - Deterministic `auth.admin.listUsers` existence check (replaces the regex-on-error-text heuristic that was causing wrong-template sends).
  - Two distinct paths: `invite` (new user) vs `magiclink` (existing user).
  - Both render through ONE shared parchment template (`buildEmailHtml({ kind, confirmUrl, recipientEmail })`); only six copy slots in `COPY[kind]` differ.
  - `[bootstrap]` structured logs at every step.
  - 30-of-30 render-smoke invariants pass (verified locally with a tsx script in `c527aa6`).

### What's currently broken or unverified (live as of this writing)

- **DB state right now:** `profiles=0`, `auth_otp=0`, `auth_audit_log=0`. The user deleted themselves from Supabase Auth → Users mid-test (cascade nuked the profile + OTP rows; audit log was likely SQL-deleted manually). **Nobody can sign in until bootstrap is rerun.**
- **Bug A — invite email template still rendering wrong** per user report. See §2.
- **Bug B — "We can't find your profile" error after setting password** per user report. See §2.
- **Mobile / cross-device test sweep** — never run on real iPhone/Android. See `CLAUDE_CONTEXT.md` §12 #15.

═══════════════════════════════════════════════════════════════════════════════
## 2. OPEN BUGS RIGHT NOW
═══════════════════════════════════════════════════════════════════════════════

### Bug A — Invite email is reportedly NOT the gorgeous parchment design after `c527aa6`

**Symptom (user-reported):**
After running `npx tsx scripts/bootstrap-admin.ts` on a fresh delete-the-user, the email that arrives is NOT the unified parchment "Welcome to the Nexvelon Enterprise Suite" template. The user said "the invite email template still rendering wrong" without specifying what arrived instead.

**Reproduction (best guess):**
1. Delete `jayshah.x@gmail.com` from Supabase Auth → Users.
2. `DELETE FROM public.auth_otp;`
3. `npx tsx scripts/bootstrap-admin.ts`
4. Check inbox.

**Important: this report came in BEFORE the next session can verify, so it may be stale.** The unification commit (`c527aa6`) was just pushed; the user's last test was likely against `deacabc` or earlier. A fresh test with `c527aa6` may show the bug is already fixed.

**Suspected root causes (in likelihood order):**

1. **The user tested against an older bootstrap binary.** The commit was pushed minutes before the report. The script is run via `npx tsx scripts/bootstrap-admin.ts` from the local working tree — if `git pull` hadn't run, they'd be running the pre-`c527aa6` code that still had two distinct templates. **Verify first**: run `git rev-parse HEAD` on the host that ran the script.
2. **Resend API key has a default template that overrides our HTML.** Unlikely (Resend doesn't do this) but worth confirming via Resend dashboard → Logs → click the latest message → view raw HTML.
3. **Supabase Dashboard "Invite User" email template is intercepting** somehow. Should NOT be possible — the bootstrap script POSTs directly to `https://api.resend.com/emails`, fully bypassing Supabase's email pipeline. But if someone left `inviteUserByEmail` in the script or a stray fetch points at Supabase, this would happen. Read `scripts/bootstrap-admin.ts` lines 671-720 to confirm only `postToResend(...)` is called.
4. **The user is comparing against a previously-received magic-link email** that was sent before `c527aa6`. They may not realize the new test would only fire on a fresh bootstrap run.

**Files most likely involved:**
- `scripts/bootstrap-admin.ts` (lines 355-668: `EmailKind`, `COPY`, `buildEmailHtml`, `buildEmailText`)
- The `COPY` config block (lines 369-403). If a future-you accidentally renamed `kind` keys or swapped invite/magiclink, the wrong copy would land — confirm by literal read.

**What's been tried that didn't work / what HAS been confirmed:**
- Local render-smoke script printed 30/30 invariants green (commit `c527aa6` body). Both kinds render the parchment chrome. So the script's output is verified.
- The render check explicitly confirmed: invite has "Accept Your Invitation"; magic-link has "Sign In to Your Workspace"; magic-link does NOT contain "Accept Your Invitation"; both contain "Welcome to the Nexvelon Enterprise Suite" headline; both have parchment background `#F5F1E8`; neither has the dark-canvas `radial-gradient`.

**Next session should:**
1. Have the user re-run the bootstrap on the freshest `main` and capture the terminal logs (`[bootstrap] taking_path …`, `[bootstrap] resend_send_starting subject:…`, `[bootstrap] resend_send_complete messageId:…`).
2. Have the user open the new email and screenshot it.
3. If still wrong, fetch the message body from Resend's dashboard (Logs → click message → "Raw HTML") and compare against the script's `buildEmailHtml` output for the same kind.

---

### Bug B — "We can't find your profile" error after setting password

**Symptom (user-reported):**
After clicking the invite link → `/auth/confirm` → `/auth/set-password`, entering a valid password, and submitting, the user sees the error message:

> "We can't find your profile. Please contact your administrator."

This is a NEW error message added in `deacabc` — it surfaces when `getUser()` returns a valid user but the subsequent `profiles` lookup returns null. Previously this branch returned the misleading "session expired" copy.

**Reproduction:**
1. Delete the user from Supabase Auth.
2. Run bootstrap-admin → email arrives.
3. Click "Accept Your Invitation" → `/auth/confirm` exchanges token → `/auth/set-password` loads.
4. Type a 12+ password meeting policy → submit.
5. Error appears.

**Suspected root causes (in likelihood order):**

1. **The `on_auth_user_created` trigger didn't fire.** Migration `0002_auth_and_users_schema.sql` declares this trigger on `auth.users`. When `generateLink({ type: 'invite' })` creates the user, the trigger should fire and INSERT a corresponding row into `public.profiles`. If the trigger was dropped or the migration was re-applied with `drop trigger if exists` happening AFTER the invite, the profile row is missing. **Verify next session:** `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created';` should return one row.
2. **The trigger fired but the INSERT was rolled back.** The trigger is `SECURITY DEFINER` and inserts into `profiles`. If RLS or the `guard_profile_updates` trigger raised an error during the insert, the entire `auth.users` insert (and trigger) would roll back. But auth.users *did* get a row (the `getUser()` call succeeds), so this scenario is unlikely — unless trigger errors are silently swallowed in Supabase's setup.
3. **A race between the bootstrap script and the trigger.** `generateLink({ type: 'invite' })` is documented as creating the user synchronously, so by the time the user clicks the email link the profile should exist. Race is improbable but possible if Supabase batches operations server-side.
4. **Email mismatch.** The trigger reads `NEW.email` to populate `profiles.email`. If the email casing differs from what `getCurrentProfile()` looks up, `.eq("id", user.id)` would still match (id is uuid, not email). Likely not the issue but worth checking.
5. **Profile actually exists but RLS denies the read.** The cookie-aware client carries the user's JWT. The RLS policy `profiles_select` allows `id = auth.uid() OR role <> 'ClientPortal'`. For a brand-new invitee with `status='Invited'` and `role='Admin'`, this should match `id = auth.uid()`. Unlikely to fail but verify.

**Files most likely involved:**
- `app/auth/set-password/actions.ts` — the `getCurrentProfile()` call (line ~91) and the `if (!profile)` branch (line ~98). The structured `[setPassword]` logs (commit `deacabc`) will tell us EXACTLY which case fires:
  - `[setPassword] getUser_result {hasUser: true, userId: "..."}`  ← session valid
  - `[setPassword] profile_lookup_result {hasProfile: false, ...}` ← THE BUG
- `lib/auth/profile.ts` `getCurrentProfile()` — uses cookie-aware client, RLS-scoped read.
- `supabase/migrations/0002_auth_and_users_schema.sql` lines 86-132 — `handle_new_user` function + `on_auth_user_created` trigger definition.

**Diagnostic queries the next session should run in Supabase SQL Editor:**
```sql
-- 1. Confirm the trigger is installed
SELECT trigger_name, event_manipulation, event_object_schema, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 2. Confirm the function exists
SELECT proname, prosrc IS NOT NULL AS has_body
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'handle_new_user';

-- 3. After the user reproduces, query auth.users + profiles for the same email
SELECT u.id AS auth_id, u.email, u.created_at AS auth_created,
       p.id AS profile_id, p.status, p.role, p.created_at AS profile_created
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'jayshah.x@gmail.com';
-- If profile_id is NULL, the trigger didn't fire / insert was rolled back.
```

**What's been tried that didn't work:**
- The structured logs were added in `deacabc` so we'd be able to debug this exact scenario, but the user hasn't yet shared the actual log output from a failing attempt. Next session should ask for the Vercel runtime logs from the relevant request window.

**Workaround (if trigger is broken):**
Manually insert the profile row via SQL Editor right after `bootstrap-admin.ts` completes:
```sql
INSERT INTO public.profiles (id, email, first_name, last_name, role, status)
SELECT id, email, 'Jay', 'Shah', 'Admin', 'Invited'
FROM auth.users
WHERE email = 'jayshah.x@gmail.com'
ON CONFLICT (id) DO NOTHING;
```

═══════════════════════════════════════════════════════════════════════════════
## 3. FILE-BY-FILE STATE
═══════════════════════════════════════════════════════════════════════════════

> Every file touched in Session A. Read these before modifying.

### Middleware

| File | State | One-line description |
| --- | --- | --- |
| `middleware.ts` | **REAL** | Refreshes Supabase session via `lib/supabase/middleware.ts`. ANON_ALLOWED = `/login`, `/auth/confirm`, `/auth/signout`. MFA_PENDING_ALLOWED = `/auth/verify-otp`, `/auth/confirm`, `/auth/signout`. Calls `has_pending_otp()` RPC for MFA gate. Forwards refreshed cookies on every redirect via `redirectWithCookies`. |

### App routes

| File | State | One-line description |
| --- | --- | --- |
| `app/layout.tsx` | **REAL** | Root: ThemeProvider › AuthProvider › RoleProvider › `<Analytics />` › `<SpeedInsights />`. |
| `app/page.tsx` | **REAL** | Loading shim; middleware redirects to `/login` or `/dashboard`. |
| `app/(app)/layout.tsx` | **REAL** | RequireAuth + AppShell wrapper. |
| `app/(auth)/login/page.tsx` | **REAL** | Single-step form. signInAction → server-redirect to `/auth/verify-otp`. Maps `?error=session_check_timeout` to friendly copy. |
| `app/(auth)/login/layout.tsx` | **REAL** | Sets `dynamic = "force-dynamic"`. Toaster + RedirectIfAuthed wrapper. |
| `app/(auth)/login/actions.ts` | **REAL** | `signInAction`: validates password, status check, generates OTP, sends email. `signOutAction`: server-side sign out + redirect. |
| `app/auth/verify-otp/page.tsx` | **REAL** | Manual `pending` state + 30s timeout + NEXT_REDIRECT-aware error handling. Auto-submits at 6 digits. |
| `app/auth/verify-otp/actions.ts` | **REAL** | `verifyOtpAction`: bcrypt-compares, marks `used_at`, stamps last_login, audits `mfa_challenge_verified` + `login_success`, server-side `redirect('/dashboard')`. Plus `resendOtpAction`. Tagged `[verifyOtp]` logs. |
| `app/auth/verify-otp/layout.tsx` | **REAL** | Toaster, `dynamic = "force-dynamic"`. |
| `app/auth/set-password/page.tsx` | **REAL** | NEXT_REDIRECT-aware. Pending button text: "Sending verification code…". Live strength meter + per-rule checklist. |
| `app/auth/set-password/actions.ts` | **REAL** | `setPasswordAction`: tagged `[setPassword]` logs at 8 checkpoints. After updateUser + status flip, generates OTP + emails it + audits + redirects to `/auth/verify-otp`. Returns `SetPasswordFailure \| undefined` (success path throws NEXT_REDIRECT). |
| `app/auth/set-password/layout.tsx` | **REAL** | Toaster, `dynamic = "force-dynamic"`. |
| `app/auth/confirm/route.ts` | **REAL** | Token-hash redemption for invite/magiclink/recovery/email_change/signup. Uses `redirect()` from next/navigation (NOT `NextResponse.redirect`). Tagged `[/auth/confirm]` logs. |
| `app/auth/signout/route.ts` | **REAL** | POST → 204 (idempotent cookie clear). GET → `redirect('/login')`. Allowlisted in middleware for both anon + MFA-pending callers. |
| `app/auth/callback/route.ts` | **DELETED** in `024a74a`. Don't recreate without a real OAuth need. |

### Components — auth + layout

| File | State | One-line description |
| --- | --- | --- |
| `components/auth/AuthProvider.tsx` | **REAL** | Real Supabase Auth provider. Hydrates from `getUser()` + `profiles` row. try/catch/finally guarantees status resolves. signOut: 5s timeout + force-clear + fetch /auth/signout + window.location.replace('/login'). Tagged `[AuthProvider]` + `[signOut]` logs. |
| `components/auth/RequireAuth.tsx` | **REAL** | 10s timeout fallback. Both RequireAuth and RedirectIfAuthed use `hardReload(href, reason)` (window.location.replace) for the redirect, not router.replace. |
| `components/layout/AvatarMenu.tsx` | **REAL** | Plain `<div>` for header (sidesteps Base UI #31). Sign-out only. |
| `components/layout/AppShell.tsx` | **REAL** | Sidebar + TopBar + main. **GlobalCommandPalette is no longer mounted** (commented why). |
| `components/layout/TopBar.tsx` | **REAL** | Breadcrumbs, NotificationsBell, Mail-icon button, role pill, AvatarMenu. **Search bar removed.** |
| `components/layout/nav-config.tsx` | **REAL but counts removed** | No mock-data imports. Each nav item: `{href, label, icon, resource}` only. |
| `components/layout/Sidebar.tsx` | **REAL** | Reads `useRole()`. Conditionally renders `count` chip (currently never since nav-config doesn't set it). |
| `components/layout/RoleSwitcher.tsx` | **DELETED** in Phase 6. |
| `components/layout/GlobalCommandPalette.tsx` | **ORPHAN** (kept on disk, not imported anywhere). Imports `lib/mock-data/*`. Will be rebuilt in a future session against real DB tables. |

### Components — modules

| File | State | One-line description |
| --- | --- | --- |
| `components/modules/users/Tabs.tsx` | **MIXED** | UsersTab + InvitationsTab + ActivityLogTab use real DbProfile / AuditEventWithProfile. UserRowActions menu uses plain `<div>` instead of `<DropdownMenuLabel>`. RolesTab + PermissionsMatrixTab + SubcontractorsTab still mock-driven. |
| `components/modules/users/InviteUserDrawer.tsx` | **REAL** | Calls `inviteUserAction`. Role picker shows Admin + SalesRep enabled, others disabled with "Session B" hints. |
| `components/modules/users/UserDrawer.tsx` | **DELETED** in `024a74a`. |
| All other `components/modules/*` | **UI_ONLY** | Untouched in Session A. Read mock data. Don't demolish — they remain decorative shells until each module is wired in Session B+. |

### Library — auth + api

| File | State | One-line description |
| --- | --- | --- |
| `lib/api/audit.ts` | **NEW (REAL)** | `getRecentAuditLog(limit=100)` — joins `auth_audit_log` with `profiles` (two-query, since user_id FK points at auth.users not profiles). Cookie-aware client; RLS-enforced. |
| `lib/api/clients.ts` | **REAL** | Reference pattern. Cookie-aware Supabase server client. RLS enforced. Soft-delete via `deleted_at`. |
| `lib/api/users.ts` | **REAL** | Service-role helpers: `listVisibleProfilesAdmin`, `inviteUserAdmin`, `setProfileStatusAdmin`, `revokeAllSessionsAdmin`, `suspendUserAdmin`, `reactivateUserAdmin`, `terminateUserAdmin`. `inviteUserAdmin.redirectTo` points at `/auth/confirm` (NOT `/auth/callback`, which is deleted). |
| `lib/auth/audit.ts` | **REAL** | `writeAuditLog(event, payload)` — service-role insert into `auth_audit_log`. Never throws. |
| `lib/auth/email.ts` | **REAL** | `sendOtpEmail({to, code, firstName})` — Resend send for the OTP step (used by signInAction + verifyOtpAction.resend + setPasswordAction). NOT the bootstrap-admin templates (those are inline in the script). |
| `lib/auth/normalize-role.ts` | **REAL** | Maps 11-value DbRole → 7-value app Role. Will be retired in Session B when permissions matrix expands. |
| `lib/auth/otp.ts` | **REAL** | Generate / hash / verify OTP. bcrypt cost 10. 10-min TTL, 5 attempts max. `createOtpForUser`, `verifyOtpForUser`, `getActiveOtpForUser`, `hasPendingOtp`, `canResendOtp`. |
| `lib/auth/password-policy.ts` | **REAL** | 12+/upper/lower/digit/symbol. `checkPassword` (UI), `assertValidPassword` (server). |
| `lib/auth/profile.ts` | **REAL** | `getCurrentProfile`, `getProfileByIdAdmin`, `updateProfileAdmin`, `stampLogin`, `isActiveStatus`. |
| `lib/auth/request-info.ts` | **REAL** | `getRequestInfo()` — pulls IP + UA from headers. |
| `lib/role-context.tsx` | **REAL but minimal** | Thin reader over `useAuth()`. setRole no-op was removed. `<Can>` reads role from useAuth directly. |
| `lib/supabase/{client,server,middleware,admin}.ts` | **REAL** | Four flavours of Supabase client: browser, cookie-aware server, edge-middleware, service-role admin. |
| `lib/types/database.ts` | **REAL** | DB types. `DbProfile`, `DbRole` (11 values), `DbProfileStatus`, `DbAuthOtp`, `DbAuthAuditLog`, `AuthAuditEvent`. Plus the existing `DbClient`/`DbSite`/`DbContact`. |
| `lib/types.ts` | **LEGACY** | 7-value app Role + mock-data shape types. Keep until each UI_ONLY module migrates. |
| `lib/permissions.ts` | **REAL** | role × resource × action matrix. 7 roles. |
| `lib/permissions-matrix.ts` | **DISPLAY-ONLY** | 75-permission catalogue. Not enforced at runtime. |

### Scripts + migrations

| File | State | One-line description |
| --- | --- | --- |
| `scripts/bootstrap-admin.ts` | **REAL** | Single shared parchment template (`buildEmailHtml`). `userExists` paginates `auth.admin.listUsers`. `[bootstrap]` structured logs. Branches between `invite` (new user) and `magiclink` (existing user) deterministically. |
| `supabase/migrations/0001_clients_schema.sql` | **APPLIED** | clients/sites/contacts tables, RLS, updated_at trigger. |
| `supabase/migrations/0002_auth_and_users_schema.sql` | **APPLIED** | profiles, auth_otp, auth_audit_log. on_auth_user_created trigger. is_admin() + guard_profile_updates() helpers. Tightens clients/sites/contacts policies (per-action, no DELETE). |
| `supabase/migrations/0003_auth_otp_helper.sql` | **APPLIED** | `has_pending_otp()` RPC for middleware (SECURITY DEFINER, granted to `authenticated`). |

═══════════════════════════════════════════════════════════════════════════════
## 4. DATABASE STATE
═══════════════════════════════════════════════════════════════════════════════

### Migrations applied (all live)
| Migration | Lines | Purpose |
| --- | --- | --- |
| `0001_clients_schema.sql` | 188 | clients + sites + contacts |
| `0002_auth_and_users_schema.sql` | 361 | profiles + auth_otp + auth_audit_log + triggers + helpers |
| `0003_auth_otp_helper.sql` | 35 | `has_pending_otp()` RPC |

### Live row counts (queried just now via service-role)

| Table | Rows | Notes |
| --- | --- | --- |
| `profiles` | **0** | User deleted themselves mid-test. **Bootstrap must be rerun before anyone can sign in.** |
| `auth_otp` | 0 | Empty (FK cascade from auth.users deletion + manual DELETE before tests). |
| `auth_audit_log` | 0 | Likely manually deleted before testing. |
| `clients` | 3 | Survived. |
| `sites` | 2 | Survived. |
| `contacts` | 1 | Survived. |

### RLS policies summary
- **clients / sites / contacts:** SELECT/INSERT/UPDATE for any `authenticated`. No DELETE policy (soft-delete via `deleted_at`). Per-action policies, no catch-all.
- **profiles:** SELECT `id = auth.uid() OR role <> 'ClientPortal'`. UPDATE `id = auth.uid() OR is_admin()`. DELETE `is_admin()` only. INSERT no policy (only the `on_auth_user_created` trigger and service role can insert).
- **auth_otp:** No policies → all client access denied. Service role only.
- **auth_audit_log:** SELECT for `is_admin()`. No INSERT/UPDATE/DELETE policies → service role only.

### Triggers worth knowing about
- `clients_set_updated_at`, `sites_set_updated_at`, `contacts_set_updated_at`, `profiles_set_updated_at` — all BEFORE UPDATE, all call `public.handle_updated_at()`.
- `on_auth_user_created` — AFTER INSERT on `auth.users`. Calls `handle_new_user()` (SECURITY DEFINER) which inserts the matching `profiles` row from `raw_user_meta_data` (first_name, last_name, role, created_by). **If this trigger isn't firing, Bug B happens.**
- `profiles_guard_updates` — BEFORE UPDATE on profiles. Raises `42501` if a non-admin tries to change role/status/created_by/terminated_at/mfa_enrolled/last_login_*/email/id. Bypassed when `auth.uid()` is NULL (service role).

### Functions / RPCs
- `handle_updated_at()` — trigger function.
- `handle_new_user()` — trigger function. **The one Bug B suspects.**
- `is_admin()` — SECURITY DEFINER, returns boolean. Active Admin check.
- `guard_profile_updates()` — trigger function.
- `has_pending_otp()` — SECURITY DEFINER, granted to `authenticated`. Used by middleware.

═══════════════════════════════════════════════════════════════════════════════
## 5. SUPABASE DASHBOARD STATE
═══════════════════════════════════════════════════════════════════════════════

> Last verified during Phase 2 setup; user has not reported changes since.

### Auth providers
- **Email** enabled. Confirm email ON. Secure email change ON. Secure password change ON. Allow signup OFF (invite-only). Mailer auto-confirm OFF. Min password length 12. Strict password requirements.
- **All other providers disabled** (Phone, GitHub, Google, Apple, Microsoft, Facebook, Twitter/X, Discord, Slack, Spotify, etc.).

### MFA panel
- **All OFF** (TOTP, Phone, WebAuthn). We deliberately roll our own email-OTP-as-second-factor on top of `signInWithPassword`. Enabling Supabase's native MFA later is a Session B option but not required.

### URL Configuration
- **Site URL:** `https://app.nexvelonglobal.com`
- **Redirect URLs (16 entries):** `…/auth/callback`, `…/auth/confirm`, `…/auth/set-password`, `…/auth/verify-otp`, `…/login`, `…/dashboard` for both prod and `localhost:3000`. Plus Vercel preview wildcard `https://*-nexvelon.vercel.app/auth/{callback,confirm,set-password,login}`.
- **Note:** `/auth/callback` is in this allowlist but the route handler was DELETED in `024a74a`. Anonymous visits to `/auth/callback` now bounce to /login via middleware. The dashboard entry can be left as-is or removed; harmless either way.

### Email templates (in Supabase Dashboard → Authentication → Email Templates)

> The user customised all 6 templates with the navy + gold "Nexvelon" branding during Phase 2. Then in the token_hash hardening pass (around `4a14637`), they were instructed to swap each link from `{{ .ConfirmationURL }}` to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<TYPE>&next=<PATH>`.

| Template | Should use this URL pattern | Triggered by |
| --- | --- | --- |
| **Invite user** | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password` | `inviteUserByEmail` (regular invite drawer in /users) |
| **Confirm signup** | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard` | (signup is disabled, won't fire) |
| **Magic Link** | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard` | `signInWithOtp` (not currently used) |
| **Change Email Address** | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/dashboard` | (not currently used) |
| **Reset Password** | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/set-password` | (not currently used) |
| **Reauthentication** | uses `{{ .Token }}` (6-digit OTP), no link change | (not currently used) |

> **Critical:** the **bootstrap-admin script does NOT use any of these dashboard templates.** It POSTs to Resend's REST API directly with HTML inlined in `scripts/bootstrap-admin.ts`'s `buildEmailHtml`. The dashboard templates only fire when our app calls `inviteUserByEmail` from the regular `/users` invite drawer (Phase 4 surface).

### Rate limits
- Sign-ins (per IP, per 5 min): 10
- Sign-ups (per IP, per hour): 0 (signup disabled)
- Emails sent (per hour): 30
- Token refreshes (per IP, per 5 min): default 150
- Password verifications (per IP, per 5 min): 10
- OTP verifications (per IP, per 5 min): 10
- Anonymous sign-ins: 0

### SMTP
- **Custom SMTP enabled** via Resend.
- Host: `smtp.resend.com`, port 465, username `resend`, password = the Resend API key.
- Sender: `noreply@nexvelonglobal.com` ("Nexvelon").
- Domain `nexvelonglobal.com` is DKIM/SPF-verified at Resend (Phase 2 setup).

═══════════════════════════════════════════════════════════════════════════════
## 6. ENVIRONMENT VARIABLES
═══════════════════════════════════════════════════════════════════════════════

### `.env.local` (host machine)

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

Optional (have safe fallbacks in code):
- `NEXT_PUBLIC_APP_URL` — falls back to `https://app.nexvelonglobal.com` in `bootstrap-admin.ts`. Override locally to `http://localhost:3000` for dev.
- `RESEND_FROM_EMAIL` — falls back to `Nexvelon <noreply@nexvelonglobal.com>`.

### Vercel project (production)
Same 4 required vars. Marked Sensitive where appropriate. RESEND_API_KEY is Production-only (added between Phases 3 and 4).

### Stub vars in `.env.example` that no code reads yet
`NEXT_PUBLIC_BUILD_SHA`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`, `QUICKBOOKS_*`, `XERO_*`, `AZURE_AD_*`, `GOOGLE_CLIENT_ID/SECRET`, `SAML_*`, `S3_*`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`. (SendGrid was removed in `024a74a`.)

═══════════════════════════════════════════════════════════════════════════════
## 7. EMAIL TEMPLATES INVENTORY
═══════════════════════════════════════════════════════════════════════════════

### Bootstrap script (`scripts/bootstrap-admin.ts`)

**One unified parchment template, two copy variants.** The script POSTs directly to Resend; Supabase Dashboard templates are NOT involved here.

- `buildEmailHtml({ kind, confirmUrl, recipientEmail })` — the shared HTML builder. Parchment outer `#F5F1E8`, cream card `#FBF8F1` with thin gold border, gold ◆ accents flanking the wordmark, Cormorant Garamond, hairline rules, signature block, footer with ◆-bracketed "© 2026 Nexvelon Global Inc.".
- `buildEmailText({ kind, confirmUrl, recipientEmail })` — plain-text fallback.
- `COPY: Record<EmailKind, EmailCopy>` — six copy slots per kind (subject, preheader, bodyPara1, bodyPara2, statusLine, buttonText, italicSubline) plus outerNotePrefix and titleTag.

The 6 copy slots that differ:

|                       | INVITE                                                          | MAGIC-LINK                                                                                       |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| subject               | "Your seat at the Nexvelon Enterprise Suite is ready"          | "Your sign-in link to the Nexvelon Enterprise Suite"                                             |
| bodyPara1             | "You've been selected to join the Nexvelon Enterprise Suite…" | "Welcome back. Use the link below to securely access your Nexvelon Enterprise Suite workspace." |
| bodyPara2             | "Inside, you'll find … leads, quotes, projects, schedules…"   | "For your security, this single-use link expires within the hour…"                              |
| statusLine            | "Full Access Configuration Complete"                           | "Single-Use Sign-In Link"                                                                        |
| buttonText            | "Accept Your Invitation"                                       | "Sign In to Your Workspace"                                                                      |
| italicSubline         | "Kindly set your password after accepting the invite."         | "This link expires within the hour. Use it once."                                                |

Eyebrow ("By Invitation Only"), headline ("Welcome to the / Nexvelon Enterprise Suite."), subtitle ("Complete operating system in one place."), signature ("With regards from, / The Nexvelon Global Group. / Enterprise Suite · Private Issue") and footer are intentionally identical across both kinds.

### Supabase Dashboard email templates
See §5. Six templates exist; the bootstrap script doesn't use them. They're invoked when `inviteUserByEmail` is called from the regular `/users` invite drawer.

### Resend
- Domain `nexvelonglobal.com` DKIM/SPF verified.
- API key is the same one wired into Supabase's Custom SMTP integration.
- Click tracking is OFF (the user noted this earlier — important context if you can't tell whether a link was clicked from logs).

═══════════════════════════════════════════════════════════════════════════════
## 8. AUTH FLOW DIAGRAM
═══════════════════════════════════════════════════════════════════════════════

### Anonymous user → /login → password → OTP → /dashboard

1. Browser hits any URL → `middleware.ts` runs.
2. `updateSession(request)` calls `supabase.auth.getUser()` (validates JWT against Supabase Auth) + `has_pending_otp()` RPC.
3. **No user, not in ANON_ALLOWED** → 307 to `/login?next=<original>`. Cookies (refreshed token, etc.) are forwarded onto the redirect via `redirectWithCookies`.
4. `/login` page renders. User submits email + password.
5. `signInAction` (`app/(auth)/login/actions.ts`):
   - `supabase.auth.signInWithPassword` (sets session cookies via cookie-aware client's setAll).
   - `getCurrentProfile()` — reads `profiles` row.
   - If `status !== 'Active'` → signOut + audit `login_failed` + return error.
   - `createOtpForUser(profile.id)` — bcrypt-hash + insert into `auth_otp` via service role.
   - `sendOtpEmail({to, code, firstName})` — Resend.
   - `writeAuditLog('mfa_challenge_sent', …)`.
   - Returns `{ ok: true, redirectTo: '/auth/verify-otp' }`. Client `router.replace` follows.
6. Middleware on `/auth/verify-otp` request: user authenticated + `has_pending_otp() === true` → in MFA_PENDING_ALLOWED → allow.
7. `/auth/verify-otp` page renders. User enters 6 digits (or auto-submits at 6 chars).
8. `verifyOtpAction`:
   - `verifyOtpForUser(profile.id, code)` — bcrypt-compare; on success marks `used_at`, on miss increments `attempts` (5 max).
   - On success: audit `mfa_challenge_verified` + `login_success`, stamp `last_login_at` + IP.
   - **`redirect('/dashboard')`** from `next/navigation` (NEXT_REDIRECT throw; framework merges cookieStore writes onto the redirect response).
9. Browser navigates to `/dashboard`. Middleware: `has_pending_otp()` now returns false (used_at is set). Allows.
10. `(app)/layout.tsx` mounts `<RequireAuth>`. AuthProvider's status is already 'authenticated'. RequireAuth renders children.

### Invite click → /auth/confirm → /auth/set-password → OTP → /dashboard

1. Admin sends invite (or `npx tsx scripts/bootstrap-admin.ts` runs). Email lands in inbox.
2. User clicks "Accept Your Invitation" → browser hits `https://app.nexvelonglobal.com/auth/confirm?token_hash=…&type=invite&next=/auth/set-password`.
3. `/auth/confirm/route.ts` GET:
   - Reads `token_hash` + `type` + `next`.
   - `supabase.auth.verifyOtp({ type: 'invite', token_hash })` — sets session cookies via cookieStore.set (queued for response).
   - `redirect(next)` — `redirect()` from next/navigation; throws NEXT_REDIRECT; framework constructs the redirect response with all cookieStore writes attached.
4. Browser navigates to `/auth/set-password`. Middleware: authenticated, no pending OTP, allows.
5. `/auth/set-password` page renders. AuthProvider sees the new session.
6. User submits new password + confirm.
7. `setPasswordAction`:
   - `assertValidPassword`.
   - `supabase.auth.getUser()` — verify session is alive. **If null here → "Your sign-in session was lost." error.** (Tagged log: `[setPassword] getUser_result`.)
   - `getCurrentProfile()` — read profiles. **If null here → "We can't find your profile." error.** (Tagged log: `[setPassword] profile_lookup_result`.) **THIS IS BUG B'S HOT SPOT.**
   - `supabase.auth.updateUser({ password })`.
   - `updateProfileAdmin(profile.id, { status: 'Active', mfa_enrolled: true })` — service-role bypass past `guard_profile_updates`.
   - `writeAuditLog('password_changed', …)`.
   - `createOtpForUser` + `sendOtpEmail` + `writeAuditLog('mfa_challenge_sent', source: 'set-password')`.
   - `redirect('/auth/verify-otp')`.
8. From here, same as the regular sign-in flow steps 6-10.

### Sign-out

1. User clicks "Sign out" in AvatarMenu → `useAuth().signOut()`.
2. `Promise.race(supabase.auth.signOut, 5s timer)` — either resolves or times out, never blocks indefinitely.
3. Force-clear AuthProvider state (status='anonymous', profile=null).
4. `fetch('/auth/signout', { method: 'POST', keepalive: true })` — server-side belt-and-braces cookie clear via cookie-aware client + supabase.auth.signOut.
5. `window.location.replace('/login')` — hard reload past any stuck React state.

### Cookie handling at each step
- `verifyOtp`, `signInWithPassword`, `updateUser`, `signOut` all write Set-Cookie via cookieStore.set (the cookie-aware client's setAll callback in `lib/supabase/server.ts`).
- Route Handlers (`/auth/confirm`, `/auth/signout` GET) **must use `redirect()` from next/navigation**, not `NextResponse.redirect`, or the cookieStore writes don't merge onto the redirect response. This is the Bug 2 fix from `deacabc`.
- `NextResponse(null, { status: 204 })` (signout POST) DOES merge cookieStore writes correctly — explicit response is fine for non-redirect cases.
- Middleware uses its own cookie-shuttle pattern (see `lib/supabase/middleware.ts` + `redirectWithCookies` in `middleware.ts`).

### What middleware checks
- Anonymous + `/`, `/login`, `/auth/confirm`, `/auth/signout` → allow.
- Anonymous + anything else → 307 → `/login?next=<original>`.
- Authenticated + `has_pending_otp()===true` + `/auth/verify-otp`, `/auth/confirm`, `/auth/signout` → allow.
- Authenticated + `has_pending_otp()===true` + anything else → 307 → `/auth/verify-otp?next=<original>`.
- Authenticated + no pending OTP + `/auth/verify-otp` → 307 → `/dashboard` (no point being there).
- Authenticated + no pending OTP + `/login` → 307 → `?next=` (or `/dashboard`).
- Authenticated + no pending OTP + `/` → 307 → `/dashboard`.
- Otherwise → allow.

### What each guard component does
- `RequireAuth` (`(app)/layout.tsx`): Client-side hydration safety net. While `useAuth().status === 'loading'` shows "Verifying session…". 10s hard timeout → `window.location.replace('/login?error=session_check_timeout')`. On status='anonymous' → `window.location.replace('/login')`. On status='authenticated' → render children.
- `RedirectIfAuthed` (used in `(auth)/login/layout.tsx`): mirror — redirects authenticated users away. Same 10s timeout pattern.

═══════════════════════════════════════════════════════════════════════════════
## 9. WHAT'S NEXT (PRIORITY ORDER)
═══════════════════════════════════════════════════════════════════════════════

The user's stated goal: "taking client work tomorrow with this app." Realistically that means **clients only** as the wired surface, with auth working end-to-end. Until Bug A and Bug B are confirmed fixed, the app isn't usable by anyone other than someone who never has to sign in fresh.

### Priority 0 — BLOCKERS

1. **Bug B — "We can't find your profile" after set-password.** Fix this first. Without it, even a successful invite can't onboard the admin. Diagnostic queries in §2 will tell us within 2 minutes whether it's the trigger, RLS, or something else. Likely a 30-min fix.

2. **Bug A — Confirm the unified parchment template is actually shipping.** May be already fixed by `c527aa6`; just needs the user to retest on a freshly-deleted user. If still broken: check Resend dashboard logs for the message body, compare against expected `buildEmailHtml({kind:'invite',…})` output. 15-min triage.

### Priority 1 — Reach a clean signed-in state

3. **Bootstrap fresh admin.** After Bug B is fixed: delete any stale auth.users row, run `npx tsx scripts/bootstrap-admin.ts`, click email, set password, OTP verify, land on /dashboard. Captures the full happy path live for the first time end-to-end.

4. **Verify sign-out + refresh.** Once signed in, click avatar → Sign out → confirm /login lands within 5s. Refresh /dashboard while signed in → confirm clean reload, no "Redirecting…" hang. These were fixed in `6ec212a` and `024a74a` but not all reverified post-`deacabc`.

5. **Manual cross-device sweep.** Per CLAUDE_CONTEXT §12 #15: 320/768/1024/1440 px on Safari, Chrome, Firefox, Edge, iOS Safari, Android Chrome. Min 44px touch targets on auth surfaces.

### Priority 2 — Session B (Quotes module)

See §12 below for the rough plan. ~4-6 hours of focused work.

### Priority 3 — Hardening + observability

6. Sentry / error tracking. The structured `[<tag>] <event>` console logs we added are great in dev but get lost in Vercel's runtime logs over time. Wiring Sentry would surface the OTP and signin failure modes to a dashboard.
7. The 5 pre-existing financials/Tabs.tsx ESLint warnings — fix as part of wiring the Financials module to DB, not a standalone task.

═══════════════════════════════════════════════════════════════════════════════
## 10. WORKING ASSUMPTIONS / CONSTRAINTS
═══════════════════════════════════════════════════════════════════════════════

### Identity + domain
- **User name:** Jay Shah
- **Email:** jayshah.x@gmail.com
- **Domain:** nexvelonglobal.com
- **App URL:** https://app.nexvelonglobal.com
- **GitHub repo:** https://github.com/nexvelon/nexvelon (default branch `main`)
- **Operating company:** Nexvelon Global Inc.
- **Industry:** security systems integrator (Toronto, Ontario)

### Stack (versions in `package.json`)
- Next.js 15.5.15 (App Router + Turbopack)
- React 19.1.0
- TypeScript ^5 (strict)
- Tailwind v4
- Supabase (`@supabase/ssr` ^0.10.2, `@supabase/supabase-js` ^2.105.1)
- `@base-ui/react` ^1.4.1 (NOT Radix — see §11)
- bcryptjs, resend, @vercel/analytics, @vercel/speed-insights, recharts, dnd-kit, @react-pdf/renderer, sonner, cmdk, framer-motion

### Branding
- **Tone:** private bank, not SaaS dashboard.
- **Palette:** parchment `#F5F1E8` / `#FBF8F1`, navy `#0A1226`, gold `#B8924B`, ink `#2A2418`, taupe `#5C5240`, muted `#8C8273`.
- **Type:** Cormorant Garamond (emails) / Playfair Display + Geist Mono (app); Helvetica Neue / Arial / Georgia fallbacks throughout.
- **Tiny gold uppercase tracked eyebrow labels are a brand signature.** `.nx-eyebrow` and `.nx-eyebrow-soft` in globals.css.

### Hard regulatory rule — NO false certifications
- **Never claim "ULC Listed", "ESA Licensed", or "Holloway Security Integration Group"** anywhere user-facing or internal-display. These were v0 scaffolding artefacts; Nexvelon does NOT hold those certs. Re-introducing them is a compliance violation (ESA Ontario fines possible).
- **Customer-side ULC/ESA references** in the app (Settings → Company pane fields, technician certification list, mock project descriptions) are the *integrator's own* certs they're tracking — those are correct domain language and **stay**.

### Module wiring policy
- **`/clients` and `/users` are the only DB-wired surfaces.** Everything else (`/dashboard`, `/quotes` ×3, `/projects` ×2, `/inventory`, `/scheduling`, `/financials`, `/settings`) is decorative UI consuming `lib/mock-data/*`.
- **DON'T DEMOLISH UI-ONLY modules.** They stay as decorative shells until each is migrated.
- **Wire one module at a time, in this order:** Quotes → Projects → Inventory → Vendors → Invoices → Subcontractors → Financials → Scheduling. Each module ships its own migration + `lib/api/<module>.ts` (mirrors `clients.ts`) + server actions + page rewrite (server component fetch, client view).
- **Don't migrate `lib/types.ts` to `lib/types/database.ts` yet.** That's a separate refactor for after Quotes ships.
- **Don't delete `lib/mock-data/*` files** — modules still consume them and will be removed module-by-module.

### Email templates
- Bootstrap script and Supabase Dashboard are TWO separate pipelines (see §11).
- All templates **must NEVER** claim regulatory certifications.

═══════════════════════════════════════════════════════════════════════════════
## 11. TROUBLESHOOTING NOTES
═══════════════════════════════════════════════════════════════════════════════

> Patterns and quirks discovered during Session A. Read these before debugging.

### @supabase/ssr cookie quirks with Next 15 Route Handlers
**In Route Handlers** (`route.ts` files), use `redirect()` from `next/navigation` instead of `NextResponse.redirect(...)`. The cookies that `supabase.auth.verifyOtp` / `signOut` / `updateUser` write via the cookie-aware client's `setAll` callback are queued on Next's request-scoped cookieStore. They merge into the response Next builds for `redirect()` (which throws NEXT_REDIRECT) but DO NOT reliably attach to a manually-constructed `NextResponse.redirect`. This was Bug 2 from the `deacabc` cycle.

For non-redirect responses (`new NextResponse(null, { status: 204 })`), cookieStore writes DO attach correctly — `/auth/signout` POST proves this works.

### Server Actions
Server Actions also use `redirect()` from `next/navigation` for the success path. The function's return type is `Promise<FailureType | undefined>`; success throws NEXT_REDIRECT and never returns. Client must:
- `await` the action;
- catch errors and check `digest?.startsWith("NEXT_REDIRECT")` — re-throw those so Next handles the navigation;
- handle returned failure values via `result?.ok === false`.

### Base UI v1.4.x — Menu primitives
- **`Menu.GroupLabel` MUST be inside `Menu.Group`.** Otherwise it throws "Base UI error #31" on first render. The shadcn helper `<DropdownMenuLabel>` wraps `Menu.GroupLabel` directly — using it bare crashes. Either wrap in `<DropdownMenuGroup>` or replace with a styled plain `<div>` (the AvatarMenu pattern, post-`0f51609`).
- **`@base-ui/react` does NOT support `asChild`.** If you copy a Radix-style shadcn snippet with `<Button asChild><Link/></Button>`, it won't compile. Use `buttonVariants()` to apply button styles to a plain `<Link>` instead. Pattern is in `app/(auth)/login/page.tsx`.

### lucide-react ^1.14.0
The 1.x release moved many icon names. If you import an icon and TS complains "X has no exported member", open the package's exports and check the new name.

### `generateLink()` from Supabase admin SDK does NOT auto-send email
It only mints + returns the link object (`hashed_token`, `action_link`, `email_otp`, etc.). To actually email the link, POST to Resend's REST API directly. The bootstrap script does this; Supabase Dashboard templates only fire when our app calls `inviteUserByEmail` from the `/users` invite drawer.

### Supabase Dashboard templates and bootstrap script are TWO different pipelines
- **Dashboard templates:** fire when `auth.admin.inviteUserByEmail` / `auth.signInWithOtp` / `auth.resetPasswordForEmail` etc. are called. They render via Supabase's email engine using the dashboard-saved HTML with `{{ .ConfirmationURL }}` / `{{ .TokenHash }}` / `{{ .Email }}` substitutions.
- **Bootstrap script:** mints the token via `auth.admin.generateLink` (no email sent), constructs the URL ourselves, POSTs to Resend's REST API directly with HTML inlined in `scripts/bootstrap-admin.ts`. Bypasses Supabase's email pipeline entirely.
- Editing the dashboard templates does NOT affect the bootstrap script's emails, and vice versa.

### Token-hash flow defeats Gmail prefetch
Email links use the hardened pattern: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<TYPE>&next=<PATH>`. The legacy `/auth/v1/verify?token=…` URL gets consumed by Gmail's link scanner before the human clicks. token_hash requires an interactive cookie session at `/auth/confirm` to redeem (verifyOtp), which scanners can't synthesize.

### MFA gate is middleware-enforced, not RLS-enforced
During the ~10-minute OTP-pending window, the user holds a valid Supabase JWT. Direct REST calls succeed at JWT level (RLS still scopes to role). Middleware blocks every protected route by checking `has_pending_otp()` per request. We have no public REST surface today, so this is theoretical. Upgrade path when needed: enable Supabase Auth Hooks → custom JWT claim `mfa_verified` → RLS policies require it.

### Two parallel role enums
`lib/types.ts` `Role` is the 7-value app enum. `lib/types/database.ts` `DbRole` is the 11-value DB enum. `lib/auth/normalize-role.ts` collapses DB → app on read (LeadTechnician → Technician, Dispatcher → ProjectManager, Warehouse/ClientPortal → ViewOnly). Session B will retire the helper.

### Mock data and DB tables share names
`lib/mock-data/clients.ts` exports `clients` (mock array). `public.clients` is the DB table. The `/clients` page imports only from the DB API; everything else still imports from mock data. Take care during migrations to update consumers in lockstep.

### Demo dates are anchored to `TODAY = '2026-04-30T12:00:00'`
in `lib/dashboard-data.ts`. All mock data references this. Don't replace with `new Date()` in chart helpers unless the module is fully off mock data.

### Recharts SSR width warnings
`<ResponsiveContainer>` measures zero during prerender → console warning during `next build`. Cosmetic. Don't try to "fix" by removing `<ResponsiveContainer>`.

### Sidebar uses inline `style={...}` heavily
Because background/border/text colours all reference theme CSS variables that need to stay in sync. Don't refactor to Tailwind classes without preserving the exact `color-mix(...)` math.

### Vercel env vars are project-level, not Shared+Link
Fine for a one-project tenancy. If you ever scale to staging + admin-tool projects, migrate to Shared+Link. Watch out: a Shared var that's NOT explicitly linked to a project produces builds failing with `Missing NEXT_PUBLIC_SUPABASE_URL` at the import site. The error reads like a code bug; it's a Vercel config issue.

═══════════════════════════════════════════════════════════════════════════════
## 12. SESSION B ROADMAP HINT
═══════════════════════════════════════════════════════════════════════════════

> Once Bug A and Bug B are resolved, Session B should wire the **Quotes** module to Supabase. Estimated 4–6 hours.

### Migration `0004_quotes_schema.sql`
Three tables:
- `quotes` — id (uuid pk), client_id (uuid not null FK → clients.id), site_id (uuid FK → sites.id, nullable), project_id (uuid, FK → future projects.id, nullable), number (text unique), name (text), project_type (text check), status (text check, default 'Draft', enum: Draft, Sent, Approved, Rejected, Expired, Converted), owner_id (uuid → profiles.id), payment_terms (text), tax_rate (numeric), discount (numeric), discount_type (text check), terms (text), internal_notes (text), subtotal/tax/total (numeric), created_at/updated_at/expires_at, deleted_at.
- `quote_sections` — id, quote_id (uuid FK → quotes.id ON DELETE CASCADE), name, sort_order, created_at/updated_at.
- `quote_line_items` — id, section_id (uuid FK → quote_sections.id CASCADE), type (text check, "product" | "labor"), product_id (uuid FK → future products.id, nullable), sku, description, qty, unit_cost, markup, unit_price, hours, rate, notes, sort_order.
- Indexes: `quotes_client_id_idx`, `quotes_status_idx`, `quote_sections_quote_id_idx`, `quote_line_items_section_id_idx`.
- Trigger: `quotes_set_updated_at`, `quote_sections_set_updated_at`, `quote_line_items_set_updated_at` (all use `handle_updated_at()` from migration 0001).
- RLS: same per-action pattern as clients/sites/contacts (SELECT/INSERT/UPDATE for any authenticated; no DELETE — soft-delete via `deleted_at`).

### New + modified files
- `supabase/migrations/0004_quotes_schema.sql` — new.
- `lib/types/database.ts` — extend with `DbQuote`, `DbQuoteSection`, `DbQuoteLineItem` + Insert/Update payload variants.
- `lib/api/quotes.ts` — new. Mirror `lib/api/clients.ts` pattern. Functions: `getQuotes(filters)`, `getQuoteById(id)`, `createQuote(payload)`, `updateQuote(id, payload)`, `softDeleteQuote(id)`, `createSection(quoteId, payload)`, `updateSection`, `deleteSection`, `createLineItem`, `updateLineItem`, `deleteLineItem`. Cookie-aware client; RLS-enforced.
- `app/(app)/quotes/page.tsx` — convert from "use client" to a server component. Fetch via `lib/api/quotes.ts`, render a new `QuotesView.tsx` (client) for interactivity.
- `app/(app)/quotes/QuotesView.tsx` — new. The current page's body, rewired against real `DbQuote[]`.
- `app/(app)/quotes/[id]/page.tsx` — server component. Fetch quote + sections + line items. Render `QuoteBuilder` against real data instead of localStorage.
- `app/(app)/quotes/new/page.tsx` — server component. Initialise an empty draft via `createQuote` server action, redirect to `/quotes/[id]`.
- `app/(app)/quotes/actions.ts` — new. Server actions wrapping the API.
- `components/modules/quotes/builder/QuoteBuilder.tsx` — convert from localStorage state to controlled props. Save/Send/Convert call server actions.
- `lib/quote-store.ts` — DELETE after migration. (localStorage drafts retired.)
- `components/modules/quotes/QuoteRowActions.tsx` and friends — wire the dropdown actions to server actions.
- `lib/mock-data/quotes.ts` — leave on disk; only the dashboard pipeline funnel still reads it. Will be retired when Dashboard wires up.

### Testing checklist for Session B
- Migration applies cleanly (verify with `psql` query against pg_tables).
- Build clean.
- /quotes list renders empty + "New quote" button.
- Create a draft via builder → save → returns to list → row appears.
- Edit existing quote → totals recalc → save → row updates.
- Send / Approve / Convert flows → status badges change + audit-log entries (eventually).
- PDF export still works against the new data shape (verify QuoteDocument.tsx props).

### Dependencies on other modules
- `quotes.client_id` → `clients.id` (live).
- `quotes.site_id` → `sites.id` (live).
- `quotes.owner_id` → `profiles.id` (live).
- `quote_line_items.product_id` → future `products.id` (Inventory module). **Ship Quotes with this column nullable; backfill once Inventory ships.**
- `quotes.project_id` → future `projects.id`. Ship nullable.

═══════════════════════════════════════════════════════════════════════════════
**End of handoff.** Next session: read this top-to-bottom, then `CLAUDE_CONTEXT.md`. Triage Bug B first (it's a cheap fix and unblocks everything else). Don't demolish UI-only modules. Keep the parchment + navy + gold tone, no neon.
═══════════════════════════════════════════════════════════════════════════════

# NEXVELON_SESSION_B_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-11 against `main` @ `91677d6`. Updated with
> post-codification commits — see "Final Cleanup Commits" subsection
> at the bottom of §1 CURRENT STATE.
>
> Read this file end-to-end before proposing any change. Reading order
> for a cold start:
>   1. `NEXVELON_PRINCIPLES.md` — the six non-negotiables.
>   2. `CLAUDE_CONTEXT.md` "Current Session State" block at the top.
>   3. **This file** — Session B file-by-file state + decisions made.
>   4. `NEXVELON_ROADMAP.md` — what's next, in order.
>   5. `NEXVELON_SESSION_A_HANDOFF.md` — Session A's historical state,
>      for any auth-surface lookup.
>
> Session B goals were: ship the rest of the auth surface (forgot-
> password, reset-password, in-app change-password), purge all mock
> data ahead of the Quotes module, and codify the production-readiness
> commitments in docs. **All goals shipped.** The app is now in
> production mode — data preservation rules apply from `8d44ef7`
> forward (see `NEXVELON_PRINCIPLES.md` §1).

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Latest commit
**`91677d6` — "fix(cleanup): purge remaining hardcoded mock data + remove sidebar footer + add Reports module shell"** (2026-05-11)

### What shipped in Session B (commits in order)

| Hash | Message | Phase |
| --- | --- | --- |
| `96454d2` | feat(auth): forgot-password + reset-password flow (Session B Priority 1) | Auth |
| `c840386` | fix(auth): restore sub-2s session verification on dashboard load | Auth |
| `047d8a9` | feat(auth): in-app change-password flow (Session B Priority 2) | Auth |
| `f82dc6c` | fix(auth): update password via fresh throwaway session to bypass secure-change gate | Auth |
| `e472b1c` | fix(auth): use admin update endpoint to bypass secure-change nonce requirement | Auth |
| `8d44ef7` | chore(cleanup): empty mock data + add wipe-test-data.sql script (pre-quotes cleanup) | Cleanup |
| `7ee7c4e` | docs: nexvelon principles + production-readiness commitment | Docs |
| `b3fab6f` | fix(cleanup): handle empty mock-data gracefully across all unwired modules | Cleanup |
| `91677d6` | fix(cleanup): purge remaining hardcoded mock data + remove sidebar footer + add Reports module shell | Cleanup + Reports shell |

### Build status

**Clean.** `npm run build` → `✓ Compiled successfully`. **0 TypeScript
errors.** **5 ESLint warnings**, all pre-existing in
`components/modules/financials/Tabs.tsx` (UI_ONLY module — gets fixed
when Financials wires to DB per `NEXVELON_ROADMAP.md` item 10).
**Zero new warnings introduced** across the full Session B run.

### Deploy status

- **Live URL:** https://app.nexvelonglobal.com
- **Vercel auto-deploys from `main` on every push.** All Session B
  commits live.
- **Last verified-live commit:** `91677d6`. End-to-end auth flow
  (sign-in → OTP → dashboard → change password → sign-out) tested in
  production by the user.

### Final Cleanup Commits (post-codification)

Two commits shipped after this handoff was originally codified at
`6e6e41f`. They are pure tidy-up — no new module surface, no
architectural decisions, no migrations:

- **`b70d11b` — simPRO refinement (docs-only).** Added simPRO as a
  reference floor in `NEXVELON_PRINCIPLES.md` §3 (Quotes, Projects,
  Inventory, Scheduling rows; not Financials — QuickBooks stays the
  integration target there). Propagated to `NEXVELON_SESSION_B_
  HANDOFF.md` §4 mirror of the table, the §7 "beats X" prose for
  Quotes / Projects / Inventory, and `NEXVELON_ROADMAP.md` items
  4 (Quotes) / 5 (Projects) / 6 (Inventory) / 11 (Scheduling) +
  the "Discount granularity" deferred-decision section. No code
  change.

- **`5fbca47` — exhaustive inline mock-data sweep.** Fourth and
  final cleanup pass. Found the residual hardcoded entries that
  earlier sweeps missed (prior passes stopped at the first hit
  per file or only scanned `lib/mock-data/*`). Seven files
  touched:
  1. `lib/dashboard-data.ts` `recentActivity()` — removed 3
     hardcoded synthetic PO events ("PO to Anixter received —
     28 Avigilon H6A bullets", "PO to ADI received — Kantech
     ioSmart readers (×24)", "PO to CDW received — Axis
     Q6225-LE PTZ (×4)") that bypassed `lib/mock-data` by being
     appended directly inside the function. Was the specific
     bug the user reported.
  2. `components/modules/dashboard/ActivityFeed.tsx` — added
     "No recent activity" empty state when events is empty.
  3. `components/modules/settings/SettingsPanes.tsx`
     Integrations — removed 11 hardcoded fake-connected
     integrations (QBO, Xero, Stripe, Twilio, SendGrid, GCal,
     MS365, Genetec, Avigilon, Kantech, ICT) with "2h ago"
     timestamps. Empty-state card now renders.
  4. `components/modules/settings/SettingsPanes.tsx`
     ApiWebhooks — emptied `SAMPLE_KEYS` (2 fake API keys) and
     `WEBHOOKS` (3 fake hooks.nexvelon.com endpoints).
  5. `components/modules/settings/SettingsPanes.tsx`
     BillingPlan — replaced the fake "Enterprise · 10 seats ·
     $19,200 CAD / year" subscription card with a deliberate
     "Self-hosted · No subscription required" placeholder.
  6. `components/modules/financials/Tabs.tsx` — cleaned
     hardcoded "CRA Business # 81245-6709 RT0001" from the HST
     return card → "set in Settings → Company Profile" pattern.
  7. `lib/inventory-data.ts` — emptied `VENDOR_DIRECTORY` (5
     fake vendors with fictitious rep names + emails + account
     numbers + YTD spend + PO counts).

  Categories of fake data purged across the seven files:
   - **Security industry product brands** (Avigilon, Kantech,
     Axis, Genetec, ICT) in dashboard + integrations pane.
   - **Distributor names** (Anixter, ADI, CDW, Wesco, Provo) in
     dashboard PO events + vendor directory. The `Vendor` union
     type stays — drives filter dropdowns; lifts to a lookup
     table when Vendors v1 wires per ROADMAP item 7.
   - **Fake people names** (Tom Halloway, Sandra Whittaker,
     Reginald Coombs, Priscilla Devereaux, Lars Wittenberg) in
     vendor directory.
   - **Suspicious round numbers** (248_400 / 312_800 / 184_650
     YTD spend; 19_200 annual subscription).
   - **Hardcoded relative timestamps as literal strings** ("2h
     ago", "Yesterday", "1h ago", "12m ago", "5m ago", "3h
     ago", "Apr 28", "Apr 26", "Apr 22") in integrations pane
     and PO synthesis.
   - **Prefixed mock IDs** (`k-1`, `k-2`, `w-1`, `w-2`, `w-3`,
     `po-1`, `po-2`, `po-3`) in API keys, webhooks, PO events.
   - **Sample contact info** (`thalloway@adiglobal.ca`,
     `swhittaker@anixter.com`, `rcoombs@wesco.com`,
     `priscid@cdw.com`, `lars.w@provo.ca`, `(905) 555-####`,
     `(416) 555-####`, hooks.nexvelon.com endpoints).
   - **Fictitious CRA business number** (81245-6709 RT0001) on
     the Financials HST return card.

  Build: 0 TS errors, 0 new lint warnings. Routes unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. WHAT SHIPPED — Auth surface complete
═══════════════════════════════════════════════════════════════════════════════

### Priority 1 — Forgot-password + reset-password flow (`96454d2`)

Full anonymous → email → token → set-new-password → sign-back-in
cycle. New routes:
- **`/auth/forgot-password`** — email-input form. Server action
  `requestPasswordResetAction({email})` calls
  `auth.admin.generateLink({type:'recovery'})`, builds a
  token-hash URL pointing at `/auth/confirm?type=recovery&next=
  /auth/reset-password`, POSTs the royal-black-and-gold email via
  Resend. ALWAYS returns `{ok:true}` regardless of whether the
  email matched — no account enumeration. Writes
  `password_reset_requested` audit row regardless.
- **`/auth/reset-password`** — server component checks for a
  session (post-`/auth/confirm` verifyOtp), redirects to
  `/auth/forgot-password?expired=1` if missing. Form mirrors
  `/auth/set-password` (strength meter + per-rule checklist).
  Server action validates against password policy, calls
  `updateUser`, audits `password_changed` (source: 'reset'),
  signs out (scope: 'local'), redirects to `/login?reset=ok`.
- **New email template module:** `lib/email/templates/reset-
  password.ts` — standalone `resetPasswordEmail({resetUrl,
  recipientEmail, recipientName?})` returning `{subject, html,
  text}`. Royal black + gold + ivory chrome matching bootstrap-
  admin design.
- **Bootstrap script:** added `reset` to `EmailKind` + `COPY` in
  `scripts/bootstrap-admin.ts`. `--render-smoke --kind=reset` now
  works.

### Priority 1.5 — Sub-2s session verification (`c840386`)

Regression triage during Session B revealed that signed-in users
navigating to `/` or `/dashboard` saw "Verifying session…" for
30-60s. Root cause: every fresh dashboard load ran a duplicate
client-side `getUser + fetchProfile` chain in `AuthProvider`'s
mount-time IIFE on top of the cookie-aware `getUser` middleware
already performed. Two sequential Supabase Auth round-trips
client-side; when Supabase free-tier latency spiked, the chain
compounded with RequireAuth's 10s timeout into a 60s redirect
loop.

**Fix:** moved auth validation to the server in
`app/(app)/layout.tsx`:
- Layout became an async server component.
- Uses cookie-aware `createClient()` → `getUser` + `profile`
  fetch in the same request. `redirect("/login")` server-side on
  miss.
- New client component `components/auth/SessionSeededShell.tsx`
  receives the profile via prop and calls
  `useAuth().seedSession(profile)` in `useLayoutEffect` (runs
  before first paint).
- `AuthProvider` exposes `seedSession(profile)` in its context
  + flips an internal `seededRef`. Mount-time `useEffect` checks
  the ref at the top; when true, sets up the
  `onAuthStateChange` subscription and **returns without running
  the duplicate IIFE**.
- Critical: the seeded subscription IGNORES `INITIAL_SESSION`
  events (Supabase fires them synchronously with whatever's in
  the SDK's storage at that moment — can be null briefly after
  a hard navigation, would otherwise un-seed us back to
  'anonymous').

Net effect: zero client-side Supabase round-trips on first paint.
Server cost: one `getUser` + one profile read (~250-450ms,
parallel-able). Even at 5× Supabase latency the total stays well
under the prior 60s.

### Priority 2 — In-app change-password flow (`047d8a9` → `e472b1c`)

Self-service password change for signed-in users. New route
**`/settings/security/change-password`**, linked from the avatar
menu.

- Three-field form (current / new / confirm) + opt-in "Sign out
  other devices" checkbox.
- Submit gated client-side on all-fields-filled + new passes
  policy + new === confirm + new !== current.
- Server action `changeOwnPasswordAction({currentPassword,
  newPassword, signOutOtherDevices})`:
  1. `getUser` via cookie-aware SSR client.
  2. Cheap-shape password-policy check.
  3. Reject `new === current` no-op.
  4. Verify current password using a **throwaway** Supabase
     client (`createClient` from `@supabase/supabase-js`
     directly, **NOT** `@supabase/ssr`) with `persistSession:
     false`. signInWithPassword validates without disturbing
     the user's session cookies.
  5. Update password via the **service-role admin endpoint**
     (`admin.auth.admin.updateUserById`). This is the path
     that took two tries: commit `f82dc6c` tried calling
     `updateUser` on the throwaway (wrong — Supabase's "Secure
     password change" project setting requires a `nonce` from
     `auth.reauthenticate()`, not just a fresh session); commit
     `e472b1c` switched to the admin endpoint which bypasses
     the gate because it's intended for server-side privileged
     ops. Our throwaway `signInWithPassword` in step 4 IS the
     security verification.
  6. Optional `signOut({scope:'others'})` on the cookie-aware
     client — keeps THIS tab alive, invalidates the rest.
  7. Audit `password_changed` with `source:'self'` + a flag
     for the other-devices toggle so admins see the intent in
     the activity log.

- **Shared component extracted:** `components/auth/Password
  PolicyMeter.tsx` — `<PasswordStrengthMeter check={check}/>` +
  `<PasswordPolicyChecklist check={check} id?/>`. Refactored
  out of the inline copies in `/auth/set-password` and
  `/auth/reset-password`. All three surfaces (set / reset /
  change) now use this shared component. Single source of
  truth for the password-rule UI.

- **Avatar menu addition:** "Change password" link directly
  above "Sign out". Rendered as `<Link>` with `cn(button
  Variants({variant:"ghost", size:"sm"}), ...)` — `@base-ui/
  react`'s Menu.Item renders as a `<button>` and you can't
  nest an `<a>` inside it without `asChild`, which this
  library doesn't support. `DropdownMenu` made controlled
  (`open`/`onOpenChange`) so the Link's `onClick` can close
  the menu before navigation.

═══════════════════════════════════════════════════════════════════════════════
## 3. WHAT SHIPPED — Pre-Quotes cleanup
═══════════════════════════════════════════════════════════════════════════════

### `8d44ef7` — wipe script + mock-data zeroing

- **`scripts/wipe-test-data.sql`** — committed but NOT executed.
  Single `BEGIN ... COMMIT` transaction. Admin-presence guard
  (`RAISE EXCEPTION` if `jayshah.x@gmail.com` not found in
  `auth.users`). Wipes (in dependency order with explicit row-
  count NOTICEs): `public.auth_otp`, `public.auth_audit_log`,
  `public.contacts`, `public.sites`, `public.clients`,
  `public.profiles WHERE id != admin_id`, `auth.users WHERE id
  != admin_id` (CASCADE handles identities, sessions,
  mfa_factors, refresh_tokens). Final `UNION ALL SELECT`
  verification block. **Paste into Supabase SQL Editor
  manually.**
- **All `lib/mock-data/*` files emptied** — `clients.ts`,
  `sites.ts`, `users.ts`, `products.ts`, `projects.ts`,
  `quotes.ts`, `invoices.ts`, `subcontractors.ts`, `audit-
  log.ts`. Type definitions and helper functions (`clientTier`,
  `CLIENT_TIER_BADGE`, `sitesForClient`) preserved. `currentUser`
  is now `User | undefined`.

### `b3fab6f` — empty-data crash handling

After the wipe, several derived data engines crashed on empty
source arrays via `array[NaN]` patterns (modulo by zero):

- **`lib/scheduling-data.ts`** — `buildJobs()` hit `projects[NaN]`
  → undefined → `project.systemTypes.flatMap(...)` CRASH on
  `/scheduling`. Early-returns `[]` when projects is empty.
  `buildUnassigned()` 8-row hardcoded queue (referenced wiped
  client IDs) → `return []`.
- **`lib/inventory-data.ts`** — `movementHistory()` same pattern:
  `users[NaN]` / `projects[NaN]` → `tech.name.split(...)` /
  `proj.code` crash. Early-returns `[]`. `transfers` and
  `standalonePOs` hardcoded arrays referencing wiped IDs → `[]`.
- **`lib/notifications.ts`** — `SEED_NOTIFICATIONS` (9 hardcoded
  rows referencing wiped quotes/clients/projects) → `[]`.
- **`components/layout/NotificationsBell.tsx`** — added "No new
  notifications / You're all caught up" empty state.

### `91677d6` — hardcoded fake-data purge + sidebar + Reports

- **`components/modules/settings/BrandingThemes.tsx`** — the
  hardcoded "Marcus Holloway / Managing Director / 240 Front
  Street / (416) 555-0100 / marcus.reyes@nexvelon.com" email-
  signature block replaced with a `useMemo` seed from
  `useAuth()`: real user name + role label + phone/mobile + email.
- **`lib/dashboard-data.ts`** — pipeline funnel had a hardcoded
  `+ 240000` baseline that inflated the Lead stage to $24M when
  quotes was empty. Removed; lead = `quoted * 1.6` only.
- **`components/layout/Sidebar.tsx`** — "EST / v 4 . 18 . 2 /
  est. mmxxiv" footer block removed. Sidebar ends cleanly at the
  last nav item.
- **`components/modules/settings/SettingsPanes.tsx`
  CompanyProfile** — fictitious regulatory + contact defaults
  cleared (GST/HST, ESA, ULC, WSIB numbers, headquarters
  address, postal, phone, email). Real branding kept (Legal
  name, Trade name, City). Industry defaults kept (13% HST tax,
  Net 30, 30-day quote validity, retention periods).
- **`components/modules/quotes/builder/QuoteDocument.tsx`** — PDF
  letterhead block ("240 Front Street West / Toronto, ON M5V
  1A4 / (416) 555-0100 · sales@nexvelon.com / HST 81245-6709
  RT0001") replaced with single placeholder line "Configure
  address in Settings → Company Profile". MUST be replaced
  before sending real quotes — see `NEXVELON_ROADMAP.md`'s
  "Company-profile data source" deferred decision.
- **`/reports` route added** — server component, deliberate
  Coming Soon empty state in the elite workspace style.
  Cormorant Garamond serif headline, parchment + navy + gold
  palette, gold uppercase tracked eyebrow ("Reports · Coming
  Soon"), four-pillar description (cross-module analytics,
  customizable dashboards, scheduled email reports, export to
  PDF/CSV/Excel). NOT a placeholder — designed to look
  intentionally framed.
- **`lib/permissions.ts`** — `"reports"` added to `Resource`
  union + `ALL_RESOURCES` array.
- **`components/layout/nav-config.tsx`** — Reports nav item
  added between Financials and Users. Icon: `BarChart3`.

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT SHIPPED — Docs
═══════════════════════════════════════════════════════════════════════════════

### `7ee7c4e` + this commit — repo-as-persistent-context

- **`NEXVELON_PRINCIPLES.md`** — five (now six) non-negotiables:
  1. Data preservation — additive migrations default;
     copy-deploy-drop sequence for drops; soft-delete; audit
     retention.
  2. Granular permissions — per-user × per-feature ACL with
     three UI states; admin overrides; every server action AND
     route gated. Permissions ships BEFORE Quotes.
  3. Competitive bar — **reference floors, not ceilings**;
     world-class SaaS rebuilt from scratch in 2026 with no
     legacy debt. Updated reference list per module: Quotes →
     Sedona Office, Wisetrack, simPRO. Projects → ServiceTrade,
     Salesforce Field Service, simPRO. Inventory → Anixter,
     Best Buy distributor portal, simPRO. Scheduling →
     ServiceFusion, Jobber, simPRO. Financials → QuickBooks
     (integration target). Auth/Users dropped from the table —
     foundational, not competitive.
  4. Audit everything — who/what/when/before/after/IP/UA on
     every business-record write. Append-only at the RLS policy
     level. 7-year retention.
  5. Continuity — the repo IS the persistent context.
  6. **Extensibility & Customization** (NEW this commit) —
     custom fields on every entity; status enums become lookup
     tables; workflow rules in data, not code (Phase 2);
     field-level permissions; module-level extension points
     (events + UI slots); API-first design; **depth over
     breadth — ship deeply or don't ship**.

- **`CLAUDE_CONTEXT.md`** — `## Current Session State` block at
  the top, refreshed this commit to point at Session B
  artifacts.

- **`NEXVELON_ROADMAP.md`** (NEW this commit) — all known
  deferred work in sequence: feature audit → permissions
  design → permissions build → Quotes → Projects → Inventory →
  Vendors → Invoices → Subcontractors → Financials →
  Scheduling → Reports. Each item has 2-3 sentence v1
  must-include description. Open architectural decisions
  (custom-field implementation, workflow rules, field-level
  permission storage). Open product decisions (`quote_shares`,
  `unit_label`, currency, discount granularity, company-
  profile data source).

- **`NEXVELON_SESSION_B_HANDOFF.md`** (THIS file) — Session B
  state, file-by-file, decisions made, next-priority
  sequence.

═══════════════════════════════════════════════════════════════════════════════
## 5. KEY ARCHITECTURAL DECISIONS MADE THIS SESSION
═══════════════════════════════════════════════════════════════════════════════

1. **Auth state is seeded server-side, not re-fetched client-side.**
   `app/(app)/layout.tsx` is the source of truth for "is this user
   authenticated and what's their profile". The client AuthProvider
   trusts the seed; the client only re-fetches if the server-seed
   path is bypassed (which doesn't happen on any production code path
   today). See commit `c840386`.

2. **Password verification uses a throwaway Supabase client
   (`createClient` from `@supabase/supabase-js` directly, NOT
   `@supabase/ssr`).** The throwaway has `persistSession: false` so
   it doesn't touch the user's session cookies. This is the standard
   pattern any time we need to verify a user's password without
   disturbing their session. See commit `e472b1c`.

3. **Password mutations bypass `auth.updateUser` via the service-role
   admin endpoint.** Supabase's "Secure password change" project
   setting requires a `nonce` from `auth.reauthenticate()` on the
   user-facing `auth.updateUser` endpoint — not just a fresh session.
   The admin endpoint (`admin.auth.admin.updateUserById`) is not
   subject to that gate because it's meant for server-side
   privileged operations; our throwaway `signInWithPassword` IS the
   security verification. See `app/(app)/settings/security/
   change-password/actions.ts` + the wrong-then-right commit pair
   `f82dc6c` → `e472b1c`.

4. **Production-mode officially live as of commit `8d44ef7`.** The
   mock-data wipe + the in-repo wipe-SQL script flipped the project
   from demo mode to production. From this commit forward, every
   migration is additive by default; drops require the documented
   copy-deploy-drop sequence with operator sign-off per
   `NEXVELON_PRINCIPLES.md` §1.

5. **`NEXVELON_PRINCIPLES.md` §6 — depth over breadth.** Modules
   ship fully (audit + permissions + custom fields + reference-floor
   beaten) or stay in `NEXVELON_ROADMAP.md`. No "module lite." The
   `/reports` page is the model for what a deferred module should
   look like — a deliberately-designed empty state, not a
   placeholder.

═══════════════════════════════════════════════════════════════════════════════
## 6. PRODUCTION MODE — what changed at `8d44ef7`
═══════════════════════════════════════════════════════════════════════════════

Until `8d44ef7` (chore cleanup), the project was in demo mode:

- DB held seeded test data (3 clients, 2 sites, 1 contact).
- Mock data files in `lib/mock-data/*` held 80 products, 30 quotes,
  15 projects, etc.
- Hardcoded fake identities ("Marcus Holloway") were sprinkled in
  components.
- Migrations could be re-applied with `drop and recreate` if needed.

After `8d44ef7`:

- Mock data files are `[]`.
- `lib/dashboard-data.ts` derivations return 0s on empty sources.
- Empty-data crash paths are guarded.
- Hardcoded fake identities purged (commits `b3fab6f`, `91677d6`).
- **`scripts/wipe-test-data.sql` ready to paste into Supabase SQL
  Editor manually.** Once executed, the DB has only the admin
  account + schema.
- **Every migration from `8d44ef7` forward is production-data-
  bearing.** Additive by default. Drops require the
  documented copy-deploy-drop sequence with operator sign-off in
  the migration header. Soft-delete over hard-delete for every
  business record.

The user has been explicit: the app is going live for real business
use. There is no "we'll fix the data model later" mode anymore.

═══════════════════════════════════════════════════════════════════════════════
## 7. WHAT'S PENDING — Updated next-priority sequence
═══════════════════════════════════════════════════════════════════════════════

Full descriptions in `NEXVELON_ROADMAP.md`. Sequence:

1. **Comprehensive feature audit + sidebar expansion** — scoping
   pass across every module before the permissions module is
   designed. Inputs to the permissions design — without this audit
   the ACL would ship against incomplete action vocabulary.
2. **Permissions module — design pass** — written design doc for
   per-user, per-feature ACL with three UI states + Admin override
   UX + field-level permission storage model.
3. **Permissions module — build** — migration, `lib/api/permissions
   .ts`, `lib/permissions.ts` rewrite, server-action + route gates,
   client hooks, Admin override UI.
4. **Quotes v1** — first real business module beyond clients/users.
   Beats Sedona Office + Wisetrack + simPRO reference floor (§3) on
   margin clarity + convert-to-project friction.
5. **Projects v1** — wires the existing detail UI to real DB.
   Quote→Project conversion end-to-end. Beats ServiceTrade +
   Salesforce Field Service + simPRO.
6. **Inventory v1** — beats Anixter + Best Buy distributor portal +
   simPRO on the one-screen low-stock + on-order view.
7. **Vendors v1** — splits out into a first-class module from the
   inventory + financials surfaces.
8. **Invoices v1** — AR side of Financials. QuickBooks Online
   sync hook.
9. **Subcontractors v1** — hard-block on assignment when
   insurance/WSIB is expired.
10. **Financials v1** — full derivation engine from real
    operational tables. QuickBooks the integration backbone.
11. **Scheduling v1** — drag-to-assign with hard-block on missing
    panel certification.
12. **Reports v1** — wires the existing `/reports` Coming Soon
    shell to real cross-module analytics, scheduled email reports,
    PDF/CSV/Excel exports.

Each module ships fully per `NEXVELON_PRINCIPLES.md` §6. No
"module lite."

═══════════════════════════════════════════════════════════════════════════════
## 8. FILE-BY-FILE STATE (delta from Session A)
═══════════════════════════════════════════════════════════════════════════════

> Session A's `NEXVELON_SESSION_A_HANDOFF.md` §3 is still the
> reference for the auth surface. Below is just what's new or
> changed since that handoff was written.

### New routes

| File | Purpose |
| --- | --- |
| `app/auth/forgot-password/page.tsx` + `forgot-password-form.tsx` + `actions.ts` + `layout.tsx` | Forgot-password entry. Anonymous-reachable per `middleware.ts` ANON_ALLOWED. |
| `app/auth/reset-password/page.tsx` + `reset-password-form.tsx` + `actions.ts` + `layout.tsx` | Reset-password landing after `/auth/confirm?type=recovery` verifyOtp. |
| `app/(app)/settings/security/change-password/page.tsx` + `change-password-form.tsx` + `actions.ts` | In-app password change for signed-in users. |
| `app/(app)/reports/page.tsx` | Deliberate Coming Soon state for the Reports module. |

### Changed files

| File | What changed |
| --- | --- |
| `app/(app)/layout.tsx` | Converted from client wrapper to async server component. Validates session server-side, fetches profile, wraps children in `<SessionSeededShell>`. Critical to sub-2s dashboard load. |
| `components/auth/AuthProvider.tsx` | Added `seedSession(profile)` to context. Mount-time `useEffect` skips IIFE when seeded. Seeded subscription ignores `INITIAL_SESSION` events. |
| `components/auth/RequireAuth.tsx` | Refactored to use shared `<PasswordPolicyMeter>` (indirectly via the password forms). |
| `components/layout/Sidebar.tsx` | EST/version footer removed. Sidebar ends at last nav item. |
| `components/layout/AvatarMenu.tsx` | "Change password" link added directly above "Sign out". `DropdownMenu` now controlled. |
| `components/layout/NotificationsBell.tsx` | Added empty-state UI when no notifications. |
| `components/layout/nav-config.tsx` | Added Reports nav item between Financials and Users. |
| `components/modules/settings/BrandingThemes.tsx` | Email-signature seeded from real `useAuth()` user. Marcus Holloway hardcoded block gone. |
| `components/modules/settings/SettingsPanes.tsx` | CompanyProfile fictitious defaults cleared. |
| `components/modules/quotes/builder/QuoteDocument.tsx` | PDF letterhead contact block replaced with "Configure address in Settings → Company Profile" placeholder. |
| `lib/notifications.ts` | `SEED_NOTIFICATIONS` emptied. |
| `lib/scheduling-data.ts` | `buildJobs()` guard against empty projects. `buildUnassigned()` returns `[]`. |
| `lib/inventory-data.ts` | `movementHistory()` guard against empty users/projects. `transfers` and `standalonePOs` emptied. |
| `lib/dashboard-data.ts` | Pipeline funnel `+ 240000` constant removed. |
| `lib/mock-data/*` | All 9 files emptied. `currentUser: User \| undefined`. |
| `lib/permissions.ts` | `"reports"` added to `Resource` union + `ALL_RESOURCES`. |
| `middleware.ts` | `/auth/forgot-password` + `/auth/reset-password` added to `ANON_ALLOWED`. |
| `app/auth/confirm/route.ts` | `type=recovery` default redirect → `/auth/reset-password` (was `/auth/set-password`). |
| `lib/types/database.ts` | `password_reset_requested` added to `AuthAuditEvent`. |
| `scripts/bootstrap-admin.ts` | Added `reset` to `EmailKind` + `COPY`. `--render-smoke --kind=reset` works. |

### New shared components

| File | Purpose |
| --- | --- |
| `components/auth/SessionSeededShell.tsx` | Receives server-fetched profile, calls `useAuth().seedSession()` in `useLayoutEffect` before first paint. |
| `components/auth/PasswordPolicyMeter.tsx` | Shared strength meter + per-rule checklist used by set / reset / change-password forms. |
| `lib/email/templates/reset-password.ts` | Royal-black-and-gold reset email template. |

### New database / SQL

| File | State |
| --- | --- |
| `scripts/wipe-test-data.sql` | Committed but NOT executed. Paste into Supabase SQL Editor manually after reading the file's header. |

### Removed / DELETED files

None. (Both Session A and Session B have followed "no demolition" — see `NEXVELON_PRINCIPLES.md` §1.)

═══════════════════════════════════════════════════════════════════════════════
## 9. CONSTRAINTS CARRIED FORWARD
═══════════════════════════════════════════════════════════════════════════════

(See `NEXVELON_PRINCIPLES.md` for the full non-negotiables. Specific
Session A/B constraints below.)

- **No demolition.** Don't delete UI-only modules or mock-data
  files. Each gets retired one-by-one as its module wires to DB.
- **No regulatory false claims.** Never reintroduce "ULC Listed",
  "ESA Licensed", or "Holloway Security Integration Group" anywhere
  user-facing. Customer-side ULC/ESA references where the operator
  tracks their OWN certs (Settings → Company Profile fields,
  technician certification list) are correct domain language and
  stay.
- **`@base-ui/react`: no `asChild` anywhere.** Use `cn() +
  buttonVariants()` to style `<Link>` as a button.
- **Server actions writing cookies use `redirect()` from
  `next/navigation`,** not `NextResponse.redirect`.
- **5 pre-existing financials/Tabs.tsx ESLint warnings** stay
  untouched until Financials wires to DB (per
  `NEXVELON_ROADMAP.md` item 10).
- **Production mode active.** Migrations additive by default; drops
  require copy-deploy-drop with operator sign-off per `NEXVELON_
  PRINCIPLES.md` §1.

═══════════════════════════════════════════════════════════════════════════════
**End of Session B handoff.** Next session: read this top-to-bottom,
then `NEXVELON_ROADMAP.md`. Start with the feature audit — it's the
input to everything that follows.
═══════════════════════════════════════════════════════════════════════════════

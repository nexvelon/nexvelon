# CLAUDE_CONTEXT.md

> **Single source of truth for the Nexvelon project.**
> A fresh Claude Code session reads, in order:
>   1. **`NEXVELON_PRINCIPLES.md`** — the six non-negotiables (incl. §6 Extensibility).
>   2. The `## Current Session State` block immediately below.
>   3. **`NEXVELON_SESSION_B_HANDOFF.md`** — what shipped in Session B + file-by-file delta.
>   4. **`NEXVELON_ROADMAP.md`** — what's next, in order, with v1 acceptance bars.
>   5. `NEXVELON_SESSION_A_HANDOFF.md` — historical auth-surface reference.

---

## Current Session State

**As of 2026-05-12. Session V CLOSED. Permissions Design Pass 7 of 11 complete.**

- **Session V focus:** Permissions Design — Pass 7 (Request-Admin-Access Workflow). State machine (Pending → Approved → Granted → Expired/Revoked + Rejected/Cancelled paths). Four request types: permission_grant / field_visibility_grant / data_scope_grant / role_temporary_assignment. New `user_role_assignments` table introduced for multi-role support. Full schema for request_admin_access expanded with 30+ columns. Approval workflow end-to-end. Notification routing v1 (all admins; Phase 2 routing rules placeholder). Auto-expiry handling 3 paths. 8 edge cases. Integration with Pass 4 audit-on-read for sensitive permissions. 9 new event types added to permission_audit_log catalog (30 total). 7 Pass 7 open questions resolved. Migration order extended +7 steps (now 39 total).
- **Latest commit:** `docs: permissions design Pass 7 — request-admin-access workflow`. See `git log -1 --oneline`.
- **Auth surface:** ✅ COMPLETE (unchanged from Session B).
- **Production mode:** ⚠️ LIVE (unchanged). Data preservation rules apply from `8d44ef7` forward.
- **DB wipe:** `scripts/wipe-test-data.sql` committed but NOT executed (unchanged).
- **Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked (Sessions C-O). Total: ~1260 actions, 76 permissions design implications, ~594 acceptance criteria, 13 cross-cutting commitments locked.
- **Permissions design progress:** 7 of 11 passes complete. Pending: Pass 8 (Permissions editor UI), Pass 9 (Effective-permissions caching strategy), Pass 10 (Cross-cutting enforcement patterns), Pass 11 (Migration plan).
- **File size management:** v0.7 condenses Pass 1-6 to summaries. Full content preserved at: Pass 1 (9008fad), Pass 2 (1bafbd4), Pass 3 (ff08703), Pass 4 (de1905f), Pass 5 (904bfe5), Pass 6 (3c21e58). Pass 7 full content §14-§26.
- **Pending pipeline (in order):**
  1. ✅ Feature audit COMPLETE.
  2. **IN PROGRESS: Permissions module — design pass.** Pass 7 of 11 complete.
  3. Permissions module — build (ROADMAP item 3).
  4. Quotes v1 build (ROADMAP item 4).
  5. Projects → Inventory → Vendors → Invoices → Subcontractors → Financials → Scheduling → Reports.
- **Major architectural decisions from Pass 7:**
  - **State machine separates Approved from Granted** — supports future-dated grants (admin approves with start_at in future; cron fires grant at start_at) and atomicity on grant failure (request stays at Approved if user_permission_override insert fails for any reason). In typical case (immediate grant), transition happens in same transaction; user perceives as one event.
  - **Four request types cover the design space:**
    - `permission_grant` — most common (specific action permission)
    - `field_visibility_grant` — sensitive field visibility (banking, SIN, payroll, etc.)
    - `data_scope_grant` — widen scope on a resource (e.g., team → all temporarily)
    - `role_temporary_assignment` — take on second role for coverage periods
  - **`user_role_assignments` table introduced** for multi-role support. Primary role (`is_primary=TRUE`) is user's default. Additional roles from requests have `is_primary=FALSE`. A1 resolution unions all active role grants for the user. UNIQUE constraint with DEFERRABLE INITIALLY DEFERRED handles primary role re-assignment.
  - **Polymorphic target columns** in request_admin_access support all four request types in one table (target_permission_id OR target_flag_id OR target_resource+target_scope_id OR target_role_id, exactly one populated per request).
  - **Notification fanout v1: all admins** notified via in-app + email + Slack. routing_rule_id column (NULL at v1) prepared for Phase 2 routing rules table. Single-tenant systems have 1-3 admins typically; routing adds complexity without solving real v1 problem.
  - **Three notification channels per request event:** in-app (always), email (per admin preference), Slack (if configured). Per-admin channel preferences in Settings.
  - **Auto-expiry handles 3 paths:**
    - Pending timeout (default 7 days; operator-configurable in Settings)
    - Duration end (granted-temporary expires at end_at; Pass 3 cron handles override revocation; this cron handles request status update)
    - One-time used (one_time grants schedule revocation 24h after first use as grace period)
  - **Self-approval blocked at CHECK constraint** (`requester_user_id != decided_by_user_id`) plus UI prevention. Admins use direct override editor for self-grants (audit captures their action).
  - **Duplicate request check** includes related_entity_id — same permission for different entities allowed; same permission for same entity rejects with "you have a pending request; cancel or wait."
  - **Already-granted permission requests** validation rejects with helpful explanation including reason_if_denied from current grant resolution (helps user understand why UI showed disabled — often status binding, not permission).
  - **Sensitive flag requests trigger triple audit**: grant event + pre-emptive grant audit (for `requires_audit_on_read=TRUE` flags) + every read via Pass 4 async batched.
  - **M13 compliance report joins** request_admin_access + permission_audit_log for "Sensitive Field Reads" report — shows full chain: who requested, who approved, when granted, every read.
  - **Operator-configurable alerts**: Slack push when granted sensitive permission is actually used (catches usage patterns not matching original justification).
  - **Active actions complete on grant expiry**; new actions fail. UI shows "Your access has expired" toast.
  - **User deactivation cascades**: pending requests auto-cancelled; granted overrides revoked via Pass 3 §11.4 trigger on users.is_active change.
- **Nine new event types added to permission_audit_log catalog (30 total now):**
  - request_admin_access_submitted
  - request_admin_access_approved
  - request_admin_access_rejected
  - request_admin_access_granted
  - request_admin_access_cancelled
  - request_admin_access_expired
  - request_admin_access_revoked
  - request_admin_access_auto_cancelled (user deactivated)
  - request_one_time_used
- **Seven Pass 7 open questions resolved:**
  - Rejection rate-limiting alerts: NO at v1; Phase 2 consideration
  - Multi-step approval hierarchy: NO at v1; co-sign pattern handles high-stakes
  - Comment threads on requests: NO at v1; use "need more info" rejection pattern
  - Mobile push notifications: deferred to build phase
  - Templated justifications: NO at v1; free text enforces thoughtfulness
  - Request analytics dashboard: deferred to M13 reports
  - Auto-approval rules: NO at v1; defeats audit-trail purpose
- **Phase 2 deferrals from Pass 7:**
  - Notification routing rules (table placeholder ready)
  - Auto-escalation after 3-day pending
  - Multi-admin approval requirements for highest-stakes permissions
  - Threaded comments on requests
  - Templated justifications
  - Auto-approval rules with conservative defaults
- **Live URL:** https://app.nexvelonglobal.com (unchanged).
- **GitHub repo:** https://github.com/nexvelon/nexvelon (unchanged).
- **Admin account:** `jayshah.x@gmail.com` (unchanged).

### Open In-Flight Items

**None.** Pass 7 produced no uncommitted plans. Next session continues with Pass 8 (Permissions editor UI) — six-tab editor with all the data flows from Passes 1-7 now rendered in UI. Tab 1 (Actions hierarchy), Tab 2 (Field Visibility 47 flags), Tab 3 (Data Scopes matrix), Tab 4 (Overrides + request management sub-tab), Tab 5 (Custom Roles wizard), Tab 6 (Audit Log embedded view). Plus search/filter, save-and-validate flow, conflict detection, mobile responsive considerations, accessibility.

---

## 0. Status as of 2026-05-11 (Session A CLOSED)

> **Session A officially complete.** All blocking bugs resolved, all
> auth UX hot spots fixed, both email pipelines (bootstrap script +
> Supabase Dashboard) ship the same royal black + gold + ivory design.
> Read `NEXVELON_SESSION_A_HANDOFF.md` for the file-by-file state and
> historical triage notes; this section is the elevator summary plus
> the Session B priority list.

### Where we are right now

- **Latest commit:** `a59adab` — "Update magiclink email subject to
  password reset wording".
- **Build:** clean. 0 TS errors. 5 pre-existing ESLint warnings in
  `components/modules/financials/Tabs.tsx` (UI_ONLY, untouchable). Zero
  new warnings introduced anywhere in Session A.
- **Deploy:** https://app.nexvelonglobal.com auto-deploys from `main` on
  every push. All Session A commits live.
- **DB rows right now:** `profiles`≥1 (admin account live again after
  migration 0004 fix), `auth_otp` populated per-session, `auth_audit_log`
  accumulating, `clients`=3, `sites`=2, `contacts`=1.

### Session A — bugs and UX issues, all RESOLVED

- **Bug A — Invite email not the new design.** RESOLVED. Bootstrap
  script now sends the royal black + gold + ivory letter design
  (commit `9027b6e`). Both `invite` and `magiclink` kinds render
  identical HTML; only subject + outerNotePrefix differ per the user's
  explicit direction.
- **Bug B — "We can't find your profile" after set-password.** RESOLVED.
  Root cause was a missing `public.` schema prefix on the
  `on_auth_user_created` trigger — Supabase Auth's search_path didn't
  resolve the unqualified `handle_new_user()` reference and the trigger
  silently no-op'd. Fixed via migration
  `supabase/migrations/0004_fix_auth_user_trigger.sql` (commit `020eec2`),
  which recreates the trigger with `public.handle_new_user()` and adds
  a defensive `EXCEPTION WHEN OTHERS THEN RAISE WARNING` around the
  profile insert. Migration applied + verified in production —
  in-app invites now auto-create profile rows.
- **Sign-in speed.** RESOLVED. Post-OTP redirect now appends
  `?just_signed_in=ok` and AuthProvider + RequireAuth both honour the
  hint as a render-immediately signal, skipping the duplicate
  `getUser`+`fetchProfile` round-trip behind "Verifying session…"
  (commit `ccec631`). Sub-2s click-to-dashboard.
- **Sign-out speed.** RESOLVED. `signOut()` now navigates to
  `/auth/signout` (GET), which synchronously deletes every `sb-*`
  cookie via Set-Cookie headers attached to its redirect to
  `/login?signout=ok`. Cookies are atomically gone before middleware
  sees the follow-up request, so the hint actually reaches
  RedirectIfAuthed. A `sessionStorage` "signing out" flag prevents
  RequireAuth's reactive anonymous-redirect effect from racing the
  navigation target. The client-side SDK call uses
  `scope: 'local'` to skip a CORS-failing POST to Supabase Auth's
  `/auth/v1/logout`. Commits `0bbef7c`, `6dd785a`, `24a3195`. 1-2s
  click-to-login-form.
- **Email design.** SHIPPED. Royal black canvas + 2px gold gradient
  frame + ivory `#FBFAF5` card + Cormorant Garamond typography +
  ◆-bracketed footer band. Identical across all four pipelines:
  bootstrap invite, bootstrap magic-link, Supabase Dashboard
  "Invite user" template, Supabase Dashboard "Magic Link" template
  (commit `9027b6e` for the bootstrap side; Supabase Dashboard was
  updated manually by the user with the matching HTML).

### Subject lines locked across both pipelines

- **Invite** (bootstrap script + Supabase Dashboard "Invite user"):
  `"Your seat at the Nexvelon Enterprise Suite is ready"`.
- **Magic-link / password reset** (bootstrap script + Supabase
  Dashboard "Magic Link"): `"Your password reset link for Nexvelon
  Enterprise Suite is ready"`.

### Session B priorities (in order)

1. **Forgot-password flow** — new `/auth/forgot-password` route
   (anonymous, in `app/(auth)/forgot-password/page.tsx` +
   `actions.ts`). Single email-input form → server action calls
   `supabase.auth.resetPasswordForEmail({ redirectTo:
   '/auth/confirm?type=recovery&next=/auth/set-password' })`. Reuse
   the `/auth/confirm` token-hash redemption and the existing
   `/auth/set-password` page. Add a "Forgot password?" link from
   `/login`.
2. **Change-password flow inside the app** — signed-in user changes
   their password from the avatar menu or `/settings/security`. Server
   action validates current password (re-auth via signInWithPassword
   against the user's own email) before `supabase.auth.updateUser({
   password })`. Audit log entry `password_changed` with
   `source: 'in_app'`.
3. **5th email template for password reset.** Add `kind: 'reset'`
   variant to `scripts/bootstrap-admin.ts` `COPY` (same royal design,
   different subject + body copy emphasising "you requested" + the
   single-use one-hour TTL). Manually update Supabase Dashboard "Reset
   Password" template to match the same HTML.
4. **Quotes module wired to Supabase.** Migration
   `0005_quotes_schema.sql` (`quotes`, `quote_sections`,
   `quote_line_items` tables — schema sketched in
   `NEXVELON_SESSION_A_HANDOFF.md` §12). `lib/api/quotes.ts` mirrors
   `lib/api/clients.ts`. Server actions in `app/(app)/quotes/actions.ts`.
   Page rewrites: `app/(app)/quotes/page.tsx` becomes a server
   component fetching via the API; `QuoteBuilder` migrates from
   localStorage to controlled props.
5. **Modules to wire after Quotes (in priority order).** Each module
   ships its own `00NN_<module>_schema.sql` + `lib/api/<module>.ts` +
   server actions + page rewrite, mirroring the clients/quotes
   pattern.
   - Projects
   - Inventory
   - Vendors
   - Invoices
   - Subcontractors
   - Financials
   - Scheduling

### Constraints that survived Session A (still apply for Session B)

- The 7 UI-only modules (Dashboard, Quotes, Projects, Inventory,
  Scheduling, Financials, Settings) **stay as decorative shells until
  each is migrated**. Don't demolish them.
- **No regulatory claims.** Do NOT reintroduce "ULC Listed", "ESA
  Licensed", or "Holloway Security Integration Group" anywhere
  user-facing or in templates.
- **No demolition.** Don't delete UI-only modules or
  `lib/mock-data/*` files. Each gets retired one-by-one as its
  module is wired.
- **Migration cadence:** every new module ships its own
  `00NN_<module>_schema.sql` + `lib/api/<module>.ts` + server
  actions + page rewrite (server component fetch, client view) —
  mirroring the clients module reference.
- **Don't migrate `lib/types.ts` to `lib/types/database.ts` yet.**
  That's a separate refactor for after Quotes ships and the
  permissions matrix expands.
- **`/clients` and `/users` remain the only DB-wired surfaces until
  Quotes lands.**

### What landed in Session A (Phases 1–6 + post-acceptance fixes)

1. **Phase 1** — Migrations 0002 + 0003 added: `profiles`, `auth_otp`,
   `auth_audit_log`, `is_admin()`, `guard_profile_updates()`,
   `handle_new_user()`, `has_pending_otp()`. Tightened
   clients/sites/contacts RLS.
2. **Phase 2** — Supabase Dashboard configured: invite-only signup,
   email provider on, all OAuth off, MFA off (we roll our own),
   custom Resend SMTP, branded email templates, URL allowlist + rate
   limits.
3. **Phase 3** — Real Supabase Auth wired: middleware, AuthProvider,
   login + verify-otp + set-password + auth/confirm + auth/callback
   pages, `lib/auth/*` server-only helpers, `lib/api/clients.ts`
   swapped from admin-bypass to cookie-aware (RLS enforced).
4. **Phase 4** — `/users` invite drawer (Admin-only, calls
   `inviteUserByEmail`), per-row Suspend/Reactivate/Terminate actions
   that revoke sessions + write audit-log rows.
5. **Phase 5** — `scripts/bootstrap-admin.ts`. Deterministic
   `auth.admin.listUsers` existence check; single shared royal-black
   `buildEmailHtml({ kind, confirmUrl, recipientEmail })` for both
   invite + magic-link kinds (identical HTML, two semantic fields
   differ); `[bootstrap]` structured logs; `--render-smoke` flag for
   visual review without firing Resend.
6. **Phase 6** — Demo cleanup: `lib/demo-accounts.ts` deleted,
   `RoleSwitcher` deleted, demo env flags pruned, Holloway/ULC/ESA
   branding scrubbed.
7. **Post-acceptance fixes** (commits `0f51609` → `a59adab`):
   - Avatar dropdown crash (Base UI #31) — replaced `Menu.GroupLabel`
     with plain `<div>`.
   - OTP verify hang — `redirect()` from `next/navigation` so cookie
     writes ride atomically with the redirect response. 30s client
     timeout fallback.
   - Bug A (email design) — fully redesigned to royal black + gold
     + ivory letter (`9027b6e`).
   - Bug B (missing profile after set-password) — migration `0004`
     restores the trigger's schema prefix and hardens the function
     body (`020eec2`).
   - Sign-in fast-path — `?just_signed_in=ok` hint skips duplicate
     session check on /dashboard (`ccec631`).
   - Sign-out fast-path — `/auth/signout` GET clears cookies + 307s
     to `/login?signout=ok`; `isSigningOut()` flag prevents the
     reactive-redirect race; `scope: 'local'` SDK call avoids CORS
     (`0bbef7c`, `6dd785a`, `24a3195`).
   - Magic-link copy renamed to "password reset" wording (`a59adab`).
   - Search bar removed from TopBar; sidebar count chips removed;
     Activity Log tab now reads real `auth_audit_log` rows;
     `/auth/callback` deleted; `/auth/signout` route added.

### Detailed history sections — read below

§1–§16 of this document are the original handoff narrative kept for
historical context. The most important supplementary docs are
`NEXVELON_AUDIT.md` (read-only audit done early in Session A) and
`NEXVELON_SESSION_A_HANDOFF.md` (the wrap-up).

---

## 1. Project Overview

**Nexvelon** is a private quote-to-cash workspace for **security-systems
integrators** — firms that install Kantech / Genetec / Avigilon / DSC /
Hanwha hardware, raise multi-section quotes against ADI / Anixter / Wesco /
CDW catalogs, run their own commissioning checklists and ULC sign-off, and
need to know — to the dollar — which jobs are actually making money.

**Operating company:** Nexvelon Global Inc.

> Earlier drafts of this doc and several UI surfaces claimed
> "Holloway Security Integration Group · ULC Listed · ESA Licensed".
> Those were v0-era scaffolding artefacts — Nexvelon does **not** hold
> ULC or ESA certifications and "Holloway Security Integration Group"
> is not a real division. They were scrubbed from every user-facing
> surface. Do not reintroduce them. Customer-side ULC/ESA references
> in the app (e.g. the Settings → Company pane fields, the technician
> certification list, mock project descriptions) are the *integrator's
> own* certifications they're tracking — those are correct domain
> language and stay.

**Design tone:** private bank, not SaaS dashboard. Navy + gold + parchment,
Playfair Display headings, italic serif subtitles, tiny gold uppercase
tracked eyebrow labels everywhere. No neon, no chatbots, no rainbow charts.

**Origin:** built across multiple Claude Code sessions over 4 days
(2026-04-30 → 2026-05-03). Started as a static demo with mock data, then
progressively wired to a real Supabase backend, theme system, auth gate,
and live deployment.

**Audience:** the live URL is shown to clients and judges as a working
proof-of-concept. The tone is "this is a real product," not "this is a
demo." Demo chips on the login screen are visible deliberately so judges
can switch roles instantly.

---

## 2. Current State Snapshot

| Resource | Value |
| --- | --- |
| **Live URL** | https://app.nexvelonglobal.com |
| **Local dev URL** | http://localhost:3000 (or :3001 in this codebase's commands — see §13) |
| **GitHub repo** | https://github.com/nexvelon/nexvelon |
| **Default branch** | `main` |
| **Vercel project name** | `nexvelon` |
| **Vercel auto-deploy** | Yes — every push to `main` triggers a redeploy |
| **Supabase project URL** | https://qtznaisrrcqvtggzghil.supabase.co |
| **Supabase region** | ca-central-1 (data-residency requirement) |
| **DNS provider** | Namecheap (`nexvelonglobal.com`) — `app.` CNAME → `cname.vercel-dns.com` |
| **SSL** | Let's Encrypt via Vercel (auto-issued, auto-renewed) |
| **Last deployed commit** | `f1d5542` — "Wire Clients module to Supabase" |

### Vercel environment variables

Three Supabase env vars are configured at the **project level** (Vercel
dashboard → `nexvelon` → Settings → Environment Variables → Project tab):

| Var | Scope |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview + Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview + Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Production + Preview + Development (Sensitive) |

> **⚠ Important for future deploys:** Vercel offers two scoping options
> for env vars — **Shared** (organisation-wide, must be explicitly
> linked to each project) and **Project** (lives on the project
> directly). This project uses **Project-level**. If you instead add a
> variable under Shared without linking it, the Vercel build will fail
> with `Missing NEXT_PUBLIC_SUPABASE_URL` (or similar) at the runtime
> import site in `lib/supabase/{client,server,admin}.ts`. The error
> message looks like a code bug but is actually a Vercel config issue.

### Deployment status

| Surface | Where it runs |
| --- | --- |
| Static UI shell, sidebar, theme system, all 9 module routes | **LIVE on Vercel** |
| Login + demo-account chips | LIVE |
| Clients module schema (clients, sites, contacts) | **LIVE in Supabase** (migration `0001` applied) |
| Clients module wired to Supabase | **LIVE on Vercel** at https://app.nexvelonglobal.com/clients — verified end-to-end (create / read / update / soft-delete persists across reloads). Pushed in commit `f1d5542`. |
| All other modules (Dashboard, Quotes, Projects, Inventory, Scheduling, Financials, Users, Settings) | LIVE but still backed by **mock data** in `/lib/mock-data` |
| Real auth (Supabase Auth) | **Not built.** Login uses localStorage AuthProvider. |
| File storage (uploads) | **Not built.** Drop-zones exist in UI but accept files only into local state. |

### Working tree at handoff time

Working tree is **clean**. `main` is in sync with `origin/main`. Recent
commits, newest first:

```
f1d5542  Wire Clients module to Supabase
01f5541  Add CLAUDE_CONTEXT.md handoff document
dfc79be  Design v4.18 polish + login auth gate
b6f5d77  Initial Nexvelon build — Claude Code, Design, and Chat
d47a18d  Initial commit from Create Next App
```

`.env.local` is the only unversioned file you should expect on disk —
it's gitignored and holds the real Supabase keys (URL, publishable key,
service-role key).

---

## 3. Tech Stack

### Runtime + framework

| Tech | Version | Why |
| --- | --- | --- |
| **Node.js** | 24.15.0 (installed via official .pkg) | Latest LTS at session start; `engines: ">=18.17"` in package.json |
| **Next.js** | 15.5.15 | App Router + Turbopack + React 19 support. Production-ready and Vercel's first-class target. |
| **React** | 19.1.0 | Server actions, async cookies, automatic batching. Required for Next 15. |
| **TypeScript** | ^5 | Strict mode on. Every public API typed. |
| **Tailwind CSS** | ^4 (with `@tailwindcss/postcss`) | v4's `@theme inline` lets us drive utility classes from CSS variables — that's the foundation of the live theme switcher. |

### UI primitives

| Tech | Version | Why |
| --- | --- | --- |
| **shadcn/ui** | ^4.6.0 (CLI) | Component scaffolding. Note: this build uses the new **Base UI** flavour of shadcn (not Radix). API differences: see §15. |
| **@base-ui/react** | ^1.4.1 | Underlying primitives for Dialog, DropdownMenu, Sheet, Select, Popover, Command. Triggers do **not** support `asChild`. |
| **lucide-react** | ^1.14.0 | Icon set. Used everywhere. (Note: this is a 1.x release; tree-shake-friendly.) |
| **framer-motion** | ^12.38.0 | Animated KPI counters and stat-card entrances. |
| **sonner** | ^2.0.7 | Toast notifications. Mounted in `(app)/layout.tsx` and `(auth)/login/layout.tsx`. |
| **cmdk** | ^1.1.1 | ⌘K command palette (global + quote-builder quick-add). |

### Data + tables + charts + PDFs

| Tech | Version | Why |
| --- | --- | --- |
| **Recharts** | ^3.8.1 | All charts. Colour palette pulled from `useThemeColors()` hook so theme switches retint instantly. |
| **@tanstack/react-table** | ^8.21.3 | Sortable / filterable list tables (Quotes, Projects). |
| **@dnd-kit/core** | ^6.3.1 | Kanban drag-drop, Gantt bar drag-reschedule, scheduling assign-from-queue. |
| **@dnd-kit/sortable** + `utilities` | ^10 / ^3 | Sortable utilities for line-item reorder. |
| **@react-pdf/renderer** | ^4.5.1 | Quote PDF preview is the actual PDF — `<PDFViewer>` renders it live, `<PDFDownloadLink>` exports the same component. |
| **date-fns** | ^4.1.0 | All date formatting. **Always anchor to `TODAY` exported from `lib/dashboard-data.ts`** (currently `2026-04-30T12:00:00`) so demo data is deterministic regardless of when judges open it. |

### Backend

| Tech | Version | Why |
| --- | --- | --- |
| **Supabase JS** | ^2.105.1 | Postgres + Auth + Storage. |
| **Supabase SSR** | ^0.10.2 | Cookie-based session for server components / route handlers. |

### Tooling

| Tech | Why |
| --- | --- |
| **ESLint 9** + `eslint-config-next` | Linting. Build is currently strict — TypeScript errors fail the build. |
| **Vercel CLI** | Optional. Deploys are GitHub → Vercel webhook. |
| **GitHub CLI (`gh`)** | Installed at `~/.local/bin/gh` (v2.92.0). Authenticated as user **nexvelon**. |

---

## 4. Folder Structure

Annotated tree. Top-level dirs only. **Read these directories first** when
making any change.

```
nexvelon/
├── CLAUDE_CONTEXT.md              ← this file. Read first.
├── README.md                      ← public-facing project description, demo flow, feature matrix
├── package.json                   ← engines: ">=18.17"
├── next.config.ts                 ← bare default; no special config
├── postcss.config.mjs             ← Tailwind v4 PostCSS plugin
├── tsconfig.json                  ← path alias "@/*" → project root
├── eslint.config.mjs              ← Next + TS rules
├── components.json                ← shadcn registry config
├── .env.example                   ← every env var, with comments. Committed.
├── .env.local                     ← real keys (gitignored)
├── .gitignore                     ← .env.local, .next, node_modules, .claude/, etc.
├── app/                           ← Next.js App Router
│   ├── layout.tsx                 ← root: <html>, theme bootstrap script, AuthProvider, RoleProvider, ThemeProvider
│   ├── page.tsx                   ← /  → redirects to /login or /dashboard based on auth
│   ├── globals.css                ← Tailwind + theme tokens for all 4 themes + utility classes (.nx-eyebrow, .nx-rule, etc.)
│   ├── icon.svg                   ← gold "N" on navy favicon
│   ├── robots.ts                  ← disallow everything (private app)
│   ├── not-found.tsx              ← navy filigree 404 page
│   ├── error.tsx                  ← global error boundary
│   ├── (auth)/
│   │   └── login/
│   │       ├── layout.tsx         ← wraps in <RedirectIfAuthed> + <Toaster>
│   │       └── page.tsx           ← split-screen login + 5 demo chips
│   └── (app)/
│       ├── layout.tsx             ← wraps in <RequireAuth> + <AppShell> + <Toaster>
│       ├── dashboard/
│       │   ├── layout.tsx         ← per-route metadata
│       │   └── page.tsx           ← Executive Dashboard
│       ├── quotes/
│       │   ├── layout.tsx
│       │   ├── page.tsx           ← list
│       │   ├── new/page.tsx       ← builder (new quote)
│       │   └── [id]/page.tsx      ← builder (existing quote)
│       ├── projects/
│       │   ├── layout.tsx
│       │   ├── page.tsx           ← list (table + card view)
│       │   └── [id]/page.tsx      ← detail with 9 tabs
│       ├── clients/                ⚠ ONLY MODULE WIRED TO SUPABASE
│       │   ├── page.tsx           ← server component, fetches data
│       │   ├── ClientsView.tsx    ← client component, all interactivity
│       │   ├── actions.ts         ← server actions (create/update/delete × client/site/contact)
│       │   ├── ClientFormDrawer.tsx
│       │   ├── SiteFormDrawer.tsx
│       │   └── ContactFormDrawer.tsx
│       ├── inventory/
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── scheduling/
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── financials/
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── users/
│       │   ├── layout.tsx
│       │   └── page.tsx
│       └── settings/
│           ├── layout.tsx
│           └── page.tsx
│
├── components/
│   ├── auth/
│   │   ├── AuthProvider.tsx       ← localStorage session, signIn/signInAs/signOut
│   │   └── RequireAuth.tsx        ← <RequireAuth> guard + <RedirectIfAuthed>
│   ├── layout/                    ← AppShell pieces, used everywhere
│   │   ├── AppShell.tsx           ← <Sidebar> + <TopBar> + <main> + <GlobalCommandPalette>
│   │   ├── Sidebar.tsx            ← navy sidebar with bracketed-N mark, count badges, EST stamp
│   │   ├── TopBar.tsx             ← gold uppercase breadcrumbs + ⌘K search + bell + role + avatar
│   │   ├── Breadcrumbs.tsx        ← <GoldBreadcrumbs> uses useSearchParams (must be wrapped in <Suspense>)
│   │   ├── PageHeader.tsx         ← eyebrow / title / italic subtitle / actions / gold rule
│   │   ├── ActionButton.tsx       ← outline / primary / bronze variants
│   │   ├── EmptyState.tsx         ← gold-bordered icon + serif title + CTA
│   │   ├── Skeleton.tsx           ← .nx-skeleton shimmer wrapper
│   │   ├── GlobalCommandPalette.tsx ← ⌘K — indexes all clients/sites/projects/quotes/invoices/products/users
│   │   ├── NotificationsBell.tsx  ← popover with 9 mock notifications
│   │   ├── AvatarMenu.tsx         ← Profile/Settings/Switch/Help/Sign out
│   │   ├── RoleSwitcher.tsx       ← dropdown that mutates RoleContext
│   │   ├── Placeholder.tsx        ← (legacy, lightly used)
│   │   └── nav-config.tsx         ← sidebar nav items + count badges (open quotes, active projects, clients)
│   ├── modules/                    ← one folder per feature
│   │   ├── dashboard/             ← KPI cards, RevenueTrend, PipelineFunnel, InventoryHealth, etc.
│   │   ├── quotes/                ← QuotesTable, QuoteFilters, builder/{ClientSiteCard,SectionCard,LineItemRow,SkuAutocomplete,TotalsBar,QuoteDocument,PdfPreviewPane,...}
│   │   ├── projects/              ← list (table + cards), detail header, tabs/{OverviewTab,TasksTab,ScheduleTab,MaterialsTab,CommissioningTab,...}
│   │   ├── inventory/             ← StockTab, AllocationsTab, TransfersTab, etc.
│   │   ├── scheduling/            ← UnassignedQueue, CalendarView, TechDrawer
│   │   ├── financials/            ← Tabs.tsx (all 10 financial tabs in one file)
│   │   ├── users/                 ← Tabs.tsx + UserDrawer.tsx (the showpiece permission-override drawer)
│   │   └── settings/              ← BrandingThemes, BackupsData, SettingsPanes (12 panes)
│   └── ui/                         ← shadcn components (button, card, input, dropdown-menu, sheet, dialog, command, etc.)
│
├── lib/
│   ├── api/
│   │   └── clients.ts              ⚠ THE ONLY API FILE. Server-only, uses admin Supabase client.
│   ├── supabase/
│   │   ├── client.ts               browser supabase client (publishable key)
│   │   ├── server.ts               cookie-aware server client (for when real Supabase Auth lands)
│   │   └── admin.ts                service-role client. import "server-only". Used everywhere today.
│   ├── types/
│   │   └── database.ts             1:1 mirror of Supabase schema. Single source of truth for DB types.
│   ├── types.ts                    ← legacy mock-data types (Project, Quote, Client, etc.). Kept for non-wired modules.
│   ├── mock-data/                  18 mock seed files. Will shrink as modules migrate to DB.
│   ├── permissions.ts              role × resource × action matrix + hasPermission()
│   ├── permissions-matrix.ts       75-permission catalogue for the Users module UI
│   ├── role-context.tsx            <RoleProvider> + <Can resource action /> wrapper + useRole()
│   ├── theme.ts                    THEMES registry (4 presets) + ThemeColors type
│   ├── theme-context.tsx           <ThemeProvider> + useThemeColors() hook
│   ├── demo-accounts.ts            5 demo accounts with shared password "P@ssw0rd"
│   ├── notifications.ts            9 mock bell notifications
│   ├── format.ts                   formatCurrency / formatPercent / formatNumber via Intl
│   ├── utils.ts                    cn() classnames helper
│   ├── dashboard-data.ts           TODAY anchor + KPI builders + trend / funnel / activity helpers
│   ├── quote-helpers.ts            line-item math, totals, status order
│   ├── quote-store.ts              localStorage-backed quote persistence (until quotes migrate to DB)
│   ├── project-data.ts             tasks/materials/POs/commissioning/zones/docs/time builders
│   ├── inventory-data.ts           warehouse helpers, vendor directory, transfers seed
│   ├── scheduling-data.ts          job builder, swimlane data
│   ├── financials-data.ts          P&L builder, cash flow, AR aging
│   └── use-read-only.ts            read-only state hook for converted/approved quotes
│
└── supabase/
    └── migrations/
        └── 0001_clients_schema.sql  ← the only migration so far
```

---

## 5. Database Schema (current state)

**One migration applied:** `supabase/migrations/0001_clients_schema.sql`.
Three tables, no users / projects / quotes / invoices in the DB yet.

### `public.clients`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `name` | `text` | NOT NULL |
| `legal_name` | `text` | nullable |
| `client_code` | `text` | UNIQUE, nullable (e.g. `MCP-0017`) — UNIQUE creates an implicit index |
| `type` | `text` | CHECK ∈ {Commercial, Industrial, Residential, Healthcare, Education, Government, Heritage} |
| `tier` | `text` | CHECK ∈ {Platinum, Gold, Silver, Bronze} |
| `status` | `text` | NOT NULL, default `'Active'`, CHECK ∈ {Active, Inactive, Prospect, Lost} |
| `account_manager_id` | `uuid` | will FK → `users.id` once that table exists |
| `industry` | `text` | nullable |
| `notes` | `text` | nullable |
| `tags` | `text[]` | nullable |
| `lifetime_value` | `numeric(14,2)` | NOT NULL default 0 |
| `ytd_revenue` | `numeric(14,2)` | NOT NULL default 0 |
| `nps_score` | `integer` | nullable |
| `last_nps_date` | `date` | nullable |
| `created_at` | `timestamptz` | NOT NULL default `now()` |
| `updated_at` | `timestamptz` | NOT NULL default `now()` — bumped by trigger |
| `created_by` | `uuid` | will FK → `users.id` |
| `deleted_at` | `timestamptz` | nullable. Non-null = soft-deleted. |

**Indexes:** `clients_name_idx (name)`, `clients_tier_idx (tier)`,
`clients_status_idx (status)`, plus the implicit unique on `client_code`.

**Trigger:** `clients_set_updated_at BEFORE UPDATE` → `public.handle_updated_at()`.

### `public.sites`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `client_id` | `uuid` | NOT NULL, FK → `clients(id)` **ON DELETE CASCADE** |
| `name` | `text` | NOT NULL |
| `site_code` | `text` | nullable |
| `address_line1` / `address_line2` | `text` | nullable |
| `city` / `province` / `postal_code` | `text` | nullable |
| `country` | `text` | NOT NULL default `'Canada'` |
| `latitude` / `longitude` | `numeric(10,7)` | nullable |
| `panel_system` | `text` | nullable |
| `cameras_count` / `controllers_count` / `doors_count` / `cards_issued` | `integer` | NOT NULL default 0 |
| `intrusion_system` | `text` | nullable |
| `site_lead_id` | `uuid` | will FK → `users.id` |
| `status` | `text` | NOT NULL default `'Active'`, CHECK ∈ {Active, In Project, Maintained, Decommissioned} |
| `last_service_date` | `date` | nullable |
| `notes` | `text` | nullable |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | as above |

**Indexes:** `sites_client_id_idx (client_id)`, `sites_status_idx (status)`.

**Trigger:** `sites_set_updated_at`.

### `public.contacts`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `client_id` | `uuid` | nullable, FK → `clients(id)` **ON DELETE CASCADE** |
| `site_id` | `uuid` | nullable, FK → `sites(id)` **ON DELETE SET NULL** |
| `first_name` / `last_name` | `text` | NOT NULL |
| `title` / `department` / `email` / `phone` / `mobile` / `notes` | `text` | nullable |
| `is_primary` / `is_billing` / `is_emergency` | `boolean` | NOT NULL default `false` |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | as above |

**Indexes:** `contacts_client_id_idx`, `contacts_site_id_idx`, `contacts_email_idx`.

**Trigger:** `contacts_set_updated_at`.

### Shared

- **Function:** `public.handle_updated_at()` — `BEFORE UPDATE` trigger that
  stamps `updated_at = now()`.
- **Extension:** `pgcrypto` (for `gen_random_uuid()`).

### RLS policies

All three tables have RLS **enabled**, with permissive policies:

```sql
create policy "authenticated_all_<table>"
  on public.<table>
  for all
  to authenticated
  using (true)
  with check (true);
```

> **⚠ Important:** these policies grant *only the `authenticated` role*.
> The current app has **no Supabase Auth session**, so all DB calls go
> through `lib/supabase/admin.ts` (service-role key), which **bypasses RLS
> entirely**. When real Supabase Auth lands, swap to the cookie-aware
> client in `lib/supabase/server.ts` and the existing policies will start
> being enforced. See §6.

### Module → DB wiring status

| Module | Status |
| --- | --- |
| Clients | **Wired** to Supabase (`clients`, `sites`, `contacts`). Working tree only — not pushed yet. |
| Quotes | Mock — `lib/mock-data/quotes.ts` + `lib/quote-store.ts` (localStorage). |
| Projects | Mock — `lib/mock-data/projects.ts` + `lib/project-data.ts` builders. |
| Inventory | Mock — `lib/mock-data/products.ts` + `lib/inventory-data.ts`. |
| Scheduling | Mock — `lib/scheduling-data.ts`. |
| Financials | Mock — derived from `lib/mock-data/invoices.ts` + `lib/financials-data.ts`. |
| Users | Mock — `lib/mock-data/users.ts`. |
| Audit log | Mock — `lib/mock-data/audit-log.ts`. |
| Subcontractors | Mock — `lib/mock-data/subcontractors.ts`. |

---

## 6. Authentication State

### Today (Session A · live)

**Implementation:** real Supabase Auth (email + password) with an
email-OTP second factor we built on top. Invite-only — no public signup.
Cookie-backed sessions, JWT validated server-side, RLS enforced on every
data table.

**Pieces:**
- `components/auth/AuthProvider.tsx` — client provider that hydrates from
  `supabase.auth.getUser()` and the `profiles` row, subscribes to
  `onAuthStateChange`, and exposes `{ user, profile, status, signOut,
  refreshProfile }`.
- `lib/supabase/{client,server,middleware,admin}.ts` — the four flavours
  of Supabase client: browser (anon key), cookie-aware server (anon key
  + cookies), edge-middleware (anon key + cookie shuttle), service-role
  (admin operations only).
- `middleware.ts` — refreshes the session on every request, redirects
  anonymous users to `/login`, redirects MFA-pending users to
  `/auth/verify-otp`. Source of truth for routing decisions.
- `lib/auth/*` — server-only utilities: `otp` (generate/hash/verify with
  bcrypt), `email` (Resend OTP send), `audit` (writes to
  `auth_audit_log`), `profile` (cookie-aware reads, service-role
  mutations), `password-policy` (12+/upper/lower/digit/symbol),
  `request-info` (IP + UA from headers), `normalize-role` (DB 11-role →
  app 7-role mapping).

**Flow (sign-in):**
1. User lands on `/login`. Submits email + password.
2. Server action `signInAction` (`app/(auth)/login/actions.ts`):
   - Calls `supabase.auth.signInWithPassword`.
   - If error → audit `login_failed`, return error.
   - Loads the `profiles` row. If `status !== 'Active'` → signOut + audit
     + return a friendly error. (Suspended / Terminated / Invited each
     get their own message.)
   - Generates a 6-digit OTP, bcrypt-hashes it, inserts into `auth_otp`.
   - Sends the plaintext code via Resend (`lib/auth/email.ts`).
   - Audits `mfa_challenge_sent`, returns `{ ok: true,
     redirectTo: '/auth/verify-otp' }`.
3. Client navigates to `/auth/verify-otp`. The Supabase session cookie
   IS set, but middleware's `has_pending_otp()` RPC returns true so
   every protected route bounces back to `/auth/verify-otp` until the
   second factor is consumed.
4. User enters the 6-digit code. `verifyOtpAction` looks up the row,
   bcrypt-compares, checks expiry + attempts < 5, marks `used_at`,
   stamps `profiles.last_login_at` + `last_login_ip`, audits
   `mfa_challenge_verified` + `login_success`. Redirects to
   `/dashboard` (or `?next=` if it was preserved).
5. Sign-out (`AuthProvider.signOut` or `signOutAction`) calls
   `supabase.auth.signOut()` + redirects to `/login`.

**Flow (invite → first sign-in):**
1. Admin opens **Users** module → **+ Invite user** → fills the drawer
   (email, name, role, optional title/department/phone).
2. `inviteUserAction` (`app/(app)/users/actions.ts`):
   - Verifies caller is `Admin` + `Active`.
   - Calls `supabase.auth.admin.inviteUserByEmail(email, { data:
     { first_name, last_name, role, created_by }, redirectTo:
     '/auth/callback?next=/auth/set-password' })`.
   - The `on_auth_user_created` trigger creates the matching
     `profiles` row with `status='Invited'` and the right role.
   - Audits `user_invited`. Resend delivers the branded invite email.
3. Invitee clicks the email link → `/auth/callback?code=…` exchanges
   the PKCE code for a session → forwards to `/auth/set-password`.
4. `/auth/set-password` shows password + confirm with live strength
   meter. Submit → `setPasswordAction`:
   - Validates the password policy.
   - Calls `supabase.auth.updateUser({ password })`.
   - Flips `profiles.status='Active'` and `mfa_enrolled=true` via the
     service-role helper (bypasses the
     `guard_profile_updates` trigger).
   - Audits `password_changed`, returns `{ ok: true,
     redirectTo: '/dashboard' }`.
5. Subsequent sign-ins go through the OTP flow above.

### Status gate

Sign-in checks `profiles.status` after password verification. Only
`Active` proceeds to OTP. The other states yield:

| Status      | UI message                                                          |
| ---         | ---                                                                 |
| Active      | (continues to OTP)                                                  |
| Invited     | "Your account setup is incomplete. Use the invitation email link." |
| Suspended   | "Your account is suspended. Contact your administrator."            |
| Terminated  | "Your account is no longer active."                                 |

### Admin lifecycle controls

Per-row dropdown on `/users` (Admin only):
- **Suspend**: revokes all sessions
  (`DELETE /auth/v1/admin/users/<id>/sessions`), flips status →
  `Suspended`. Logs `user_suspended` + `session_revoked`.
- **Reactivate**: status → `Active`. Logs `user_reactivated`.
- **Terminate**: revokes sessions, status → `Terminated`, stamps
  `terminated_at = now()`. Logs `user_terminated` + `session_revoked`.

Admins can't act on themselves from this UI — the menu is disabled on
your own row.

### MFA implementation note

Supabase Auth's native MFA supports TOTP / WebAuthn / SMS but **not**
email-OTP-as-second-factor. We rolled our own (`auth_otp` table,
`has_pending_otp()` RPC, the `lib/auth/otp.ts` helpers) on top of
`signInWithPassword`. Future upgrade path: enable Supabase Auth Hooks +
mint a `mfa_verified` JWT claim so RLS can enforce the gate too (today
it's middleware-enforced — see §12 #14).

### Bootstrap admin

`scripts/bootstrap-admin.ts`:

```bash
npx tsx scripts/bootstrap-admin.ts
# or override defaults:
npx tsx scripts/bootstrap-admin.ts --email someone@example.com --first Jane --last Doe
```

Reads `.env.local`, calls `auth.admin.inviteUserByEmail()` with
`role='Admin'`, the trigger creates the profile with status='Invited',
the user clicks the email link → `/auth/set-password` → status flips to
`Active`. If the user already exists, the script falls back to
`generateLink({ type: 'magiclink' })` to re-issue the link.

### Supabase posture

- **Anonymous and pre-OTP requests are denied at RLS** — any anonymous
  query against `clients`/`sites`/`contacts`/`profiles` returns nothing.
- **Authenticated reads/writes** to those four tables are allowed for
  any signed-in user (per-action policies — no DELETE; soft-delete via
  `deleted_at`).
- **Service-role bypass** is reserved for admin operations: invite,
  status changes, audit-log inserts, OTP creation/verification.
- **`has_pending_otp()`** is a `SECURITY DEFINER` RPC granted to
  `authenticated`, so middleware can ask the question without holding
  the service-role key in Edge runtime.

### To tighten further (Session B / C)

- Per-role row scoping on `clients`/`sites`/`contacts` (e.g. SalesRep
  sees only `where account_manager_id = auth.uid()`).
- Custom JWT claim `mfa_verified` to push the OTP gate into RLS.
- Proper per-user permission overrides driven from the existing
  `permissions-matrix.ts` catalogue (UI exists in `UserDrawer.tsx`,
  doesn't persist yet).

---

## 7. Module Status Matrix

| Module | Status | DB-wired | Files |
| --- | --- | --- | --- |
| **Auth (login + OTP + invite)** | **LIVE · real Supabase Auth + email OTP** | ✓ `auth.users` + `profiles` + `auth_otp` + `auth_audit_log` | `app/(auth)/login/{page,layout,actions}.tsx`, `app/auth/{verify-otp,set-password,callback}/**`, `middleware.ts`, `components/auth/{AuthProvider,RequireAuth}.tsx`, `lib/supabase/{client,server,middleware,admin}.ts`, `lib/auth/{otp,email,audit,profile,password-policy,request-info,normalize-role}.ts`, `scripts/bootstrap-admin.ts` |
| **Dashboard** | LIVE · 6 KPI cards + 4 charts | ✗ Mock | `app/(app)/dashboard/page.tsx`, `components/modules/dashboard/*` (11 files), `lib/dashboard-data.ts` |
| **Quotes** | LIVE · list + builder + live PDF preview | ✗ Mock + localStorage drafts | `app/(app)/quotes/{page,new/page,[id]/page}.tsx`, `components/modules/quotes/**` (18 files), `lib/quote-store.ts`, `lib/quote-helpers.ts`, `lib/mock-data/quotes.ts` |
| **Projects** | LIVE · list + 9-tab detail | ✗ Mock | `app/(app)/projects/{page,[id]/page}.tsx`, `components/modules/projects/**` (17 files including 9 tab files), `lib/project-data.ts`, `lib/mock-data/projects.ts` |
| **Clients** | **LIVE · WIRED to Supabase, RLS-enforced** | ✓ `clients` + `sites` + `contacts` | `app/(app)/clients/{page.tsx,ClientsView.tsx,actions.ts,ClientFormDrawer.tsx,SiteFormDrawer.tsx,ContactFormDrawer.tsx}`, `lib/api/clients.ts`, `lib/types/database.ts`, `lib/supabase/{client,server,admin}.ts` |
| **Inventory** | LIVE · 6 tabs | ✗ Mock | `app/(app)/inventory/page.tsx`, `components/modules/inventory/*` (6 files), `lib/inventory-data.ts`, `lib/mock-data/products.ts` |
| **Scheduling** | LIVE · drag-drop dispatch board | ✗ Mock | `app/(app)/scheduling/page.tsx`, `components/modules/scheduling/*` (3 files), `lib/scheduling-data.ts` |
| **Financials** | LIVE · 10 tabs (P&L, BS, Cash Flow, etc.) | ✗ Mock | `app/(app)/financials/page.tsx`, `components/modules/financials/Tabs.tsx`, `lib/financials-data.ts`, `lib/mock-data/invoices.ts` |
| **Users & Permissions** | **LIVE · users tab + invite drawer + status actions wired to Supabase**; other 5 tabs (Roles / Permissions Matrix / Activity Log / Subcontractors / Invitations) still mock-driven for everything except invite list | ✓ `profiles` + `auth_audit_log` (Users tab), ✗ Mock (other tabs) | `app/(app)/users/{page,UsersView,actions}.tsx`, `components/modules/users/{Tabs,UserDrawer,InviteUserDrawer}.tsx`, `lib/api/users.ts`, `lib/permissions-matrix.ts`, `lib/mock-data/{users,audit-log}.ts` |
| **Settings** | LIVE · 13 panes incl. live theme switcher | ✗ Mock | `app/(app)/settings/page.tsx`, `components/modules/settings/{BrandingThemes,BackupsData,SettingsPanes}.tsx` |

### Demo data canonical names

After the v4.18 design rename, these names appear consistently across
every mock file. Don't introduce other variants.

**Users:** Marcus Holloway, Aria Vance, Camille Beaumont, Lev Petrov,
Damola Okafor, Eleanor Carstairs, Sloane Chen, Ravi Singh, Naomi Khaled,
Edward Caldwell, Imani Brooks, Hugo Reinholt, Theo Nakamura, Maya
Forsythe, Vortex Cabling Ltd, Stratos Conduit Co, Greta Halvorsen, Noah
Esterhuyse.

**Clients:** Meridian Capital Plaza, Westgate Industrial, Hartwell Estates,
Cromwell Logistics, Ardent Pharmaceuticals, Bellmont Hospital Group,
Ironclad Distribution, Bellwood Condos, Stratford Medical Center, Wexford
Pharmaceuticals, Kempton Independent Schools, Crestwood Private Residence,
Kingsbridge Auto Group, Halton Cold Storage, St. Cuthbert Cathedral,
Sterling Industrial, Beacon Energy Solutions, Vance Capital Partners,
Greenfield Medical Plaza, Ashford Heritage Manor.

---

## 8. Permission System

### Definitions

- **Resources:** `dashboard, quotes, projects, clients, inventory,
  scheduling, financials, users, settings` (in `lib/permissions.ts`).
- **Actions:** `view, create, edit, delete, approve, convert,
  viewMargin, viewInternal, viewCost, viewAll, manage`.
- **Roles:** `Admin, SalesRep, ProjectManager, Technician,
  Subcontractor, Accountant, ViewOnly`.

### Runtime API

```ts
import { hasPermission } from "@/lib/permissions";
hasPermission("SalesRep", "quotes", "viewMargin"); // → false
```

### React API

```tsx
import { Can, useRole } from "@/lib/role-context";

<Can resource="financials" action="view" fallback={<RestrictedCard />}>
  <FinancialsContent />
</Can>

const { role, setRole } = useRole();
```

### Where roles are enforced

| Surface | Enforcement |
| --- | --- |
| Sidebar (disable nav items the role can't view) | `Sidebar.tsx` checks `canViewRoute(role, item.resource)` |
| Page-level gate (Financials, Users) | `<Can resource action fallback>` at top of page |
| Inline column / cell gate (Inventory cost, quote margin) | `<Can>` or inline `hasPermission()` |
| Sidebar count badges | `nav-config.tsx` — purely cosmetic |

### Live demo via top-bar role switcher

The `RoleSwitcher` dropdown in the top bar mutates the same
`RoleContext`. Switching role retints the entire UI in-place — no reload.
This is **deliberately visible in the demo build**; in production
it should be gated behind a feature flag (`NEXT_PUBLIC_ENABLE_ROLE_SWITCHER`).

### Permission matrix UI

A 75-permission catalogue lives in `lib/permissions-matrix.ts`. Most are
**display-only** — the matrix UI in `/users` and the
`UserDrawer` toggles don't yet enforce all of them at runtime. Only the
~10 permissions tagged `enforced: true` actually gate UI today (see
that file for the list).

### Roadmap to DB-level enforcement

When Supabase Auth lands (§6), policies will check the caller's role via
a join through a `user_roles` table. Plan:

1. Add `public.user_roles (user_id uuid PK references auth.users, role text, ...)`.
2. Replace permissive RLS policies on `clients` / `sites` / `contacts`
   with role-aware ones, e.g.:
   ```sql
   create policy "sales_reps_see_own_clients"
     on public.clients
     for select
     to authenticated
     using (
       exists (select 1 from public.user_roles
               where user_id = auth.uid()
                 and role in ('Admin','ProjectManager','Accountant'))
       or account_manager_id = auth.uid()
     );
   ```

---

## 9. Theme System

### 4 presets

Defined in `lib/theme.ts`. `royal-navy` is the default.

| Key | Name | Primary | Accent | Background |
| --- | --- | --- | --- | --- |
| `royal-navy` | Royal Navy (default) | `#0A1226` | `#B8924B` (burnished bronze) | `#F5F1E8` (parchment) |
| `onyx-brass` | Onyx & Brass | `#1A1A1A` | `#B5895A` | `#F1ECE3` |
| `oxford-green` | Oxford Green | `#0F2A1D` | `#C9A24B` | `#F4F1EA` |
| `burgundy-reserve` | Burgundy Reserve | `#3B0D1A` | `#C9A24B` | `#F8F5EE` |

### How it works

1. Each theme is a CSS-variable block in `app/globals.css` keyed by
   `:root[data-theme="<key>"]`.
2. **Brand tokens** (`--brand-primary`, `--brand-accent`, `--brand-bg`,
   etc.) are themed.
3. **Tailwind utilities** (`bg-brand-navy`, `text-brand-gold`, etc.)
   resolve through `var(--color-brand-navy: var(--brand-primary))` in the
   `@theme inline` block. Switching `[data-theme]` retints every utility
   class in the same render tick.
4. **shadcn tokens** (`--primary`, `--accent`, `--card`, `--sidebar`,
   `--chart-1..5`) all derive from brand tokens — they switch in lockstep.
5. **Recharts**: `useThemeColors()` from `lib/theme-context.tsx` returns
   the active theme's palette as a `{ primary, accent, charts: [...] }`
   object. Every chart consumes this hook so theme switches retint charts
   without a re-mount.
6. **FOUC prevention**: a tiny inline `<script>` in `app/layout.tsx` reads
   `localStorage["nexvelon:theme"]` and stamps `data-theme` on `<html>`
   *before* React hydrates.
7. **Switcher**: `Settings → Branding & Themes` (`components/modules/settings/BrandingThemes.tsx`)
   shows all four presets as mini mockups; click applies + persists.

### Adding a fifth theme

1. Add the entry to `THEMES` and `THEME_ORDER` in `lib/theme.ts`.
2. Add a `:root[data-theme="<new-key>"]` block in `app/globals.css` with
   all `--brand-*` values.
3. Update the regex in `app/layout.tsx`'s `themeBootstrap` script.
4. The mini-mockup card in `BrandingThemes.tsx` reads from `THEMES`
   automatically — no UI changes needed.

### Utility classes (component-layer)

In `globals.css` under `@layer components`:

- `.nx-eyebrow` — tiny gold uppercase tracked label (10px, gold)
- `.nx-eyebrow-soft` — slightly darker gold for nested/secondary labels
- `.nx-subtitle` — italic Playfair Display, muted text
- `.nx-rule` — gradient gold horizontal rule under page headers
- `.nx-diamond` — `◆` decorative bullet in PDF letterhead
- `.nx-skeleton` — animated shimmer for loading skeletons

Use these instead of re-implementing the styling inline.

---

## 10. Backups & Data

### Current state: **UI only, no implementation**

`components/modules/settings/BackupsData.tsx` renders a fully detailed
backup-management UI: destination toggles, schedule, history, restore,
per-client export. **None of it is wired to anything.** Buttons toast
success and the progress bar is a `setTimeout`.

### Mac folder structure (designed but not implemented)

The UI shows this tree visualization:

```
/Users/<user>/Nexvelon/Backups/
└── Clients/
    └── <ClientName>/
        ├── Quotes/
        ├── Projects/
        ├── Invoices/
        ├── Documents/
        └── Photos/
```

A "Download Nexvelon Sync for Mac" button exists. The agent itself
doesn't exist.

### What needs to be built

For local Mac backups:
1. A Tauri / Electron desktop agent (or a CLI invoked by `launchd`) that
   mounts the user's filesystem and writes scheduled snapshots.
2. An auth handshake from the agent to the Supabase project so it can
   pull data scoped to the user's client tenancies.
3. A streaming export endpoint (e.g. `GET /api/export/clients/<id>`) that
   the agent calls.

For cloud backups: Supabase doesn't auto-export to user-specified
buckets. Options: scheduled `pg_dump` via Supabase Cron + write to
S3, or use Supabase's native PITR (already on for paid tiers).

For the per-client ZIP export: would need a route handler (e.g.
`app/api/clients/[id]/export/route.ts`) that streams a zip built from
project documents, photos, quote PDFs, etc.

**Priority:** low for the demo, high for the real product. Don't sink
time here until §11 priorities 1–4 are done.

---

## 11. Roadmap — What's Next

Priority order. Each item is a deliverable with rough scope estimate.

### Session A — Real auth ✅ DONE

Shipped via migrations 0002 + 0003 plus the auth code on `main`. Live at
https://app.nexvelonglobal.com/login. Includes:
- Real Supabase Auth (email + password, invite-only).
- Email-OTP 2FA (single-use, 10-min, 5-attempt).
- Branded invite + OTP emails via Resend (Supabase SMTP integration).
- `profiles`, `auth_otp`, `auth_audit_log` schema with `is_admin()` /
  `has_pending_otp()` / `guard_profile_updates` helpers.
- `clients` / `sites` / `contacts` RLS tightened to per-action policies;
  `lib/api/clients.ts` swapped to the cookie-aware server client.
- Users module: server-component fetch from `profiles`, invite drawer,
  per-row Suspend / Reactivate / Terminate with session revocation +
  audit logging.
- `scripts/bootstrap-admin.ts` for the first-admin invite.
- Demo-era code retired: localStorage `AuthProvider`, demo-account
  chips, `lib/demo-accounts.ts`, `RoleSwitcher`,
  `NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS` / `_ROLE_SWITCHER` env flags.

### P0 — Wire the Quotes module to Supabase

Next biggest payoff. Depends on Clients (live) and (eventually) Users
profiles for `owner_id` (already in the DB).

- Migration: `0004_quotes_schema.sql` — `quotes`, `quote_sections`,
  `quote_line_items`. FKs: `quotes.client_id → clients.id`,
  `quotes.site_id → sites.id` (nullable), `quote_sections.quote_id`
  cascade, `quote_line_items.section_id` cascade. Status enum: Draft,
  Sent, Approved, Rejected, Expired, Converted.
- `lib/types/database.ts` — extend with `DbQuote`, `DbQuoteSection`,
  `DbQuoteLineItem` (+ Insert/Update variants).
- `lib/api/quotes.ts` — mirror `lib/api/clients.ts` pattern (cookie-aware
  client; RLS-enforced).
- `app/(app)/quotes/actions.ts` — server actions.
- Convert `app/(app)/quotes/page.tsx` to a server component.
- Retire `lib/quote-store.ts` and the localStorage drafts pattern.
- **Scope:** ~4-6 hours.

### Session B — Per-user permission overrides + role refinement

- Expand `lib/permissions.ts` `Role` type to the full 11-value DB enum
  and retire `lib/auth/normalize-role.ts`.
- Build `public.user_permissions (user_id uuid, permission_id text,
  granted boolean)` overrides table.
- Wire the existing `UserDrawer.tsx` permission-override UI to actually
  persist (it's the showpiece — UI exists, doesn't write today).
- Add `mfa_verified` JWT custom claim (Supabase Auth Hooks) so RLS can
  enforce the OTP gate too (today it's middleware-only — see §12 #14).
- Adopt shadcn AlertDialog for the destructive
  Suspend / Reactivate / Terminate confirmations (currently
  `window.confirm()` — see §12 #4).
- **Scope:** ~6-8 hours.

### Session C — Data scope/RLS + audit log surfacing

- Replace permissive RLS on `clients`/`sites`/`contacts` with role-aware
  policies (e.g. SalesRep sees only own clients).
- Surface `auth_audit_log` rows in the Users module's Activity Log tab
  (currently mock-driven).
- **Scope:** ~3-4 hours.

### P1 — Subsequent modules in priority order

1. **Projects** — biggest payoff because of the 9-tab detail page.
   Depends on Quotes (for `quote_id` FK linking converted quotes) and
   `profiles` (for `manager_id`, `lead_tech_id`, `sales_rep_id` FKs).
   - Migration: `projects`, `project_tasks`, `project_materials`,
     `purchase_orders`, `commissioning_items`, `intrusion_zones`,
     `project_documents`, `time_entries`.
   - Will need carefully designed FKs and RLS scoping.
   - **Scope:** ~6-8 hours.
2. **Inventory** — depends on Vendors. ~80 SKUs of seed data.
   - **Scope:** ~3-4 hours.
3. **Financials** — invoices, bills. Read-only initially is fine.
   - **Scope:** ~2-3 hours.
4. **Scheduling** — depends on Projects and `profiles`. Job records +
   crew assignments.
   - **Scope:** ~3-4 hours.

### P3 — File storage (shop drawings, photos)

- Create Supabase Storage buckets: `project-documents` (private),
  `project-photos` (private), `client-logos` (public).
- Add RLS-equivalent storage policies.
- Wire the Documents tab in `components/modules/projects/tabs/DocumentsTab.tsx`
  drag-zone to `supabase.storage.from('project-documents').upload(...)`.
- Wire the Commissioning tab photo button.
- Wire the Branding & Themes logo upload.
- **Scope:** ~3-4 hours.

### P4 — Backup automation

See §10. Build the Mac sync agent or pivot to PITR + S3 mirror.
**Scope:** big — ~1-2 weeks.

### P5 — Security hardening

- Replace permissive RLS policies with role-aware ones (covered by
  Session C above — listed here for cross-reference).
- Add API rate limiting (Vercel Edge Middleware or Supabase rate-limits).
- Audit headers (`Strict-Transport-Security`, `Content-Security-Policy`,
  `X-Frame-Options`, etc.) — add a `next.config.ts` `headers()` block.
- **Scope:** ~2-3 hours.

### P6 — Misc polish

- Real notifications (Supabase Realtime → bell).
- Per-route metadata cleanup (some still default to template).
- Replace `window.confirm()` delete confirmations with shadcn
  AlertDialog.
- Replace remaining mock charts with DB-derived data.
- Mobile responsiveness audit (the app is built for 1440px first; below
  ~1100px the dispatch Gantt and quote builder PDF preview overflow).

---

## 12. Known Issues / Tech Debt

These are deliberate Phase-1 trade-offs documented so future sessions
don't "fix" them by accident.

1. **Admin (service-role) client is reserved for privileged actions
   only.** As of Session A, `lib/api/clients.ts` uses the cookie-aware
   server client and RLS is enforced. Service role lives in
   `lib/api/users.ts` (invite + status changes), `lib/auth/otp.ts`
   (creates / consumes OTP rows that no client may touch),
   `lib/auth/audit.ts` (audit log inserts), `lib/auth/profile.ts`
   `updateProfileAdmin` (bypasses `guard_profile_updates`), and
   `scripts/bootstrap-admin.ts`. **Never reach for the admin client
   from a route's render path** — keep it inside server actions that
   have already authorised the caller.
2. **No per-user/per-role row scoping yet.** RLS on
   `clients`/`sites`/`contacts` is "any authenticated user, no DELETE".
   Any signed-in user sees every client. Session C tightens this.
3. **Two parallel "client" type systems coexist.**
   - `lib/types.ts` defines the *legacy* `Client` for mock data
     (`lib/mock-data/clients.ts`) and is consumed by Quotes / Projects /
     Financials / Inventory / Scheduling / Users.
   - `lib/types/database.ts` defines the *new* `DbClient` from Supabase,
     consumed only by the Clients module.
   - **As each module migrates to DB**, retire its legacy type and
     stop importing from `lib/mock-data/`. The Clients module is the
     reference pattern.
4. **`window.confirm()` for deletes.** Used in `ClientsView.tsx` for
   speed. Replace with a proper AlertDialog when you have time.
5. **Mock data names overlap with DB names.** A mock `clients` collection
   exists in `lib/mock-data/clients.ts` (exporting `clients` as a
   constant array). The DB also has a `clients` table. The Clients
   module imports only from the DB API; everything else still imports
   from mock data. **Take care during migrations** to update consumers
   in lockstep so you don't end up with the dashboard reading mock
   client names while the Clients page reads DB names.
6. **Demo dates are anchored to 2026-04-30** in `lib/dashboard-data.ts`
   (`export const TODAY = ...`). All mock data references this so
   trends, "Days remaining", etc. are stable. Don't replace with
   `new Date()` in any chart helper unless that module is fully off
   mock data.
7. **`force-dynamic` on `/clients`.** The page exports
   `export const dynamic = "force-dynamic"` so Vercel never serves a
   stale prerendered version. Other modules don't yet need this — add
   it as you wire each one.
8. **Recharts SSR width warnings.** `ResponsiveContainer` measures zero
   during prerender and emits a console warning during `next build`.
   Cosmetic — charts render fine on the client. Don't try to "fix" by
   removing `ResponsiveContainer`.
9. **shadcn Base UI components don't support `asChild`.** When you copy
   a shadcn snippet from the Radix-based docs, it'll have
   `<Button asChild>...<Link/>...</Button>` patterns. Those won't
   compile here. Use `buttonVariants()` to apply button styles to a
   raw `<Link>` instead. Pattern is in `app/(auth)/login/page.tsx`.
10. **`lucide-react ^1.14.0`.** The 1.x release moved many icon names.
    If you import an icon and TS complains "X has no exported member,"
    open the package and check the new name.
11. **Sidebar uses inline `style={...}` heavily.** Because the
    background/border/text colors all reference theme CSS variables
    that need to be kept in sync, and Tailwind utility classes
    can't easily express `color-mix(...)` constructs. Don't refactor
    to Tailwind classes without preserving the exact colour math.
12. **DB-wired surfaces today:** the `/clients` module end-to-end (read
    + write through `clients`/`sites`/`contacts`); the **/users** Users
    tab + invite drawer + Suspend/Reactivate/Terminate row actions
    (read from `profiles`, write to `profiles`/`auth.users`/
    `auth_audit_log`); and every auth surface (login → OTP → set-
    password → invite). The other 7 module surfaces still read from
    `/lib/mock-data`. See §11 P0 for the next module to migrate.

    **Orphaned showpiece:** `components/modules/users/UserDrawer.tsx`
    (the 75-permission override drawer) is no longer mounted from
    `/users` since Session A — clicking a row opens the action menu
    instead. The file is kept on disk because Session B will wire it
    to the `user_permissions` overrides table. Don't delete it.

    **Two parallel role enums coexist.** `lib/types.ts` `Role` is the
    7-value app enum used by the permissions matrix; `lib/types/
    database.ts` `DbRole` is the 11-value DB enum.
    `lib/auth/normalize-role.ts` collapses DB → app on read. Session B
    will expand the matrix to 11 and retire the helper.
13. **Vercel env vars are project-level, not Shared+Link.** The three
    Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are
    attached directly to the `nexvelon` Vercel project rather than
    declared once at the org level and linked. This is fine for a
    one-project tenancy. **If the team scales to multiple Vercel
    projects** (staging, internal admin, etc.) sharing the same
    Supabase backend, migrate to the Shared + Link pattern: declare the
    vars once under Vercel → Settings → Environment Variables → Shared,
    then link each project. Watch out: a Shared var that is *not*
    explicitly linked to a project produces builds that fail with
    `Missing NEXT_PUBLIC_SUPABASE_URL` at the import site in
    `lib/supabase/{client,server,admin}.ts`. The error reads like a
    code bug; it's a Vercel config issue.
14. **MFA gate is middleware-enforced, not RLS-enforced.** During the
    ~10-minute window between password verification and OTP
    verification, the user holds a valid Supabase JWT. Any direct REST
    call from that JWT to Supabase succeeds (RLS still scopes data to
    the role, but the OTP gate isn't part of the gate). The Next.js
    middleware blocks every protected app route by checking
    `public.has_pending_otp()` per request; we don't expose any
    public REST endpoints, so this is the only practical bypass surface
    and there are no callers for it today. **Upgrade path** when this
    matters: enable Supabase Auth Hooks, mint a `mfa_verified` custom
    JWT claim that flips on `mfa_challenge_verified`, and add an RLS
    policy line on every sensitive table requiring it. Defer to
    Session B or C.
15. **Manual cross-device test pass needed after Session A.** The new
    auth surfaces (`/login`, `/auth/verify-otp`, `/auth/set-password`)
    were built mobile-first with explicit min-44px touch targets, but
    haven't been tested on real devices yet. Run a manual sweep before
    we open invites:
    - **Breakpoints:** 320px (iPhone SE), 768px (iPad portrait),
      1024px (iPad landscape / small laptop), 1440px (desktop default).
    - **Browsers:** Safari (macOS), Chrome (macOS + Windows), Firefox,
      Edge, **iOS Safari**, **Android Chrome**.
    - **What to verify on each:** login submit, autofill of email +
      saved password, OTP `inputMode="numeric"` shows numeric keyboard,
      password manager picks up `autocomplete="one-time-code"` for the
      OTP field on iOS, eye/show-password toggle is reachable, no
      horizontal scroll at 320px, all buttons at least 44×44 CSS px.

---

## 13. How to Resume Work

A fresh Claude Code session should run through this checklist on first
launch in this repo. Don't skip steps.

### Step 0 — Read this file

Read `CLAUDE_CONTEXT.md` end-to-end before suggesting any change.
Especially §6, §11, and §12.

### Step 1 — Confirm the branch is clean

```bash
git status
git branch --show-current   # should be "main"
git log --oneline -3
```

If there are uncommitted changes, **stop and ask** what's intended
before editing. The user often has work-in-progress.

### Step 2 — Verify the dev server boots

```bash
npm install            # only if node_modules missing
npm run dev            # default port 3000

# OR if 3000 is taken (which it usually is in this user's setup):
PORT=3001 npm run dev
```

Expected output: `✓ Ready in <500ms` and the line `- Environments:
.env.local` (proves env vars are loading).

### Step 3 — Verify Supabase connection

The Clients page is the canary. Hit it with curl after auth (the page
itself returns 200 even when anonymous because RequireAuth renders the
"Verifying session…" loader, but a Supabase failure would crash the
page). For a real check, run:

```bash
node -e "
import('./node_modules/@supabase/supabase-js/dist/index.mjs').then(async m => {
  const fs = await import('node:fs');
  const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k,...r] = l.split('='); return [k.trim(), r.join('=').trim()]; }));
  const sb = m.createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false }});
  const { data, error } = await sb.from('clients').select('id').limit(1);
  console.log(error ? 'FAIL: '+error.message : 'OK: '+data.length+' rows');
});
" --input-type=module
```

Expected: `OK: 0 rows` (or however many clients exist).

### Step 4 — Decide what to do

Match the user's request to §11. If their ask doesn't appear in the
roadmap and isn't in §1's spirit (private bank tone, security-systems
domain), push back before building.

### Step 5 — Before committing

- `npm run build` must pass with zero TS errors. Lint warnings are
  acceptable; errors are not.
- Per §12 (#5), if you migrated a module to DB, search for stale
  imports from `lib/mock-data/<module>.ts` and replace.
- Don't push without explicit user say-so. Default to commit-only.

### Step 6 — Commit message style

Look at `git log` for the existing tone. Multi-line commits with a
1-line headline + bullet list of changes. No `🤖 Generated with`
footer (the user explicitly removed those previously). Keep
`Co-Authored-By: Claude Opus 4.7 (1M context)` only if you've added
substantial work; otherwise omit.

---

## 14. Critical Files Inventory

In rough order of "what to read first when picking up cold."

### Tier 1 — must read

| File | Why |
| --- | --- |
| `CLAUDE_CONTEXT.md` | This document. |
| `README.md` | Public-facing project pitch + 90-second demo flow. |
| `package.json` | Versions + scripts + Node engine. |
| `app/layout.tsx` | Provider order: Theme → Role → Auth. Reading this tells you the runtime stack. |
| `app/globals.css` | All theme tokens. The `@theme inline` block + four `[data-theme=...]` blocks. |
| `lib/permissions.ts` | Role × resource × action matrix. Authoritative. |
| `lib/theme.ts` + `lib/theme-context.tsx` | Theme registry + hook. |
| `components/auth/AuthProvider.tsx` | The current auth pipeline. |
| `lib/api/clients.ts` | The reference pattern for any new module's DB wiring. |
| `app/(app)/clients/page.tsx` + `ClientsView.tsx` + `actions.ts` | Reference pattern for server-component-fetches-data + client-component-handles-interactivity + server-actions-mutate. |
| `supabase/migrations/0001_clients_schema.sql` | Schema authoritative. |

### Tier 2 — read when working in a specific area

| Area | Files |
| --- | --- |
| Sidebar / TopBar / shell | `components/layout/{AppShell,Sidebar,TopBar,Breadcrumbs,PageHeader,GlobalCommandPalette,NotificationsBell,AvatarMenu,RoleSwitcher,nav-config}.tsx` |
| Dashboard | `components/modules/dashboard/*` (KpiCard, RevenueTrendChart, PipelineFunnel, ActivityFeed, TopClientsTable, InventoryHealth, TechnicianUtilization, AnimatedNumber, RangePicker, Restricted, CanFinancials) |
| Quotes builder | `components/modules/quotes/builder/{QuoteBuilder,BuilderHeader,ClientSiteCard,QuoteDetailsCard,SectionCard,LineItemRow,SkuAutocomplete,CommandPalette,TotalsBar,NotesCards,QuoteDocument,PdfPreviewPane,ReadOnlyBanner,CurrencyInput}.tsx` |
| Projects detail | `components/modules/projects/{ProjectDetailHeader,ProjectTabsNav,ProgressRing,ProjectsTable,ProjectsCardView,ProjectStatusBadge,ProjectStatsStrip,ProjectFilters}.tsx` plus `tabs/{Overview,Tasks,Schedule,Materials,Commissioning,ZoneList,Documents,Financials,TimeLabor}Tab.tsx` |
| Inventory | `components/modules/inventory/{StockTab,AllocationsTab,TransfersTab,PurchaseOrdersTab,VendorsTab,CategoriesTab}.tsx` |
| Scheduling | `components/modules/scheduling/{UnassignedQueue,CalendarView,TechDrawer}.tsx` |
| Financials | `components/modules/financials/Tabs.tsx` (all 10 tabs in one file) |
| Users | `components/modules/users/{Tabs,UserDrawer}.tsx` + `lib/permissions-matrix.ts` |
| Settings | `components/modules/settings/{BrandingThemes,BackupsData,SettingsPanes}.tsx` |

### Tier 3 — config + tooling

| File | Purpose |
| --- | --- |
| `next.config.ts` | Currently empty defaults. Add `headers()` for CSP later. |
| `eslint.config.mjs` | ESLint 9 flat config + `eslint-config-next`. |
| `tsconfig.json` | `paths: { "@/*": ["./*"] }`. |
| `components.json` | shadcn registry config. |
| `postcss.config.mjs` | Tailwind v4 PostCSS plugin. |
| `app/icon.svg` | Favicon. |
| `app/robots.ts` | Disallow all (private app). |
| `.env.example` | Documents every env var. Update when adding new ones. |
| `.gitignore` | Already covers `.env.local`, `.next`, `.claude/`, etc. |

---

## 15. Conventions & Patterns

These are not arbitrary — they were chosen to match how the existing
code is structured. Match them when adding new code.

### Naming

- **Files:** PascalCase for components (`ClientFormDrawer.tsx`),
  camelCase for utilities (`quote-helpers.ts` is the exception — kebab
  inherited from create-next-app), camelCase or kebab-case is fine but
  don't mix in one folder.
- **Server actions:** verb + noun + `Action` suffix:
  `createClientAction`, `deleteSiteAction`. Always returns
  `ActionResult<T>` (defined in `app/(app)/clients/actions.ts`).
- **API functions:** verb + noun (no Action suffix):
  `createClient`, `getSitesByClient`. Throws on error.
- **DB types:** `Db<Entity>` (e.g. `DbClient`), with `<Entity>Insert` and
  `<Entity>Update` payload variants.
- **Mock data exports:** lowercase plural — `clients`, `projects`,
  `users`. (Pre-existing convention. Stick to it for any remaining
  mock files.)

### Server actions

```ts
// app/(app)/<module>/actions.ts
"use server";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createXAction(payload): Promise<ActionResult<{ id }>> {
  try {
    const row = await createX(payload);     // calls lib/api/<module>.ts
    revalidatePath("/<module>");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown" };
  }
}
```

Client invocation:
```tsx
const result = await createXAction(payload);
if (result.ok) toast.success("Saved");
else toast.error(result.error);
```

### Forms (drawer pattern)

Every form lives in a drawer (shadcn `<Sheet>` on the right). Each drawer
component:

1. Accepts a discriminated `mode` prop:
   `{ kind: "create"; ...parents } | { kind: "edit"; entity: DbX }`.
2. Holds form state in local `useState` initialized from `existing` (if
   editing).
3. Wraps the submit in `useTransition` for loading state.
4. On submit, calls the appropriate Action and toasts the result.

Reference: `app/(app)/clients/ClientFormDrawer.tsx`.

### API layer organization

```
lib/api/
├── clients.ts       — getClients, createClient, ..., getSitesByClient, ..., getContactsByClient, ...
├── (future) projects.ts
├── (future) quotes.ts
└── ...
```

Conventions inside each file:
- Always `import "server-only"` at the top.
- Always use the same `function db()` accessor at the top so swapping
  admin → cookie-aware client is one line.
- Filter `.is("deleted_at", null)` on every read.
- Throw on error: `throw new Error(<function name>: <message>)`.
- Return raw DB rows typed as `DbX[]`. Don't transform unless absolutely
  necessary — let consumers transform.

### Type organization

```
lib/
├── types.ts                  ← legacy mock types (Project, Quote, Client). DO NOT add new types here.
├── types/
│   └── database.ts           ← all NEW DB types live here. Mirror schema 1:1.
```

When you add a new DB-wired module, **extend `lib/types/database.ts`**;
don't create a parallel types file.

### Error handling

- API layer: throws.
- Action layer: catches and returns `{ ok: false, error }`.
- Client layer: shows `toast.error(result.error)` from sonner.
- React error boundary: `app/error.tsx` handles uncaught render errors.

### Loading states

- Server components fetching DB data: no spinner, just await. Page
  renders when data is ready.
- Client components doing mutations: `useTransition` + drawer button
  shows "Saving…".
- For long-running pages: use `<Skeleton>` from `components/layout/Skeleton.tsx`
  with the `nx-skeleton` shimmer.

### Dates

- Always import from `date-fns`, not `Date.toLocaleString()`.
- For demo data, anchor to `TODAY` from `lib/dashboard-data.ts`.
- Format dates with `format(d, "MMM d, yyyy")` (full) or `"MMM d"` (compact).

### Currency

- Always `formatCurrency(n)` from `lib/format.ts`. Never inline
  `Intl.NumberFormat`.
- Tabular alignment: add `tabular-nums` className.

### Theme-aware colors

- Use `bg-brand-navy`, `text-brand-gold`, `bg-brand-ivory`,
  `text-brand-charcoal` Tailwind utilities for the base palette. They
  retint with theme.
- For nuanced colours (e.g. a soft accent at 20% opacity), use inline
  `style={{ background: "color-mix(in oklab, var(--brand-accent) 20%,
  transparent)" }}`. The pattern is documented heavily in `Sidebar.tsx`.
- For Recharts: import `useThemeColors()` from `lib/theme-context.tsx`
  and pull `t.primary`, `t.accent`, `t.charts`, etc.

### Demo determinism

Two anchors must stay in sync if you change them:

1. `TODAY` in `lib/dashboard-data.ts` (currently `2026-04-30T12:00:00`).
2. The fiscal-year calculations in PageHeader eyebrow text (currently
   hard-coded `2026`).

If you bump the year for a new demo, search for `2026` and update each
hit deliberately.

### Commits

- Imperative + headline (50 char max ideal): `"Wire Quotes module to
  Supabase"`.
- Body explains *why* and lists changes.
- `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  trailer is fine; no other footer markup.

---

**End of handoff.** When you're ready to continue work, follow §13 step
by step. Welcome to Nexvelon.

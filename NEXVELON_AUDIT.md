# NEXVELON_AUDIT.md

> Read-only codebase audit. Generated 2026-05-04 against commit `0f51609` on
> branch `main`. **No code was modified during this audit.**

═══════════════════════════════════════════════════════════════════════════════
## SECTION 1 — PROJECT OVERVIEW
═══════════════════════════════════════════════════════════════════════════════

### Tech stack (from package.json)

**Runtime + framework**
- Node.js — engine `>=18.17` (running 24.15.0 locally per CLAUDE_CONTEXT.md)
- Next.js — `15.5.15` (App Router + Turbopack)
- React — `19.1.0`
- React DOM — `19.1.0`
- TypeScript — `^5` (strict)
- Tailwind CSS — `^4` (with `@tailwindcss/postcss`)

**UI primitives**
- `@base-ui/react` — `^1.4.1` (shadcn/ui Base UI flavour, not Radix)
- `lucide-react` — `^1.14.0` (icons)
- `framer-motion` — `^12.38.0` (animations)
- `sonner` — `^2.0.7` (toasts)
- `cmdk` — `^1.1.1` (⌘K command palette)
- `class-variance-authority` — `^0.7.1`
- `clsx` — `^2.1.1`
- `tailwind-merge` — `^3.5.0`
- `tw-animate-css` — `^1.4.0`

**Data + tables + charts + PDFs**
- `recharts` — `^3.8.1`
- `@tanstack/react-table` — `^8.21.3`
- `@dnd-kit/core` — `^6.3.1`
- `@dnd-kit/sortable` — `^10.0.0`
- `@dnd-kit/utilities` — `^3.2.2`
- `@react-pdf/renderer` — `^4.5.1`
- `date-fns` — `^4.1.0`

**Backend / auth / email**
- `@supabase/ssr` — `^0.10.2`
- `@supabase/supabase-js` — `^2.105.1`
- `bcryptjs` — `^3.0.3`
- `resend` — `^6.12.2`

**Observability**
- `@vercel/analytics` — `^2.0.1`
- `@vercel/speed-insights` — `^2.0.0`

**Tooling**
- ESLint 9 + `eslint-config-next` 15.5.15
- `tsx` (devDep, ^4.21.0) — runs `scripts/bootstrap-admin.ts`
- `shadcn` CLI ^4.6.0
- `@types/bcryptjs`, `@types/node`, `@types/react`, `@types/react-dom`

### Folder structure (depth 3, code dirs only)

```
app/
├── (app)/                          ← protected routes group
│   ├── clients/                    ← REAL (Supabase-wired)
│   │   ├── ClientFormDrawer.tsx
│   │   ├── ClientsView.tsx
│   │   ├── ContactFormDrawer.tsx
│   │   ├── SiteFormDrawer.tsx
│   │   ├── actions.ts
│   │   └── page.tsx
│   ├── dashboard/{layout.tsx,page.tsx}
│   ├── financials/{layout.tsx,page.tsx}
│   ├── inventory/{layout.tsx,page.tsx}
│   ├── projects/
│   │   ├── [id]/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── quotes/
│   │   ├── [id]/page.tsx
│   │   ├── layout.tsx
│   │   ├── new/page.tsx
│   │   └── page.tsx
│   ├── scheduling/{layout.tsx,page.tsx}
│   ├── settings/{layout.tsx,page.tsx}
│   ├── users/                      ← MIXED (Users tab + invite real, others mock)
│   │   ├── UsersView.tsx
│   │   ├── actions.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── layout.tsx                  ← AppShell + RequireAuth wrapper
├── (auth)/
│   └── login/{layout.tsx,page.tsx} ← real Supabase Auth
├── auth/                            ← non-grouped public auth handlers
│   ├── callback/route.ts            ← legacy OAuth landing (unused by current flow)
│   ├── confirm/route.ts             ← token_hash redemption (NEW, since 0f51609 / 4a14637)
│   ├── set-password/{layout.tsx,page.tsx}
│   └── verify-otp/{layout.tsx,page.tsx,actions.ts}
├── error.tsx                       ← global error boundary
├── globals.css
├── icon.svg
├── layout.tsx                      ← root: ThemeProvider › AuthProvider › RoleProvider › Analytics + SpeedInsights
├── not-found.tsx
├── page.tsx                        ← / → middleware redirects
└── robots.ts

components/
├── auth/{AuthProvider,RequireAuth}.tsx
├── layout/                         ← shell + nav (RoleSwitcher deleted Phase 6)
│   ├── ActionButton.tsx
│   ├── AppShell.tsx
│   ├── AvatarMenu.tsx              ← rewritten 0f51609
│   ├── Breadcrumbs.tsx
│   ├── EmptyState.tsx
│   ├── GlobalCommandPalette.tsx    ← orphaned but still mounted
│   ├── NotificationsBell.tsx
│   ├── PageHeader.tsx
│   ├── Placeholder.tsx
│   ├── Sidebar.tsx
│   ├── Skeleton.tsx
│   ├── TopBar.tsx                  ← search bar removed 0f51609
│   └── nav-config.tsx              ← uses mock-data for badge counts
├── modules/
│   ├── dashboard/   (11 files: KpiCard, RevenueTrendChart, PipelineFunnel, …)
│   ├── financials/  (1 file: Tabs.tsx — all 10 financial tabs in one)
│   ├── inventory/   (6 tab files)
│   ├── projects/    (8 top-level + tabs/ with 9 tab files)
│   ├── quotes/      (4 top-level + builder/ with 14 builder files)
│   ├── scheduling/  (3 files: UnassignedQueue, CalendarView, TechDrawer)
│   ├── settings/    (3 files: BrandingThemes, BackupsData, SettingsPanes)
│   └── users/       (3 files: Tabs, UserDrawer (orphan), InviteUserDrawer)
└── ui/              (16 shadcn primitives, all Base UI-flavoured)

lib/
├── api/             ← server-only DB access
│   ├── clients.ts   ← cookie-aware Supabase client; RLS-enforced
│   └── users.ts     ← service-role for invite + status changes
├── auth/            ← server-only auth helpers (Phase 3+)
│   ├── audit.ts
│   ├── email.ts
│   ├── normalize-role.ts
│   ├── otp.ts
│   ├── password-policy.ts
│   ├── profile.ts
│   └── request-info.ts
├── mock-data/       ← 9 fake-data exports (still consumed by 8 modules)
│   ├── audit-log.ts, clients.ts, invoices.ts, products.ts,
│   ├── projects.ts, quotes.ts, sites.ts, subcontractors.ts, users.ts
├── supabase/        ← 4 client flavours (browser, server, middleware, admin)
├── types/database.ts ← DB row types (profiles, auth_*, clients, sites, contacts)
├── dashboard-data.ts  ← derives KPIs/charts from mock-data
├── financials-data.ts ← P&L / cash-flow builders from mock invoices
├── inventory-data.ts  ← warehouse/vendor helpers
├── notifications.ts   ← 9 mock bell notifications
├── permissions.ts     ← role × resource × action matrix (7 app roles)
├── permissions-matrix.ts ← 75-permission catalogue (display-only)
├── project-data.ts    ← tasks/materials/POs/commissioning builders
├── quote-helpers.ts   ← line-item math, totals, status order
├── quote-store.ts     ← localStorage draft persistence (legacy)
├── role-context.tsx   ← thin reader over useAuth
├── scheduling-data.ts ← jobs + swimlane builders
├── theme.ts + theme-context.tsx
├── types.ts           ← LEGACY mock-data types (still used by 8 modules)
├── format.ts, utils.ts, use-read-only.ts

supabase/migrations/
├── 0001_clients_schema.sql              (188 lines)
├── 0002_auth_and_users_schema.sql       (361 lines)
└── 0003_auth_otp_helper.sql              (35 lines)

scripts/
└── bootstrap-admin.ts                   (678 lines — first-admin invite script)

middleware.ts                             (root, 135 lines)
```

### File counts and rough LOC

| Type | Count | LOC |
| --- | --- | --- |
| `.tsx` | 132 | (combined with `.ts` below) |
| `.ts` (excl. `scripts/`) | 47 | — |
| `.tsx` + `.ts` (under `app/` + `components/` + `lib/` + `middleware.ts`) | — | **29,573** |
| `.sql` (migrations) | 3 | **584** |
| `.ts` (`scripts/`) | 1 | **678** |
| `.md` (root) | 2 | `CLAUDE_CONTEXT.md` (~63 KB), `README.md` (~14 KB) |

**Grand total source LOC: ~30,835.** Plus the 63 KB handoff doc.

### Git state

- **Branch:** `main`
- **In sync with origin/main:** yes
- **Working tree:** clean (verified before audit)

**Last 10 commits:**

| Hash | Message |
| --- | --- |
| `0f51609` | Fix avatar menu, OTP verify hang, remove broken search bar |
| `4f5a27f` | Adopt v3 'private issue' email template in bootstrap script |
| `907f92e` | Update bootstrap email template to the v2 Nexvelon Enterprise Suite design |
| `43fccd4` | Use Phase 2 branded email template in bootstrap script + remove fake company branding |
| `4a14637` | Fix bootstrap-admin email send + harden invite links against Gmail prefetch |
| `b4e93d8` | Invite drawer + admin bootstrap + demo cleanup + Vercel analytics (Session A · Phases 4 + 5 + 6) |
| `1c344be` | Wire real Supabase Auth + email-OTP 2FA (Session A · Phase 3) |
| `fe768ac` | Update handoff doc — Clients module live |
| `f1d5542` | Wire Clients module to Supabase |
| `01f5541` | Add CLAUDE_CONTEXT.md handoff document |

═══════════════════════════════════════════════════════════════════════════════
## SECTION 2 — EVERY ROUTE / PAGE
═══════════════════════════════════════════════════════════════════════════════

| Route Path | File Path | Type | Status | Description | DB-Wired? | Has Mock Data? | Auth Required? | Crashes Reported? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` | Page | AUTH | Loading shim; middleware redirects to `/login` or `/dashboard`. | NO | NO | NO | NO |
| `/login` | `app/(auth)/login/page.tsx` | Page | AUTH | Real Supabase email + password sign-in; signInAction → OTP step. | YES (`auth.users` via signInWithPassword) | NO | NO (anon-allowed) | NO |
| `/auth/verify-otp` | `app/auth/verify-otp/page.tsx` | Page | AUTH | 6-digit code entry. Now uses server `redirect()` (since `0f51609`). 30s client timeout. | YES (`auth_otp`, `auth_audit_log`, `profiles`) | NO | YES (must hold pre-MFA session) | **HISTORICAL hang fixed `0f51609`** — verify ok in last live test (audit log rows confirm) |
| `/auth/set-password` | `app/auth/set-password/page.tsx` | Page | AUTH | Invitee picks a password, status flips to `Active` + mfa_enrolled=true. Live strength meter, 12+ chars policy. | YES (Supabase auth.updateUser, `profiles` admin patch) | NO | YES (session from `/auth/confirm`) | NO |
| `/auth/confirm` | `app/auth/confirm/route.ts` | Route handler | AUTH | Token-hash redemption for invite/magiclink/recovery/email_change. Calls verifyOtp, redirects per type. | YES (Supabase Auth verifyOtp) | NO | NO (anon-allowed; sets cookies) | NO |
| `/auth/callback` | `app/auth/callback/route.ts` | Route handler | AUTH | Legacy PKCE / OAuth code exchange. **No current flow uses this** — kept for future OAuth. | YES | NO | NO | NO |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Page | UI_ONLY | Executive dashboard: 6 KPI cards, revenue trend, pipeline funnel, activity feed, top clients, inventory health, technician utilization. | NO — derives from `lib/dashboard-data.ts` which reads mock-data | YES (everything via `lib/dashboard-data` + `lib/mock-data/users` for greeting) | YES | NO |
| `/quotes` | `app/(app)/quotes/page.tsx` | Page | UI_ONLY | List view with table/card toggle, filters, status badges. Footer flagged "synthetic data". | NO | YES (`lib/mock-data/quotes`, `clients`, `sites`, `users`, plus `lib/quote-store.ts` localStorage drafts) | YES | NO |
| `/quotes/new` | `app/(app)/quotes/new/page.tsx` | Page | UI_ONLY | Quote builder shell — sets up empty draft, mounts `QuoteBuilder`. | NO | YES (everything imported via builder) | YES | NO |
| `/quotes/[id]` | `app/(app)/quotes/[id]/page.tsx` | Page | UI_ONLY | Quote builder for an existing quote. Reads from mock + localStorage. | NO | YES | YES | NO |
| `/projects` | `app/(app)/projects/page.tsx` | Page | UI_ONLY | List view with table/card toggle, status filters, stat strip. | NO | YES (`lib/mock-data/projects`, `clients`, `users`) | YES | NO |
| `/projects/[id]` | `app/(app)/projects/[id]/page.tsx` | Page | UI_ONLY | Detail with 9 tabs: Overview, Tasks, Schedule, Materials, Commissioning, Zones, Documents, Financials, Time/Labor. | NO | YES (`lib/project-data.ts` synthesizers + mock-data) | YES | NO |
| `/clients` | `app/(app)/clients/page.tsx` | Page | **REAL** | List + create + edit + soft-delete clients/sites/contacts. Server component fetches via `lib/api/clients.ts` (cookie-aware Supabase, RLS enforced). | YES (`clients`, `sites`, `contacts`) | NO | YES | NO |
| `/inventory` | `app/(app)/inventory/page.tsx` | Page | UI_ONLY | 6 tabs: Stock, Allocations, Transfers, POs, Vendors, Categories. | NO | YES (all 6 tabs use `lib/mock-data/products` + `lib/inventory-data`) | YES | NO |
| `/scheduling` | `app/(app)/scheduling/page.tsx` | Page | UI_ONLY | Drag-drop dispatch board (UnassignedQueue + CalendarView + TechDrawer). Drag-drop uses dnd-kit but writes to in-memory state only. | NO | YES (`lib/scheduling-data`, mock users) | YES | NO |
| `/financials` | `app/(app)/financials/page.tsx` | Page | UI_ONLY | 10-tab consolidator (P&L, Balance Sheet, Cash Flow, AR Aging, AP, Bills, Bank Recon, Tax, Forecast, Reports). All in one `Tabs.tsx`. | NO | YES (`lib/financials-data`, `lib/mock-data/invoices`) | YES | NO |
| `/users` | `app/(app)/users/page.tsx` | Page | **MIXED** | Server component checks Admin role, fetches `profiles` via `lib/api/users.ts`. 6 tabs in `UsersView` → `Tabs.tsx`. | YES (`profiles`, `auth_audit_log`, `auth.users`) for the **Users** tab + Invitations tab + invite drawer. | YES — RolesTab, PermissionsMatrixTab, ActivityLogTab (uses mock auditLog), SubcontractorsTab still mock-driven. | YES | NO (since recent commit) |
| `/settings` | `app/(app)/settings/page.tsx` | Page | UI_ONLY | 13-pane settings shell. BrandingThemes pane has the only working interaction (theme switcher persists to localStorage). | NO | YES (`SettingsPanes.tsx`, `BackupsData.tsx`) | YES | NO |

**Counts**
- REAL pages: **1** (`/clients`)
- MIXED: **1** (`/users`)
- UI_ONLY: **9** (dashboard, quotes ×3, projects ×2, inventory, scheduling, financials, settings)
- AUTH (real auth surfaces, working): **5** (login, verify-otp, set-password, confirm, callback)
- BROKEN: **0** open. *(Three were just fixed in `0f51609` and need user verification: avatar menu, OTP hang, search-bar crash.)*
- PLACEHOLDER: **0** — everything renders something.

═══════════════════════════════════════════════════════════════════════════════
## SECTION 3 — EVERY MODULE / FEATURE
═══════════════════════════════════════════════════════════════════════════════

#### Module: **Auth** (login → OTP → set-password)

- **Pages:** `/login`, `/auth/verify-otp`, `/auth/set-password`
- **Route handlers:** `/auth/confirm` (token-hash redemption), `/auth/callback` (legacy / OAuth, idle)
- **Drawers/Modals:** none
- **Tabs:** none
- **Side features:** invite-only enrollment via Admin (separate module); MFA-pending gate via `has_pending_otp()` RPC checked by middleware on every request; password policy 12+/upper/lower/digit/symbol; 6-digit OTP bcrypt-hashed, 10-min TTL, 5 attempts; resend 60s cooldown.
- **DB tables:** `profiles`, `auth_otp`, `auth_audit_log` + `auth.users` (Supabase Auth schema)
- **Mock data files:** none
- **Status:** **REAL** ✅
- **Effort to make REAL:** 0 (already real)
- **Notes:** Fully wired since Phases 3–5. Live audit log rows confirm end-to-end success in last 24h (`mfa_challenge_sent` → `mfa_challenge_verified` → `login_success` × 3 sessions). One known design tradeoff: MFA gate is middleware-enforced not RLS-enforced (CLAUDE_CONTEXT §12 #14) — direct Supabase REST calls during the OTP-pending window would succeed at JWT level (RLS still scopes to role).

---

#### Module: **Dashboard**

- **Pages:** `/dashboard`
- **Drawers/Modals:** none
- **Tabs:** none (single-page composite)
- **Side features:** RangePicker (MTD / QTD / YTD / TTM); 6 KPI cards (Revenue, EBITDA, Gross Margin, Open Quotes, Active Projects, Overdue Invoices); RevenueTrendChart, PipelineFunnel, ActivityFeed, TopClientsTable, InventoryHealth, TechnicianUtilization. `<CanFinancials>` gates EBITDA / Gross Margin / Trend / Top Clients.
- **DB tables:** none read
- **Mock data files imported:** `lib/mock-data/users` (greeting fallback), `lib/dashboard-data.ts` which transitively reads `clients`, `quotes`, `projects`, `invoices`, `products`, `users`, `subcontractors` from `lib/mock-data/*`
- **Status:** **UI_ONLY**
- **Effort to make REAL:** **6–8 hours**, but heavily blocked — needs real `quotes`, `projects`, `invoices`, `products` tables to derive most KPIs. Practically last in queue.
- **Notes:** Footer reads "Demo build · figures derived from synthetic data, anchored to {TODAY}" — at least the page is honest about its state. KPIs would need new aggregating queries (probably as Postgres views) to pull from real tables.

---

#### Module: **Quotes**

- **Pages:** `/quotes` (list), `/quotes/new`, `/quotes/[id]`
- **Drawers/Modals:** none discrete (the entire builder is full-page)
- **Tabs:** quote builder is a single tall form (no tabs); list page has table/card view toggle
- **Side features:** sortable/filterable list (`@tanstack/react-table`), status badges, builder with sections + line items + SKU autocomplete + live PDF preview (`@react-pdf/renderer`) + ⌘K command-palette quick-add, line-item math (`lib/quote-helpers.ts`), localStorage drafts (`lib/quote-store.ts`)
- **DB tables:** none read or written
- **Mock data files:** `lib/mock-data/quotes`, `lib/mock-data/clients`, `lib/mock-data/sites`, `lib/mock-data/users`, `lib/mock-data/products` + `lib/quote-helpers.ts` + `lib/quote-store.ts` (localStorage)
- **Status:** **UI_ONLY**
- **Effort to make REAL:** **4–6 hours.** Migration `0004_quotes_schema.sql` (`quotes`, `quote_sections`, `quote_line_items`); `lib/types/database.ts` extension; `lib/api/quotes.ts` mirroring clients pattern; server actions; convert list page to server component; retire `lib/quote-store.ts`. **Promoted to next P0 in CLAUDE_CONTEXT §11.**
- **Notes:** Most-mature UI-only module. Builder is the showpiece — drag-reordering, real-time totals, PDF preview that exports identically. Well worth wiring next.

---

#### Module: **Projects**

- **Pages:** `/projects` (list), `/projects/[id]` (9-tab detail)
- **Drawers/Modals:** none
- **Tabs (within detail):** Overview, Tasks, Schedule (Gantt), Materials, Commissioning, Zones, Documents, Financials, Time/Labor
- **Side features:** ProgressRing, ProjectStatsStrip, ProjectStatusBadge, table/card view toggle on list, filters by status/PM/system-type, drag-to-reschedule on Gantt (dnd-kit, in-memory only)
- **DB tables:** none
- **Mock data files:** `lib/mock-data/projects`, `lib/mock-data/clients`, `lib/mock-data/users`, plus all 9 tabs read various `lib/project-data.ts` builders (tasks, materials, POs, commissioning items, zones, documents, time entries)
- **Status:** **UI_ONLY**
- **Effort to make REAL:** **6–8 hours.** Largest schema in the queue: `projects`, `project_tasks`, `project_materials`, `purchase_orders`, `commissioning_items`, `intrusion_zones`, `project_documents`, `time_entries`. FK-heavy: depends on `quotes.id`, `clients.id`, `sites.id`, `profiles.id` (manager/lead_tech/sales_rep) — should ship after Quotes.
- **Notes:** Biggest payoff visually. The 9-tab detail page is where security-systems integrators spend most of their time. Documents tab will need Supabase Storage (P3 in roadmap).

---

#### Module: **Clients & Sites**

- **Pages:** `/clients`
- **Drawers/Modals:** `ClientFormDrawer`, `SiteFormDrawer`, `ContactFormDrawer` (all in `app/(app)/clients/`)
- **Tabs:** sub-views within the page (Clients list / Site nesting / Contact list)
- **Side features:** filters by tier/status/type, search, soft-delete via `deleted_at`, expandable client rows showing sites + contacts
- **DB tables:** `clients`, `sites`, `contacts` ← all writable through `app/(app)/clients/actions.ts` server actions
- **Mock data files:** none ✅
- **Status:** **REAL** ✅
- **Effort to make REAL:** 0 (already real, served end-to-end since `f1d5542`)
- **Notes:** Reference pattern for every other module. `lib/api/clients.ts` is the canonical example — cookie-aware server client, RLS enforced, soft-delete pattern, `revalidatePath('/clients')` after every mutation. Per-action RLS policies (no DELETE) added in migration 0002.

---

#### Module: **Inventory**

- **Pages:** `/inventory`
- **Drawers/Modals:** none
- **Tabs:** Stock, Allocations, Transfers, Purchase Orders, Vendors, Categories (6 tabs)
- **Side features:** AnimatedNumber stat cards on top, low-stock alerts, vendor distribution chart, cost columns gated by `<Can resource="inventory" action="viewCost">`
- **DB tables:** none
- **Mock data files:** `lib/mock-data/products` + `lib/inventory-data.ts` (warehouse helpers, vendor directory, transfers seed)
- **Status:** **UI_ONLY**
- **Effort to make REAL:** **3–4 hours** for `vendors` + `products` tables (~80 SKUs of seed data); allocations/transfers/POs are derived views. Not strictly blocked by another module.
- **Notes:** ~80 mock SKUs across Kantech / Genetec / Avigilon / DSC / Hanwha / etc. Realistic enough that a full vendor catalog import would replace it cleanly.

---

#### Module: **Scheduling / Dispatch**

- **Pages:** `/scheduling`
- **Drawers/Modals:** `TechDrawer` (technician profile sidebar — opens on click)
- **Tabs:** none (single-board view with day/week/month switcher)
- **Side features:** UnassignedQueue (drag-source), CalendarView (drag-target swimlanes), drag-drop via dnd-kit, technician utilization bars, subcontractor distinction (dashed border)
- **DB tables:** none
- **Mock data files:** `lib/scheduling-data.ts` (job builder, swimlane data) + `lib/mock-data/users`
- **Status:** **UI_ONLY**
- **Effort to make REAL:** **3–4 hours** but blocked by Projects + Profiles. Needs `scheduling_jobs` table + crew-assignments + recurrence rules.
- **Notes:** Drag-drop animations are smooth and persist in component state; refresh wipes them. TechDrawer shows fake ESA license numbers / certifications.

---

#### Module: **Financials**

- **Pages:** `/financials`
- **Drawers/Modals:** none
- **Tabs:** **10 in one file** (`components/modules/financials/Tabs.tsx`, 1149 LOC): P&L, Balance Sheet, Cash Flow, AR Aging, AP Aging, Bills, Bank Reconciliation, Tax, Forecast, Reports
- **Side features:** Range selector (Month / Quarter / Year), exportable rows, drill-down into invoice detail (no actual click target), aged-receivables waterfall
- **DB tables:** none
- **Mock data files:** `lib/financials-data.ts` (P&L builder, cash flow, AR aging) + `lib/mock-data/invoices`
- **Status:** **UI_ONLY**
- **Effort to make REAL:** **2–3 hours** for read-only initial pass — `invoices`, `bills`, `payments` tables; ledger entries can come later.
- **Notes:** `<Can resource="financials" action="view">` gates the entire page. Page has 6 known ESLint warnings (stale dep deps in useMemo; cosmetic, not blocking).

---

#### Module: **Users & Permissions**

- **Pages:** `/users`
- **Drawers/Modals:** `InviteUserDrawer` (functional, wired to `inviteUserAction`); `UserDrawer` (the 75-permission override drawer — **orphaned, no longer mounted**, kept on disk for Session B per CLAUDE_CONTEXT §12 #12)
- **Tabs:** Users, Roles, Permissions Matrix, Activity Log, Subcontractors, Invitations (6)
- **Side features:** Per-row dropdown action menu (Suspend / Reactivate / Terminate); search by name/email; role + status filters; gold-tick MFA-enrolled column; status pills; self-action protection (you can't suspend yourself)
- **DB tables:** `profiles` (Users tab + Invitations + invite drawer + lifecycle actions), `auth.users` via `auth.admin.inviteUserByEmail`, `auth_audit_log` (every action writes); RolesTab counts profiles by role
- **Mock data files:** `lib/mock-data/users` (still used by RolesTab role-counts and ActivityLogTab); `lib/mock-data/audit-log` (ActivityLogTab); `lib/mock-data/subcontractors` (SubcontractorsTab)
- **Status:** **MIXED**
- **Effort to make REAL (the remaining tabs):** **4–6 hours.** Surface `auth_audit_log` real rows in ActivityLogTab; build `subcontractors` table; persist 75-permission overrides into a new `user_permissions` table for the orphaned UserDrawer; PermissionsMatrixTab and RolesTab can re-use existing constants (display-only). Session B scope per roadmap.
- **Notes:** The page uses a server-side Admin gate before rendering UsersView (defense in depth alongside `<Can>`). Session-revocation calls a direct `DELETE /auth/v1/admin/users/<id>/sessions` REST hit (Supabase JS doesn't expose this in the SDK shape).

---

#### Module: **Settings**

- **Pages:** `/settings`
- **Drawers/Modals:** none
- **Tabs / panes:** 13 panes across `SettingsPanes.tsx`, `BrandingThemes.tsx`, `BackupsData.tsx` — Company Profile, Branding & Themes, Notifications, Localization, Tax & Billing, Integrations, Roles, Security, Devices, Webhooks, API Keys, Audit, Backups & Data
- **Side features:** **The only working interaction** is the live theme switcher in `BrandingThemes.tsx` (4 presets, persists to `localStorage["nexvelon:theme"]`, retints whole UI in-place via CSS variables). Everything else (signature blocks, ESA/ULC numbers, backup destinations, integration toggles) is non-functional UI.
- **DB tables:** none (theme persists to localStorage only)
- **Mock data files:** `lib/mock-data/users`, `lib/notifications.ts`, plus hardcoded form defaults (e.g. fake ESA license number `ESA/ECRA 7012-441` and ULC number — these are integrator-customer-side fields though, not Nexvelon claims)
- **Status:** **UI_ONLY**
- **Effort to make REAL:** **6–8 hours.** Needs a `settings_kv` table or per-org settings rows; Supabase Storage for logo / signature uploads; a real backup agent (CLAUDE_CONTEXT §10 has the design — Tauri/CLI sync agent — but it's a 1–2 week build).
- **Notes:** BackupsData renders a polished filesystem tree visualization for `/Users/<user>/Nexvelon/Backups/Clients/...` — this is **fake**. Buttons toast success and progress bars are setTimeout. Tagged tech debt in CLAUDE_CONTEXT §10.

═══════════════════════════════════════════════════════════════════════════════
## SECTION 4 — DATABASE TABLES
═══════════════════════════════════════════════════════════════════════════════

### `public.clients`

- **Migration file:** `0001_clients_schema.sql`
- **Columns:** `id uuid pk default gen_random_uuid()` · `name text not null` · `legal_name text` · `client_code text unique` · `type text check in (Commercial,Industrial,Residential,Healthcare,Education,Government,Heritage)` · `tier text check in (Platinum,Gold,Silver,Bronze)` · `status text not null default 'Active' check in (Active,Inactive,Prospect,Lost)` · `account_manager_id uuid` · `industry text` · `notes text` · `tags text[]` · `lifetime_value numeric(14,2) not null default 0` · `ytd_revenue numeric(14,2) not null default 0` · `nps_score integer` · `last_nps_date date` · `created_at/updated_at timestamptz` · `created_by uuid` · `deleted_at timestamptz`
- **Foreign keys:** none materialised (`account_manager_id`, `created_by` documented as future FKs to `users.id` but not enforced)
- **Indexes:** `clients_name_idx (name)`, `clients_tier_idx (tier)`, `clients_status_idx (status)`, implicit unique on `client_code`
- **RLS policies:** SELECT / INSERT / UPDATE allowed for any `authenticated` user; **no DELETE policy** (rows are soft-deleted via `deleted_at`). Phase-1 catch-all `for all` policy was retired in migration 0002 in favour of per-action policies.
- **Triggers:** `clients_set_updated_at BEFORE UPDATE` → stamps `updated_at = now()`
- **Used by:** `/clients` page (list + drawers), `lib/api/clients.ts`, `lib/mock-data/clients.ts` (separate, not the DB table — for non-clients-module surfaces)
- **Has data?** **2 rows**
- **Notes:** Reference table — every later module's RLS pattern should follow this shape (per-action, no DELETE, soft-delete via `deleted_at`).

---

### `public.sites`

- **Migration file:** `0001_clients_schema.sql`
- **Columns:** `id uuid pk` · `client_id uuid not null` · `name text not null` · `site_code text` · `address_line1/2 text` · `city/province/postal_code text` · `country text not null default 'Canada'` · `latitude/longitude numeric(10,7)` · `panel_system text` · `cameras_count/controllers_count/doors_count/cards_issued integer not null default 0` · `intrusion_system text` · `site_lead_id uuid` · `status text not null default 'Active' check in (Active, In Project, Maintained, Decommissioned)` · `last_service_date date` · `notes text` · `created_at/updated_at/deleted_at timestamptz`
- **Foreign keys:** `client_id → clients(id) ON DELETE CASCADE`
- **Indexes:** `sites_client_id_idx`, `sites_status_idx`
- **RLS policies:** same as `clients` — SELECT/INSERT/UPDATE for `authenticated`, no DELETE
- **Triggers:** `sites_set_updated_at`
- **Used by:** `/clients` page (nested under each client), `lib/api/clients.ts`
- **Has data?** **1 row**

---

### `public.contacts`

- **Migration file:** `0001_clients_schema.sql`
- **Columns:** `id uuid pk` · `client_id uuid` · `site_id uuid` · `first_name/last_name text not null` · `title/department/email/phone/mobile/notes text` · `is_primary/is_billing/is_emergency boolean not null default false` · `created_at/updated_at/deleted_at timestamptz`
- **Foreign keys:** `client_id → clients(id) ON DELETE CASCADE`, `site_id → sites(id) ON DELETE SET NULL`
- **Indexes:** `contacts_client_id_idx`, `contacts_site_id_idx`, `contacts_email_idx`
- **RLS policies:** same as `clients`
- **Triggers:** `contacts_set_updated_at`
- **Used by:** `/clients` page, `lib/api/clients.ts`
- **Has data?** **1 row**

---

### `public.profiles`

- **Migration file:** `0002_auth_and_users_schema.sql`
- **Columns:** `id uuid pk references auth.users(id) on delete cascade` · `email text not null unique` · `first_name / last_name / display_name / avatar_url / phone / mobile / title / department text` · `employee_type text not null default 'Employee' check in (Employee, Subcontractor, Contractor)` · `role text not null default 'ViewOnly' check in (Admin, ProjectManager, SalesRep, LeadTechnician, Technician, Dispatcher, Warehouse, Accountant, Subcontractor, ViewOnly, ClientPortal)` · `status text not null default 'Invited' check in (Active, Invited, Suspended, Terminated)` · `last_login_at timestamptz` · `last_login_ip inet` · `mfa_enrolled boolean not null default false` · `created_at/updated_at timestamptz` · `created_by uuid references auth.users(id) on delete set null` · `terminated_at timestamptz` · `notes text`
- **Foreign keys:** `id → auth.users(id) cascade`, `created_by → auth.users(id) set null`
- **Indexes:** `profiles_role_idx`, `profiles_status_idx`, implicit unique on `email`
- **RLS policies:**
  - SELECT: `id = auth.uid()` OR `role <> 'ClientPortal'` (every signed-in non-client user sees every internal profile)
  - UPDATE: `id = auth.uid()` OR `is_admin()` (with the `guard_profile_updates` BEFORE UPDATE trigger preventing non-admins from changing role/status/created_by/terminated_at/mfa_enrolled/last_login_*/email/id)
  - DELETE: `is_admin()` only
  - INSERT: no policy (only the `on_auth_user_created` trigger and service role can insert)
- **Triggers:** `profiles_set_updated_at` (BEFORE UPDATE → handle_updated_at), `profiles_guard_updates` (BEFORE UPDATE → guard_profile_updates which raises `42501` on protected-field changes by non-admins)
- **Used by:** `/users` page (Users tab + Invitations tab + invite drawer + row actions), `lib/api/users.ts`, `lib/auth/profile.ts`, `components/auth/AuthProvider.tsx`, every `<Can>` gate (transitively via useAuth)
- **Has data?** **1 row** — `jayshah.x@gmail.com` (Jay Shah, Admin, Active, mfa_enrolled=true)
- **Notes:** The `role` enum has 11 values; the app's `Role` type in `lib/types.ts` has 7. `lib/auth/normalize-role.ts` collapses DB → app on read (LeadTechnician → Technician, Dispatcher → ProjectManager, Warehouse/ClientPortal → ViewOnly). Session B will retire this helper by expanding the matrix.

---

### `public.auth_otp`

- **Migration file:** `0002_auth_and_users_schema.sql`
- **Columns:** `id uuid pk` · `user_id uuid not null references auth.users(id) on delete cascade` · `code_hash text not null` (bcrypt cost 10) · `expires_at timestamptz not null` · `used_at timestamptz` · `attempts integer not null default 0` · `created_at timestamptz`
- **Foreign keys:** `user_id → auth.users(id) cascade`
- **Indexes:** `auth_otp_user_id_idx`, `auth_otp_created_at_idx`
- **RLS policies:** **none** (deliberate). Default-deny for all `authenticated` users; service role is the only writer.
- **Triggers:** none
- **Used by:** `lib/auth/otp.ts` (createOtpForUser, verifyOtpForUser, getActiveOtpForUser, hasPendingOtp, canResendOtp), `app/auth/verify-otp/actions.ts`, `app/(auth)/login/actions.ts`, middleware via the `has_pending_otp()` RPC
- **Has data?** **1 row** (a consumed OTP from the most recent successful login)
- **Notes:** Plaintext code is **never** persisted — only its bcrypt hash. 10-min TTL; 5 attempts max; on miss-or-burn the row's `used_at` is stamped to lock further tries.

---

### `public.auth_audit_log`

- **Migration file:** `0002_auth_and_users_schema.sql`
- **Columns:** `id uuid pk default gen_random_uuid()` · `user_id uuid references auth.users(id) on delete set null` · `email text` · `event text not null` · `ip inet` · `user_agent text` · `metadata jsonb` · `created_at timestamptz`
- **Foreign keys:** `user_id → auth.users(id) set null`
- **Indexes:** `auth_audit_log_user_id_idx`, `auth_audit_log_event_idx`, `auth_audit_log_created_at_idx (desc)`
- **RLS policies:** SELECT only for `is_admin()`. No INSERT/UPDATE/DELETE policies — service role is the sole writer.
- **Triggers:** none
- **Used by:** `lib/auth/audit.ts` (writeAuditLog), every auth server action (signInAction, verifyOtpAction, resendOtpAction, setPasswordAction, inviteUserAction, suspendUserAction, reactivateUserAction, terminateUserAction)
- **Has data?** **12 rows**. Most recent: `login_success` 2026-05-04 04:13Z (i.e., the user did successfully complete the OTP flow recently). Recent log shows three full sign-in cycles in the past 24h.
- **Event vocabulary:** `login_success`, `login_failed`, `mfa_challenge_sent`, `mfa_challenge_verified`, `mfa_challenge_failed`, `password_changed`, `user_invited`, `user_suspended`, `user_reactivated`, `user_terminated`, `session_revoked`, `email_changed`

---

### Functions / RPCs / triggers (no row count, but enumerated)

| Object | Migration | Purpose |
| --- | --- | --- |
| `public.handle_updated_at()` | 0001 | Generic BEFORE UPDATE trigger that stamps `updated_at = now()`. Used by clients/sites/contacts/profiles. |
| `public.handle_new_user()` | 0002 | AFTER INSERT on `auth.users` → reads `raw_user_meta_data` for first/last/role and inserts the matching `profiles` row with `status='Invited'`. SECURITY DEFINER. |
| `public.is_admin()` | 0002 | SECURITY DEFINER, returns boolean. True if `auth.uid()` is an active Admin in `profiles`. Used by RLS policies that need an "is admin?" gate without recursion. |
| `public.guard_profile_updates()` | 0002 | BEFORE UPDATE on `profiles`. Raises `42501` if a non-admin tries to change `role`, `status`, `created_by`, `terminated_at`, `mfa_enrolled`, `last_login_*`, `email`, or `id`. |
| `public.has_pending_otp()` | 0003 | SECURITY DEFINER, returns boolean. True iff the current `auth.uid()` has an unconsumed unexpired `auth_otp` row. Granted to `authenticated` so middleware can call it without service-role. |

═══════════════════════════════════════════════════════════════════════════════
## SECTION 5 — COMPONENTS INVENTORY
═══════════════════════════════════════════════════════════════════════════════

> Pure-UI primitives in `components/ui/` (button, card, input, select, etc.) are listed at the end without per-row notes — they're stable shadcn / Base UI primitives with one exception called out in §7.

### `components/auth/`

| Component | Path | Used By | Status | Notes |
| --- | --- | --- | --- | --- |
| AuthProvider | `components/auth/AuthProvider.tsx` | Root layout (wraps all pages) | REAL | Real Supabase Auth provider. Hydrates from `supabase.auth.getUser()` + `profiles` row, subscribes to `onAuthStateChange`. Exposes `{ user, profile, status, signOut, refreshProfile, isAuthenticated }`. |
| RequireAuth | `components/auth/RequireAuth.tsx` | `(app)/layout.tsx` | REAL | Client-side hydration safety net (middleware is the real gate). Shows `Verifying session…` placeholder while AuthProvider's initial getUser settles. |
| RedirectIfAuthed | `components/auth/RequireAuth.tsx` | (currently unused — middleware handles this server-side) | REAL but ORPHAN | Was used by `(auth)/login/layout.tsx` until middleware took over. Still exported. |

### `components/layout/`

| Component | Path | Used By | Status | Notes |
| --- | --- | --- | --- | --- |
| AppShell | `components/layout/AppShell.tsx` | `(app)/layout.tsx` | REAL | Composes Sidebar + TopBar + main + GlobalCommandPalette. |
| Sidebar | `components/layout/Sidebar.tsx` | AppShell | REAL | Navy nav with bracketed-N mark, count badges. Reads `useRole()` + `canViewRoute()` to disable rows the role can't view. **Imports nav-config which transitively reads mock-data for badge counts.** |
| nav-config | `components/layout/nav-config.tsx` | Sidebar | UI_ONLY-ish | **Imports `lib/mock-data/{quotes,projects,clients}` for the count chips on quotes/projects/clients sidebar rows.** Counts will be wrong vs. real DB content. (Clients chip says 20 from mock; DB has 2.) |
| TopBar | `components/layout/TopBar.tsx` | AppShell | REAL | Search bar removed `0f51609`. Now just breadcrumbs + bell + mail-icon button + read-only role pill + AvatarMenu. |
| AvatarMenu | `components/layout/AvatarMenu.tsx` | TopBar | REAL | **Just rewritten in `0f51609`**. Plain divs for header (name + email + role badge) avoiding the Base UI GroupLabel-without-Group constraint. Sign-out only. Awaiting user verification of the fix. |
| GoldBreadcrumbs | `components/layout/Breadcrumbs.tsx` | TopBar | REAL but reads mock-data | Uses `usePathname()` + `useSearchParams()` (wrapped in Suspense). Imports `lib/mock-data/clients`, `lib/mock-data/projects`, `lib/mock-data/quotes` to resolve detail-page slugs to display labels — would show wrong labels for real DB rows that don't exist in mock-data. |
| NotificationsBell | `components/layout/NotificationsBell.tsx` | TopBar | UI_ONLY | Reads `lib/notifications.ts` (9 hardcoded mock notifications). Popover renders. Interactions are no-op. |
| GlobalCommandPalette | `components/layout/GlobalCommandPalette.tsx` | AppShell | **DEAD-ish** | Mounted but no longer triggered from the search bar (which was removed). **Still listens for ⌘K via its own `window.addEventListener("keydown")`.** Imports `lib/mock-data/{clients,sites,projects,products,invoices,quotes,users}` to populate the searchable command list. **Likely crash vector if user presses ⌘K** — see §7. |
| AvatarMenu (children) | (TopBar passes the Avatar primitive) | TopBar | REAL | initials badge — initials are computed from `useAuth().user.name` |
| PageHeader | `components/layout/PageHeader.tsx` | every page in `(app)/` | REAL | Eyebrow / title / italic subtitle / actions / gold rule. Pure presentation. |
| ActionButton | `components/layout/ActionButton.tsx` | (page-header actions) | REAL | Primary / outline / bronze variants. |
| EmptyState | `components/layout/EmptyState.tsx` | (used by some lists) | REAL | Gold-bordered icon + serif title + CTA. |
| Skeleton | `components/layout/Skeleton.tsx` | (used by loading states) | REAL | `nx-skeleton` shimmer wrapper. |
| Placeholder | `components/layout/Placeholder.tsx` | (lightly used) | REAL but rarely rendered | |

### `components/modules/dashboard/`

| Component | Path | Used By | Status | Notes |
| --- | --- | --- | --- | --- |
| KpiCard | dashboard/ | /dashboard | UI_ONLY | Reads no data itself; receives values. |
| AnimatedNumber | dashboard/ | /dashboard, /inventory, /scheduling | UI_ONLY | framer-motion counter. Pure. |
| RangePicker | dashboard/ | /dashboard | UI_ONLY | Uses `lib/dashboard-data` for range labels. |
| Restricted | dashboard/ | /dashboard (locked KPIs) | REAL | Renders a lock icon when `<Can>` denies a panel. |
| CanFinancials | dashboard/ | /dashboard | REAL | Wraps `<Can resource="financials" action="view">`. |
| RevenueTrendChart | dashboard/ | /dashboard | UI_ONLY | Reads `lib/dashboard-data.ts` (mock-derived). |
| PipelineFunnel | dashboard/ | /dashboard | UI_ONLY | Reads dashboard-data. |
| ActivityFeed | dashboard/ | /dashboard | UI_ONLY | Reads dashboard-data → mock activity events. |
| TopClientsTable | dashboard/ | /dashboard | UI_ONLY | Reads dashboard-data. |
| InventoryHealth | dashboard/ | /dashboard | UI_ONLY | Reads dashboard-data. |
| TechnicianUtilization | dashboard/ | /dashboard | UI_ONLY | Reads dashboard-data. |

### `components/modules/quotes/` + `quotes/builder/`

| Component | Status | Notes |
| --- | --- | --- |
| QuotesTable | UI_ONLY | TanStack table over mock quotes |
| QuoteFilters | UI_ONLY | Mock status/owner filters |
| QuoteRowActions | UI_ONLY | Per-row dropdown — toasts only |
| QuoteStatusBadge | REAL | Pure presentation |
| builder/QuoteBuilder | UI_ONLY | Master orchestrator. Reads localStorage drafts. |
| builder/BuilderHeader | UI_ONLY | Save/Send/Convert toasts |
| builder/ClientSiteCard | UI_ONLY | Picks from mock clients/sites |
| builder/QuoteDetailsCard | UI_ONLY | |
| builder/SectionCard | UI_ONLY | |
| builder/LineItemRow | UI_ONLY | |
| builder/SkuAutocomplete | UI_ONLY | Reads mock products |
| builder/CommandPalette | UI_ONLY | Quote-builder quick-add (separate from GlobalCommandPalette) |
| builder/CurrencyInput | REAL | Pure input control |
| builder/TotalsBar | UI_ONLY | |
| builder/NotesCards | UI_ONLY | |
| builder/QuoteDocument | UI_ONLY | `@react-pdf/renderer` — renders the printable PDF |
| builder/PdfPreviewPane | UI_ONLY | Live PDF viewer |
| builder/ReadOnlyBanner | REAL | Banner shown on Approved/Converted quotes |

### `components/modules/projects/` + `projects/tabs/`

All UI_ONLY, all consume `lib/project-data.ts` builders + mock-data. Notable:

| Component | Status | Notes |
| --- | --- | --- |
| ProjectDetailHeader | UI_ONLY | progress ring, status badges |
| ProjectFilters / ProjectStatsStrip / ProjectStatusBadge / ProjectsTable / ProjectsCardView / ProjectTabsNav / ProgressRing | UI_ONLY | |
| tabs/OverviewTab | UI_ONLY | |
| tabs/TasksTab | UI_ONLY | |
| tabs/ScheduleTab | UI_ONLY | Gantt with drag-reschedule (in-memory) |
| tabs/MaterialsTab | UI_ONLY | |
| tabs/CommissioningTab | UI_ONLY | |
| tabs/ZoneListTab | UI_ONLY | |
| tabs/DocumentsTab | UI_ONLY | Drag-zone into local state only — needs Storage |
| tabs/FinancialsTab | UI_ONLY | |
| tabs/TimeLaborTab | UI_ONLY | |

### `components/modules/inventory/` (6 tabs)

All UI_ONLY, all read mock products + inventory-data.

| Component | Status |
| --- | --- |
| StockTab, AllocationsTab, TransfersTab, PurchaseOrdersTab, VendorsTab, CategoriesTab | UI_ONLY |

### `components/modules/scheduling/`

| Component | Status | Notes |
| --- | --- | --- |
| UnassignedQueue | UI_ONLY | Drag source |
| CalendarView | UI_ONLY | Day/week/month, drag-drop swimlanes |
| TechDrawer | UI_ONLY | Technician profile sidebar — fake ESA license / certifications display |

### `components/modules/financials/`

| Component | Status |
| --- | --- |
| Tabs (10 tabs in one file, 1149 LOC) | UI_ONLY |

### `components/modules/users/`

| Component | Status | Notes |
| --- | --- | --- |
| InviteUserDrawer | REAL | Wired to `inviteUserAction` |
| Tabs.UsersTab | REAL | DbProfile-backed; row actions wired to suspend/reactivate/terminate |
| Tabs.InvitationsTab | REAL | Filters DbProfile rows where `status='Invited'` |
| Tabs.RolesTab | UI_ONLY | Counts profiles by role from `lib/mock-data/users` (would be wrong vs. real DB) |
| Tabs.PermissionsMatrixTab | UI_ONLY | 75-permission catalogue display, no persistence |
| Tabs.ActivityLogTab | UI_ONLY | Reads `lib/mock-data/audit-log` — should surface real `auth_audit_log` |
| Tabs.SubcontractorsTab | UI_ONLY | Reads `lib/mock-data/subcontractors` |
| UserDrawer | **DEAD** | The 75-permission override drawer. **No longer mounted from `/users`** since Phase 4. Still on disk, still imports `lib/types.ts` legacy User type. Will be re-wired in Session B against a future `user_permissions` table. |

### `components/modules/settings/`

| Component | Status | Notes |
| --- | --- | --- |
| BrandingThemes | REAL (limited) | Theme switcher persists to localStorage. Only working setting in the entire module. |
| BackupsData | UI_ONLY | Fake filesystem tree, fake progress bars. CLAUDE_CONTEXT §10 details the unbuilt design. |
| SettingsPanes | UI_ONLY | 12 panes, all decorative. |

### `components/ui/` (shadcn / Base UI primitives)

avatar · badge · button · card · command · dialog · **dropdown-menu** · input · input-group · label · popover · select · separator · sheet · table · tabs · textarea

All Base UI v1.4.x. **One known caveat called out in §7:** `DropdownMenuLabel` wraps `Menu.GroupLabel` which throws if not nested in `Menu.Group`. AvatarMenu was the only consumer using it bare; rewrite in `0f51609` removed that usage. Other consumers (`Tabs.tsx` UserRowActions) wrap it inside the menu's main popup but **also do not nest in a Group** — they currently render fine because the user hasn't clicked them yet. If a row's action menu opens, same crash will surface there.

═══════════════════════════════════════════════════════════════════════════════
## SECTION 6 — MOCK DATA INVENTORY
═══════════════════════════════════════════════════════════════════════════════

### `lib/mock-data/*` (the explicit fake-data exports)

| File | Type | Records | Consumed by | Should be replaced with |
| --- | --- | --- | --- | --- |
| `lib/mock-data/clients.ts` | Mock clients | ~20 | nav-config (count badge), GlobalCommandPalette, Breadcrumbs, dashboard helpers, quotes builder, /quotes list, /projects list, project tabs | `public.clients` table — already wired for `/clients` only |
| `lib/mock-data/sites.ts` | Mock sites | ~30 | GlobalCommandPalette, dashboard, quotes builder | `public.sites` |
| `lib/mock-data/contacts` | (no separate file — embedded in clients) | — | — | `public.contacts` |
| `lib/mock-data/quotes.ts` | Mock quotes | ~30 | nav-config, GlobalCommandPalette, /quotes list, dashboard pipeline funnel | future `public.quotes` (P0 next) |
| `lib/mock-data/projects.ts` | Mock projects | ~20 | nav-config, GlobalCommandPalette, Breadcrumbs, /projects list, project detail, dashboard | future `public.projects` |
| `lib/mock-data/products.ts` | Mock SKUs | ~80 | inventory tabs, quotes builder SKU autocomplete, dashboard inventory health | future `public.products` + `public.vendors` |
| `lib/mock-data/invoices.ts` | Mock invoices | ~30 | financials tabs, dashboard overdue KPI, GlobalCommandPalette | future `public.invoices` |
| `lib/mock-data/users.ts` | Mock users (incl. `currentUser` export — 18 names) | 18 | dashboard greeting, sidebar/avatar fallback (defunct), Breadcrumbs (resolves owner names), users module RolesTab + ActivityLogTab + SubcontractorsTab, scheduling, projects | `public.profiles` — already partially wired |
| `lib/mock-data/audit-log.ts` | Mock activity events | ~80 | users module ActivityLogTab | `public.auth_audit_log` (already exists, just needs Surface in the tab) |
| `lib/mock-data/subcontractors.ts` | Mock subs | ~6 | users module SubcontractorsTab | future `public.subcontractors` |

### Legacy "data helper" libs that synthesize mock data (NOT in `lib/mock-data/` but functionally identical)

| File | Purpose | Consumed by |
| --- | --- | --- |
| `lib/dashboard-data.ts` | Builds KPIs / charts from mock-data | `/dashboard` and most dashboard sub-components |
| `lib/financials-data.ts` | Builds P&L / cash flow / AR aging | `/financials` Tabs.tsx |
| `lib/inventory-data.ts` | Warehouse / vendor / transfers helpers | inventory tabs |
| `lib/project-data.ts` | Tasks / materials / POs / commissioning / zones / docs / time builders (649 LOC) | project detail tabs |
| `lib/quote-helpers.ts` | Line-item math, totals, status order — also has SOME mock helpers | quotes builder |
| `lib/quote-store.ts` | localStorage draft persistence | `/quotes/new` and `/quotes/[id]` |
| `lib/scheduling-data.ts` | Job builder, swimlane data, technician profiles with ESA #s | scheduling page + TechDrawer |
| `lib/notifications.ts` | 9 hardcoded notifications (some mock projects names) | NotificationsBell |
| `lib/types.ts` | LEGACY `User`, `Project`, `Quote`, `Client` types for mock-data shape | every UI_ONLY module that hasn't migrated |
| `lib/permissions-matrix.ts` | 75-permission catalogue (mostly display-only) | users module PermissionsMatrixTab + UserDrawer |

### Hardcoded arrays inside components (spot-checked)

- `components/modules/users/InviteUserDrawer.tsx` — `ROLE_OPTIONS` array (11 entries) for the role dropdown. **This is configuration, not mock data — fine.**
- `components/modules/settings/SettingsPanes.tsx` — fake field defaults (e.g. `defaultValue="ESA/ECRA 7012-441"`, `"ULC-A-1188-CA"`). These are *integrator-customer-side* values they would input, not Nexvelon's claims — kept per CLAUDE_CONTEXT §1 cleanup note.
- `components/modules/settings/BrandingThemes.tsx` — `useState("Marcus Holloway\n…")` default signature block. Mock seed.

### Files matching `*.mock.ts`, `*.fake.ts`, `*.demo.ts`, `*.seed.ts`

**None.** All fake data lives under `lib/mock-data/` or in the legacy data-helper files above.

═══════════════════════════════════════════════════════════════════════════════
## SECTION 7 — KNOWN ERRORS / BROKEN BEHAVIORS
═══════════════════════════════════════════════════════════════════════════════

> Severity scale: **BLOCKER** (can't sign in / use app) · **HIGH** (visible crash on common click) · **MEDIUM** (functional gap or wrong data) · **LOW** (polish / cosmetic).

### Recently fixed (in `0f51609`, awaiting user verification)

| Issue | Severity | Status |
| --- | --- | --- |
| Avatar dropdown crashed on click — Base UI #31 from `Menu.GroupLabel` without `Menu.Group` | HIGH | **Fix pushed.** AvatarMenu rewritten with plain divs. Awaiting user click test. |
| OTP verify hung at "Verifying session…" | BLOCKER (sign-in broken) | **Fix pushed.** Server now uses `redirect()` from `next/navigation` (atomic with cookie writes). Manual loading state on client + 30s timeout fallback. Recent audit log shows the user successfully completed the OTP flow at 2026-05-04 04:13Z, so the live evidence supports the fix. |
| Search-bar input crashed on focus/click | HIGH | **Fix pushed.** Search bar entirely deleted from TopBar. |

### Open (live in `main` right now)

| # | Issue | Severity | File / location |
| --- | --- | --- | --- |
| 1 | **⌘K keyboard shortcut still triggers GlobalCommandPalette.** The search-bar trigger was removed but `GlobalCommandPalette` is still mounted in AppShell with its own `window.addEventListener("keydown", onKey)` that fires on `⌘K` / `Ctrl+K`. The palette imports `lib/mock-data/clients/sites/projects/products/invoices/quotes/users` to build its searchable index. Whether it actually crashes when opened depends on the same render path that crashed via the search input — likely yes for the same reason. | **HIGH** (latent — easy to hit by accident) | `components/layout/GlobalCommandPalette.tsx` (line 69 has the keydown listener), `components/layout/AppShell.tsx` mounts it |
| 2 | **`<DropdownMenuLabel>` still used unguarded in `Tabs.tsx`.** The user-row Suspend/Reactivate/Terminate menu uses the same `DropdownMenuLabel` primitive that crashed AvatarMenu. The Users page list has 1 row currently (Jay), and clicking the ⋯ menu on your own row is suppressed by `isSelf || isTerminated`. So the bug **doesn't surface yet**, but the moment a second profile exists and an admin clicks the row's menu, same Base UI #31 will fire. | **HIGH** (latent, will fire as soon as second user invited) | `components/modules/users/Tabs.tsx` lines ~283–293 |
| 3 | **Sidebar count badges read mock data, not DB.** `nav-config.tsx` imports `lib/mock-data/{quotes,projects,clients}` and uses array lengths for the chip counts. Real `clients` table has 2 rows; the chip says "20". This is **wrong data** in the live UI. | MEDIUM | `components/layout/nav-config.tsx` |
| 4 | **Breadcrumbs on detail pages may show wrong labels.** `Breadcrumbs.tsx` resolves slugs to display names by looking up `lib/mock-data/{clients,projects,quotes}`. A real DB-created client will have a UUID slug that's not in the mock array → breadcrumb shows the raw slug. (Currently only `/clients/[id]` would surface this — and that route doesn't exist yet, sites are nested under the list — so MEDIUM, latent.) | MEDIUM | `components/layout/Breadcrumbs.tsx` |
| 5 | **NotificationsBell shows 9 fake notifications.** Hardcoded list in `lib/notifications.ts`. Some referencing fake project names. Bell icon is in TopBar. Click opens a popover — no crash, but the data is fake. | LOW | `components/layout/NotificationsBell.tsx`, `lib/notifications.ts` |
| 6 | **Mail icon button in TopBar is non-functional.** No onClick. `aria-label="Messages"`. | LOW | `components/layout/TopBar.tsx` lines ~95–99 |
| 7 | **Most modules toast on mutation buttons.** Quote builder Save/Send/Convert, Projects edit, Inventory adjustments, etc. — all currently toast success without persisting. User will accept this as part of "UI_ONLY" but worth flagging. | MEDIUM | many files |
| 8 | **Theme switcher persists to localStorage only, not user profile.** `lib/theme.ts` + `BrandingThemes.tsx`. Multi-device sync not implemented. | LOW | `components/modules/settings/BrandingThemes.tsx` |
| 9 | **`lib/quote-store.ts` writes draft quotes to localStorage.** Drafts disappear on browser clear. Will be deleted in Session A's next P0 (Quotes wiring). | MEDIUM | `lib/quote-store.ts` |
| 10 | **`@base-ui/react` does not support `asChild`.** Documented in CLAUDE_CONTEXT §12 #9. If a future contributor copies a Radix-style shadcn snippet with `<Button asChild><Link/></Button>`, it won't compile. Use `buttonVariants()` instead. | LOW (pattern hazard) | global |
| 11 | **`lucide-react@^1.14.0` renamed many icons.** If you import an icon name from a stale Radix/shadcn snippet, TS will error "X has no exported member". | LOW | global |
| 12 | **Recharts SSR width warnings during `next build`.** `ResponsiveContainer` measures zero during prerender → console warning. Cosmetic. | LOW | dashboard, financials |
| 13 | **MFA gate is middleware-enforced, not RLS-enforced.** During the ~10-min OTP-pending window the user holds a valid Supabase JWT — direct REST calls succeed (RLS still scopes by role, but the OTP gate is app-layer only). Documented in CLAUDE_CONTEXT §12 #14. Upgrade path: Supabase Auth Hooks + `mfa_verified` JWT claim. | MEDIUM (real but mitigated for our threat model) | `middleware.ts`, RLS policies |
| 14 | **Manual cross-device test pass not done.** New auth surfaces (login, verify-otp, set-password) built mobile-first with min-44px touch targets but never run on real iPhone/Android. CLAUDE_CONTEXT §12 #15 lists the matrix (320/768/1024/1440 + Safari, Chrome, Firefox, Edge, iOS Safari, Android Chrome). | MEDIUM | various |
| 15 | **`window.confirm()` for destructive actions.** Used in `ClientsView.tsx` deletes and `Tabs.tsx` Suspend/Reactivate/Terminate. Not a real modal. CLAUDE_CONTEXT §12 #4. | LOW | global |
| 16 | **`UserDrawer.tsx` is orphaned.** No longer mounted from `/users` since Phase 4. 420 LOC of permission-override UI sitting on disk. Still imports `lib/types.ts` legacy `User` type. **Won't crash because it's not rendered**, but contributes to dead-code drag and ESLint passes still scan it. CLAUDE_CONTEXT §12 #12. | LOW | `components/modules/users/UserDrawer.tsx` |
| 17 | **Dashboard page renders "Demo build · figures derived from synthetic data" footer.** Self-aware, but the data is unambiguously fake. | LOW (intentional) | `app/(app)/dashboard/page.tsx` |
| 18 | **Quote line-item PDF export uses fake products + clients.** `<PDFDownloadLink>` produces a PDF that looks real but every detail is mock. | LOW (UI_ONLY behaviour) | `components/modules/quotes/builder/QuoteDocument.tsx` |
| 19 | **`/auth/callback` route exists but is unused.** Originally for the legacy PKCE flow before we switched to `/auth/confirm`. Documented as "kept for future OAuth" but no caller invokes it today. Not broken — just dead. | LOW | `app/auth/callback/route.ts` |

═══════════════════════════════════════════════════════════════════════════════
## SECTION 8 — AUTH FLOW DIAGRAM
═══════════════════════════════════════════════════════════════════════════════

### Step-by-step trace, with file references

**1. User hits `https://app.nexvelonglobal.com`.**
The request lands at the root path `/`. Static assets bypass the matcher; everything else hits `middleware.ts`.

**2. `middleware.ts` runs** (`middleware.ts:39`).
The handler calls `updateSession(request)` from `lib/supabase/middleware.ts:1`, which:
- Builds an Edge-runtime cookie-aware Supabase client.
- Calls `supabase.auth.getUser()` to validate the JWT (NOT `getSession()` — `getUser()` re-validates against Supabase Auth).
- Calls the `has_pending_otp()` RPC if there's a user, returning `boolean`.
- Returns `{ supabaseResponse, user, hasPendingOtp }`.

Then `middleware.ts` decides:
- **No user** → if path is `/`, `/login`, `/auth/callback`, or `/auth/confirm`, allow. Otherwise redirect to `/login?next=<original>`.
- **User + hasPendingOtp** → if path is `/auth/verify-otp`, `/auth/callback`, or `/auth/confirm`, allow. Otherwise redirect to `/auth/verify-otp?next=<original>`.
- **User + no pending OTP** → if path is `/auth/verify-otp` or `/login` or `/`, redirect to `/dashboard` (or `?next=`). Otherwise allow.

Cookies refreshed during `getUser()` are forwarded onto every redirect response via `redirectWithCookies()` (`middleware.ts:112`).

**3. If redirected to `/login`** (`app/(auth)/login/page.tsx`).
- Renders the v4.18 navy-and-gold split-screen.
- User submits email + password → `signInAction` (`app/(auth)/login/actions.ts:28`).
- `signInAction`:
  - Calls `supabase.auth.signInWithPassword()` via the cookie-aware server client.
  - On success, fetches `profiles` row via `getCurrentProfile()` (`lib/auth/profile.ts:8`).
  - Verifies `profile.status === 'Active'` — otherwise signOut + return error.
  - Generates a 6-digit OTP via `createOtpForUser()` (`lib/auth/otp.ts:60`) — bcrypt-hashes it, inserts into `auth_otp` via service-role admin client.
  - Emails the plaintext code to the user via Resend (`sendOtpEmail()` in `lib/auth/email.ts:25`).
  - Writes `mfa_challenge_sent` to `auth_audit_log`.
  - Returns `{ ok: true, redirectTo: '/auth/verify-otp' }`.
- Client `router.replace('/auth/verify-otp')`.
- The Supabase session cookie IS set at this point. Middleware's `has_pending_otp()` will now return true.

**4. `/auth/verify-otp`** (`app/auth/verify-otp/page.tsx`).
Reachable only because middleware sees `hasPendingOtp === true`.
- Renders the 6-digit code input. Auto-submits when 6 digits typed.
- Submit → `verifyOtpAction(code, next)` (`app/auth/verify-otp/actions.ts:35`).
- `verifyOtpAction` (with structured `[verifyOtp] <step>` logs at every checkpoint):
  - Validates 6-digit code length.
  - Calls `getCurrentProfile()` again. If missing or not Active → return failure.
  - Calls `verifyOtpForUser()` (`lib/auth/otp.ts:144`):
    - SELECTs the most recent unconsumed `auth_otp` row for this user.
    - Checks expiry, attempts < 5.
    - bcrypt.compare against `code_hash`.
    - On match: UPDATE `used_at = now()` (the row is now consumed; `has_pending_otp()` will return false on next query).
    - On miss: increment `attempts`. If `>= 5`, also stamp `used_at` to lock further tries.
  - On success: writes `mfa_challenge_verified` and `login_success` to `auth_audit_log`. Stamps `profiles.last_login_at` and `last_login_ip` via `stampLogin()` (`lib/auth/profile.ts:75`, service-role).
  - **Calls `redirect('/dashboard')` from `next/navigation`** — throws `NEXT_REDIRECT` which Next intercepts and sends as a redirect response (with all cookie writes attached).
- Client side (since `0f51609`): a manual `pending` state + 30s timeout. If the action throws `NEXT_REDIRECT`, the digest-prefix check re-throws so Next handles the navigation. If action returns a failure object, error is shown. If 30s elapses with no resolution, button re-enables and a "Verification timed out" message appears.

**5. After OTP success**, the redirect response sends the browser to `/dashboard`. Middleware on that request sees `user` + `hasPendingOtp === false` (the OTP row's `used_at` is set). Allows `/dashboard`.

**6. On `/dashboard` (or any `(app)` route)**, `(app)/layout.tsx` renders `<RequireAuth><AppShell>{children}</AppShell></RequireAuth>` (`app/(app)/layout.tsx`).
- `RequireAuth` (`components/auth/RequireAuth.tsx:18`) checks `useAuth().status` (provided by `AuthProvider` at the root).
- If `status === 'authenticated'`, render children.
- If `status === 'loading'`, render `Verifying session…` placeholder. **This is the only place that text appears.**
- If `status === 'anonymous'` (rare — would mean Supabase rejected the JWT mid-render), `useEffect` triggers `router.replace('/login')`.
- `AuthProvider` (`components/auth/AuthProvider.tsx:111`) is initialised at the root layout. It runs `supabase.auth.getUser()` + `fetchProfile()` on mount. Subscribes to `onAuthStateChange` for token-refresh / sign-out events.

**7. `/auth/confirm`** (`app/auth/confirm/route.ts`).
Fires when the user clicks an email link from any of: invite (bootstrap-admin script + the regular /users invite drawer once Supabase dashboard templates are updated), magic link, recovery, email change.
- Reads `?token_hash=<hashed>&type=<invite|magiclink|recovery|email_change|signup>&next=<safe-internal-path>`.
- Validates the type is in the whitelist.
- Calls `supabase.auth.verifyOtp({ type, token_hash })`. Side effect: sets session cookies on the response.
- On success: redirects to `?next=` if it's a safe internal path, otherwise per type — `invite`/`recovery` → `/auth/set-password`, others → `/dashboard`.
- On failure: redirects to `/login?error=<friendly>`.

The token_hash flow defeats Gmail's link prefetch (which would otherwise consume one-time tokens before the human clicks) — `verifyOtp` requires a cookie-setting interactive context to redeem.

**8. `/auth/callback`** (`app/auth/callback/route.ts`).
Originally invoked by older PKCE-style invite/recovery emails. **Currently no flow uses it** — `/auth/confirm` is the canonical endpoint. Kept on disk for future OAuth (e.g. "Sign in with Google") since OAuth uses the legacy `?code=` query param.

**9. `/auth/set-password`** (`app/auth/set-password/page.tsx`).
- Reachable only with a session (the `/auth/confirm` exchange sets one).
- Form: new password + confirm, with live strength meter (`lib/auth/password-policy.ts`) and per-rule checklist.
- Submit → `setPasswordAction()` (`app/auth/set-password/actions.ts`):
  - Validates against the policy (12+/upper/lower/digit/symbol).
  - Calls `supabase.auth.updateUser({ password })`.
  - Calls `updateProfileAdmin()` to flip `status='Active'` and `mfa_enrolled=true` (service-role bypasses the `guard_profile_updates` trigger).
  - Writes `password_changed` to `auth_audit_log`.
  - Redirects to `/dashboard`.

**10. Sign-out.**
- `useAuth().signOut()` (`AuthProvider.tsx:163`) calls `supabase.auth.signOut()` then `router.replace('/login')`.
- Or `signOutAction()` (`app/(auth)/login/actions.ts`) — server-side, used by the "Use a different account" link on /auth/verify-otp.

═══════════════════════════════════════════════════════════════════════════════
## SECTION 9 — ENVIRONMENT VARIABLES
═══════════════════════════════════════════════════════════════════════════════

### Vars actually read by the code (`process.env.*`)

| Name | Purpose | Required? | Set in Vercel? | Set in `.env.local`? |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Used by `bootstrap-admin.ts` to build the `/auth/confirm` URL when generating invite links. Falls back to `https://app.nexvelonglobal.com` if unset. | NO (has fallback) | per CLAUDE_CONTEXT — Vercel sets this automatically on its own deploys | typical local override `http://localhost:3000` per `.env.example` |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server + edge Supabase clients | **YES** — app crashes on first DB call without it | **YES** (Phase 2 setup) | YES |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + cookie-aware server clients (RLS-scoped reads) | **YES** | **YES** | YES |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` — bypasses RLS for privileged ops only | **YES** for server actions that invite users / write OTP / write audit log | **YES** | YES |
| `RESEND_API_KEY` | `lib/auth/email.ts` (OTP send) + bootstrap-admin script (invite send). Same key powers Supabase's Custom SMTP integration. | **YES** for OTP sends and invites | **YES** (added by you between Phases 3 and 4, marked Sensitive Production-only) | should be in your `.env.local` if you've run the bootstrap script |
| `RESEND_FROM_EMAIL` | Sender address for outbound mail. Falls back to `Nexvelon <noreply@nexvelonglobal.com>` if unset. | NO (has fallback) | optional — fallback is correct | optional |

### Vars in `.env.example` but NOT yet read by any code

These are stubs for future integrations — present in `.env.example` so they're documented, but **no code reads them yet**. Setting or unsetting them changes nothing today.

| Name | Purpose (planned) |
| --- | --- |
| `NEXT_PUBLIC_BUILD_SHA` | Footer/about identifier (Vercel auto-provides `VERCEL_GIT_COMMIT_SHA` — could wire). |
| `SUPABASE_JWT_SECRET` | Future server-side JWT verification path. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Planned billing. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Planned SMS notifications. |
| `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` | **Legacy** — kept "for reference"; not used (Resend won the contest). Could be deleted in a tidy-up. |
| `QUICKBOOKS_CLIENT_ID/SECRET/REDIRECT_URI` | Planned accounting sync. |
| `XERO_CLIENT_ID/SECRET/REDIRECT_URI` | Planned accounting alternative. |
| `AZURE_AD_TENANT_ID/CLIENT_ID/CLIENT_SECRET` | Planned Microsoft SSO. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Planned Google SSO. |
| `SAML_IDP_ENTRY_POINT` / `SAML_IDP_CERT` / `SAML_SP_ACS_URL` | Planned enterprise SAML. |
| `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Planned alternative storage. |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Planned error tracking. |

═══════════════════════════════════════════════════════════════════════════════
## SECTION 10 — HONEST ASSESSMENT
═══════════════════════════════════════════════════════════════════════════════

### 1. Production-ready vs decorative vs broken — exact counts

Counting only the **17 sidebar-navigable destinations** (the things a user clicks on):

| Status | Count | % | Routes |
| --- | --- | --- | --- |
| REAL (DB-wired, working CRUD) | **1** | ~6% | `/clients` |
| MIXED (partly DB-wired) | **1** | ~6% | `/users` (Users tab + Invitations + invite drawer real; 4 of 6 tabs still mock) |
| UI_ONLY (renders fine, fake data) | **9** | ~53% | `/dashboard`, `/quotes`, `/quotes/new`, `/quotes/[id]`, `/projects`, `/projects/[id]`, `/inventory`, `/scheduling`, `/financials`, `/settings` |
| AUTH (real, working) | **5** | ~29% | `/login`, `/auth/verify-otp`, `/auth/set-password`, `/auth/confirm`, `/auth/callback` |
| BROKEN (open) | **0** | 0% | (the 3 in `0f51609` are awaiting verification, not yet known-broken in main) |
| PLACEHOLDER | **0** | 0% | — |

In plainer terms: **of the 11 protected app destinations, exactly 1 is genuinely real**, 1 is partly real, and 9 are decorative. The auth surfaces (5 routes) are real and battle-tested. The dashboard says "Demo build · figures derived from synthetic data" in its own footer — at least it's honest.

### 2. Shortest path to "an app the user can use tomorrow without anything crashing on click"

Hardening pass on what's there, **no new module wiring** — strictly fix the latent crash vectors and disconnect the most-misleading mock surfaces. Estimated **1–2 hours**:

1. **Disable the ⌘K listener in `GlobalCommandPalette.tsx`.** Comment out the `window.addEventListener("keydown", onKey)` block (line 69-ish) or unmount the palette from `AppShell.tsx`. Same reason the search-bar trigger was removed — palette imports mock-data and may crash on open. (5 min.)
2. **Wrap `<DropdownMenuLabel>` in `Tabs.tsx` UserRowActions inside a `<DropdownMenuGroup>`** (line ~283) to dodge the same Base UI #31 that bit AvatarMenu. (5 min.)
3. **Switch sidebar count badges in `nav-config.tsx` to async server-rendered counts** OR just remove the chips entirely until DB is wired. Today they show "20 clients" when DB has 2 — looks broken to a real user. (15 min if removing chips; 30 min if querying DB.)
4. **Strip the dashboard footer's apologetic "Demo build" line** (or keep it — it's honest, but if you'd like, replace with a real-looking footer). Optional. (2 min.)
5. **Add a polite empty state** to UI_ONLY pages so a user who lands there sees "Coming soon — your real data will populate here when the [Quotes/Projects/Inventory] module ships next sprint" instead of seeing impressive-looking fake data they might mistake for theirs. **The user explicitly said no "Coming Soon" markers**, so skip if that constraint stands.
6. **Verify the three `0f51609` fixes** by doing the manual test pass the user described.

### 3. Modules closest to wirable, ordered by effort (lightest first)

| Module | Effort | Blocker | Why |
| --- | --- | --- | --- |
| **Quotes** | 4–6h | none — Clients is already live | Schema is 3 simple tables; the builder already understands sections + line items in its own shape. CLAUDE_CONTEXT §11 already has this as next-P0. Retiring `lib/quote-store.ts` localStorage is a satisfying single-file delete. |
| **Inventory** | 3–4h | none | `vendors` + `products` is a clean migration. Allocations / transfers / POs are derived views over those + later projects. ~80 SKUs of mock data is an easy first-seed. |
| **Financials** (read-only first pass) | 2–3h | invoices need projects+clients FKs | Just `invoices` + `bills` + `payments` for view. Editing comes later. |
| **Users (finish remaining tabs)** | 4–6h | none | Surface `auth_audit_log` rows in ActivityLogTab; build `subcontractors` table; persist 75-perm overrides into a `user_permissions` table for the orphaned UserDrawer. |
| **Projects** | 6–8h | quotes (for `quote_id` FK) + users wiring | Largest schema; biggest payoff visually. Should ship after Quotes. |
| **Scheduling** | 3–4h | projects + users | Job records + crew assignments. Drag-drop already works locally; needs server persistence. |
| **Dashboard** | 6–8h | quotes + projects + invoices + products | All KPIs derive from other modules. Last in queue. |
| **Settings** | 6–8h+ | needs design decision (settings_kv vs per-pane tables) + Storage for uploads | Non-trivial because of file uploads (logo, signatures) and the Mac backup agent design (CLAUDE_CONTEXT §10). |

### 4. Most dangerous tech debt if left unaddressed

In my honest assessment, ranked by combination of **impact** × **likelihood of biting**:

1. **Sidebar count badges show wrong numbers** (`nav-config.tsx`). **High likelihood** — every page load. A real customer or judge looking at "20 clients" when their actual count is 2 immediately reads the app as broken. Trivial to remove or fix.
2. **`<DropdownMenuLabel>` unguarded in Users module's row-action menu.** Latent BLOCKER. As soon as a 2nd user is invited and an Admin clicks the row's ⋯ menu, same crash as the AvatarMenu we just fixed. 5-minute fix.
3. **`GlobalCommandPalette` ⌘K still hot.** Can be triggered by accidental keystroke on macOS. Crashes for the same reason the search-bar click did.
4. **MFA gate is middleware-only, not RLS-enforced** (CLAUDE_CONTEXT §12 #14). Low likelihood (no public REST surface today; threat model is friendly), but high impact if exploited. The `mfa_verified` JWT-claim upgrade is a Session B/C item.
5. **Auth audit log is invisible to admins.** It's writing every login/MFA/invite/lifecycle event to the DB beautifully — **but the UI Activity Log tab still shows mock data.** If something suspicious happens, there's no in-app way to see it; you have to query Supabase directly. Cheap fix (~30 min) once you re-render that tab from `auth_audit_log`.
6. **No error tracking in production.** No Sentry, no Datadog, no Vercel Log Drains. The new structured `[verifyOtp] <step>` logs only land in Vercel's Logs UI which is awkward to scan. If a user reports something, your only recourse is asking them to repro while you watch.
7. **No automated tests, anywhere.** Build is the only safety net. A single PR could break sign-in and pass `npm run build` because the Cloud-side behaviour isn't simulated.
8. **`UserDrawer.tsx` is dead but loaded.** ~420 LOC of unused code that imports stale legacy types — won't crash but increases bundle size and confuses readers. CLAUDE_CONTEXT §12 #12 says it's deliberate (Session B will rewire); fine, but flagged.
9. **No Storage policies / no file uploads.** Documents tab in projects has a drag-drop zone that does nothing. Photos tab in commissioning same. Branding logo upload same. CLAUDE_CONTEXT P3 plans it; nothing's there yet.
10. **`SENDGRID_*` env vars still in `.env.example`.** Dead reference. We won the contest with Resend but the SendGrid stub is still documented. A future contributor might wire it accidentally. Trivial cleanup.

### 5. What Phase 6 cleanup missed

Phase 6 was scoped to "delete demo code". It deleted `lib/demo-accounts.ts` and `RoleSwitcher.tsx`, pruned the demo env flags, scrubbed Holloway/ULC/ESA branding claims. It **did NOT**:

1. **Delete `UserDrawer.tsx`** — left orphaned by design (Session B re-wires it).
2. **Migrate the orphaned components from `lib/types.ts` legacy types to `lib/types/database.ts` Db types.** Most of the codebase still imports legacy `User`, `Client`, `Project`, `Quote` etc. The `lib/types.ts` file is 228 LOC of legacy mock-shape types that will keep growing if nothing changes.
3. **Wire NotificationsBell to real notifications.** Still 9 mock notifications in `lib/notifications.ts` — some referencing fake project names that don't exist in any real table.
4. **Remove the GlobalCommandPalette mounting.** It's still in `AppShell.tsx`. The search-bar trigger was deleted but the palette itself remains, with its keyboard listener intact.
5. **Decommission `lib/quote-store.ts`.** localStorage drafts are still there even though Quotes is the next module to wire.
6. **Strip the SendGrid env stubs.**
7. **Delete `app/auth/callback/route.ts`** — it's unused. Or document why it's kept (which CLAUDE_CONTEXT and the file's own header do, so this is debatable).
8. **Tidy ESLint warnings.** 8 warnings in the build output, mostly stale-deps in `useMemo` and `useCallback`. No errors, but the noise hides real issues if/when they appear.

### 6. Things the human owner should know that aren't obvious from clicking around

1. **The auth_audit_log is your friend.** Every meaningful auth event in the past 24h is there. Three full sign-in cycles since you bootstrap-admin'd. You can verify the OTP-flow fix worked just by reading the table — and you should, before manually clicking through.
2. **Only one user exists in the system.** `profiles` has 1 row (you). Everything that "lists users" outside the Users tab is mock.
3. **The bootstrap script doesn't ship with the app.** It's a local CLI. Anyone with `.env.local` access can run it. **Treat `.env.local` like a secret** — that file is the master key.
4. **`/auth/callback` is dead code by design.** No flow uses it. We use `/auth/confirm` for the token_hash flow. CALLBACK kept for future OAuth.
5. **Cormorant Garamond loads from Google Fonts** in the bootstrap email. Most email clients will fall back to Georgia. Apple Mail and web Gmail render the real font. The fallback is intentional — design holds either way.
6. **The 5-day work history is preserved in `git log` and CLAUDE_CONTEXT.md.** The handoff doc is exhaustive (~63 KB) and worth re-reading before any major change.
7. **Vercel Analytics + Speed Insights are mounted but not yet collecting** because no real traffic has hit the deployed app since they were added in `b4e93d8`. They'll start populating when you sign in.
8. **The 11 DB-role enum vs 7 app-role enum split is paid down by `lib/auth/normalize-role.ts`.** That helper will be retired in Session B once `lib/permissions.ts` is expanded to all 11 roles.
9. **There are only 3 SQL migrations.** Total schema fits in 584 lines. The system is small. The complexity isn't database-side — it's the 30,835 lines of UI that's mostly fronting fake data.
10. **Vercel project-level env vars (not Shared+Link).** CLAUDE_CONTEXT §12 #13 — fine for a one-project tenancy. If you ever scale to staging + admin-tool projects, migrate to the Shared+Link pattern or you'll get cryptic build failures.
11. **The user's Supabase email templates** (Invite, Confirm signup, Magic Link, Recovery, Email Change, Reauthentication) have been customized in the Supabase Dashboard during Phase 2 + the token_hash hardening. The bootstrap script does NOT use them — it sends via Resend's REST API directly. Regular `inviteUserByEmail` from the /users invite drawer DOES use them, so they need to be in sync.
12. **The most-likely next test failure** isn't auth — it's clicking the avatar or pressing ⌘K in production after the `0f51609` deploy lands. The avatar fix should hold; ⌘K will still try to open a likely-crashing palette. See §7 #1.

═══════════════════════════════════════════════════════════════════════════════
END OF REPORT — generated 2026-05-04 against `main` @ `0f51609`
═══════════════════════════════════════════════════════════════════════════════

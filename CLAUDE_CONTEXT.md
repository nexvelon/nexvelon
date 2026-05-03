# CLAUDE_CONTEXT.md

> **Single source of truth for the Nexvelon project.**
> A fresh Claude Code session should read this file end-to-end before
> proposing any change.

---

## 1. Project Overview

**Nexvelon** is a private quote-to-cash workspace for **security-systems
integrators** — firms that install Kantech / Genetec / Avigilon / DSC /
Hanwha hardware, raise multi-section quotes against ADI / Anixter / Wesco /
CDW catalogs, run their own commissioning checklists and ULC sign-off, and
need to know — to the dollar — which jobs are actually making money.

**Operating company:** Nexvelon Global Inc. · Holloway Security Integration
Group · ULC Listed · ESA Licensed.

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
| **Last deployed commit** | `dfc79be` — "Design v4.18 polish + login auth gate" |

### Deployment status

| Surface | Where it runs |
| --- | --- |
| Static UI shell, sidebar, theme system, all 9 module routes | **LIVE on Vercel** |
| Login + demo-account chips | LIVE |
| Clients module schema (clients, sites, contacts) | **LIVE in Supabase** (migration `0001` applied) |
| Clients module wired to Supabase | **LOCAL ONLY** — committed to repo but **not yet pushed** to GitHub, so production still serves the mock data version |
| All other modules (Dashboard, Quotes, Projects, Inventory, Scheduling, Financials, Users, Settings) | LIVE but still backed by **mock data** in `/lib/mock-data` |
| Real auth (Supabase Auth) | **Not built.** Login uses localStorage AuthProvider. |
| File storage (uploads) | **Not built.** Drop-zones exist in UI but accept files only into local state. |

### Working tree at handoff time

The working tree has **uncommitted changes** for the Clients module wiring:

```
M  .env.example             — Supabase section refreshed (commit when ready)
M  app/(app)/clients/page.tsx     — converted to server component
M  package.json + lock      — added @supabase/* deps
?? app/(app)/clients/ClientFormDrawer.tsx
?? app/(app)/clients/ClientsView.tsx
?? app/(app)/clients/ContactFormDrawer.tsx
?? app/(app)/clients/SiteFormDrawer.tsx
?? app/(app)/clients/actions.ts
?? lib/api/clients.ts
?? lib/types/database.ts
?? lib/supabase/{client,server,admin}.ts
?? supabase/migrations/0001_clients_schema.sql
?? .env.local               (gitignored — contains real Supabase keys)
?? CLAUDE_CONTEXT.md        (this file)
```

These should be reviewed and committed in two waves:
1. **Supabase scaffolding + Clients DB wiring** as one commit.
2. **CLAUDE_CONTEXT.md** as a separate commit.

(The user explicitly asked to commit but **not push** until they say so.)

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

### Today

**Implementation:** `components/auth/AuthProvider.tsx`. Pure client-side
React Context, persists session to `localStorage` under key
`nexvelon_session`. No server-side check. No cookie. No JWT.

**Flow:**
1. User lands on `/`.
2. `app/page.tsx` reads `useAuth().status`. If `authenticated`, redirects
   to `/dashboard`; otherwise to `/login`.
3. `(app)/layout.tsx` wraps everything in `<RequireAuth>` which
   client-side redirects anonymous users to `/login`.
4. `(auth)/login/layout.tsx` wraps in `<RedirectIfAuthed>` so signed-in
   users hitting `/login` bounce to `/dashboard`.
5. Sign-in via the form calls `signIn(email, password)`. Server-side this
   is `authenticate()` in `lib/demo-accounts.ts` — a hard-coded array
   lookup. Returns `{ ok: true } | { ok: false, error }`.
6. The 5 demo chips call `signInAs(email)` which **skips the password
   check** but still verifies the email is in the demo list.
7. On success we `setRole(acct.role)` so `<Can>` and `useRole()` work
   immediately.
8. Sign-out clears `localStorage` + redirects to `/login` + sonner toast.

### Demo accounts

Defined in `lib/demo-accounts.ts`. Shared password `P@ssw0rd`.

| Email | Role | Name |
| --- | --- | --- |
| `admin@nexvelon.com` | `Admin` | Marcus Holloway |
| `pm@nexvelon.com` | `ProjectManager` | Aria Vance |
| `sales@nexvelon.com` | `SalesRep` | Camille Beaumont |
| `tech@nexvelon.com` | `Technician` | Damola Okafor |
| `accounting@nexvelon.com` | `Accountant` | Eleanor Carstairs |

### Current Supabase posture

**RLS is bypassed.** `lib/api/clients.ts` calls `createAdminClient()` from
`lib/supabase/admin.ts` for **every read and every write**. The DB
permissive policies (`to authenticated`) are in place but unreachable
because no JWT is being attached.

This is a deliberate Phase-1 trade-off: the demo works without a real
auth pipeline, and the schema's RLS is ready for Phase 2.

### To swap to real auth (Phase 2)

When you wire Supabase Auth:

1. Replace the localStorage `AuthProvider` with one that calls
   `supabase.auth.signInWithPassword(...)` from `lib/supabase/client.ts`.
2. Wire `lib/supabase/server.ts` cookie helpers into Next.js middleware
   so requests carry the session cookie to server components.
3. **In `lib/api/clients.ts`**, change the single line
   `function db() { return createAdminClient(); }`
   to
   `async function db() { return createClient(); }` (importing from
   `lib/supabase/server.ts`).
4. The existing RLS policies (`for all to authenticated using (true)`)
   will start being enforced. They remain permissive within authenticated
   users — tighten them when introducing per-role row scoping.
5. Once you have an `auth.uid()` to bind to, replace the permissive
   policies with role-aware ones (e.g. SalesRep can only see clients
   where `account_manager_id = auth.uid()`).

---

## 7. Module Status Matrix

| Module | Status | DB-wired | Files |
| --- | --- | --- | --- |
| **Login** | LIVE · polished design v4.18 | n/a (localStorage) | `app/(auth)/login/page.tsx`, `app/(auth)/login/layout.tsx`, `components/auth/AuthProvider.tsx`, `components/auth/RequireAuth.tsx`, `lib/demo-accounts.ts` |
| **Dashboard** | LIVE · 6 KPI cards + 4 charts | ✗ Mock | `app/(app)/dashboard/page.tsx`, `components/modules/dashboard/*` (11 files), `lib/dashboard-data.ts` |
| **Quotes** | LIVE · list + builder + live PDF preview | ✗ Mock + localStorage drafts | `app/(app)/quotes/{page,new/page,[id]/page}.tsx`, `components/modules/quotes/**` (18 files), `lib/quote-store.ts`, `lib/quote-helpers.ts`, `lib/mock-data/quotes.ts` |
| **Projects** | LIVE · list + 9-tab detail | ✗ Mock | `app/(app)/projects/{page,[id]/page}.tsx`, `components/modules/projects/**` (17 files including 9 tab files), `lib/project-data.ts`, `lib/mock-data/projects.ts` |
| **Clients** | **WIRED to Supabase** (working tree, unpushed) | ✓ `clients` + `sites` + `contacts` | `app/(app)/clients/{page.tsx,ClientsView.tsx,actions.ts,ClientFormDrawer.tsx,SiteFormDrawer.tsx,ContactFormDrawer.tsx}`, `lib/api/clients.ts`, `lib/types/database.ts`, `lib/supabase/{client,server,admin}.ts` |
| **Inventory** | LIVE · 6 tabs | ✗ Mock | `app/(app)/inventory/page.tsx`, `components/modules/inventory/*` (6 files), `lib/inventory-data.ts`, `lib/mock-data/products.ts` |
| **Scheduling** | LIVE · drag-drop dispatch board | ✗ Mock | `app/(app)/scheduling/page.tsx`, `components/modules/scheduling/*` (3 files), `lib/scheduling-data.ts` |
| **Financials** | LIVE · 10 tabs (P&L, BS, Cash Flow, etc.) | ✗ Mock | `app/(app)/financials/page.tsx`, `components/modules/financials/Tabs.tsx`, `lib/financials-data.ts`, `lib/mock-data/invoices.ts` |
| **Users & Permissions** | LIVE · 6 tabs + permission override drawer | ✗ Mock | `app/(app)/users/page.tsx`, `components/modules/users/{Tabs,UserDrawer}.tsx`, `lib/permissions-matrix.ts`, `lib/mock-data/users.ts`, `lib/mock-data/audit-log.ts` |
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

### P0 — Push the Clients DB wiring to production

- Commit the working tree (Clients module + Supabase scaffolding + this file).
- Push to `main` so Vercel redeploys.
- Smoke test on `https://app.nexvelonglobal.com/clients` after deploy.
- **Scope:** ~10 minutes.

### P1 — Wire the next module to Supabase

Pick one. Recommended order:

1. **Users** — small, self-contained, unblocks real auth.
   - Migration: `0002_users_schema.sql` — `users`, `user_roles`,
     `subcontractors`, `audit_log`, `invitations`.
   - Mirror `lib/types/database.ts` extensions, `lib/api/users.ts`,
     `app/(app)/users/actions.ts`.
   - **Scope:** ~2-3 hours.
2. **Projects** — biggest payoff because of the 9-tab detail page.
   - Migration: `projects`, `project_tasks`, `project_materials`,
     `purchase_orders`, `commissioning_items`, `intrusion_zones`,
     `project_documents`, `time_entries`.
   - Will need carefully designed FKs and RLS scoping.
   - **Scope:** ~6-8 hours.
3. **Quotes** — depends on Clients (for client_id FK) and optionally
   Users (for owner_id). Has the most complex existing in-memory model
   (sectioned line items, totals).
   - **Scope:** ~4-6 hours.
4. **Inventory** — depends on Vendors. ~80 SKUs of seed data.
   - **Scope:** ~3-4 hours.
5. **Financials** — invoices, bills. Read-only initially is fine.
   - **Scope:** ~2-3 hours.
6. **Scheduling** — depends on Projects and Users. Job records + crew
   assignments.
   - **Scope:** ~3-4 hours.

### P2 — Real auth (Supabase Auth + 2FA)

- Replace `AuthProvider` (`components/auth/AuthProvider.tsx`) with one
  backed by `supabase.auth.signInWithPassword()`.
- Add Next.js middleware (`middleware.ts`) using `lib/supabase/server.ts`
  to refresh session cookies.
- Update `lib/api/clients.ts` (and any new API files) to use the
  cookie-aware server client instead of the admin client. RLS becomes
  enforced.
- Add **TOTP 2FA** via Supabase MFA. UI lives in the user-drawer
  Section 5 ("Session & Security") which already has the toggle but
  doesn't wire to anything.
- Keep the demo-account chips on `/login` — they should call
  `supabase.auth.signInWithPassword()` with real seeded users in the
  `auth.users` table (created via the admin SQL editor).
- **Scope:** ~4-6 hours.

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

- Replace permissive RLS policies with role-aware ones (depends on P2).
- Add API rate limiting (Vercel Edge Middleware or Supabase rate-limits).
- Audit headers (`Strict-Transport-Security`, `Content-Security-Policy`,
  `X-Frame-Options`, etc.) — add a `next.config.ts` `headers()` block.
- Hide demo chips and role-switcher in production by default
  (`NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS=false`,
  `NEXT_PUBLIC_ENABLE_ROLE_SWITCHER=false`).
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

1. **Admin client used for every read/write.** See §6. Swap when real
   auth lands.
2. **`lib/api/clients.ts` does not enforce row scoping.** The service
   role bypasses RLS; if you call `getClients()` you get every row in
   the table regardless of caller.
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
12. **`/clients` is the only DB-wired page in the working tree but
    isn't pushed yet.** Production still serves the mock-data version.
    See §2.

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

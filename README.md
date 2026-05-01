# Nexvelon

> Field operations, refined.

Nexvelon is a private quote-to-cash workspace built for security-systems
integrators — the firms that install Kantech / Genetec / Avigilon / DSC /
Hanwha hardware, raise multi-section quotes against ADI / Anixter / Wesco /
CDW catalogs, run their own commissioning checklists and ULC sign-off, and
need to know — to the dollar — which jobs are actually making money. It's
designed to feel like a private bank, not a SaaS dashboard: navy and gold,
Playfair Display headings, no neon, no chatbots.

## Tech stack

- **Next.js 15** (App Router, Turbopack, React 19)
- **TypeScript 5**, **Tailwind CSS v4** with a CSS-variable theme system
- **shadcn/ui** (Radix / Base UI primitives)
- **Recharts** for every chart, with palette driven from a `useThemeColors()`
  hook so the four themes retint the entire app live
- **@react-pdf/renderer** for the quote PDF — the right-hand preview pane is
  the actual PDF, so "Download" is a one-click export
- **@dnd-kit** for Kanban, Gantt, and the drag-to-assign scheduling calendar
- **@tanstack/react-table** for sortable / filterable lists
- **framer-motion** for animated counters and stat-card entrances
- **sonner** for toasts, **cmdk** for the global ⌘K palette
- **date-fns** everywhere; `Intl.NumberFormat` for currency

## Modules

| Module | Routes | Highlights |
| --- | --- | --- |
| **Login** | `/login` | Split layout — navy filigree left / ivory card right. **Five demo-account chips** for one-click role-switch. SSO buttons (Microsoft / Google / SAML). |
| **Executive Dashboard** | `/dashboard` | 6 KPI cards (Revenue MTD / EBITDA / Margin / Open Quotes / Active Projects / Overdue), 12-month revenue & EBITDA trend, project pipeline funnel, recent activity timeline, sortable Top Clients YTD, vendor-stock donut + low-stock list, technician utilization with banded colours. |
| **Quotes** | `/quotes`, `/quotes/new`, `/quotes/[id]` | List with weighted-pipeline footer. Full builder: client/site cards, multi-section line items with SKU autocomplete and drag-to-reorder, labor lines, sticky totals bar with margin gating, **live PDF preview** in the right pane, ⌘K quick-add, Convert to Project. |
| **Projects** | `/projects`, `/projects/[id]` | Stat strip · status pills · list/card toggle. Detail page with sticky header (progress ring + status + margin) and **9 tabs**: Overview · Tasks (Kanban + list) · Schedule (custom CSS-grid Gantt with drag) · Materials · **Commissioning** (per-system checklist with photo + initials + timestamp) · Zone List (24 intrusion zones) · Documents (folder tree + drop-zone) · Financials · Time & Labor. |
| **Inventory & Warehouse** | `/inventory` | 5-card stat strip · 6 tabs: Stock (filters, low-stock highlight, reorder button, expandable per-location + lot/UPC + last-10 movement) · Allocations · Transfers (with modal) · Purchase Orders (collapsible line items) · Vendors (drill-down) · Categories. |
| **Scheduling & Dispatch** | `/scheduling` | Unassigned queue (drag onto calendar) · technician swimlanes with subcontractor dashed-border distinction · day/week/month views · drag-to-reschedule · tech profile drawer with certifications, ESA license, vehicle, utilization. |
| **Financials** | `/financials` | **Whole route gated** by `financials.view`. 10 tabs: Overview (KPIs · revenue & EBITDA · cash flow · AR aging · top clients · expense donut) · P&L (expandable, current/prior/variance) · Balance Sheet · Cash Flow · Invoices · Bills (AP) · Receivables · Payables · Tax (HST 13%) · Reports (9 generators). QuickBooks / Xero sync footer on every tab. |
| **Users & Permissions** | `/users` | Admin-only. 6 tabs: Users · Roles · **Permissions Matrix** (sticky 7×75 grid) · Activity Log (100 entries) · Subcontractors (insurance expiry · WSIB) · Invitations. **User drawer** with role assignment, full 75-permission override toggles, data scope, field-level visibility, MFA + IP allowlist + session timeout. |
| **Settings** | `/settings` | 13-section side-nav: Company Profile · **Branding & Themes** (4 live theme presets) · Quote Defaults · Project Defaults · Numbering Schemes · Tax & Currency · Integrations (11 cards) · Vendors · **Backups & Data** (cloud + local Mac folder + NAS + S3, schedule, history, restore, per-client export) · Notifications · Audit & Compliance · API & Webhooks · Billing & Plan. |

## Demo accounts

Click any chip on `/login` to drop into the dashboard with that role wired
live across every module.

| Chip | Role | Demoed gating |
| --- | --- | --- |
| **Admin** (Marcus Reyes) | `Admin` | Sees everything. |
| **Project Manager** (Sophie Tremblay) | `ProjectManager` | Owns scheduling, project edits, quote conversion. Hidden from Users module. |
| **Sales Rep** (Priya Shankar) | `SalesRep` | Quote drafts allowed; **margin column hidden**, Internal Notes hidden, Approved/Converted quotes are read-only, Financials replaced with Restricted card, Inventory cost columns hidden. |
| **Technician** (Jin Park) | `Technician` | Read-only project access. Scheduling collapses to **own swimlane only**. Financials and Users locked. |
| **Accountant** (Hannah Liu) | `Accountant` | Full Financials and Reports. **Read-only on quotes** (drawer banner explains why). |

Top-bar role-switcher swaps role at any point — every module reacts in the
same render cycle, with no reload.

## 90-second demo flow

1. Cold-load `/login` → click the **Admin** chip → land on the Executive
   Dashboard with animated KPIs.
2. Press **⌘K** → search "Mercer" or "KT-400" → see grouped results across
   clients, projects, quotes, invoices, products, and users. Press Enter.
3. Open **Projects → Meridian Tower Lobby Access Upgrade** → walk every tab:
   Overview (system chips, milestones, stakeholders), Tasks (drag a Kanban
   card), Schedule (drag a Gantt bar), Materials (POs expand), Commissioning
   (62% — tick another item), Zone List (24 zones), Documents, Financials
   (cumulative billed vs. cost), Time & Labor.
4. Open **Quotes → Q-2026-0118** → see the live PDF preview re-render as you
   tweak a line item.
5. Open **Settings → Branding & Themes** → click **Onyx & Brass** → watch
   the entire app retint, including charts. Click **Oxford Green** then
   **Burgundy Reserve**. Land back on **Royal Navy**.
6. Open **Settings → Backups & Data** → scroll the local-Mac folder tree,
   click "Backup Now" (3-second progress bar → toast).
7. Switch role to **Sales Rep** in the top bar → watch the demo badge update,
   the Financials sidebar item disable, the Inventory cost columns disappear,
   the project margin in the header vanish.
8. Switch to **Technician** → calendar collapses to one swimlane, an amber
   banner explains the restriction.
9. Switch to **Accountant** → Financials reopens, but try editing a quote
   and the read-only banner appears.
10. Visit `/foobar` → tasteful 404 page with the gold "Return to Dashboard"
    button. Done.

## Features matrix (full)

### Foundation
- 4 polished theme presets stored in CSS variables (Royal Navy, Onyx & Brass, Oxford Green, Burgundy Reserve), persisted to localStorage, switching retints sidebar / cards / charts / chips / buttons live.
- Inter (body) + Playfair Display (headings) + Geist Mono — loaded via `next/font/google`.
- Print stylesheet drops sidebar/topbar from print views.
- `robots.ts` blocks indexing — this is a private internal app.
- SVG favicon ("N" in gold-on-navy with a thin gold rule).

### Permissions & roles
- 7 role presets (Admin, SalesRep, ProjectManager, Technician, Subcontractor, Accountant, ViewOnly).
- 75-permission catalog grouped by module; ~10 actually enforced at runtime, the rest cosmetic in the matrix UI.
- `<Can resource action />` wrapper, `useRole()` hook, runtime `hasPermission()`.
- Per-user override drawer with toggles, data scope (5 options), field-level visibility, session/security policy.

### Dashboard
- 6 animated KPI cards with delta-vs-prior-period.
- Recharts ComposedChart (revenue bars + EBITDA line, 12-month trail).
- Recharts FunnelChart (Lead → Quoted → Approved → In Progress → Completed).
- Activity timeline (gold-dot chronologic).
- Inventory donut by vendor + low-stock alerts table.
- Technician utilization horizontal bars with banded colours.
- Date range picker (Today / 7d / MTD / QTD / YTD / Custom).

### Quotes
- 30 seeded quotes; 6 statuses (Draft / Sent / Approved / Rejected / Expired / Converted).
- Builder: section-based line items with vendor, SKU autocomplete (80-product catalog), description, qty, cost, markup, unit price, line total. Labor lines (hours × rate). Drag-to-reorder. Per-section subtotals.
- Sticky totals bar with discount (% or $), tax, total, margin (gated).
- ⌘K command palette to add SKUs.
- Live `<PDFViewer>` of the actual export — Letter-size with letterhead, gold-underlined "QUOTATION", Bill-To / Ship-To, sectioned line tables, totals box, terms, signature blocks, page footer.
- localStorage persistence so saving a Draft survives navigation.
- Read-only banner when status is Converted (cites linked Project ID) or when role is Accountant / SalesRep on Approved.

### Projects
- 15 seeded projects, 8 statuses (Planning / Scheduled / In Progress / On Hold / At Risk / Commissioning / Completed / Closed).
- Sticky header with progress ring, contract value, change-orders, gross margin (gated), action menu, "Originated from quote" deep link.
- Tab nav with **gold ring** on Commissioning when project status equals `Commissioning`.
- 9 fully-implemented tabs (see modules table above).
- Read-only banner on Completed / Closed projects, propagated to every tab.

### Inventory & Warehouse
- 80 SKUs across 13 manufacturers and 5 vendors (ADI / Anixter / Wesco / CDW / Provo).
- 5 warehouse locations including 3 trucks; per-product breakdown shown in expanded rows.
- 30-day movement history per SKU (Receipt / Pick / Transfer / Return / Adjustment).
- 5 stock-replenishment POs + project-linked POs aggregated under one tab.
- Vendor directory with rep / payment terms / YTD spend / lead time and drill-down detail.
- Cost columns gated by `inventory.viewCost`.

### Scheduling
- ~35 seeded jobs across 11 swimlanes (8 techs + 3 sub crews).
- Day / Week / Month view toggle.
- Drag a job between cells to reassign + reschedule.
- Drag an unassigned card from the queue to assign it.
- Tech drawer with certifications (Kantech EntraPass, Avigilon ACC, ULC ULC-S561, CFAA, ICT Protege, Hanwha Wisenet…), ESA license #, vehicle, today's schedule, weekly utilization.
- Role-driven swimlane filtering: Technician sees only their own lane.

### Financials
- 60+ invoices YTD, ~30 vendor bills, full P&L / Balance Sheet / Cash Flow statements.
- AR + AP aging tables (Current / 1-30 / 31-60 / 61-90 / 90+).
- HST 13% summary with "Generate HST Return" mock.
- 9 report cards (Job Profitability, WIP, Margin Analysis, Sales by Rep, Sales by System Type, Service Contract Renewals, Subcontractor Spend, Inventory Valuation, Custom Builder).
- QuickBooks / Xero sync footer.
- Whole module gated by `financials.view` with a centered "Restricted Access" card.

### Users & Permissions
- 18 users · 5 subcontractors with WSIB and insurance expiry · 3 pending invitations · 100-entry audit log.
- 7×75 permissions matrix as a single sticky-header table.
- The user drawer is the showpiece — five sections including the full permission grid with `live` badges on enforced rows.

### Settings
- 13 panes including theming, backups, integrations, audit & compliance, API & webhooks, billing.
- Themes preview as mini mockups; one click applies.
- Backup destinations support 3-2-1 (Cloud + Local Mac + NAS + S3); local path renders as a folder tree showing per-client subfolders.
- 30-day backup history; one-click restore opens a modal.
- Per-client `Export Folder` button generates a ZIP (mock).

### Global polish
- ⌘K command palette indexing **all** clients, sites, projects, quotes, invoices, products, users, and module routes — grouped, searchable, navigable.
- Notifications bell with 9 mock notifications, unread badge, mark-all-read.
- Avatar menu (Profile, Settings, Switch Workspace, Help, Sign out — sign-out clears the demo role).
- Breadcrumbs under the top bar with project-name and tab resolution.
- Demo-mode chip in the top bar showing the active role.
- Tasteful **404** at `/not-found` (filigree backdrop, gold CTA) and **error boundary** at `/error` with Retry.
- Skeleton shimmer utility (`nx-skeleton`) ready for any async list.
- Empty states are intentional cards with gold-outlined icons, not "No data".

## Architecture notes

- **`/app`** — Next.js App Router. Two route groups: `(auth)` for login, `(app)` for the authenticated workspace.
- **`/components/modules`** — one folder per feature; nothing is shared cross-module beyond `/components/layout` and `/components/ui` (shadcn).
- **`/lib`** — types, runtime helpers (`permissions.ts`, `theme-context.tsx`, `role-context.tsx`), and per-module data builders (`dashboard-data.ts`, `project-data.ts`, `inventory-data.ts`, `scheduling-data.ts`, `financials-data.ts`, `quote-store.ts`, `permissions-matrix.ts`, `demo-accounts.ts`, `notifications.ts`).
- **`/lib/mock-data`** — every seed list (clients, sites, products, quotes, invoices, projects, users, subcontractors, audit-log).

## Local dev

```bash
npm install
npm run dev         # http://localhost:3000
npm run build       # production prerender + type-check
```

## Known omissions (deliberate, for the demo build)

- No backend — Next.js builds prerendered pages; quote drafts persist via
  localStorage; everything else is in-memory.
- "Sync with QuickBooks/Xero" buttons toast success but do not call out.
- File uploads in Documents and Branding are accepted but not stored.
- The role-switcher is intentional. In production, role would be derived
  from the authenticated session and the switcher would be removed.

---

**Built in 3 hours with Claude Code, Claude Design, and Claude.**

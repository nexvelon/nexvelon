# UI / Theme / Dashboard / Gantt — Vision & Project Handover

> **Purpose.** A single, self-contained brief so a brand-new chat session can
> resume the Nexvelon build with full context and immediately scope the next big
> initiative: a market-leading **UI / theming / dashboard / Gantt** layer.
>
> **This document builds nothing.** It captures (1) where the project stands
> today, (2) the new UI/Dashboard/Gantt vision in structured form, (3) the
> constraints to honor, and (4) the exact next step. The initiative itself
> proceeds as its own multi-sprint arc **after** a read-only audit of the
> theming / dashboard / chart infrastructure that already exists.
>
> **How to use it:** read this doc top-to-bottom, then follow *"Next step when
> resuming."* Created on the `docs-ui-dashboard-gantt-vision` branch; DOCUMENTATION
> ONLY (no app code, no migration).

---

## Current build state (context for a new chat)

**What Nexvelon is.** A from-scratch, web-native ERP for a security-systems
integrator (low-voltage security / CCTV / access / intercom / fire), owned and
operated by **Jay** (non-technical owner). Three legal entities present under the
licensed "Nexvelon Global" brand: **Nexvelon Inc.** (parent/holding), **Nexvelon
Integrated Solutions Inc.** (default quote entity), **Nexvelon Guardian Inc.**
(ULC fire + monitoring). Repo `github.com/nexvelon/nexvelon`, app
`app.nexvelonglobal.com`, region Toronto/Ontario (EDT).

**Stack (current, confirmed in-repo):**
- **Next.js 15** (15.5.15, App Router + React Server Components), **React 19**.
- **Tailwind CSS v4**.
- **Base UI** (`@base-ui/react` ^1.4.1) for headless primitives — **NOT Radix**.
- **Supabase** (Postgres + Auth + Storage; RLS + GRANT boilerplate per new table).
- **Vercel** hosting (`@vercel/analytics`, `@vercel/speed-insights`).
- **Recharts** ^3.8.1 is the current charting library.
- **@dnd-kit** for drag-and-drop (kanban, dispatch board, reorderable lists).
- Fonts: **Inter** (sans, `--font-inter`), **Playfair Display** (serif/headings,
  `--font-playfair`), **Geist Mono** (mono). *Note: the initiative brief referred
  to the serif as "Cormorant Garamond"; the shipped serif is Playfair Display —
  reconcile the intended serif during the audit.*

**Design tokens today.** House default theme is **"Royal Navy"** — deep navy
`#0B1B3B` primary, warm gold `#C9A24B` accent, ivory/linen `#F8F5EE` background,
on a `--brand-*` CSS-variable token set. (Described informally as "royal
black/gold/ivory".) **Theming already exists in a meaningful way** — see the
*Existing infrastructure* appendix; the initiative extends it, it is not
greenfield.

**Modules shipped (feature-complete v1s).** The core module sequence is done and
live, each shipped to the depth bar in `NEXVELON_PRINCIPLES.md` §6 (no "module
lite"):

- **Permissions** — DB-resolved ACL with role baselines + per-user overrides +
  audit, admin editor UI, fail-safe fallback, plus a Warehouse role (PERM-1…4,
  DES-1/2).
- **Quotes v1** — multi-section quotes, live per-line margin, per-entity
  templates + terms (Integrated 23-section / Guardian 26-section), Guardian
  monitoring/dispatch/keyholders/PAD schedules, PDF export, acceptance/sign-off,
  post-approval lock.
- **Projects & Jobs v1** — tasks (list/kanban), deficiencies + commissioning
  (with certificate PDF), warranty & bonds, team assignment, site log, cost codes
  + margin snapshots, WIP accounting, **schedule & timeline (Gantt)**, unified
  performance board (Budgeted/Actual/Earned/Projected), inline edits.
- **Inventory v1** — specific-identification stock, receiving, movement ledger,
  cycle counts, pickup slips, job-cost accuracy.
- **Vendors v1 + Purchase Orders** — PO create/issue/receive → inventory loop,
  vendor performance metrics.
- **Invoices / Financials v1** — per-project & per-opco P&L, deposits, holdback,
  AR/AP, HST position, T5018.
- **Subcontractors v1** — CRUD, compliance docs + alerting, bills → job cost,
  work orders, job assignment, T5018.
- **Scheduling v1** — dispatch model + certifications, live drag dispatch board,
  working hours & availability, field view + audit + the labour cost seam.
- **Reports v1** — export engine (CSV / Excel / PDF), financial + operational
  reports + business snapshot, role-gated.
- **Dashboard** — real KPI row, alerts/worklists, and all panels driven by
  **live data with no fabricated figures** (DASH-1…3).

**Latest state markers.**
- **Latest PR: #364** (CLEAN-1 — inline edits + PM/lead header + mock retirement
  + breadcrumb fix), merged to `main` (merge commit `19e6f3a`).
- **Tests: 1,034 passing across 162 files** (vitest) as of #364.
- **Migrations applied through 0116** (`0116_warehouse_role_editable`).

**The working loop (how every change ships).**
1. **Jay** describes a need in plain language.
2. **Strategist Claude** (a planning chat) writes **ONE** decisive Claude Code
   spec — one decisive thing per paste; large/new-table features go two-phase
   (read-only inspect → build).
3. **Jay** pastes the spec into **Claude Code (CC)**.
4. **CC** builds on a fresh branch, runs verify (typecheck / lint / build / test),
   and opens a **non-draft PR** against `main`.
5. **Jay** applies any migration **via the Supabase Dashboard SQL Editor** (the
   in-repo migration file must match the live table — paste DDL to *both*), then
   **merges** the PR.
- **Discipline that works:** merge each PR before starting the next; put a grep
  **guard** at the top of dependent chunks that aborts if the prior chunk's marker
  isn't on `main`. Result across recent epics: near-zero reconciles.
- **Docs note:** the `NEXVELON_SESSION_*_HANDOFF.md` / `docs/HANDOFF-SESSION-*.md`
  files **lag far behind HEAD** (the last detailed handoff, AJ, ends around PR
  #151). For current state, trust **`git log` + `docs/USER_FACING_CHANGELOG.md`**
  (kept live) over the handoff docs.

**Deferred / open items (carry-forward).**
- **Email delivery tests** — work-order / report email paths never exercised
  end-to-end against a live inbox.
- **Live smoke passes** — the F-series inventory commit/decrement live-test and
  the PO receive→stock live-test have never been run on real inventory
  (recommended before production reliance).
- **Legal / Terms** — lawyer review of both T&C drafts (Integrated 23-section,
  Guardian 26-section): the **$1,000 / 3-month liability cap** placeholder,
  4-hour deemed-acceptance, offshore-CCTV / PIPEDA cross-border clause, and PAD
  wording. Settings-stored terms must be re-pasted after any terms code change.
- **Future modules** — **Expenses · Receipt OCR · Payroll/HR** (see
  [`docs/FUTURE_MODULES_EXPENSES_PAYROLL.md`](FUTURE_MODULES_EXPENSES_PAYROLL.md)):
  manual-first expenses feeding job cost + HST + reimbursement; an optional
  pluggable receipt-OCR add-on (no zero-cost OCR exists — manual stays the
  always-on baseline); full Canadian payroll/paystubs/HR (a serious CRA-compliance
  arc; tax-engine decision required first).
- **Phase-2 / architectural decisions still open** — data-driven workflow-rule
  engine; custom-field storage model per entity; field-level permission storage
  model; `quote_shares` necessity; `unit_label` enum vs freeform; currency at
  quote vs client level; discount granularity; `company_profile` table for PDF
  letterhead. (All catalogued in `NEXVELON_ROADMAP.md`.)
- **Housekeeping backlog** — CSV/PDF report export polish, scheduled low-stock
  cron email, `/sites/[id]` detail page, eslint baseline (~1,600 pre-existing
  errors), `permissions.ts` ↔ `permissions-matrix.ts` consolidation, post-build
  role-based training package (generated from the changelog + live UI).

---

## The UI / Theme / Dashboard / Gantt initiative (the new big ask)

> Jay's requirements, captured verbatim in structured form. This is the vision to
> be scoped and built as its own arc — **after** the audit (see *Next step*).

### GOAL
- **UI is the make-or-break selling point.** It must **match AND exceed** Simpro,
  Q360, and *every* admin/ERP template on the market.
- Jay wants the ERP **sellable for very high value on UI + dashboard + Gantt
  strength alone** — the visual/interaction layer is a primary commercial
  differentiator, not polish.

### THEMES
- The existing **royal-black / gold / ivory** theme becomes **ONE preset** under a
  new **"Themes" settings category**.
- Add **many** theme variations, **categorized / subcategorized**, covering:
  **modern, mixed, "AI look", gradient, glass / glassmorphism, neumorphic /
  soft-UI, dark / elegant-dark / neon-dark, pastel, bright / vibrant, warm /
  luxury, monochrome-accent, light**.
- Users can **pick presets AND fully customize** — add / update / remove colors —
  and it must be **user-editable from ERP settings**.

### DASHBOARD
- **Fully customizable.** Users **add / update / remove / rearrange** every
  widget, KPI, object, chart, shape, pattern. **Drag-and-drop.**
- **Ready-made dashboard templates** to choose from.
- **Every widget / pattern / option seen on any app or website on the market must
  be offered — categorized / subcategorized.**
- Per-widget controls (**refresh / expand / ⋯ / gear / help**), **status pills**,
  **feeds**, **KPI tiles with deltas + sparklines**, **command-palette search**,
  **segmented time-range toggles**.

### GANTT
- **Full-featured Gantt with every capability on the market:** dependencies,
  **critical path**, drag-to-reschedule, **baselines**, milestones, **resource
  assignment**, zoom levels, grouping, progress, templates + theme variants.
- **Multiple Gantt UI styles / templates** the user selects from.

### CHART LIBRARY (from 51 reference screenshots Jay shared)
Offer equivalents of all of these:
- Area / gradient-area; spline / wave line; multi-line.
- Stacked bar; grouped bar; **3D cylinder bar**; gradient bar; dot-plot bar.
- Donut / pie (**2D + 3D**); radial gauges (half / full / segmented); progress
  rings; dot-matrix grids.
- Pyramid / triangle; bubble / cluster; funnel / inverted-triangle; sparklines.
- **World-map dot-density**; radar / spider (multi-layer); candlestick / OHLC;
  **3D globe with points**.
- **HUD / sci-fi circular gauges**; hexagon / 3D-crystal stat shapes; clock dials;
  calendar heat-select.

### COMPONENT KITS seen (offer equivalents)
Toggles; steppers; +/− counters; dual-range sliders; star ratings; segmented
pills; currency-pair selectors; date pickers; calendars; storage bars;
ticket / boarding-pass cards; credit-card mockups; weather widget; video / audio
player cards; notification / activity / transaction feeds; **quick-action bars**
(Add Client / Create Quote / Enter Payment / Create Invoice — Jay's domain).

### NAMED PALETTES from references (starting presets)
| Name | Colors |
|---|---|
| Pollux | `#844FC1` |
| Plus | `#1A55E3` / `#FF0854` |
| Corona | `#191C24` / `#AF1763` |
| Purple | `#A05AFF` / `#1BCFB4` |
| JustDo | `#F5A623` / `#248AFD` |
| Breeze | `#423A8E` / `#00CCCD` |
| Stellar | `#38CE3C` / `#181824` |
| Star Admin | `#F29F67` / `#1E1E2C` |
| Skydash | `#4B49AC` / `#98BDFF` |
| Azia | `#6F42C1` / `#007BFF` |

---

## Constraints & principles to honor

- **No paid subscriptions / ongoing cost.** Everything must work without a
  recurring fee. (Directly rules out commercial Gantt/chart SaaS libraries with
  per-seat licensing; favor open-source or self-built.)
- **Honest data (§2.8).** **No fabricated figures in any dashboard widget** — the
  dashboard is already fully real-data (DASH-1…3 removed all mock figures). Every
  new widget must bind to a real source or render an explicit empty / "not enough
  data yet" state — never a plausible-looking fake number.
- **Existing stack is fixed:** Next.js 15, Tailwind v4, **Base UI (NOT Radix)**,
  Supabase, Vercel. New UI work lives inside this stack.
- **Current design tokens:** royal black / gold / ivory (`--brand-*` variables),
  serif = Playfair Display (see font note above). New themes must flow through the
  same token mechanism so the whole app re-skins from one switch.
- **Depth over breadth / competitive bar (§4).** Reference floors are a *minimum*,
  not a target: the bar is "what a world-class 2026 SaaS would look like rebuilt
  from scratch." Ship deeply or don't ship.
- **The initiative proceeds as its own multi-sprint arc AFTER an audit** of what
  theming / dashboard / chart infrastructure exists today. **This doc does NOT
  build anything.**

---

## Existing infrastructure the audit will build on (do not re-invent)

A read of the current tree shows the initiative is **not greenfield** — capture
this before scoping so the audit measures the gap, not zero:

- **Theme system already exists.** `lib/theme.ts` defines a `THEMES` registry
  (`ThemeKey`, `ThemeColors`) with **15 luxury presets** already shipped
  (`royal-navy` [default], `onyx-brass`, `oxford-green`, `burgundy-reserve`,
  `imperial-plum`, `sapphire-noir`, `emerald-dynasty`, `espresso-gilt`,
  `slate-rose`, `midnight-teal`, `mahogany-brass`, `amethyst-dusk`, `ivory-court`,
  `pearl-platinum`). Each carries a **5-stop Recharts chart palette**.
- **Runtime theming is wired:** `lib/theme-context.tsx` (`useTheme` / `setTheme`),
  `data-theme="…"` blocks in `app/globals.css` (one full `--brand-*` set per
  theme), and `ThemeProvider` in `app/layout.tsx`.
- **A themes settings pane already exists:** `components/modules/settings/
  BrandingThemes.tsx` (preset picker + email-signature + login-background). The
  new "Themes" category is an **evolution of this pane**, not a new build — and
  the "make the current theme just one preset" ask is largely already true.
- **Charts:** Recharts is in use in the dashboard (`RevenueTrendChart`,
  `InventoryHealth`), financials, and inventory reports — driven by the
  per-theme 5-stop palette.
- **A Gantt/timeline already ships** for projects (PROJ2-20:
  `components/modules/projects/ProjectScheduleCard.tsx` — planned dates,
  milestones, dependencies, today line, overdue highlighting). The initiative's
  "full-featured Gantt" extends this.
- **Drag-and-drop** is already established via **@dnd-kit** (task kanban, dispatch
  board, reorderable lists) — the natural basis for a drag-and-drop dashboard.

> **Audit implication:** the first chunk is a read-only audit that maps the delta
> between the shipped theme/chart/Gantt infra above and the full vision — what to
> extend vs. build new — before any code.

---

## Next step when resuming

> **New chat:** re-attach the **51 UI reference screenshots**, tell Claude to read
> **this doc** (`docs/UI_DASHBOARD_GANTT_VISION.md`), then request the
> **THEME / DASHBOARD / GANTT audit spec (read-only)** as the **first chunk** —
> an inventory of existing theming, dashboard, and chart infrastructure and the
> gap to the vision above, with no code changes.

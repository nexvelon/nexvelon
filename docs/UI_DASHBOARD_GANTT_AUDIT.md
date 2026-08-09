# UIDG-1 — Read-Only Audit: Theme / Dashboard / Chart / Gantt

**HEAD sha:** `21071309608a875495b0d221190a7305f06732f6`
**Latest merged PR:** #365 (`docs: capture UI/Theme/Dashboard/Gantt vision + project handover`)
**Date:** 2026-08-09
**Highest migration in repo:** `0116_warehouse_role_editable.sql`

> **READ-ONLY AUDIT — nothing was changed.** No app code, style, config, SQL, or
> dependency was modified. Every file path below was actually opened; every
> schema claim cites a migration filename. Bugs/discrepancies found are recorded
> here, not fixed. This audit measures the gap to
> [`docs/UI_DASHBOARD_GANTT_VISION.md`](UI_DASHBOARD_GANTT_VISION.md).

---

## 1. Executive summary (what exists vs. what the vision needs)

1. **Theming is real but shallow-and-static.** A 14-preset registry
   (`lib/theme.ts`) + CSS `[data-theme]` blocks (`app/globals.css`) retint the
   whole app from one attribute. But it is **presets-only, no user color editing**,
   persisted to **localStorage only** (per-device, not per-user/DB), and the
   settings pane that exposes it is **mostly a mock** (only the preset switch
   works). The vision's "add/update/remove colors, user-editable, many
   categorized themes" is largely **unbuilt**.
2. **Two theme sources of truth disagree.** The CSS `--brand-*` values and the JS
   `THEMES` object do **not** match for the default theme (`#0A1226`/`#B8924B` in
   CSS vs `#0B1B3B`/`#C9A24B` in JS), despite an in-code "match 1:1" comment.
3. **All 14 presets are light-background.** There is a `.dark` class block in CSS
   but **no theme wired to it** — the vision's dark / elegant-dark / neon-dark /
   glass / neumorphic / gradient categories are **entirely absent**.
4. **Charts = Recharts only, 3 chart types in production** (`ComposedChart`,
   `BarChart`, `PieChart`). Recharts covers the "flat 2D" reference forms; it
   **cannot** natively do the vision's 3D bars/pyramids, liquid/needle/HUD gauges,
   dot-matrix, hex/dot world maps, 3D globe, candlestick, or the Gantt itself.
5. **The dashboard is 100% fixed-layout JSX.** No drag-and-drop, no widget
   add/remove/rearrange, no layout stored in data, no per-widget chrome
   (refresh/expand/⋯/gear/help), no dashboard templates. The vision's
   "fully customizable drag-and-drop dashboard" is **greenfield**.
6. **Honest-data holds.** Every dashboard panel binds to a real server action; no
   fabricated figures found (one hardcoded *color* array in `InventoryHealth`, not
   data). The §2.8 rule and its INV-9-1 "Not enough data yet" precedent stand.
7. **The Gantt is a lightweight read-first CSS/SVG job-bar chart** (354 lines,
   `ProjectScheduleCard.tsx`) — absolutely-positioned bars, a today line, diamond
   milestones. **No drag-to-reschedule, no zoom, no critical path, no baselines,
   no dependency arrows** (deps show as a "↳ after N" text hint), **no resource
   lane**. The vision's full Gantt is a **new build**.
8. **The schema cannot back a real Gantt yet.** `job_dependencies` is
   finish-to-start-only (no type, no lag/lead); jobs have planned dates but **no
   actual dates and no baseline**; tasks have no start/end/%-complete and no
   parent/child. Critical path, baselines, and slack have **no columns**. Multiple
   migrations required.
9. **Primitive kit is Base UI (not Radix) and thin** — 18 files, **no** switch/
   toggle, slider, stepper, counter, rating, segmented control, date-picker, or
   calendar. The vision's component-kit asks are mostly **missing primitives**.
10. **No paid dependencies today** — Recharts, @dnd-kit, cmdk, d3-shape all
    MIT/ISC. The zero-cost constraint is currently satisfied and constrains every
    library choice ahead (rules out DHTMLX/Bryntum/Syncfusion Gantt).

---

## 2. Theme system — current state

### 2.1 `lib/theme.ts` (288 lines) — the JS registry
- `export type ThemeKey` is a 14-member union: `"royal-navy"`, `"onyx-brass"`,
  `"oxford-green"`, `"burgundy-reserve"`, `"imperial-plum"`, `"sapphire-noir"`,
  `"emerald-dynasty"`, `"espresso-gilt"`, `"slate-rose"`, `"midnight-teal"`,
  `"mahogany-brass"`, `"amethyst-dusk"`, `"ivory-court"`, `"pearl-platinum"`.
- `export interface ThemeColors` fields: `key`, `name`, `description`, `primary`,
  `accent`, `bg`, `text`, `card`, `border`, `muted`, `sidebarAccent`,
  `chartTertiary`, `chartQuaternary`, and `charts: [string, string, string,
  string, string]` (comment: *"Five-stop chart palette in stable order — used by
  Recharts."*).
- `export const THEMES: Record<ThemeKey, ThemeColors>` — one object per key.
- `export const THEME_ORDER: ThemeKey[]` — **14 entries** (the true preset count).
- `export const DEFAULT_THEME = "royal-navy"`, `export const STORAGE_KEY =
  "nexvelon:theme"`, `export function isThemeKey(...)`.
- Every preset's `bg` is a **light** value (e.g. royal-navy `bg: "#F8F5EE"`); the
  darkness lives in `primary`/`sidebarAccent`. **There is no dark-background
  preset.**

### 2.2 `lib/theme-context.tsx` (69 lines) — runtime wiring
- `ThemeProvider` holds `useState<ThemeKey>(DEFAULT_THEME)`; on mount reads
  `localStorage.getItem(STORAGE_KEY)` and sets `document.documentElement.dataset.
  theme`. `setTheme(next)` writes both the `<html data-theme>` attribute and
  `localStorage`.
- Exposes `useTheme()` → `{ theme, colors: THEMES[theme], setTheme }` and
  `useThemeColors()` → `THEMES[theme]`.
- **Persistence is localStorage-only** — device-local, not a DB row, not
  per-user server-side, not role-scoped, not synced across devices.

### 2.3 `app/globals.css` (513 lines) — the CSS token layer
- `@theme inline { … }` (lines 7–59) maps Tailwind `--color-*` utilities onto the
  runtime vars and defines the radius scale (`--radius-sm … --radius-4xl`).
- **14 `[data-theme="…"]` blocks** (`:root,:root[data-theme="royal-navy"]` plus 13
  more), each redefining the `--brand-*` set:
  `--brand-primary`, `--brand-accent`, `--brand-bg`, `--brand-text`,
  `--brand-card`, `--brand-border`, `--brand-muted`, `--brand-sidebar-accent`,
  `--brand-sidebar-border`, `--brand-chart-tertiary`, `--brand-chart-quaternary`.
- **Partial inheritance:** only the royal-navy/`:root` block defines
  `--brand-accent-soft`, `--brand-status-green`, `--brand-status-red`. The other
  13 themes **do not** redefine these — they inherit royal-navy's values. So the
  "full token set per theme" is not actually per-theme for those three tokens.
- A base `:root {}` (lines 306–339) **derives the shadcn/runtime tokens from
  `--brand-*`**: `--background:var(--brand-bg)`, `--card:var(--brand-card)`,
  `--primary:var(--brand-primary)`, `--chart-1:var(--brand-primary)` …
  `--chart-5:var(--brand-text)`, `--sidebar:var(--brand-primary)`, etc. This is
  the elegant part: one `[data-theme]` swap retints every shadcn token.
- A `.dark {}` block (lines 341–373) hardcodes a dark palette (`--background:
  #0B1B3B` …) — **but nothing toggles `.dark`**; no preset applies it and no
  dark-mode switch was found. `app/layout.tsx:42` sets `viewport.colorScheme:
  "light"`.
- Full custom-property surface a new theme touches (the `--brand-*` set, 11–14
  vars) is small, **but** a new theme must be registered in **four** places:
  `lib/theme.ts` (`ThemeKey` + `THEMES` + `THEME_ORDER`), `app/globals.css` (a
  `[data-theme]` block), and the inline `themeBootstrap` regex in
  `app/layout.tsx:47–58`. That 4-surface duplication is a maintenance hazard for
  "many themes."

### 2.4 `app/layout.tsx` (90 lines) — fonts + provider
- Fonts loaded via `next/font/google`: **`Inter`** (`--font-inter`, sans),
  **`Playfair_Display`** (`--font-playfair`, serif/heading), **`Geist_Mono`**
  (`--font-geist-mono`, mono). **No Cormorant Garamond is imported anywhere.**
- `themeBootstrap` inline `<script>` sets `data-theme` pre-hydration from
  localStorage (FOUC guard) against a hardcoded 14-key regex.
- `<ThemeProvider>` wraps `<AuthProvider><RoleProvider>`.

### 2.5 `components/modules/settings/BrandingThemes.tsx` (267 lines) — the pane
Surfaced at Settings → **"Branding & Themes"** (`app/(app)/settings/page.tsx:67`,
`key:"branding"`, description still reads *"four theme presets"* — stale, 14
exist). Controls offered:
- **Theme presets** — a grid over `THEME_ORDER`; each `ThemeCard` calls
  `setTheme(key)` + a toast. **This is the only control that actually does
  anything** (writes localStorage via the context).
- **Logo** — "Replace" button → `toast.success("Upload accepted (mock)")`. **Mock,
  no upload/persist.**
- **Login page background** — 3 options; sets local `useState` only. **Not
  persisted.**
- **Email signature template** — a `Textarea` seeded from the signed-in user;
  local state only. **Not persisted.**
- **"Save Changes"** → `toast.success("Settings saved")`. **Mock — persists
  nothing.**

### 2.6 Verdicts
- **User-defined color capability today:** **none.** Presets only — no color
  pickers, no add/update/remove, no custom-theme storage.
- **Token surfaces a new theme must define:** the `--brand-*` set (11 core, +3
  inherited) in CSS, plus the JS `ThemeColors` (14 fields incl. the 5-stop chart
  palette), registered across 4 code locations.

---

## 3. Chart layer — current state

- **Library:** `recharts` **`^3.8.1`** (`package.json`). No other chart lib.
- **Only 4 files import Recharts** (all under `components/`; none in `app/` or
  `lib/`):

| File | Lines | Recharts components | Data source | Role-gated? |
|---|---|---|---|---|
| `components/modules/financials/Tabs.tsx` | 899 | `ComposedChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis` | `getMonthlyRevenueAction({months:12})` (invoiced vs collected) | Yes — page wraps in `<Can resource="financials" action="view">` (`app/(app)/financials/page.tsx:69`) |
| `components/modules/dashboard/RevenueTrendChart.tsx` | 98 | `ComposedChart, Bar, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis` | `getRevenueTrendAction()` → `getMonthlyRevenue({months:12})` | Yes — component sets `restricted` on failure → Lock "Requires financials access." |
| `components/modules/dashboard/InventoryHealth.tsx` | 100 | `PieChart, Pie, Cell, ResponsiveContainer, Tooltip` | `getInventoryHealthAction()` | Yes — `restricted` → Lock "Requires inventory access." |
| `components/modules/inventory/ReportsTab.tsx` | 287 | `BarChart, Bar, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis` | `getInventoryReportDataAction()` | Yes — `$` gated by `hasPermission(role,"inventory","viewCost")` |

- **Color resolution:** `useThemeColors()` (`lib/theme-context.tsx:67`) →
  `THEMES[theme]` (`lib/theme.ts`). Charts read `t.charts` (the 5-stop array),
  `t.primary`, `t.accent`, `t.chartTertiary`, `t.border`. Only `ReportsTab.tsx`
  consumes the `t.charts` array (`fill: t.charts[i % t.charts.length]`);
  `InventoryHealth.tsx:27` **deviates** with a hardcoded hybrid palette
  `[t.primary, t.accent, "#475569", "#1E40AF", "#0f766e", "#94a3b8"]`.
- **Chart TYPES in production:** `ComposedChart` (Bar+Line / Bar+Bar), `BarChart`,
  `PieChart` (donut via `innerRadius`). **No** standalone Line, Area, Radar,
  Scatter, or Composed-anything-else in use.
- Supporting libs already present that help future chart work: `framer-motion`
  `^12.38.0` (animation), `@tanstack/react-table` `^8.21.3` (data grids),
  `date-fns` `^4.1.0`.

---

## 4. Dashboard — current state

- Entry: `app/(app)/dashboard/page.tsx` (234 lines) + `actions.ts` (159) +
  `layout.tsx` (11). Panels live in `components/modules/dashboard/`.

**Panel → data → gate map:**

| Panel | File (lines) | Data source | Gate |
|---|---|---|---|
| Financial KPI tiles ×5 | `page.tsx` + `KpiCard.tsx` (102) | `getDashboardKpisAction` → `kpi.financial` | `financials:view`; UI redacts to `<Restricted>` |
| Active projects / Open quotes tiles | `page.tsx` | same action → `kpi.operational` | `projects:view` / `quotes:view` |
| Financial-edit tiles ×3 (WIP, HST, blended margin) | `page.tsx` | same action → `kpi.financial_edit` | `financials:edit` |
| `AlertsWorklists` (7 alert cards) | `AlertsWorklists.tsx` (197) | `getDashboardAlertsAction` | base `dashboard:view` + per-block `subcontractors/projects/scheduling:view` |
| `RevenueTrendChart` | (98) | `getRevenueTrendAction` | `financials:view` |
| `QuotesByStatusPanel` | (76) | `getQuotesByStatusAction` | `quotes:view` |
| `ActivityFeed` | (71) | `getRecentActivityAction({limit:15})` | `dashboard:view` |
| `TopClientsTable` | (65) | `getTopClientsByRevenueAction({limit:5})` | `financials:view` |
| `InventoryHealth` | (100) | `getInventoryHealthAction` | `inventory:view` |
| `TechnicianUtilization` | (106) | `getDispatchBoardAction` (scheduling) | `scheduling:view` |

- **Layout:** **fixed in JSX, not data-driven.** Hardcoded Tailwind grids
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` for KPIs; `lg:grid-cols-12`
  split 8/4 for trend+quotes; `lg:grid-cols-2` rows for the rest). Tiles carry
  fixed `index` props. **No** config object, DB table, or user preference controls
  placement/order/visibility. **No** drag/resize/persisted layout anywhere.
- **Per-widget chrome:** **essentially none.** No refresh/expand/⋯/gear/help/
  filter per widget. Card headers are icon + title only. The only per-card
  affordance is that `AlertsWorklists` cards are whole-card `<Link>`s to their
  module.
- **Global time range:** one `RangePicker` (`RangePicker.tsx`, options `today,
  7d, mtd, qtd, ytd, custom`) in the page header. **It only feeds the KPI tiles**
  (`getDashboardKpisAction`); every other panel fetches once on mount with a
  hardcoded window (trend = trailing 12 months, top-clients = current year,
  utilization = current ISO week). The `custom` option has **no custom-date-entry
  UI**.
- **Honest data:** confirmed — `lib/api/dashboard.ts` (530 lines) issues real
  Supabase `.from(...)` queries throughout; a mock/placeholder scan found only
  provenance comments, no fabricated numbers. Dead code: `CanFinancials.tsx` /
  `CanFinancialsEdit.tsx` exist but are imported nowhere (the live code uses the
  `<Restricted>` null-block pattern).

---

## 5. Gantt / Schedule — current state

`components/modules/projects/ProjectScheduleCard.tsx` (353 lines), header comment:
*"a read-first, lightweight Gantt (pure CSS/SVG — NO heavy Gantt dependency) …
Deliberately the HOOK, not the scheduler — no calendar, no dispatch, no
drag-to-reschedule."* Backed by `getProjectScheduleAction` → `lib/api/schedule.ts`
(399 lines), typed `ProjectSchedule`.

- **Rendering approach:** **absolutely-positioned `<div>` bars** inside a relative
  track. `left%`/`width%` computed from `daysBetween(from, d) / totalDays * 100`
  (a local `daysBetween` using `Date.parse`). One row **per job** (`sched.jobs`),
  not per task.
- **Time axis:** a single server-provided `sched.range.{from,to}`; header shows
  `from · N days · to`. **No zoom levels, no day/week/month/quarter switch** —
  one fixed scale.
- **Today line:** a 1px `<div>` positioned by `geom.pct(sched.today)`.
- **Milestones:** tiny inline `<svg>` rotated-`<rect>` diamonds on a shared axis
  row, colored by status (`MS_FILL`).
- **Bar states:** solid (planned), **hatched** `repeating-linear-gradient`
  (inferred — no planned dates), red tint (`is_overdue`).
- **Dependencies:** **not drawn.** A job with predecessors shows a text hint
  `↳ after {n}` next to its label. No arrows, no lines.
- **Interactions:** **no drag.** Dates are edited via inline `<input type="date">`
  in a separate "Planned dates" manager (`onBlur` → `setJobPlannedDatesAction`).
  Add-milestone and add-dependency are `<Select>`+button forms; the dependency
  form is labelled **"Add dependency (finish-to-start)"** and calls
  `addDependencyAction(depJob, depOn, projectId)`.
- **Resource / assignee dimension:** **none** on the Gantt. (Assignees exist on
  tasks and job_assignments, but the Gantt bars are jobs and show no resource
  lane.)
- **Gate:** the whole management half is `hasPermission(role,"projects","edit")`.

There is a **separate** scheduling surface — the dispatch board
(`app/(app)/scheduling/page.tsx`, @dnd-kit) — which *does* drag-to-book against a
tech×time grid, but it operates on `schedule_jobs`/`schedule_assignments`
(dispatch), not on the project Gantt bars.

---

## 6. Drag-and-drop & primitives — current state

- **@dnd-kit:** `@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`,
  `@dnd-kit/utilities ^3.2.2` (no modifiers/accessibility packages). Used in:
  quote builder (`SectionCard.tsx`/`LineItemRow.tsx` — reorder in local state,
  persisted on quote save, **no drag-end action**); job task kanban
  (`JobTasksTab.tsx` → `reorderTasksAction`); deficiency kanban
  (`DeficienciesTab.tsx` → `reorderDeficienciesAction`); commissioning items
  (`JobCommissioningTab.tsx` → `reorderItemsAction`); job line items
  (`JobLineItemsTab.tsx` → `reorderJobLineItemsAction`); and the dispatch board
  (`scheduling/page.tsx` → `createBookingAction`/`moveBookingAction`). **This is
  the proven basis for a drag-and-drop dashboard grid.**
- **Primitives (`components/ui/`, 18 files, Base UI):** `avatar`, `badge`,
  `button`, `card`, `command` (cmdk), `dialog`, `dropdown-menu`, `input-group`,
  `input`, `label`, `popover`, `select`, `separator`, `sheet`, `table`, `tabs`,
  `textarea`, `AddressAutocomplete`. Confirmed **Base UI (`@base-ui/react
  ^1.4.1`)** imports (e.g. `dialog.tsx:4` `@base-ui/react/dialog`); **zero
  `@radix-ui` imports anywhere** in the repo.
- **Missing primitives the vision's component kits imply:** switch/toggle, slider
  / dual-range slider, stepper, +/− counter, star rating, segmented control,
  date-picker (dates use native `<input type="date">`), calendar, storage/progress
  bar. A command palette **does** exist (`command.tsx` via cmdk) — the vision's
  "command-palette search" has a foundation.

---

## 7. Schema gap table (from `supabase/migrations`, read-only)

Live shapes (creation migration = current shape; a repo-wide `ALTER TABLE` grep
found no later date/dependency/baseline columns added):

- **`project_jobs`** — created `0082_project_jobs.sql`; `planned_start_date`,
  `planned_end_date date` added `0108_schedule_hooks.sql`; `sort_order`. **No**
  actual dates, duration, %-complete, or `parent_id`.
- **`job_tasks`** — created `0101_job_tasks.sql`: `status`, `priority`
  (`low/normal/high/urgent`), `assignee_tech_id`, `assignee_subcontractor_id`,
  `due_date` (single date), `completed_at`, `sort_order`. **No** start/end pair,
  **no** `percent_complete`, **no** `parent_id`.
- **`schedule_milestones`** — `0108_schedule_hooks.sql`: `target_date`,
  `completed_at`, `status`, `sort_order`.
- **`job_dependencies`** — `0108_schedule_hooks.sql`: `job_id`,
  `depends_on_job_id`, `created_at`; unique edge; no self-edge. **Finish-to-start,
  job-to-job only.**
- **Working hours / absences** — `0112_tech_availability.sql`:
  `tech_working_hours` (`day_of_week`, `start_time`, `end_time`, unique per
  weekday) + `tech_absences` (`absence_type`, `starts_at`, `ends_at`, `status`).
- **Dispatch** — `0111_dispatch_model.sql`: `schedule_jobs`
  (`estimated_hours`, `required_certs[]`, `window_start/end`) +
  `schedule_assignments` (`starts_at`/`ends_at`, GiST **no-overlap** exclusion per
  tech; `converted_labour_entry_id` added `0113`).

| Gantt capability | Status (schema) | Missing column(s) |
|---|---|---|
| Dependency link types (FS/FF/SS/SF) | **NOT SUPPORTED** | `job_dependencies.dependency_type` |
| Lag & lead | **NOT SUPPORTED** | `job_dependencies.lag_days` / `lead` |
| Critical path computation | **NOT SUPPORTED** | needs durations + typed deps + float — all absent |
| Baselines (planned vs actual dates) | **NOT SUPPORTED** | no baseline table; jobs lack `actual_start_date`/`actual_end_date` (only project-level `actual_completion`) |
| Slack / float | **NOT SUPPORTED** | no `total_float`/`free_float` |
| Parent/child task rollup | **NOT SUPPORTED** | `job_tasks.parent_id` (+ rollup) |
| Resource assignment on a task | **SUPPORTED** | `job_tasks.assignee_tech_id` / `assignee_subcontractor_id` (single) |
| Resource capacity & over-allocation | **PARTIAL** | capacity via `tech_working_hours`/`tech_absences`; over-alloc enforced only for `schedule_assignments` (GiST), not for job/task bars; no allocation-% column |
| Per-task priority | **SUPPORTED** | `job_tasks.priority` |
| Task-level % complete | **NOT SUPPORTED** | `job_tasks.percent_complete` |

**Key structural fact for the Gantt build:** schedule dates live at two
disconnected levels — **jobs** (`project_jobs`, date-only, no actuals) and
**bookings** (`schedule_assignments`, timestamptz). `job_tasks` has only a single
`due_date`, so **tasks cannot render as Gantt bars without new start/end columns**,
and there is **no task-level dependency table** at all.

---

## 8. Constraint check

**1. No paid subscriptions.** All current viz/interaction deps are permissively
licensed: `recharts` MIT, `d3-shape` ISC, `victory-vendor` MIT AND ISC (Recharts'
d3 bundle), `@dnd-kit/core|sortable|utilities` MIT, `cmdk` MIT, `framer-motion`
(MIT), `@tanstack/react-table` (MIT). **OSS Gantt candidates** to evaluate (do not
install here): **frappe-gantt** (MIT, plain SVG, light), **svar / wx-react-gantt**
(GPL-3.0 / commercial dual-license — GPL is a **copyleft risk** for a proprietary
product; flag), **react-calendar-timeline** (MIT, resource-lane timeline, not full
CPM). Hand-built SVG/CSS (extending the current approach) is also viable and
zero-dep. **Out of scope on licensing:** DHTMLX, Bryntum, Syncfusion (commercial).
Decision deferred (see §12).

**2. Honest data (§2.8).** Rule to carry into every new widget: **bind to a real
source or render an explicit "Not enough data yet" state — never a plausible fake
figure.** Precedent in code: vendor performance metrics (INV-9-1) render "Not
enough data yet" rather than a misleading 0% when dated receipts are insufficient
(`docs/USER_FACING_CHANGELOG.md`, Vendors — Performance metrics). A customizable
dashboard must gate any widget the user adds against real data availability.

**3. Base UI, not Radix.** **Confirmed** — `@base-ui/react ^1.4.1`; zero
`@radix-ui` imports repo-wide. New primitives must be built on Base UI.

**4. Recharts ceiling.** Recharts natively covers line / bar / area / pie / radar
/ scatter / composed (flat 2D). It **cannot** natively produce these vision forms:
3D cylinder/pyramid bars, liquid-fill gauges, needle/HUD radial gauges, dot-matrix
grids, hex-dot/dot-density world maps, 3D globe, candlestick/OHLC, and the Gantt
itself. **The decision (not made here):** (a) *extend Recharts* with custom SVG
shapes/`Customized` layers for the near-misses (gauges, dot-plots); (b) *add one
OSS lib* for a cluster (e.g. an ECharts-class MIT lib covers candlestick, gauges,
3D-ish, maps in one — but it is a second, heavier chart engine to theme); (c)
*hand-build SVG* per exotic form (max control, max effort, best theming fidelity).
Trade-off: (a) keeps one engine + theme path but tops out below the "wow" forms;
(b) unlocks the exotic catalog fast but doubles the theming/perf surface and adds a
large dep; (c) is zero-dep and pixel-perfect but slow to breadth. **Present, do not
decide.**

**5. Mobile.** The vision doc is silent on mobile. Current state: the dashboard
grids use responsive Tailwind breakpoints (`sm:`/`lg:`) and **do** reflow to one
column at phone widths; but the KPI density, `RangePicker`, and especially
`ProjectScheduleCard` (fixed-width 140px label column + percentage bars) are
**desktop-tuned and not verified usable at phone widths** — a drag-and-drop
dashboard and a full Gantt are both hard on touch/small screens. **Flag as an open
decision for Jay** (§12).

---

## 9. Resolved discrepancies (what the CODE says)

1. **Serif font.** The vision *brief* said "Cormorant Garamond"; the prior vision
   *doc* said "Playfair Display." **CODE is authoritative: Playfair Display** is
   the live serif (`app/layout.tsx:16`, `Playfair_Display` → `--font-playfair` →
   `--font-serif`). Cormorant Garamond is **not** imported anywhere. If Cormorant
   is actually wanted, that is a change to make later — it is not current.
2. **Preset count.** The vision doc said "15 presets." **CODE says 14** (`ThemeKey`
   union, `THEME_ORDER`, and 14 `[data-theme]` blocks). The Settings pane
   description still says "four theme presets" — also stale. **True count: 14.**
3. **Theme token source of truth is split and inconsistent.** `app/globals.css`
   `royal-navy` uses `--brand-primary: #0A1226` / `--brand-accent: #B8924B`, while
   `lib/theme.ts` `THEMES["royal-navy"]` uses `primary: "#0B1B3B"` / `accent:
   "#C9A24B"` — despite a CSS comment claiming "CSS values match lib/theme.ts 1:1."
   CSS drives utility classes / shadcn tokens; JS `THEMES.charts` drives Recharts.
   They **disagree for the default theme.** (Recorded, not fixed.)
4. **"User-editable themes from settings" is not built.** Presets only; the
   Branding pane's Logo/login-bg/signature/Save are mocks; theme choice persists
   to **localStorage**, not a per-user DB row.
5. **All presets are light.** The `.dark` CSS block is **unwired**; there is no
   dark-background theme and no dark-mode toggle. `viewport.colorScheme` is
   hardcoded `"light"`.
6. **Handoff/context docs lag HEAD.** `CLAUDE_CONTEXT.md` still reads "Latest PR
   #273 / migration 0075"; `docs/HANDOFF-SESSION-AJ.md` ends ~PR #151. Trust
   `git log` + `docs/USER_FACING_CHANGELOG.md` (current) for state — consistent
   with the vision doc's own note.

---

## 10. Gap-to-vision, tiered

Tiering rule: **P0** = required for the initiative's first shippable sprint;
**P1** = in the arc, a later sprint; **P2** = catalogued, not scheduled. Weighted
on: new schema needed? blocks other work? load-bearing for the sell (§4) vs
decorative?

### P0 — first shippable sprint
- **Theme persistence + real "Themes" settings category.** Move theme choice to a
  per-user DB row (survives devices, respects §7 field/settings model); make the
  Branding pane's Save real; fix the split source of truth so one place defines a
  theme. *(Needs schema: a `user_ui_prefs` / `theme` column or table.)*
- **User color customization (custom theme).** Color pickers to add/update/remove
  the `--brand-*` set and save a named custom theme. Load-bearing for the sell.
  *(Needs schema for stored custom palettes.)*
- **Theme-source unification.** Single source generating both CSS vars and the JS
  chart palette (kills the #0A1226-vs-#0B1B3B class of bug and the 4-place
  registration). *(Refactor; no schema.)*
- **Dashboard layout in data + drag-and-drop rearrange.** A per-user dashboard
  layout model (widget list, grid positions, sizes) + @dnd-kit grid; add/remove/
  reorder existing panels. This is the spine of "customizable dashboard." *(Needs
  schema: `dashboard_layouts`.)*
- **Per-widget chrome baseline.** Refresh / expand / ⋯ menu / (where meaningful)
  per-widget time-range, plus wiring the global `RangePicker` to more panels.
  *(No schema.)*
- **Dark theme support + at least one dark preset.** Wire `.dark` (or a
  dark-`--brand-bg` preset family) so the vision's dark categories are possible.
  *(Mostly CSS; a `mode` flag if persisted.)*

### P1 — later sprints in the arc
- **Interactive Gantt v2 — schema + rendering.** Add job/task start+end+
  %-complete, `job_dependencies.dependency_type`+`lag`, a task dependency table,
  and baseline (`*_baseline_start/end`) columns; then drag-to-reschedule, zoom
  levels, dependency arrows, milestone/today, resource lane. **Multiple
  migrations.** Highest-value sell item after the dashboard.
- **Critical path + slack + baselines** (depends on the Gantt-v2 schema).
- **Chart-library expansion round 1** — the Recharts-reachable/near-reachable
  forms: area/gradient-area, multi-line, stacked/grouped bar, radial gauges,
  progress rings, sparklines, radar, donut. *(No schema; a shared `<Chart>`
  wrapper themed off one palette source.)*
- **Component-kit primitives** — switch, slider, stepper, counter, rating,
  segmented control, date-picker, calendar (Base UI). *(No schema.)*
- **Dashboard templates** — a handful of ready-made layouts to pick from
  (reuses the P0 layout model). *(Data/seed.)*
- **Presentation Timeline Export** — see §10b. *(Reuses REP-1 export engine;
  likely no schema.)*

### P2 — catalogued, not scheduled
- **Exotic chart forms** requiring a second engine or heavy custom SVG: 3D
  cylinder/pyramid bars, 3D globe with points, HUD/sci-fi gauges, hex-dot world
  maps, candlestick/OHLC, dot-matrix grids, clock dials, calendar heat-select.
- **Component-kit "flavor" widgets** from the references: weather widget, video/
  audio player cards, credit-card/boarding-pass mockups, currency-pair selectors —
  offer equivalents only where a real ERP use exists (quick-action bars —
  Add Client/Create Quote/Enter Payment/Create Invoice — are the load-bearing
  ones and could move to P1).
- **Theme sub-categorization taxonomy** (modern / AI / gradient / glass /
  neumorphic / pastel / …) as a browsable, sub-categorized gallery.
- **Resource capacity/over-allocation on job & task bars** (beyond the dispatch
  board's booking-level GiST guard).

### 10b. Presentation timeline templates (distinct from the interactive Gantt)
The references include ~15 **fixed-slot, client-facing** timeline renderings that
are **NOT** candidates for the interactive Gantt (they assume a fixed content
count and break with variable task volume): winding-road / floating-island, arc /
dome, spiral-helix, dartboard-target, 3D-perspective roadway, funnel-to-target,
stepped year-cards, month pill-strip, isometric ribbon cascade, circular
step-chain, numbered milestone chain, curved road with map pins.

**Treat these as a separate "Project Timeline Export" feature:** the operator
picks a template; the system renders the project's phases/milestones into the
template's fixed slots; export to **PDF via the existing REP-1 engine**
(`lib/reports/` — `to-pdf.tsx`, `export.ts`, `download.ts`). Natural slot counts
and the **required overflow behaviour when a project exceeds the slots**:

| Template family | Natural slots | On overflow |
|---|---|---|
| Winding-road / curved-road-with-pins | 6–8 | **Paginate** (multiple pages, same style) |
| Arc / dome, dartboard-target, circular step-chain | 6–8 | **Roll up to phase level** (group jobs→phases) |
| Spiral-helix, isometric ribbon cascade | 8–12 | **Paginate** |
| Stepped year-cards | 4–6 (per year) | **Roll up to phase level** |
| Month pill-strip | 12 (months) | **Paginate** by year |
| Numbered milestone chain, funnel-to-target | 4–6 | **Roll up to phase level** |

**Recommended default overflow rule:** **roll up to phase level first** (the
honest, presentation-appropriate default — a client deck should show phases, not
40 tasks), and **paginate** only for the road/ribbon/pill families that read
naturally as continuations. **Never silently truncate**; if a template genuinely
can't fit even at phase level, render what fits and show a clear "N more phases not
shown" note (consistent with §2.8 honesty). **Tier: P2** (P1 only if Jay wants a
client-facing deliverable early) — it must **not** compete with the P0/P1
interactive-Gantt work; it is a rendering/export feature, not scheduling.

---

## 11. Recommended sprint sequence (each a single Claude Code paste)

> Ordered; ⚙️ = requires a migration (Jay applies manually via Supabase Dashboard).
> The expanded widget/chart/theme **reference catalog** (from the ~110 reference
> screenshots) is a **separate follow-up chunk**, deliberately not attempted in
> this audit.

1. **UIDG-2 — Theme source unification (read+refactor, no schema).** One module
   generates both the CSS `--brand-*` blocks and the JS chart palette; kill the
   #0A1226/#0B1B3B split and the 4-place theme registration. Fix the stale "four
   presets" copy.
2. **UIDG-3 ⚙️ — Per-user UI prefs.** `user_ui_prefs` table (theme key, mode,
   later dashboard layout). Move theme persistence off localStorage; make the
   Branding "Save" real. GRANT+RLS boilerplate (§3).
3. **UIDG-4 — Custom themes + color editor.** Color pickers over the token set;
   save/name/apply custom palettes (stored per §3 in a `custom_themes` table —
   fold into UIDG-3's migration if done together ⚙️). Add ≥1 dark preset + wire
   `.dark`.
4. **UIDG-5 ⚙️ — Dashboard layout model + drag rearrange.** `dashboard_layouts`
   (per-user widget list + positions/sizes); @dnd-kit grid; add/remove/reorder the
   existing real panels only.
5. **UIDG-6 — Per-widget chrome + range wiring.** Refresh/expand/⋯; wire the
   global range (and per-widget range where meaningful) to all panels; implement
   the `custom` date input.
6. **UIDG-7 — Chart wrapper + expansion round 1.** A themed `<Chart>` abstraction
   over Recharts; add area/multi-line/stacked/grouped/radial-gauge/sparkline/
   radar/donut. No schema.
7. **UIDG-8 ⚙️ — Gantt schema.** Job/task start+end+%-complete, actual dates,
   baseline columns, `job_dependencies.dependency_type`+`lag`, a task-dependency
   table.
8. **UIDG-9 — Interactive Gantt v2.** Drag-to-reschedule, zoom levels, dependency
   arrows, resource lane, baseline overlay — on the UIDG-8 schema.
9. **UIDG-10 — Critical path + slack** (computation over UIDG-8/9).
10. **UIDG-11 — Component-kit primitives** (Base UI: switch/slider/stepper/
    counter/rating/segmented/date-picker/calendar).
11. **UIDG-12 — Dashboard templates** (ready-made layouts over UIDG-5).
12. **UIDG-13 — Presentation Timeline Export** (fixed-slot templates → REP-1 PDF;
    §10b overflow rules).

---

## 12. Open decisions for Jay (each one question)

1. **Serif:** keep **Playfair Display** (what's live) or switch to Cormorant
   Garamond (what the brief said)?
2. **Theme scope:** should a chosen theme be **per-user** (each login its own) or
   an **org-wide default an Admin sets** (or both — user overrides an org default)?
3. **Dark mode:** do you want true **dark-background** themes (neon-dark /
   elegant-dark) as their own family, and a light/dark toggle — or keep the
   current "light UI, dark chrome" look and only vary accent colors?
4. **Custom-theme sharing:** when a user builds a custom palette, is it **private
   to them** or **publishable to the whole org** as a new preset?
5. **Chart engine strategy:** for the exotic forms (gauges, 3D, maps, candlestick),
   do we (a) extend Recharts + hand-built SVG, (b) add a second MIT chart engine
   (bigger, one theming path to maintain), or (c) hand-build every exotic form?
6. **Gantt scope for v2:** which are must-have for the **sell** — critical path,
   baselines, resource leveling — vs nice-to-have? (Drives how big the UIDG-8
   migration is.)
7. **Gantt granularity:** should bars be **jobs** (today's model) or **tasks**
   (needs task start/end + a task-dependency table — more schema)?
8. **Mobile:** is a **phone-usable** dashboard/Gantt in scope, or is Nexvelon
   **desktop-first** (tablet minimum) so we optimize for large screens?
9. **OSS Gantt library vs hand-built:** acceptable to adopt an MIT OSS Gantt
   (e.g. frappe-gantt) as a base, or build in-house SVG to avoid any dependency
   and match the theme exactly? (Note: svar/wx-react-gantt's GPL license is a
   copyleft risk and likely disqualified.)
10. **Presentation Timeline Export priority:** is a client-facing "timeline deck"
    PDF an early win (P1) or later (P2)?
11. **Dashboard widget catalog breadth:** offer only widgets backed by **real
    Nexvelon data** (honest-data safe), or also decorative/reference widgets
    (weather, media cards) that would need external or placeholder data?

---

> **Reference-catalog note.** The full, sub-categorized widget/chart/theme
> **reference catalog** derived from the ~110 reference screenshots is a
> **separate follow-up chunk** and was deliberately **not** attempted in this
> audit. This document scopes infrastructure and gaps, not the exhaustive catalog.

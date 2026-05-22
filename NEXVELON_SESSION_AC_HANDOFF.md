# Nexvelon — Session AC Handoff

**Period covered**: Session AC (continued from compacted Session AB)
**Started**: Mid-CONTACTS-1 inspection (where Session AB ended)
**Ended**: After CL-4 Phase 2b ship (PR #63)
**Modules completed this session**: Quote (final polish via POLISH-2), Contacts (display layer via CONTACTS-1), Sites (new module via SITES-1), Clients (full-screen refactor via CLIENTS-FS + inline contacts via CL-3c + onboarding template via CL-4)
**Modules in queue**: Inventory Sprint (INV-1 through INV-6)
**Current status**: Quote + Client + Sites + Contacts = 100% done. Ready to begin Inventory Sprint.
**Last shipped PR**: #63 (CL-4 Phase 2b)

---

## §1. Session AC Summary — Chunks Shipped (PRs #53–#63)

Session AC continued from compacted Session AB which ended mid-CONTACTS-1 inspection. Session AC picked up the diagnostic and shipped 11 PRs across three module-completion arcs: QD-2 Phase 5 (drawings embed), Client+Sites+Contacts polish, and a new full-screen client experience with onboarding template.

### QD-2 Phase 5c — PDF embed of uploaded drawings (PR #53)
- Installed pdfjs-dist@^5.7.284; copied worker to `public/pdf.worker.min.mjs` (~1.2MB)
- New `lib/quote-drawings-render.ts` → `renderPdfToImages()` rasterizes each page to PNG data URL at 2× scale, 12-page soft cap
- QuoteBuilder: ephemeral `Record<pdfPath, dataUrls[]>` cache + in-flight Set guard + conversion useEffect (NEVER persisted to localStorage — would blow 5MB cap)
- PdfPreviewPane threads `drawingsImagesByPath` through to QuoteDocument
- QuoteDocument orchestrator refactored: running `pageCounter` + `pageCountOf()` helper
- DrawingsPage split into DrawingsSummaryPage + new DrawingsImagePage
- pdfjs v5 API: used `page.render({ canvas, viewport })` (NOT v4's `canvasContext`)

### QD-2 Phase 5c Layout Fix (PR #54)
- Removed extra summary page with chips before drawings
- `pageCountOf` for drawings-with-images now returns `images.length` (was `1 + length`)
- DrawingsSummaryPage takes optional `firstImageSrc` — when present, renders first image directly below title block (no placeholder, no chips)
- Result: no upload → 1 page · 1-page upload → 1 page combined · 3-page upload → 3 pages

### CL-3b — Inline site creation (PR #55)
- Single-file change: `ClientFormDrawer.tsx`
- New "Initial Site (optional)" collapsible section, create-mode only
- AddressAutocomplete on site address line 1 — real API is `onPlaceSelected` with `{street, city, province, postal, country}`
- Submit chains: `createClientAction` → if active, `createSiteAction({client_id: newClient.id, ...})`

### SITES-1 — Dedicated Sites page (PR #56)
- 2 new files: `app/(app)/sites/page.tsx` (RSC) + `SitesView.tsx`
- 5 modified: `database.ts` (DbSiteWithClient), `lib/api/clients.ts` (listSites with clients join + auto-gen `site_code` per-client `S-{client_code}-{NNN}`), `actions.ts` (listSitesAction), `nav-config.tsx` ("Clients & Sites" → "Clients" + new "Sites" with Building2 icon), `SiteFormDrawer` (clientId optional in create mode → client picker dropdown)
- 11-entry nav: Dashboard/Quotes/Projects/Clients/Sites/Inventory/Scheduling/Financials/Reports/Users/Settings

### CONTACTS-1 — Role badges (PR #57)
- Single file: `app/(app)/clients/ClientsView.tsx`
- New `RoleBadges` helper: amber Primary + emerald Billing + red Emergency
- `is_billing` and `is_emergency` were already stored and editable since CL-3a but never rendered anywhere
- Operator decision: kept existing 3 roles; declined to add Technical/Decision-Maker

### POLISH-2 — Housekeeping (PR #58)
- Deleted `components/layout/GlobalCommandPalette.tsx` (223 lines, dead since SEARCH-1)
- Updated stale comments in `TopBar.tsx` and `AppShell.tsx`
- SKU → Part # sweep: CommandPalette dialog, StockTab, QuoteBuilder helper text, QuoteDocument PDF part line
- Inventory-module SKU references DELIBERATELY KEPT — SKU is correct domain term for inventory
- Net: +5 / −236 lines

### CLIENTS-FS Phase 2a — Extract right-panel components (PR #59)
- Pure refactor — no behavior change
- ClientsView.tsx reduced 1307 → 612 lines (53% reduction)
- New `app/(app)/clients/_components/` folder (Next.js _-prefix = not a route):
  - `shared.tsx` (initials, TIER_BADGE)
  - `ClientHeader.tsx` (ClientHeader + ClientStatsRow)
  - `TabBar.tsx` (TabBar + TABS + TabKey)
  - `SitesPane.tsx` (SitesPane + SiteCard + SiteStat)
  - `ContactsPane.tsx` (ContactsPane + ContactsCard + RoleBadges)
  - `PlaceholderPane.tsx`
- ClientRow stays in ClientsView (only the list uses it)
- TIER_BADGE went to `shared.tsx` (not ClientHeader.tsx) because ClientRow also uses it — genuinely shared

### CLIENTS-FS Phase 2b — Full-screen client detail page (PR #60)
- New `/clients/[id]` route — `page.tsx` (RSC using `getClientById`) + `ClientDetailView.tsx`
- ClientsView slimmed 612 → 449 lines — list-only; row click → `router.push('/clients/{id}')`
- List `page.tsx` dropped the N+1 sites/contacts pre-fetch — `/clients` bundle 25 → 15 kB
- Detail page owns its own site/contact/edit drawer state; `router.refresh()` after every mutation
- Delete client → confirm → redirect to `/clients`
- "← Back to Clients" link mirrors the quotes/[id] pattern
- Type wrinkle resolved: `getClientById` returns `DbClient`, but ClientHeader wants `DbClientWithCounts` — constructed via `{ ...client, site_count: sites.length, contact_count: contacts.length }` in the RSC

### CL-3c — Inline 3-contact creation (PR #61)
- Single file: `ClientFormDrawer.tsx`
- New "Initial Contacts (optional)" section, create-mode only
- 3 contact slots:
  - **Main Contact** → first_name + last_name + phone + email → `is_primary=true`
  - **Accounts Payable Contact** → same fields → `is_billing=true`
  - **Additional Contact (optional)** → same fields → no role flag
- Each slot "active" once any field has content; active slots require first + last name (schema NOT NULL)
- Submit chains: create client → create site (if CL-3b active) → up to 3 contacts in parallel
- Combined toast: `Added Acme Corp · site "Main Office" added · 2 contacts added`
- Closes the CL-3 inline-creation trilogy (3a → 3b → 3c)

### CL-4 Phase 2a — Excel template generator + Download (PR #62)
- Installed `exceljs` (chosen over `xlsx` which is stale at 0.18.5 with audit advisories)
- Dynamic-imported — exceljs (~1MB) stays out of main bundle; `/clients` 15.1 → 16.3 kB
- New `lib/client-onboarding-template.ts` → `generateClientTemplate(): Promise<Blob>`
- 4-sheet Excel workbook: Instructions / Client & Billing / Contacts / Site
- Labels bold; fillable cells highlighted yellow (`FFFFF9E6`)
- ClientFormDrawer gets top-of-form banner (create-only, above Identity section) with 2 buttons:
  - "Download template" (enabled — triggers download)
  - "Upload filled template" (disabled — Phase 2b enables)

### CL-4 Phase 2b — Upload + parser → auto-populate (PR #63)
- Extended `lib/client-onboarding-template.ts` with `parseClientTemplate(file)`
- `file.arrayBuffer()` → exceljs `load()` → label-based lookup (robust to clients adding blank rows / reordering within a sheet)
- Missing-sheet guards throw friendly errors ("This doesn't look like a Nexvelon template — 'Client & Billing' sheet is missing.")
- `ParsedClientTemplate.tax_exempt: boolean | null` — null distinguishes "cell empty" from "explicitly no" (don't override existing state)
- "Upload filled template" button enabled — hidden file input ref + button-click trigger (mirrors Phase 5b pattern, scaled to single input)
- `e.target.value = ""` after read so the same file can be re-selected
- Helper functions typed with exceljs's `Worksheet` (via `import type` — zero runtime cost) instead of `any` (project's `no-explicit-any` rule)
- `handleUploadTemplate` only sets fields with content (preserves what Jay already typed); contacts/site populate only when name has content (mirrors CL-3b/3c gating)
- Lenient parse — invalid emails populate as-is; form validation catches on submit
- Closes the CL-4 trilogy — Phase 1 inspect → 2a generate → 2b parse

---

## §2. Architectural Locks (Carried Forward, Unchanged)

### §2.1 Past-Data Preservation
Compat shims are transformative, not destructive. Examples: QB-2/QB-3/QB-8/QB-11 chain in `lib/quote-store.ts` `readOverrides` (l5/l8/l11 inline blocks). When schema evolves, old records continue to read correctly via shims rather than being migrated destructively.

### §2.2 Snapshot Principle (universal lock)
Catalog/master data = templates. Transaction records snapshot values at creation. Deletes/edits to templates never affect existing records.

Line items store classification/vendor/sku/name/description/qty/unitCost/margin/unitPrice as fields (no FKs). client_name/site_name still looked up live from FKs (flagged for Quotes-v1 DB persistence sprint).

### §2.3 Page Size: A4 (locked)
Applied in QD-2 Phase 2. All 6 PDF pages use `size="A4"`. Page padding 64pt uniform.

### §2.4 Inventory cost tracking: specific-identification per-lot
Per-lot cost tracking with explicit lot-picker at allocation time. Each `inventory_lot` has its own `unit_cost`. When allocated to a quote line or project, `unit_cost` is locked via `unit_cost_locked`. Enables reconciling actual costs against quoted costs later.

---

## §3. Modules Status (End of Session AC)

| Module | Status | Notes |
|--------|--------|-------|
| Dashboard | Basic | Placeholder, future work |
| **Quotes** | **100% DONE** | QB-1 through QB-12 + QD-2 full design overhaul + SEARCH-1 + POLISH-1+2 |
| Projects | Basic | Future module |
| **Clients** | **100% DONE** | CL-1 through CL-3c + CLIENTS-FS full-screen + CL-4 onboarding template |
| **Sites** | **100% DONE** | SITES-1 |
| **Contacts** | **100% DONE** | CONTACTS-1 (display layer with 3 role badges) |
| Inventory | Next sprint | INV-1 through INV-6 (~6 chunks) |
| Scheduling | Future | Not yet scoped |
| Financials | Future | Not yet scoped |
| Reports | Future | Not yet scoped |
| Users | Basic | Permission matrix complete |
| Settings | Functional | Classifications + Margin Tiers admin done |

---

## §4. Key File Locations (End of Session AC)

### Types
- `lib/types.ts` — `BuilderLineItemType = "product" | "labor" | "misc" | "service"`
- `lib/types/database.ts` — DbClient/DbSite/DbContact/DbClientWithCounts/DbLineItemClassification/DbMarginTier/DbSiteWithClient/DbSiteInsert/DbSiteStatus/DbClientOpco

### Quote builder
- `components/modules/quotes/builder/QuoteBuilder.tsx` — drawings image cache + conversion useEffect
- `components/modules/quotes/builder/SectionCard.tsx` — +Product/+Labor/+Service line/+Misc buttons
- `components/modules/quotes/builder/SchedulesCard.tsx` — ADDABLE_KINDS includes drawings, drawings upload sub-row
- `components/modules/quotes/builder/LineItemRow.tsx` — unified row, service through non-labor branch
- `components/modules/quotes/builder/QuoteDocument.tsx` — A4 + 64px gutter, SectionTitle/SignatureBlock/DrawingsDotGrid/DrawingsSummaryPage/DrawingsImagePage helpers, numText, orchestrator with pageCountOf + running pageCounter
- `components/modules/quotes/builder/PdfPreviewPane.tsx` — threads drawingsImagesByPath

### Quote logic
- `lib/classifications.ts` — seed array + classificationsFor + defaultClassificationFor including service→Warranty Cost
- `lib/quote-helpers.ts` — miscLineItem/serviceLineItem factories, takeoffGroups helper, recalcLineItem, roundCRA
- `lib/quote-store.ts` `readOverrides` — compat chain QB-2 → QB-3 → QB-5a → QB-8 → QB-11
- `lib/quote-schedules.ts` — 7 kinds, createDrawingsSchedule factory
- `lib/quote-drawings-render.ts` — renderPdfToImages via pdfjs-dist v5
- `lib/quote-themes.ts` — QuoteTheme interface + 3 optional slots; default_theme_grayish

### Quote API
- `lib/api/classifications.ts` — full CRUD
- `lib/api/clients.ts` — createClient auto-code (CL-3a), getSitesByClient/createSite (auto-coded S-{client_code}-{NNN}), getContactsByClient, listSites cross-client with join, getClientById (used by /clients/[id])
- `lib/api/drawings.ts` — uploadDrawingsPdf/deleteDrawingsPdf/getSignedDrawingsUrl
- `lib/api/margin-tiers.ts` — full CRUD
- `lib/permissions.ts` — Resource union (sites reuses "clients")

### Client onboarding template (NEW this session)
- `lib/client-onboarding-template.ts` — `generateClientTemplate()` (CL-4 Phase 2a) + `parseClientTemplate()` (CL-4 Phase 2b) + `ParsedClientTemplate` interface

### Layout
- `components/layout/nav-config.tsx` — 11 entries
- `components/layout/Sidebar.tsx` — `w-52`
- `components/layout/AppShell.tsx` — `pl-52`
- `components/layout/TopBar.tsx` — center search trigger + ⌘K
- `components/layout/GlobalSearch.tsx` — controlled CommandDialog
- `components/ui/command.tsx` — CMDK-FIX canonical structure

### Clients module (significantly restructured this session)
- `app/(app)/clients/page.tsx` — RSC, drops N+1 pre-fetch (CLIENTS-FS 2b); just fetches getClients()
- `app/(app)/clients/ClientsView.tsx` — list-only after CLIENTS-FS 2b (449 lines, was 1307)
- `app/(app)/clients/[id]/page.tsx` — NEW (CLIENTS-FS 2b) — RSC using getClientById
- `app/(app)/clients/[id]/ClientDetailView.tsx` — NEW (CLIENTS-FS 2b) — full-screen detail
- `app/(app)/clients/_components/` — NEW (CLIENTS-FS 2a) — extracted right-panel components:
  - `shared.tsx` (initials, TIER_BADGE)
  - `ClientHeader.tsx` (ClientHeader + ClientStatsRow)
  - `TabBar.tsx` (TabBar + TABS + TabKey)
  - `SitesPane.tsx` (SitesPane + SiteCard + SiteStat)
  - `ContactsPane.tsx` (ContactsPane + ContactsCard + RoleBadges)
  - `PlaceholderPane.tsx`
- `app/(app)/clients/ClientFormDrawer.tsx` — 8 sections + Initial Site (CL-3b) + Initial Contacts (CL-3c) + Download/Upload template banner (CL-4)
- `app/(app)/clients/SiteFormDrawer.tsx` — create+edit, optional clientId with picker (SITES-1)
- `app/(app)/clients/ContactFormDrawer.tsx` — is_primary default true (CL-3a), 3 role toggles
- `app/(app)/clients/actions.ts` — full CRUD actions

### Sites module
- `app/(app)/sites/page.tsx` — RSC route with listSitesAction + listClientsAction
- `app/(app)/sites/SitesView.tsx` — table + filters + drawer + delete dialog

### Settings
- `components/modules/settings/ClassificationsPane.tsx`
- `components/modules/settings/MarginTiersTable.tsx`
- `components/modules/settings/SettingsPanes.tsx`
- `app/(app)/settings/page.tsx` — 14 SECTIONS array
- `app/(app)/settings/classifications-actions.ts` — requireAdmin gated
- `app/(app)/settings/margin-tiers-actions.ts` — requireAdmin gated

### Quote routing
- `app/(app)/quotes/new/page.tsx` — RSC, listClassifications without try/catch
- `app/(app)/quotes/[id]/page.tsx` — client component

### Search
- `app/(app)/global-search-actions.ts` — searchClientsAction

### Migrations (in order)
- `supabase/migrations/0001` — clients_schema (clients, sites, contacts)
- `supabase/migrations/0007` — cl2_form_expansion
- `supabase/migrations/0008` — line_item_classifications
- `supabase/migrations/0009` — classifications_service_applies_to
- `supabase/migrations/0010` — margin_tiers
- `supabase/migrations/0011` — quote_drawings_storage
- Smoke files paired with each (temp-table aggregation, FAILs-first, ROLLBACK)

### Public assets
- `public/pdf.worker.min.mjs` — ~1.2MB pdfjs v5 worker
- `public/fonts/` — Cormorant Regular/Italic/Bold/BoldItalic, Inter Regular/Medium

### Repo root docs
- `NEXVELON_SESSION_AA_HANDOFF.md` — first session
- `NEXVELON_SESSION_AB_HANDOFF.md` — second session (added §2.2 Snapshot Principle, §2.3 A4, §2.4 Inventory cost tracking)
- `NEXVELON_SESSION_AC_HANDOFF.md` — THIS DOCUMENT
- `NEXVELON_FULL_HANDOVER.md`
- `CLAUDE_CONTEXT.md`
- `NEXVELON_PRINCIPLES.md`
- `NEXVELON_ROADMAP.md`

---

## §5. Inventory Sprint Plan (Forward-Looking)

The Inventory Sprint implements per-lot cost tracking locked in by §2.4. Currently `/inventory` is mostly a placeholder; this sprint builds the full module.

### Architecture overview — tables to create

1. **`product_categories`** — Hierarchical categories (Cameras, Controllers, Cables, Power, Software, Accessories, Hardware)
2. **`vendors`** — Suppliers/manufacturers (Axis, Hikvision, Hanwha, Genetec, etc.)
3. **`products`** — The catalog: `part_number`, `name`, `description`, `category_id` FK, `vendor_id` FK, `default_unit_cost`, status, audit
4. **`inventory_lots`** — Per-receipt batches of a product. Each lot has its own unit_cost.
   - Key fields: `qty_received` (immutable), `qty_remaining` (decrements), `unit_cost` (price PAID for THIS lot), `received_at`, optional `po_number`
5. **`inventory_allocations`** — Links a lot's quantity to a quote line or project.
   - Key fields: `product_id`, `lot_id`, `quote_id` OR `project_id` (one of), `quantity`, `unit_cost_locked` (snapshotted from lot at allocation time — Snapshot Principle in action)

### INV-1 — Schema migration + smoke
- Migration 0012 creates all 5 tables with proper FKs, indexes, RLS policies
- Seed: product_categories (~7 categories), maybe 3-5 vendors
- NO seed products (those get created via UI in INV-2)
- Smoke SQL paired (temp-table aggregation, FAILs-first, ROLLBACK)
- Phase 1 inspect first to map current /inventory placeholder

### INV-2 — Products catalog page
- Build proper `/inventory` UI
- Table: Part # / Name / Category / Vendor / Default Unit Cost / Status / Actions
- Filters: category, vendor, search
- ProductFormDrawer for create/edit
- CategoriesPane + VendorsPane (in settings or inline)

### INV-3 — Receive flow (PO → lots)
- "Receive inventory" button on a product
- Form: qty, unit_cost, PO number (optional), received_at
- Creates a new `inventory_lot`
- Stock totals auto-update

### INV-4 — Allocation with lot-picker
- Snapshot Principle at work
- When allocating to a quote/project, show available lots
- User chooses which lot (or default to oldest FIFO)
- `unit_cost_locked` snapshotted from chosen lot
- Lot's `qty_remaining` decrements

### INV-5 — Physical counts / adjustments
- Inventory adjustments (theft, damage, write-offs, recounts)
- Audit log of adjustments

### INV-6 — Catalog Browser button in Quote builder
- The integration point that wires everything together
- In QuoteBuilder line item row, "From catalog" button
- Search/filter products → pick one → choose lot → line item populated with `unit_cost` from chosen lot
- Allocation record created linking quote line to lot

### Decisions needed for Phase 1 of INV-1
1. Hierarchical vs flat categories?
2. Vendors: just name+contact, or full vendor module with PO history?
3. Products: SKU/part_number — same field or separate? (SKU = internal Nexvelon code, part_number = manufacturer's code?)
4. Lots: support partial receipts or full batches only?
5. Multi-warehouse support, or single-location?

---

## §6. Deferred Items (Tracked)

1. **Guardian own HST registration** — Currently uses Integrated Solutions' HST 785486770 RT0001
2. **DEFAULT_LABOR_RATE export removal** — Legacy export still in codebase
3. **roundCRA float-precision edge for .X45 cents** — Banker's rounding edge case
4. **Quotes-v1 DB persistence** — Separate sprint. Currently quotes in localStorage; needed for true client_name/site_name snapshot
5. **`site_code` UNIQUE constraint** — Race condition acceptable for single-user
6. **Audit columns on sites table** — None exist; no add planned
7. **Dedicated `/contacts` page** — Deferred; not in CONTACTS-1 scope
8. **Billing "same as primary site" copy-on-create** — Currently no-op in create mode
9. **Inventory-module SKU vocab** — Deliberately kept as "SKU" (correct domain term)
10. **CL-4 template polish** — Cell protection / data validation dropdowns (deferred per Phase 1 decision)
11. **Phone number format enforcement** — Free text in v1; could add Canadian format validation later
12. **Borderline template fields** — industry/type/payment_method/currency intentionally NOT in v1 template

---

## §7. Operating Context

### Operator
- **Name**: Jay Shah
- **Background**: Non-technical; runs Nexvelon (security integrator in Brampton, ON)
- **Tech setup**: Claude Desktop + Claude Code (terminal or VSCode); pastes specs into Claude Code, pastes results back
- **Style**: Slow and steady, ONE Claude Code paste per turn, decisive specs

### Process locks
1. **One chunk = one PR**: Each shippable unit of work is its own PR
2. **Branch naming**: `feature/<scope>-<chunk>-<short>`, `docs/<topic>`, `fix/<scope>-<chunk>-<short>`, `polish/<scope>-<short>`
3. **Commit format**: `<type>(<scope>): <Chunk ID> — <description>`
4. **Vercel auto-deploys from main**, repo auto-deletes merged branches
5. **DB migrations via Supabase Dashboard SQL Editor ONLY** (no CLI)
6. **Smoke files paired with migrations**: temp-table aggregation pattern, FAILs-first, ROLLBACK
7. **NEVER run `scripts/wipe-test-data.sql`**
8. **Auth user FKs**: Reference `auth.users(id)` directly
9. **Inline SQL given directly to Jay** when GitHub navigation creates friction
10. **Past-data preservation + Snapshot Principle govern every chunk**

### Claude Code's pattern (strategist trusts these)
Claude Code repeatedly demonstrates sharp spec-vs-reality adaptations:
- Verifies component APIs before writing code (e.g., AddressAutocomplete's actual `onPlaceSelected` prop)
- Catches nullable types in interfaces (e.g., `DbClient.default_opco`)
- Catches setter naming mismatches (e.g., `setName` not `setTradeName`)
- Caught library audit issues (e.g., xlsx 0.18.5 stale on npm → use exceljs)
- Caught early-return bugs that would skip valid actions (CL-3c's `isEdit || !isInitialSiteActive`)
- Uses proper types instead of `any` to respect project lint rules (exceljs `Worksheet` type)
- Network timeouts handled with retries (no duplicate commits)
- Flags spec deviations in PR bodies

Strategist trusts these adaptations — they prevent runtime bugs.

### Operating companies (business context)
- **Nexvelon Integrated Solutions Inc.** — HST 785486770 RT0001 (prefix "IS")
- **Nexvelon Guardian Inc.** — HST 785486770 RT0001 (same number — flagged: own registration needed) (prefix "GD")
- Both at Unit 104, 350 Rutherford Rd S, Plaza II, Brampton, ON L6W 4N6
- Trade name "Nexvelon Global" shared

---

## §8. Tooling

- **Repo**: github.com/nexvelon/nexvelon
- **App**: app.nexvelonglobal.com (Vercel deployment from main branch)
- **DB**: Supabase (PostgreSQL)
- **Auth**: Supabase auth
- **Storage**: Supabase Storage (used for quote-drawings PDF uploads — private bucket `quote-drawings`, 20MB PDF-only, RLS folder-scoped)
- **PDF rendering**: @react-pdf/renderer (quote PDFs) + pdfjs-dist v5 (PDF embed of uploaded drawings)
- **Excel handling**: exceljs (chosen over xlsx — npm xlsx 0.18.5 stale with audit advisories)
- **Fonts**: Cormorant (display) + Inter (text)
- **UI primitives**: shadcn/ui (Tabs, Sheet, Dialog, Select, etc.) + Tailwind CSS
- **State**: localStorage for quote drafts (Quotes-v1 DB persistence deferred)
- **Build**: Next.js (App Router, RSC)

---

## §9. How to Start a New Claude Session

1. **Read docs in this order**:
   - `CLAUDE_CONTEXT.md` (orientation)
   - `NEXVELON_PRINCIPLES.md` (architectural locks)
   - `NEXVELON_ROADMAP.md` (current state)
   - `NEXVELON_SESSION_AC_HANDOFF.md` (THIS document — latest)
   - `NEXVELON_SESSION_AB_HANDOFF.md` (previous session, QD-2 + classifications detail)
   - `NEXVELON_SESSION_AA_HANDOFF.md` (first session, foundations)

2. **Current state at end of AC**: Quote + Client + Sites + Contacts modules all 100% done. PR #63 (CL-4 Phase 2b) is the last shipped. The full client-onboarding-via-Excel workflow works end-to-end.

3. **Next sprint**: Inventory Sprint, starting with INV-1 Phase 1 inspect (map current `/inventory` placeholder + design schema for 5 new tables).

4. **Operator style**: Non-technical, ONE Claude Code paste per turn, decisive specs. SQL files given inline when GitHub navigation creates friction.

5. **Architectural locks**: §2.1–§2.4 are non-negotiable and apply to every chunk.

6. **Strategist trusts Claude Code** to flag spec-vs-reality deviations and adapt. Don't fight its corrections — they prevent runtime bugs.

7. **Phase 1 inspect → Phase 2 implementation pattern**: For any non-trivial chunk, do a Phase 1 inspect (no edits, just read + report) before Phase 2. This pattern caught many gotchas this session — library audit issues, setter naming, type wrinkles, etc.

8. **Multi-PR chunk pattern**: For large refactors (like CLIENTS-FS), split into separable PRs (2a = pure refactor, 2b = behavior change). Each PR stays reviewable; the refactor PR is invisible to users; the behavior PR has clear smoke targets.

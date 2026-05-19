# NEXVELON_SESSION_AB_HANDOFF.md

> **Session AB** — continuation from Session AA. Snapshot of state, architectural decisions, sprint queue, and locked future-feature specs as of 2026-05-19 end of session AB. Any future Claude Code or Claude AI chat session should read this in full before proceeding with quote/inventory work.

---

## 1. What shipped this session (Session AB)

All merged to `main` unless flagged otherwise:

| Chunk | PR | Description |
|---|---|---|
| QB-6 | #27 | Vendor cell disabled on labour lines; "None" option in parts vendor dropdown; "Misc" added as classification (LATER MOVED to standalone type in QB-8); compat shim clears vendor on labour (**FLAGGED FOR REVERT — see §3.1**) |
| QB-7 Phase 1 | (inspect only) | Layout diagnostic |
| QB-7 Phase 2 | #28 | Sidebar `w-64→w-52` (256→208px); sidebar internal padding tightened; builder/preview split 3:2→7:3; Name + Description width floors (`min-w-[10rem]`); Vendor/SKU/Qty/Margin cells trimmed |
| QB-7 Phase 3 | #29 | Builder/preview split 7:3→4:1; collapsible preview toggle ("Hide PDF preview ›" / "‹ Show PDF preview"); session-only state |
| QB-8 | #30 | Misc as standalone line type alongside Product/Labour; new "+ Misc" button; Misc removed from parts/labour Type dropdowns; compat shim migrates legacy Misc-classified lines to `type: "misc"` |

## 2. Sprint queue (priority order, all pre-spec'd)

1. **QB-6b** — Revert the destructive vendor-clear compat shim from QB-6 (~10-line removal in `lib/quote-store.ts`). Per **Past-data preservation principle** (§3.1).
2. **QB-5b** — Settings page for admin-managed labour classifications. Currently hardcoded in `lib/classifications.ts`; Jay needs to add types like Installation Labour, Programming Labour, System Design Labour, Freight, Cable Pulling Labour, etc. without code changes. Requires Supabase table + API + admin UI.
3. **QB-4** — PDF visibility toggles per-quote (vendor name, part #, part name, part description, unit price column). Defaults OFF for vendor name and part #. Same UX pattern as existing show-unit-price toggle.
4. **QD-2** — Full design overhaul per Claude Designer spec (§4). Includes Letter→A4 page size migration. Cascades through all 6 pages and print CSS.
5. **Inventory Sprint (INV-1 → INV-6)** — Foundation for product catalog, inventory tracking with per-lot cost layering, and the Catalog Browser button in the quote builder (§5).

## 3. Architectural locks (new this session)

### 3.1 Past-data preservation principle (NEW — locked)

Compat shims in client code must be **non-destructive normalization**:

**Acceptable** patterns:
- Schema rename with intent preservation (QB-2 `markup`→`margin` — mathematically equivalent; QB-3 `hours/rate`→`qty/unitPrice` — preserves total)
- Adding new fields with sensible defaults (QB-5a classification backfill)
- Type-union migration when math is unaffected (QB-8 Misc-classified → type `misc`)

**Forbidden** patterns:
- Wiping data without preservation (QB-6 vendor-clear: **to be reverted in QB-6b**)
- Mutating values that change business meaning

Going forward, schema changes that need to mutate persisted records require **explicit one-time Supabase migration scripts with rollback plans** — not silent client-side wipes.

### 3.2 Page size: A4 (overrides previous Letter lock — Session AA's lock supersedes)

Per Claude Designer handoff. QD-2 work migrates from Letter (8.5×11) to A4 (210×297mm). All 6 pages, all schedule layouts, and the print CSS (`@page { size: A4; margin: 0 }`) affected. Note: this **overrides** the Letter lock recorded in Session AA's architecture-locks list.

### 3.3 Inventory: specific-identification cost tracking (NEW — locked)

Each purchase-order receipt creates an "inventory lot" with its own `unit_cost`. Catalog views show **all lots** per product (qty + cost breakdown). Allocating inventory to a job requires explicit lot selection; the allocation's cost-per-unit is **locked at allocation time** from the selected lot. Enables precise quoted-vs-actual cost analysis per job.

NOT FIFO. NOT LIFO. NOT weighted-average. **Specific identification.**

## 4. QD-2 Design Spec (LOCKED — paste into Claude Code at QD-2 sprint kickoff)

### 4.1 Page format (overrides Session AA's Letter lock)
- A4: 210×297mm physical; **800×1131px** on screen at 96dpi
- Gutter / page padding: **64px** inside each sheet
- Print CSS: `@page { size: A4; margin: 0 }`

### 4.2 Document structure (6 pages, ordered)
1. **Cover** — wordmark, FOR/AT parties, particulars strip, scope drop-cap
2. **Schedule I — Bill of Materials** — centered cost-center title (e.g. *ACCESS CONTROL*); 4-column REF/DESCRIPTION/QTY/AMOUNT table; totals stack ending in italic accent total
3. **Schedule II — Drawings & Take-off** — drafting sheet: dotted grid, floor plan with reader pins, take-off chips, title block with drafting metadata
4. **Schedule III — Programme of Works** — five phase cards + Gantt with dependency arrows + commencement note
5. **Schedule IV — Warranty & Service** — 2×2 ornamented warranty cards (Gold/Platinum) + exclusions list
6. **Schedule V — Terms & Conditions** — 6 numbered T&C blocks in 2 columns + recap strip + dual signature block

### 4.3 Color palette (replaces QD-1 default-theme values)
- Ambience (page bg): jet `#121212` (was QD-1 `#212327`)
- Accent (champagne): `#b4924c` (was QD-1 `#AF9357`)
- Ink (bone): `#f6f0e2`
- Soft: `#dcd3bb`
- Muted: `#b1a487`
- Deep-muted: `#8c8167`

### 4.4 Typography
- Primary pair: Cormorant Garamond × Inter
- Also loaded (per Designer): Playfair Display, EB Garamond, Cardo, Plus Jakarta Sans, JetBrains Mono
- Display headings + section titles: italic Cormorant Garamond
- Body italic: true Cormorant italic
- **All numbers** (`Q-2026-0001`, prices, dates, %, week numbers, page count): Cormorant Garamond **lining figures** via `font-variant-numeric: tnum lnum`, weight 500, `letter-spacing: 0.015em`, **NEVER italic** — enforced by `.num` / `.num-sans` class with `font-style: normal !important`
- Section title pattern (used at every schedule head): ornamental rule above → `❦` centered → 10px sans **eyebrow** letterspaced 0.5em → 42px italic accent-colored display word

### 4.5 Visual treatment
- Backgrounds: flat color + **glossy overlay only** (no real gradients) — narrow diagonal specular sweep + soft top-center sheen + edge vignette
- Ornament glyph: `❦` (not `◆`) for divider centerpieces
- Dual signature lines: `borderBottom: 1px solid ink` for signature row; thinner `0.5px solid accent` for printed name and title

### 4.6 Implications for QD-2 implementation
- Page size migration cascades through all 6 pages + print CSS — not just the cover
- Section-title pattern needs a shared component applied uniformly to Schedules I–V
- New `.num` typography class defined globally; applied to every numeric rendering site
- New theme slots needed: `soft`, `muted`, `deepMuted` (in addition to existing `ink`/`accent`/`ambience` plus QD-1's `brandPrimary`/`brandSecondary`/`accentMuted`)
- Glossy overlay layer is new architecture (no current equivalent in QuoteDocument.tsx)

## 5. Inventory Sprint (LOCKED — multi-chunk, post-quote-finalization)

### 5.1 INV-1 — Schema migration (foundational, must ship first)

Tables required:
- `products` — `id`, `sku`, `name`, `description`, `category_id`, `subcategory_id`, `manufacturer`, `default_vendor_id`, `attributes` (JSONB for category-specific data — cable strand count, camera resolution, etc.), `is_active`, `created_at`, `updated_at`
- `product_categories` — `id`, `name`, `parent_id` (self-ref for hierarchy), `display_order`
- `vendors` — `id`, `name`, `code` (ADI / ANIXTER / WESCO / CDW / ...), `api_endpoint` (nullable), `integration_status`
- `inventory_lots` — `id`, `product_id`, `purchase_order_id`, `qty_received`, `qty_remaining`, `unit_cost`, `received_at`, `vendor_id`
- `inventory_allocations` — `id`, `lot_id`, `job_id`, `qty_allocated`, `unit_cost_locked` (snapshot of `lot.unit_cost` at allocation time), `allocated_at`, `allocated_by`, `returned_at`, `return_reason`

Indexes: `products(sku)`, `products(category_id)`, `inventory_lots(product_id, qty_remaining)`, `inventory_allocations(job_id)`.

RLS: standard tenant + admin/manager permission gates.

### 5.2 INV-2 — Catalog page (browse + manage products)
Sidebar: Inventory → Catalog.
- List view: filter by category, vendor, active/inactive
- Detail view: product info + **per-lot breakdown** (each lot shown with qty available and unit cost; total qty rolled up)
- Admin CRUD for products and categories
- Connects to vendor catalogs (future enhancement; INV-1/2 just need the schema and manual entry)

### 5.3 INV-3 — Receive flow (PO → creates lots)
Sidebar: Orders → Purchase Orders.
- Receive screen: select PO; for each line confirm `qty_received` and `unit_cost`
- Submit creates `inventory_lots` rows with `qty_received = qty_remaining`
- Multiple receipts against the same PO line allowed (creates multiple lots)

### 5.4 INV-4 — Allocation flow with lot-picker + cost-lock
Triggered from:
- Quote builder (after Catalog Browser button — INV-6 — converts a quote to a job)
- Job edit page directly

Picker UI: table showing each lot for the selected product with `qty_remaining` and `unit_cost`. User picks a lot + enters qty → writes `inventory_allocations` + decrements `lot.qty_remaining`. `unit_cost_locked` is snapshotted from the lot at this moment.

### 5.5 INV-5 — Counts (physical reconciliation)
Sidebar: Inventory → Counts.
- Manual or scheduled count entry
- Variance report: counted vs system qty
- Adjustment writes (positive or negative lots)

### 5.6 INV-6 — Catalog Browser in quote builder (capstone)
"+ Catalog" button alongside "+ Product line" / "+ Labour line" / "+ Misc" (per QB-8).

Opens large drawer or modal:
- Hierarchical filter: category → subcategory → vendor → attributes (cable strand count, camera resolution, etc. — see `products.attributes` JSONB)
- Search box: matches `name`, `description`, `sku`
- Each result row: full part details + lot breakdown (qty available + cost per lot) + total
- Click row → expand to lot-picker (if multiple lots exist) → enter qty → adds to BOM with cost from selected lot
- Single-lot products skip the picker step
- Vendor catalogs eventually integrate via API (ADI / Anixter / Provo); INV-6 initially works against manually-entered products

## 6. Quote line-item structure (current state after QB-8)


```ts
export type BuilderLineItemType = "product" | "labor" | "misc";

export interface BuilderLineItem {
  id: ID;
  type: BuilderLineItemType;
  vendor?: Vendor;             // optional; disabled for labour; available for product/misc
  productId?: ID;
  sku?: string;
  name: string;                // required
  description?: string;
  qty: number;
  unitCost: number;
  margin: number;              // percentage 0-99 (40 = 40%)
  unitPrice: number;           // computed from unitCost / (1 - margin/100)
  classification?: string;     // catalog name from lib/classifications.ts
  notes?: string;
}
```



Math (unified across all three types):
- `lineItemTotal = qty * unitPrice`
- `lineItemCost = qty * unitCost`
- `recalcLineItem` applies margin formula identically for all types

Defaults by type:
- `product`: classification "Materials", margin 40, qty 1
- `labor`: classification "Technician Labour", margin 40, qty 8, unitCost 87, unitPrice 145 (preserves $145/hr billing rate)
- `misc`: classification "Misc", margin 40, qty 1, everything else 0/empty

## 7. Classifications catalog (current — to be moved to Supabase in QB-5b)


```ts
LINE_ITEM_CLASSIFICATIONS = [
  { name: "Materials",            appliesTo: "product", order: 1 },
  { name: "Subcontractor Labour", appliesTo: "labor",   order: 2 },
  { name: "Technician Labour",    appliesTo: "labor",   order: 3 },
  { name: "Project Management",   appliesTo: "labor",   order: 4 },
  { name: "Misc",                 appliesTo: "misc",    order: 1 },
];
```


QB-5b will add (via admin UI): Installation Labour, Programming Labour, System Design Labour, Freight, Cable Pulling Labour, and any others Jay defines.

## 8. Compat-shim ledger (lib/quote-store.ts readOverrides)

In order of application (each touches every line on every quote load):

1. **QB-2** — `markup` → `margin`: `margin = round(markup / (100 + markup) * 100)`, delete `markup`. (Acceptable: schema rename, intent preserved.)
2. **QB-3** — labour `hours/rate` → unified fields: `qty = hours`, `unitPrice = rate`, `unitCost = round2(rate * (1 - margin/100))`, delete `hours`/`rate`. Backfill `name: ""` if missing. (Acceptable: schema rename, intent preserved.)
3. **QB-5a** — classification backfill: if `classification === undefined`, set to `"Materials"` (product) or `"Technician Labour"` (labor). (Acceptable: default fill.)
4. **QB-6** — vendor-clear on labour: if `type === "labor" && vendor !== undefined`, set `vendor = undefined`. **VIOLATES past-data principle. SCHEDULED FOR REVERT IN QB-6b.**
5. **QB-8** — Misc-classified → type migration: if `classification === "Misc" && type !== "misc"`, set `type = "misc"`. (Acceptable: schema-only, math unchanged.)

## 9. Layout state (after QB-7 all phases)

- Global sidebar: `w-52` (208px); nav `px-2.5`, item `px-2.5`, `gap-2.5`
- Content offset: `pl-52` in AppShell
- Quote builder grid: `lg:grid-cols-5` by default (or absent when preview collapsed); builder `lg:col-span-4`, preview `lg:col-span-1`
- Preview pane: 4:1 ratio, collapsible via session-state toggle ("Hide PDF preview ›" / "‹ Show PDF preview")
- Line-item table cell widths: Vendor `w-24`, SKU `w-24`, Name `min-w-[10rem]`, Description `min-w-[10rem]`, Qty `w-14`, Unit cost `w-24`, Margin `w-14`, Unit price `w-24`, Line total `w-24`, Type `w-36`

## 10. Color tokens currently in code (default_theme_grayish, after QD-1 phases)

- ambience: `#212327` (Jay's RGB 33/35/39) — TO BE CHANGED TO jet `#121212` in QD-2
- accent: `#AF9357` (Jay's RGB 175/147/87) — TO BE CHANGED TO champagne `#b4924c` in QD-2
- ink: `#EFE8D8` (Jay's RGB 239/232/216) — TO BE CHANGED TO bone `#f6f0e2` in QD-2
- brandPrimary: `#5EC269` (NEX green)
- brandSecondary: `#FFFFFF` (VELON/GLOBAL white)
- accentMuted: `#978C73` (dusty subtitle gold)

Other 12 themes leave new optional slots undefined and fall back to `accent` — unchanged from pre-QD-1 behavior.

## 11. Operating companies (locked, unchanged from Session AA)

- **Nexvelon Integrated Solutions Inc.** — HST/GST 785486770 RT0001
- **Nexvelon Guardian Inc.** — HST/GST 785486770 RT0001 (FLAG: same number, likely needs own registration)
- Both at: Unit 104, 350 Rutherford Rd S, Plaza II, Brampton, ON L6W 4N6
- Both license trade name "Nexvelon Global" from holding co
- Both templates enabled in QUOTE_TEMPLATES (`lib/company-profile.ts`); Guardian's footer correctly shows "NEXVELON GUARDIAN INC." after QB-1b cleanup

## 12. Permissions rule (locked, unchanged from Session AA)

Every employee defaults to Integrated Solutions access only. Guardian access is admin-granted and time-limited. Already enforced in CL-2 `validateClientPayload` for `allowed_opcos`. Will be enforced on Guardian template selection in a future chunk (currently both templates selectable by anyone since Jay is admin-only user).

## 13. Sidebar architecture (locked, unchanged from Session AA)

Dashboard / People / Sales / Jobs / Inventory / Orders / Systems Configuration / Invoices / Scheduling / Financials / AI / Reports / Settings

- People: Clients · Sites · Users · Employees · Vendors · Contractors · Misc Contacts
- Sales: Leads (Project/Service/Closed-Archived) · Quotes (Project Open/Service/Closed-Archived)
- Jobs: Projects · Service · Recurring Jobs
- Inventory: Allocation · Catalog · Counts
- Orders: Purchase Orders
- Systems Configuration: Extract info · Drawing Takeoff · System Design · Commissioning Files · Access Control · CCTV · Intercoms · ULC Fire · Intrusion · Monitoring · Integration
- Invoices: Contractor · Vendor
- Scheduling: Create-View · Timesheets · Work Orders · Task
- Financials: Financial Operations · Employee Salary-Commissions

## 14. Process notes (locked)

- One chunk = one PR (no compressed/parallel chunking)
- Branch naming: `feature/<scope>-<chunk-id>-<short-name>` for features; `docs/<topic>` for docs
- Commit format: `<type>(<scope>): <Chunk ID> — <description>`
- Vercel auto-deploys from `main` on push
- This repo auto-deletes merged branches (configured behavior, not an error)
- Follow-up commits require a fresh PR if the previous PR is already merged
- DB migrations via Supabase Dashboard SQL Editor only — no CLI, no GitHub Actions for DB
- Smoke files in `supabase/migrations/` alongside migrations, temp-table aggregation pattern, single final SELECT
- **NEVER run `scripts/wipe-test-data.sql`**
- Architectural decisions and forward-feature commitments captured in session handoffs (`NEXVELON_SESSION_<X>_HANDOFF.md`) as they're made

## 15. Big roadmap items (captured, not active — Session AA still authoritative)

- AI assistant scoped per user permissions
- Systems Configuration auto-design engine (RFP → takeoff + 2D/3D + commissioning + parts list + cable counts + permits)
- Vendor integrations (ADI/Provo/Anixter APIs)
- QuickBooks sync
- Client intake form template (PDF/Word/email, versioned upload-back)
- Full CSV/PDF/Excel export/import
- Credit-card surcharge on invoices (2.5% + HST flag captured on client record in CL-2)
- Mobile field app + external client portal

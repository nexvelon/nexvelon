# Nexvelon ERP — Handoff: Session AG
**Status:** post-Inventory-Sprint (PRs #96–#106 merged to `main`)
**Supersedes:** `docs/HANDOFF-SESSIONS-AE-AF.md` (kept as history; covered PRs #70–#94)
**Paste this doc inline at the start of the next session to restore context.**

---

## 1. Executive summary — where the build is
The Nexvelon ERP has completed the **Inventory Sprint (INV-1 → INV-6)**. Inventory is now a live, real-data module on a two-table specific-identification schema: catalog CRUD, bulk xlsx import, stock receiving + unit lifecycle, site allocation, activity logging, real-cost quote lines, low-stock alerting, and a reports tab. DB migrated through **0022**; `main` auto-deploys to https://app.nexvelonglobal.com via Vercel. Next phase: the **testing pass** (§10), then deferred-backlog chunks (§9).

## 2. Environment & access
- **Repo:** `github.com/nexvelon/nexvelon` (private). Claude **cannot** access it — repo context arrives via this doc + operator-run Phase 1 inspects.
- **App:** https://app.nexvelonglobal.com — Vercel, auto-deploys from `main`.
- **DB:** Supabase. Migrations run **only** via the Dashboard SQL Editor (never CLI). **Never** run `scripts/wipe-test-data.sql`.
- **Operator:** Jay runs every spec through Claude Code and pastes results back; Claude does not run git/gh itself.

## 3. Operator workflow rules
- **One spec per turn.** No batching; paste CC's result before the next spec.
- **Decisive specs** — no options menus. Genuine forks → 1–3 tappable questions, then proceed.
- **Two-phase for big chunks:** Phase 1 read-only inspect (no branch/edits) → Phase 2 implementation. Small chunks ship in one spec with embedded pre-flight.
- **Inline SQL** for migrations, Supabase Dashboard SQL Editor only.
- **One chunk = one PR, NON-draft.** Branches `feature/`/`fix/`/`polish/`/`docs/`. Commits `<type>(<scope>): <Chunk ID> — <description>`.
- **After each merged PR:** sprint dashboard table → "What's next?" tappable options. Always state the merge step + PR link before the next chunk.
- **Smoke files:** temp-table aggregation + FAILs-first ORDER BY; pure-DDL verifies COMMIT (not ROLLBACK).

## 4. Architectural locks (do not violate)
- **§2.1 Past-data preservation.** History is never destructively overwritten; protective FKs use `ON DELETE RESTRICT`.
- **§2.2 Snapshot Principle.** Moment-in-time values (e.g. a quote line's cost) are snapshotted at write-time and stay immutable even if the source later changes.
- **§2.4 Inventory specific-identification.** Each physical unit / bulk lot carries its **own** cost row. **No** average / FIFO / LIFO costing, ever. On-hand qty, avg cost, by-location are **computed at the API layer, never stored.**

## 5. Schema state — through migration 0022
Pre-sprint tables: clients, sites, contacts + supporting (classifications, margin tiers, drawings, audit, activity_log, users). Site code-generation lives in `lib/api/clients.ts` — **correction:** prior §5 wrongly listed `lib/api/sites.ts`, which does not exist.

**New (specific-identification, two tables):**

`inventory_products` (catalog) — migration **0021**
- `id`, `sku` (UNIQUE, operator-entered), `name`, `description`
- `category`/`manufacturer`/`vendor` — **free-text** (no CHECK; UI dropdowns union existing values)
- `tracking_mode` CHECK(`serialized`|`bulk`) default `serialized`
- `unit_of_measure` default `each`, `default_unit_cost` numeric(12,2), `list_price`, `reorder_point`, `reorder_qty`, timestamps

`inventory_stock` (one row per serialized unit qty=1, or per bulk lot qty=N) — **0021**, `site_id` added **0022**
- `id`, `product_id` FK→inventory_products `ON DELETE RESTRICT`
- `serial_number` (partial-unique index where not null)
- `unit_cost` numeric(12,2) NOT NULL — **the §2.4 per-unit cost**
- `quantity` CHECK(>0) default 1, `location`, `supplier`
- `status` CHECK(`in_stock`|`allocated`|`consumed`|`retired`) default `in_stock`
- `acquired_at` date, `notes`, timestamps
- `site_id` uuid FK→sites `ON DELETE RESTRICT` + index (**0022**)

Migrations: …0020, **0021_inventory_schema.sql**, **0022_inventory_stock_site_allocation.sql**. Smokes: `smoke_inv1.sql`, `smoke_inv3.sql`. **Both applied + smokes passed (operator-confirmed).** RLS mandatory on every table (`select_authenticated USING(true)` + `write_authenticated FOR ALL`).

## 6. Inventory module — code map
**API `lib/api/products.ts`** (new): `listProducts`, `getProductById`, `getProductRowById`, `createProduct`, `updateProduct`, `deleteProduct`, `listStockForProduct`, `bulkCreateProducts`, `receiveStock`, `updateStockUnit`, `deleteStockUnit`, `allocateUnitToSite`, `returnUnitToStock`, `getInventoryReportData`. Types: `ReceiveStockInput`, `AgingBucket`, `InventoryReportData`.
> **Path A adapter:** `listProducts()` rolls the two tables into the legacy aggregate `Product` shape (`lib/types.ts`); `avgCost` is display-only/computed, never stored. `getInventoryReportData()` sums real `inventory_stock` rows server-side for §2.4-accurate valuation.

**`lib/api/`:** activity-log · audit · classifications · clients · drawings · margin-tiers · **products** · users. (No `sites.ts`.)

**Routes `app/(app)/inventory/`:** `page.tsx` (RSC, force-dynamic) → `InventoryPageClient.tsx` (7-tab UI), `actions.ts` (server actions + `logActivity`), `new/{page,NewProductPageClient}.tsx`, `[id]/{page,ProductDetailClient}.tsx`.

**Components `components/modules/inventory/`:** StockTab, ProductForm, ImportProductsButton, ReceiveStockForm, EmailLowStockButton, **ReportsTab** (real data) + still-**mock**: AllocationsTab, TransfersTab, PurchaseOrdersTab, VendorsTab, CategoriesTab. Quote catalog: `components/modules/quotes/builder/catalog-context.ts`.

**Types `lib/types/database.ts`:** `ActivityEntityType = "client"|"site"|"contact"|"inventory"`; `ActivityChanges = Record<string,{from,to}>`; `InventoryTrackingMode`; `InventoryStockStatus`; `DbInventoryProduct`/Insert/Update; `DbInventoryStock`/Insert/Update (incl. `site_id`). UI aggregate `Product` in `lib/types.ts`.

**Helpers:** `lib/inventory-data.ts` (`movementHistory()` is a synthetic stub → `[]`); `lib/format.ts`; `lib/auth/email.ts` (Resend: `sendOtpEmail`, `sendLowStockAlert`). Charts: `recharts` (dashboard + ReportsTab, **dynamically imported** to keep it off the main inventory bundle).

## 7. Tech stack — versions
next 15.5.15 · react 19.1.0 · @base-ui/react ^1.4.1 · @supabase/ssr ^0.10.2 · @supabase/supabase-js ^2.105.1 · exceljs ^4.4.0 · recharts ^3.8.1 · resend ^6.12.2. (base-ui DropdownMenu/Select: no `asChild`; Select handles `string|null`.)

## 8. Inventory Sprint ledger — DONE (#96–#106)
| Chunk | PR | What |
|---|---|---|
| INV-1 | #96 | Schema (migration 0021, smoke_inv1) |
| — | #97 | Polish: reset-password email branding |
| INV-2a | #98 | Products API + Stock tab on real data (Path A) |
| INV-2b | #99 | Catalog CRUD + new/detail/edit routes |
| INV-2c | #100 | Bulk xlsx import |
| INV-2d | #101 | Receiving + unit lifecycle |
| INV-3a | #102 | Activity-log wiring (entity "inventory" + 7 seams) |
| INV-3b | #103 | Site allocation (migration 0022, smoke_inv3) |
| INV-4 | #104 | Quote lines pull real catalog cost (snapshot) |
| INV-5 | #105 | Low-stock badge + email report |
| INV-6 | #106 | Reports (valuation / aging / consumption proxy) |

(Prior session AE-AF: #70–#94; #95 last merge before this sprint.)

## 9. Deferred backlog — future chunks
- **Quotes → DB persistence** (currently localStorage) — unblocks **specific-stock-unit pinning** + **stock-decrement-on-quote-approval**.
- **Partial-bulk allocation** (M of N; needs row-splitting — today whole-row only).
- **`/sites/[id]` detail page.**
- **Scheduled low-stock cron digest** + recipients (needs `vercel.json` cron + authed `api/cron` route + `CRON_SECRET`); today's alert is on-demand to the signed-in user only.
- **Movements ledger** → unlocks **true turnover ratio** (INV-6 currently uses a consumption-90d proxy, labeled approximate).
- **CSV/PDF report export.**
- **Promote mock inventory tabs** (Allocations/Transfers/PO/Vendors/Categories) + stubbed header buttons (Reorder/Receive PO/Stock count/Adjust) to real data.
- **Project-vs-site reconciliation** — mock AllocationsTab is project-centric, DB+allocation are site-centric; **needs a business decision** first.
- **Code debt:** `site_code` UNIQUE; `updated_by`/`deleted_by` on sites/contacts; `roundCRA` float fix; `DEFAULT_LABOR_RATE` removal; per-unit field-edit (cost/serial/location) on detail page.
- **Per-user permission/visibility system** — `hasPermission(role,module,action)` framework exists (e.g. `inventory:viewCost`) to build on.

## 10. Testing-pass checklist (data-dependent)
- **INV-2a/b** — CRUD; delete a product **with stock** → friendly FK-RESTRICT message.
- **INV-2c** — xlsx template round-trips; dup SKUs skipped (warn-and-proceed); per-product import logged.
- **INV-2d** — serialized receive → N rows qty 1; bulk → one row qty N; row status menu consume/retire/restore/delete.
- **INV-3a** — activity log shows inventory events (entity_id = product id); empty diffs skipped.
- **INV-3b** — allocate unit → status `allocated` + Site column; return-to-stock; whole-row only.
- **INV-4** — quote line pulls `default_unit_cost`, snapshotted (later catalog change doesn't move existing line).
- **INV-5** — reorder_point > on-hand → Low badge + amber + stat count; Email report → email + toast; no-low / no-email → friendly toasts.
- **INV-6** — valuation + by-category match Σ(unit_cost×qty) over in_stock; aging buckets (null acquired_at → "Unknown"); consumed → Consumption-90d + caption; **viewCost OFF** → $ hidden, counts show; empty catalog → graceful.
- **Cross-cutting** — inventory header crowding is a known layout-tidy item.

## 11. Outstanding operator steps
- **Migrations 0021 (+smoke_inv1) / 0022 (+smoke_inv3):** ✅ applied + passed (confirmed).
- **Company IT / Microsoft 365 (separate workstream): DKIM toggle pending.** selector1/selector2 `._domainkey` CNAMEs added at Namecheap 2026-06-03; Microsoft needs 2–4 days to sync. **Flip DKIM → Enabled ~June 7–8, 2026** at security.microsoft.com → Email & collaboration → Policies & rules → Threat policies → Email authentication settings → DKIM (domain `nexvelonglobal.com`). Completes the SPF+DKIM+DMARC trio. Email is already live; this is the final auth step.

## 12. Resume — next session
1. Paste this doc.
2. Default next phase: the **testing pass (§10)**; file fixes as `fix/` chunks.
3. Then the **deferred backlog (§9)** — likely first: Quotes→DB persistence (unblocks two dependents).
4. Keep §3 workflow rules + §4 architectural locks in force.

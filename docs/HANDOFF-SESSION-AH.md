# Nexvelon Enterprise Suite — Handoff (Session AH)
**Status:** post-Inventory-Sprint feature push — chunks A–F merged to `main`.
**Supersedes:** `docs/HANDOFF-SESSION-AG.md` (retained as history; covered the Inventory Sprint, PRs #96–#106).
**Current as of:** PR #126 / migration 0027.
**Paste this doc inline at the start of the next session to restore context.**

---

## 1. How to use this doc / purpose
This is the running source of truth for a non-technical owner (Jay) + a single strategic architect (Claude). Paste it to restore full context, then continue chunk-by-chunk. AH covers the **post-Inventory-Sprint feature push**: chunks **A–F** (PRs **#108–#126**, migrations **0023–0027**) — UI polish, settings-managed vocabularies, search aliases, non-serialized tracking, cost-grouped stock detail + per-unit editing, an Excel-template overhaul, ten new themes, product add-ons, and the full **Quotes → DB persistence** epic with stock pin / approve / commit. Same framing and voice as AG — AH is a successor, not a rewrite.

## 2. Environment & operator/workflow model
- **Repo:** `github.com/nexvelon/nexvelon` (private). Claude **cannot** access it — repo context arrives via this doc + operator-run Phase 1 inspects.
- **App:** https://app.nexvelonglobal.com — Vercel, auto-deploys from `main`.
- **DB:** Supabase. Migrations run **only** via the Dashboard SQL Editor (never CLI/scripts). **Never** run `scripts/wipe-test-data.sql`.
- **Operator:** Jay is the non-technical owner; he runs every spec through Claude Code and pastes results back. Claude does not run git/gh itself.
- **One spec per turn.** No batching; paste CC's result before the next spec.
- **Claude = sole strategic architect.** Decisive specs — no options menus. Genuine forks → 1–3 tappable questions, then proceed.
- **Two-phase for big chunks:** Phase 1 read-only inspect (no branch/edits) → Phase 2 implementation. Small chunks ship in one spec with embedded pre-flight.
- **Inline SQL** for migrations, Supabase Dashboard SQL Editor only.
- **One chunk = one PR, NON-draft.** Branches `feature/`/`fix/`/`polish/`/`docs/`. Commits `<type>(<scope>): <Chunk ID> — <description>`.
- **After each merged PR:** sprint dashboard table → "What's next?" tappable options. Always state the merge step + PR link before the next chunk.
- **Smoke files:** temp-table aggregation + FAILs-first ORDER BY; pure-DDL verifies COMMIT (not ROLLBACK); a round-trip verify uses ROLLBACK so no test data persists.

## 3. Architectural locks (do not violate)
- **§2.1 Past-data preservation.** History is never destructively overwritten; protective FKs use `ON DELETE RESTRICT`. *This session:* the `tracking_mode` CHECK was **widened via DROP + RE-ADD** to add `non_serialized` (0025) — never narrow a CHECK; dormant columns stay (`reorder_qty` is now vestigial but **kept**, not dropped).
- **§2.2 Snapshot Principle.** Moment-in-time values (e.g. a quote line's cost) are snapshotted at write-time and stay immutable even if the source later changes. *This session:* the F-2 pin captures a stock unit's **real cost at pin time**, and F-3b commit does **not** re-read cost — editing the underlying stock unit later never moves a pinned/committed line.
- **§2.4 Inventory specific-identification.** Each physical unit / bulk lot carries its **own** cost row. **No** average / FIFO / LIFO costing, ever. On-hand qty, avg cost, by-location are **computed at the API layer, never stored.** *This session:* `consumeStock` (F-3b) consumes a whole lot **or splits it** (insert a discrete `consumed` row for the committed qty, reduce the source) — never averages.
- **§2.5–§2.8 (carried from AG):** hard-delete model with the activity-log as the audit trail; form-to-fullscreen extraction (shared body component used by both drawer + standalone route); inheritance UX = store NULL + one-time copy on toggle-off (no live re-sync); best-effort activity logging (failures never block the mutation, empty-diff skip).
- **DB field names are stable under UI relabels.** UI text changed this session (`sku` → "Part #", `reorder_point` → "Low-stock at") but the **DB columns and code identifiers are unchanged** — never rename a load-bearing key to match a label (the xlsx import column key is also load-bearing).
- **RLS mandatory** on every table (`select_authenticated USING(true)` + `write_authenticated FOR ALL`); writes additionally gated at the server-action layer where appropriate (`requireAdmin`).

## 4. Tech stack — versions
next 15.5.15 · react 19.1.0 · @base-ui/react ^1.4.1 · @supabase/ssr ^0.10.2 · @supabase/supabase-js ^2.105.1 · exceljs ^4.4.0 · recharts ^3.8.1 · resend ^6.12.2.
- **@base-ui** DropdownMenu/Select: **no `asChild`** (className goes on the trigger); `Select` `onValueChange` passes `string | null` (coerce with `?? ""`).
- **recharts** is **dynamically imported** (ReportsTab) to keep it off the main inventory bundle; **exceljs** is dynamic-imported in the template module for the same reason.

## 5. Schema state — through migration 0027
Pre-sprint tables: clients, sites, contacts + supporting (classifications, margin tiers, drawings, audit, activity_log, users). Inventory two-table specific-identification base (`inventory_products` + `inventory_stock`) landed in **0021–0022** (see AG §5). **Site code-generation lives in `lib/api/clients.ts` — there is NO `sites.ts`.** Clients have **no top-level `country` column** (only `billing_country` / `mailing_country`).

**Migrations added since AG (all applied + smoke-passed in Supabase; Jay verified each — 0027 underpins the quote-store cutover):**
- **0023 `inventory_vocab`** — settings-managed dropdown vocabularies. `kind` CHECK(`category`|`manufacturer`|`unit_of_measure`|`storage_location`), `UNIQUE(kind,name)`, `is_active` soft-delete, RLS, `handle_updated_at` trigger. The seeded **`Default` storage_location is protected** (cannot be deactivated); deactivating any other storage_location **reassigns its stock rows to `Default`**. (smoke_b1)
- **0024** — `inventory_products.search_aliases text[] NOT NULL '{}'` (alternate search terms). (smoke_c1)
- **0025** — `tracking_mode` CHECK **widened** → `serialized|bulk|non_serialized` (drop + re-add the auto-named `inventory_products_tracking_mode_check`); `inventory_stock.po_number text` (stamped on receipts). (smoke_c2a)
- **0026** — `inventory_products.notify_addons boolean NOT NULL false` + `addons jsonb NOT NULL '[]'` (ordered `[{kind:'part'|'text', value}]`; `part` values are product UUIDs, resolved-or-skipped at render — no FK on the JSON refs). (smoke_d1)
- **0027 `quotes`** — **TEXT pk** (`q-xxxxxxxx`, app-minted via `newId`, not UUIDs), the full Quote stored as `data jsonb`, plus indexed mirror columns (`number`/`client_id`/`site_id`/`status`/`owner_id`/`total`) for listing. `status` CHECK(`Draft`|`Sent`|`Approved`|`Rejected`|`Expired`|`Converted`), RLS + `handle_updated_at` trigger. **`client_id`/`site_id` are uuid columns but NOT FK'd** (deferred integrity — §14). (smoke_f1a)

`inventory_stock` lots carry `quantity` (CHECK >0), per-unit `unit_cost`, `location`, `supplier`, `po_number`, `status`(`in_stock|allocated|consumed|retired`), `site_id`, `acquired_at`, and `notes` (the traceability slot — commit stamps "Committed to <quote #>").

## 6. API surface
- **`lib/api/products.ts`** — full inventory lifecycle: `listProducts` / `getProductById` / `getProductRowById` / `createProduct` / `updateProduct` / `deleteProduct`, `listStockForProduct`, `receiveStock`, `updateStockUnit`, `deleteStockUnit`, `allocateUnitToSite` / `returnUnitToStock`, `bulkCreateProducts`, `getInventoryReportData` (+ `InventoryReportData` / `AgingBucket`), and **`consumeStock`** (F-3b: in_stock guard → over-consume guard → full-flip OR split-insert; returns the consumed row id). `Product` adapter (`toProduct`) rolls the two tables into the legacy aggregate shape — `avgCost`/on-hand/by-location computed, never stored.
- **`lib/api/inventory-vocab.ts`** *(new)* — `VocabKind`, `DbInventoryVocab`, `listVocab` / `createVocab` / `updateVocab` / `softDeleteVocab` / `restoreVocab`.
- **`lib/api/quotes.ts`** *(new)* — `listQuotes` / `getQuoteById` / `upsertQuote` / `deleteQuote` (jsonb-blob model; the `data` column IS the full Quote, mirror cols derived; `client_id`/`site_id` coerced to null when non-uuid).
- **`lib/api/clients.ts`** holds the client **and** site API (no `sites.ts`).
- **Server actions:** `app/(app)/inventory/actions.ts` (incl. `listStockForProductAction`, `commitStockUnitAction`, low-stock email, vocab-fed reads); `app/(app)/settings/inventory-vocab-actions.ts` (writes `requireAdmin`); `app/(app)/quotes/actions.ts` (`list/get/upsert/deleteQuoteAction`).

## 7. Key file locations (current)
- **`lib/api/`:** activity-log · audit · classifications · clients · drawings · **inventory-vocab** · margin-tiers · products · **quotes** · users.
- **Inventory components (`components/modules/inventory/`):** StockTab, ProductForm, ImportProductsButton, ReceiveStockForm, **EditStockUnitForm**, EmailLowStockButton, ReportsTab (all real-data) + still-**mock**: AllocationsTab, TransfersTab, PurchaseOrdersTab, VendorsTab, CategoriesTab.
- **Inventory routes:** `app/(app)/inventory/page.tsx` (RSC) → `InventoryPageClient` (7-tab UI), `actions.ts`, `new/`, `[id]/{page,ProductDetailClient}` (cost-grouped stock view).
- **Quote builder (`components/modules/quotes/builder/`):** QuoteBuilder, BuilderHeader, LineItemRow, SectionCard, SkuAutocomplete, CommandPalette, **StockUnitPicker** (F-2 pin), **CommitStockDialog** (F-3b), **AddonPrompt** (D-2), **addons-context.ts**, **catalog-context.ts**, QuoteDocument/PdfPreviewPane, SchedulesCard, etc.
- **Settings (`components/modules/settings/`):** SettingsPanes, BrandingThemes (14-theme picker), ClassificationsPane, MarginTiersTable, **InventoryVocabPane** (Settings → "Inventory Lists"), BackupsData.
- **Libs:** `lib/quote-store.ts` (DB-backed façade), `lib/theme.ts` (14-theme registry), `lib/inventory-import-template.ts` (v2 template), `lib/permissions.ts` (enforced) + `lib/permissions-matrix.ts` (descriptive), `lib/auth/email.ts` (Resend), `lib/inventory-data.ts` (compute helpers; `movementHistory()` is a synthetic stub → `[]`).

## 8. Sprint ledger — chunks A–F (verified against `git log`)
| Chunk | PR | What |
|---|---|---|
| A | #108 | "SKU" → "Part #" labels (DB `sku` kept); tracking-mode dropdown widen; responsive top-bar search |
| B-1 | #109 | `inventory_vocab` table + API + InventoryVocabPane (Settings → "Inventory Lists") |
| B-2 | #110 | ProductForm + ReceiveStockForm dropdowns sourced from managed vocab (datalists; const fallback) |
| B-3 | #111 | `WarehouseLocation` type → `string`; real location breakdown (fixed the "Default"-invisible bug) |
| C-1 | #112 | `search_aliases` + chip editor + alias matching across all 3 catalog searches |
| C-2a | #113 | `non_serialized` tracking mode + `po_number` on receipts |
| C-2b | #114 | cost-grouped part-detail stock view (cheapest-first, expandable to units) |
| C-3 | #115 | per-unit Edit (EditStockUnitForm) |
| C-4 | #116 | import surfaces the skipped duplicate Part #s |
| C-5 | #117 | "reorder point" → "Low-stock at (qty)"; reorder-qty field + Reorder button removed (detection logic kept) |
| C-6 | #118 | Excel import template v2 (type-able dropdowns, veryHidden Lists sheet, stamp v2, non_serialized parse fix) |
| E | #119 | 10 luxury themes (14 total) |
| D-1 | #120 | product add-ons (notify toggle + part/text editor) |
| D-2 | #121 | quote add-on prompt (AddonPrompt) |
| F-1a | #122 | `quotes` table + `lib/api/quotes.ts` + actions (plumbing, no cutover) |
| F-1b | #123 | quote-store cut over to DB (optimistic cache; one-time localStorage import) — verified live |
| F-2 | #124 | pin a specific stock unit's real cost to a quote line (StockUnitPicker) |
| F-3a | #125 | Approve transition (Sent → Approved) in builder + list |
| F-3b | #126 | commit/decrement pinned stock (qty-aware split; `committedStockId` idempotency; auto-on-convert) |

*(Earlier history: AE–AF = #70–#94; Inventory Sprint AG = #96–#106; #107 = AG handoff doc.)*

## 9. Themes
`THEME_ORDER` is now **14**: the 4 originals (`royal-navy` (default), `onyx-brass`, `oxford-green`, `burgundy-reserve`) + 10 luxury (`imperial-plum`, `sapphire-noir`, `emerald-dynasty`, `espresso-gilt`, `slate-rose`, `midnight-teal`, `mahogany-brass`, `amethyst-dusk`, `ivory-court`, `pearl-platinum`). Each theme lives in **5 places that must stay in sync**: a `[data-theme]` block in `app/globals.css`, a `THEMES` entry in `lib/theme.ts`, `THEME_ORDER`, the `ThemeKey` union + `isThemeKey`, and the **FOUC regex** in `app/layout.tsx`. localStorage-persisted (`nexvelon:theme`); **no DB persistence** (per-device). Charts read the JS palette via `useThemeColors()` (recharts can't read CSS vars).

## 10. Quote store — DB-backed façade
`lib/quote-store.ts` keeps its **public API unchanged** (`useQuotes` / `useQuote` / `upsertQuote` / `getMergedQuotes` / `getQuoteById` / `resetOverrides`, + new `useQuotesLoaded`) so the 5 consumers barely moved — but the backing store is now the **DB**:
- An in-memory `cache` is hydrated by `loadQuotes()` → `listQuotesAction()` (deduped in-flight promise); listeners re-render on load.
- `upsertQuote` is **optimistic**: it updates the cache + fires listeners **immediately** (preserving the synchronous-feel contract), then persists via `upsertQuoteAction` (fire-and-forget; logs on failure, never throws/blocks).
- **One-time import:** `migrateLocalStorageQuotes()` replays `readOverrides()`'s legacy transforms over the operator's real saved quotes → `upsertQuoteAction` each → sets `MIGRATED_KEY` only on full success; never re-imports. Mock seed-merge dropped (DB is the sole source).
- `useQuote` falls back to `getQuoteByIdAction` for deep-links not in the loaded list. Quotes now persist server-side **and across devices**.

## 11. Permissions — ⚠️ two systems
- **`lib/permissions.ts` is the ENFORCED runtime gate.** Small `Action` union: `view`/`create`/`edit`/`delete`/`approve`/`convert`/`viewMargin`/`viewInternal`/`viewCost`/`viewAll`/`manage`. `hasPermission(role, resource, action)` type-checks against this. `quotes:approve` + `quotes:convert` → Admin + ProjectManager; **`inventory:edit`** is the inventory-write gate (used by Commit-stock).
- **`lib/permissions-matrix.ts` is DESCRIPTIVE only** — a catalog with finer-grained keys (`editItems`, `adjustStock`, `receiveStock`, …) for documentation/UI; these do **not** type-check in `hasPermission`. The two diverge — when gating a feature, use the **`permissions.ts`** vocabulary. Consolidation is deferred debt (§14).

## 12. Email infrastructure
Resend handles transactional app email (`lib/auth/email.ts`: `sendOtpEmail`, `sendLowStockAlert`). Microsoft 365 for `nexvelonglobal.com` is the human-mailbox channel; the **SPF + DKIM + DMARC trio is complete** (the DKIM toggle from AG §11 was enabled). **No outstanding email tasks.**

## 13. Resume — next session
1. Paste this doc.
2. Pick from the **open backlog (§14)** or run a **testing pass** over the A–F surfaces; file fixes as `fix/` chunks.
3. Keep §2 workflow rules + §3 architectural locks in force.
4. **Project-vs-site reconciliation needs a business decision from Jay** before the mock AllocationsTab can go live — surface it when inventory↔projects work resumes.

## 14. Deferred backlog & known debt
**DONE this session (closed):** Quotes → DB persistence (F-1a/b); specific-stock-unit pinning (F-2); stock-decrement-on-approval/convert (F-3b); partial-bulk allocation (subsumed by the F-3b split).

**Still open:**
- **Purchase Orders / Vendors module** — makes "Receive PO" real and promotes the still-mock Allocations / Transfers / PurchaseOrders / Vendors / Categories tabs to live data. `VENDOR_DIRECTORY` is empty; **vendors are not yet a managed vocab kind** (`VENDOR_OPTIONS` is a fixed const).
- **CSV / PDF report export** (the ReportsTab has none yet).
- **Scheduled low-stock cron email** (needs `vercel.json` cron + authed `api/cron` route + `CRON_SECRET`; today's alert is on-demand to the signed-in user).
- **Movements ledger** → true turnover ratio (ReportsTab currently uses a consumption-90d approximation).
- **`/sites/[id]` detail page.**
- **Project-vs-site reconciliation** (business decision required — see §13).

**Known issues / debt:**
- `quotes.client_id` / `site_id` are **un-FK'd** (deferred integrity).
- **Two permission systems diverge** (enforced `permissions.ts` vs descriptive `permissions-matrix.ts`) — consolidation pending.
- **Commit is forward-only** — un-converting / editing a committed quote does **not** auto-return stock; returns are manual via the existing unit actions.
- `reorder_qty` column is **vestigial** (kept per §2.1; UI dropped it in C-5).
- Inventory header has accumulated buttons (Add product / Import / Download template / Email low-stock + mock Receive PO / Stock count / Adjust) — a layout tidy is a known small item.
- Carried code debt from AG: `site_code` UNIQUE constraint; `updated_by`/`deleted_by` audit cols on sites/contacts; `roundCRA` float-precision; `DEFAULT_LABOR_RATE` export removal.

## 15. Bootstrap prompts
**Fresh Claude-AI (strategist) session — paste:**
> You are the sole strategic architect for the Nexvelon Enterprise Suite build. Operator is Jay (non-technical owner); you issue ONE decisive spec per turn (no options menus — genuine forks become 1–3 tappable questions), Jay runs it through Claude Code and pastes the result back. Big chunks are two-phase (read-only Phase 1 inspect → Phase 2 build); small chunks ship in one spec with embedded pre-flight. One chunk = one NON-draft PR; state the merge step + PR link before the next chunk. Migrations are inline SQL run via the Supabase Dashboard SQL Editor only (never CLI; never `scripts/wipe-test-data.sql`). Read `docs/HANDOFF-SESSION-AH.md` in full — current state is through PR #126 / migration 0027 (Inventory module + Quotes-on-DB with pin/approve/commit complete). Honour the §3 architectural locks (past-data preservation, snapshot principle, specific-identification). Then ask what's next.

**Fresh Claude-Code (executor) session — paste:**
> Repo: github.com/nexvelon/nexvelon (Next.js 15 / React 19 / Supabase / Tailwind v4). Read `docs/HANDOFF-SESSION-AH.md` for full context. Conventions: one chunk = one NON-draft PR; branch `feature/`|`fix/`|`polish/`|`docs/`; commit `<type>(<scope>): <Chunk ID> — <description>`; `tsc` + `eslint` + `npm run build` must be clean before commit; migrations live in `supabase/migrations/` with a paired smoke file but are applied by Jay in the Supabase Dashboard (never CLI). Surgical edits, pre-flight grep before editing, never narrow a CHECK or drop a dormant column. Wait for the strategist's spec.

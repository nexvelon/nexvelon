# NEXVELON_FEATURE_AUDIT.md

> **Comprehensive feature audit + sidebar expansion.** The scoping
> pass that lands before the permissions module is designed.
>
> A new Claude Code session reads, in order:
>   1. `NEXVELON_PRINCIPLES.md` — the six non-negotiables.
>   2. `CLAUDE_CONTEXT.md` "Current Session State" block.
>   3. `NEXVELON_SESSION_<latest>_HANDOFF.md`.
>   4. `NEXVELON_ROADMAP.md`.
>   5. **This file** — feature audit + sidebar expansion.
>
> **Status:** v0.8 — Modules 1-7 fully scoped through Sessions C-I.
> Modules 8-13 pending. M1-M6 condensed to headline stats per
> file-size management pattern; current module gets full content.

---

## 0. How to use this document

### 0.1-0.5

Per v0.7 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; baseline gaps from Session C.

### 0.4 Permissions model — locked commitments

Through Sessions B + C + D + E + F + G + H + I:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widget definitions + quote terms snapshots + change order amendments + commissioning records + FIFO inventory layers.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages, PO PDFs sent to vendors).
10. **Comprehensive logging visibility** per PRINCIPLES §4. **Append-only ledgers** for inventory movements, commissioning records, acceptance records.

### 0.6 Walk order

1. **Clients + Sites + Contacts** *(complete §1)*
2. **Employees + Permissions** *(complete §2)*
3. **Settings** *(complete §3)*
4. **Dashboard** *(complete §4)*
5. **Quotes** *(complete §5)*
6. **Projects** *(complete §6)*
7. **Inventory** *(complete §7)*
8. Vendors
9. Invoices
10. Subcontractors
11. Financials
12. Scheduling
13. Reports

### 0.7 Sidebar architecture *(Session D)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People (parent — hover expands: Clients, Sites, Employees, Vendors, Contractors, Misc Contacts)
💰 Quotes
📋 Projects
📦 Inventory             ← Module 7 surface
📅 Scheduling
💵 Financials
📈 Reports
⚙️ Settings
```

---

═══════════════════════════════════════════════════════════════════
# 1. Module: Clients + Sites + Contacts
═══════════════════════════════════════════════════════════════════

## 1.1 Purpose

Customer master record. Companies + Individuals. Sites belong to clients (M:N contacts). SLAs per-site. Banking, payment terms, holdback, credit at client level. Onboarding gates auto-inject T&C language.

## 1.2-1.14 Headline stats

- 23 routes, ~110 actions, 15 lookup tables, 14 field visibilities
- Per-site SLAs with precedence resolution
- Contractual integrity exception: clients:overrideSlaResponseTime Admin-only
- 16 customer types seeded
- Holdback config (10%/Excl/45 Ontario Construction Act default)
- Communication log first-class entity
- Service contracts as separate first-class entity from SLAs
- 54 acceptance criteria
- Permissions design implications: items 1-14

(Full content preserved in v0.2 commit history at `073b393`.)

---

═══════════════════════════════════════════════════════════════════
# 2. Module: Employees + Permissions
═══════════════════════════════════════════════════════════════════

## 2.1 Purpose

The substrate every module reads from. **Employees** — internal staff. **Permissions** — ten-dimensional access control surface.

## 2.2-2.14 Headline stats

- 25 routes, ~80 actions, 11 lookup tables, 14 field visibilities
- Six-tab permissions editor (Role & Overrides / Data & Field Access / Workflows & Delegations / Security & Sessions / UI & Audit / API & SSO)
- 25+ seeded certification types
- Multi-territory model (Primary/Secondary/Relocation)
- Resource Absences with approval workflow + balance tracking
- Request-admin-access workflow
- Effective-permissions caching (sub-10ms)
- Field-level encryption: banking, SIN, access codes
- 55 acceptance criteria
- Permissions design implications: items 15-22

(Full content preserved in v0.3 commit history at `4dc0cc2`.)

---

═══════════════════════════════════════════════════════════════════
# 3. Module: Settings
═══════════════════════════════════════════════════════════════════

## 3.1 Purpose

The configuration spine. ~70 sub-pages in 10 categories. Every module reads from Settings.

## 3.2-3.14 Headline stats

- ~70 sub-pages, ~270 actions (heavily templated), 16 Settings-specific tables, 4 status surfaces
- 29 operator-editable lookups with uniform guided-creation wizard
- 12 custom-field-definition entity managers
- Workflow Rules editor (condition-action table at v1; flowchart Phase 2)
- Email/PDF templates with Handlebars + live preview + per-language versioning + stale-flagging
- Settings change preview for behavior-binding changes
- API keys as scoped permissions with one-time display
- OAuth tokens encrypted in Supabase Vault
- 42 acceptance criteria
- Permissions design implications: items 23-27

(Full content preserved in v0.4 commit history at `87a9fc8`.)

---

═══════════════════════════════════════════════════════════════════
# 4. Module: Dashboard
═══════════════════════════════════════════════════════════════════

## 4.1 Purpose

Per-role landing page. Presentation layer composing widgets.

## 4.2-4.14 Headline stats

- 3 routes, ~35 actions (13 module-specific + ~20 per-widget gates), 5 owned tables, 3 status surfaces
- ~20 seeded widgets across 6 role default layouts (A: 8, PM: 6, SR: 6, Tech: 5, Acc: 7, VO: 3)
- Three-way widget visibility gate (source-permission AND widget-enabled AND user-not-hidden)
- UI presentation locked as 10th dimension of permission control
- 25 acceptance criteria
- Permissions design implications: items 28-30

(Full content preserved in v0.5 commit history at `6283d0f`.)

---

═══════════════════════════════════════════════════════════════════
# 5. Module: Quotes
═══════════════════════════════════════════════════════════════════

## 5.1 Purpose

Heart of sales pipeline. Three quote types: Service / Project / Service Contract.

## 5.2-5.14 Headline stats

- 18 internal routes + 1 public-facing signed-URL portal
- ~85 actions across 11 categories
- 12 new owned tables, 5 status surfaces
- Online portal acceptance (signed URL, no login, 90d expiry, e-signature)
- Immutable send snapshots for legal durability
- Eight-layer print protection on revenue PDFs
- T&C auto-composition from Module 1 onboarding gates
- Value + discount threshold approval routing (combined AND logic)
- Per-cost-centre tax codes (Canadian compliance)
- Holdback in quote totals
- Field-level margin visibility (A/PM default; SR per-user override)
- 52 acceptance criteria
- Permissions design implications: items 31-37

(Full content preserved in v0.6 commit history at `5633e25`.)

---

═══════════════════════════════════════════════════════════════════
# 6. Module: Projects
═══════════════════════════════════════════════════════════════════

## 6.1 Purpose

Lifecycle management for converted Project Quotes. Multi-phase work with three-state costing, change orders, commissioning, handover.

## 6.2-6.14 Headline stats

- 24 routes, ~110 actions across 13 categories
- 12 new owned tables, 8 status surfaces
- Three-state costing (Estimated/Committed/Actual) with real-time forecast-at-completion
- Change order workflow with customer signature via signed URL portal
- Commissioning workflow with per-equipment test results + ULC fire-alarm verification auto-attachment
- Handover package auto-assembly triggering warranty clock
- Progress invoicing with Canadian Construction Act compliance
- Trade Contractor lien deadline tracking (Ontario 60-day)
- Eight-layer print protection on commissioning certificates + handover packages
- Append-only commissioning + acceptance records
- Field-level margin visibility per project
- 58 acceptance criteria
- Permissions design implications: items 38-44

(Full content preserved in v0.7 commit history at `bafb708`.)

---

═══════════════════════════════════════════════════════════════════
# 7. Module: Inventory
═══════════════════════════════════════════════════════════════════

## 7.1 Purpose

Master inventory of stock items across multiple stock locations (warehouses, branch offices, technicians' trucks/vans, project sites). Stock movements (receive, transfer, consume, adjust, return). Purchase orders to vendors with approval workflow. Stocktakes and adjustments. Minimum/restock level alerts. Vendor catalog sync. Serial number tracking for serialized security equipment. FIFO valuation with accounting integration.

For security integrators specifically:
- **Serial number tracking** essential for warranty + asset tracking on cameras, panels, readers, NVRs
- **Truck/van inventory** critical for field staff (each tech's van is a stock location)
- **Project-reserved stock** prevents double-allocation at quote acceptance
- **Vendor catalog sync** from Avigilon, Genetec, Bosch, Honeywell, Lenel, Paxton, DSC, Software House distributors keeps pricing current
- **ULC-listed equipment tracking** for fire alarm regulatory compliance

**Key design choice:** Pricebook items from Module 5 ARE the master item catalog. Module 7 adds inventory tracking on top — each `pricebook_item` has an `is_inventoried` flag. Non-inventoried items (e.g., subcontracted labor lines, travel expenses) don't get stock tracking.

## 7.2 Sidebar surface

Top-level **📦 Inventory** in sidebar per §0.7. Badge: low-stock alerts count + pending PO approvals + receipts pending verification.

## 7.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/inventory` | Dashboard (KPIs, alerts, recent activity) | `inventory:view` |
| `/inventory/items` | Master catalog (extends pricebook from M5) | `inventory_items:viewList` |
| `/inventory/items/[id]` | Item detail with stock per location | `inventory_items:viewDetail` |
| `/inventory/locations` | Locations list (warehouses, vehicles, sites) | `locations:viewList` |
| `/inventory/locations/[id]` | Location detail with all stock | `locations:viewDetail` |
| `/inventory/stock-matrix` | Items × Locations grid view | `inventory:viewMatrix` |
| `/inventory/movements` | Movement ledger (append-only audit trail) | `movements:viewLedger` |
| `/inventory/movements/[id]` | Single movement detail | `movements:viewDetail` |
| `/inventory/purchase-orders` | PO list | `pos:viewList` |
| `/inventory/purchase-orders/new` | Create PO wizard | `pos:create` |
| `/inventory/purchase-orders/[id]` | PO detail | `pos:viewDetail` |
| `/inventory/receive` | Receive PO items (mobile-friendly) | `receive:execute` |
| `/inventory/issue` | Issue stock to project/job | `issue:execute` |
| `/inventory/transfer` | Transfer between locations | `transfer:execute` |
| `/inventory/stock-take` | Stocktake list + new wizard | `stocktake:view` |
| `/inventory/stock-take/[id]` | Active stocktake (count interface) | `stocktake:execute` |
| `/inventory/adjustments` | Manual adjustments list | `adjustments:viewList` |
| `/inventory/categories` | Category tree management | `inventory_categories:view` |
| `/inventory/valuation` | Valuation report (FIFO) | `inventory:viewValuation` |
| `/inventory/serials` | Serial number tracking | `serials:viewList` |
| `/inventory/serials/[serial]` | Serial detail (history) | `serials:viewDetail` |
| `/inventory/returns` | Returns to vendor | `returns:viewList` |
| `/inventory/returns/new` | Create return authorization | `returns:create` |
| `/inventory/alerts` | Low stock + reorder alerts | `alerts:view` |
| `/inventory/reports` | Reports index | `inventory:viewReports` |
| `/inventory/vendor-sync` | Vendor catalog sync management | `vendor_sync:view` |

## 7.4 Resources

### New owned tables (15)

- `inventory_locations` — warehouses, vehicles, project sites: name, type_id, address, assigned_to_employee_id (nullable for vehicles), parent_location_id (sub-locations), is_active
- `inventory_stock_levels` — current qty per item per location: pricebook_item_id, location_id, on_hand_qty, on_order_qty, reserved_qty, available_qty (computed), min_level, restock_level, last_counted_at
- `inventory_movements` — append-only ledger: item_id, from_location_id (null for receives), to_location_id (null for issues/write-offs), qty, movement_type_id, reference_type (PO/Project/Manual), reference_id, unit_cost (FIFO layer), executed_by, executed_at
- `inventory_serials` — per-unit serial tracking: item_id, serial_number, current_location_id (nullable), current_status_id, installed_at_site_id (nullable), installed_in_project_id, warranty_start_date, warranty_end_date, notes
- `inventory_fifo_layers` — FIFO cost tracking: item_id, location_id, qty_remaining, unit_cost, received_at, source_po_line_id
- `purchase_orders` — header: po_number (auto), vendor_id, status_id, requested_by, approved_by, approved_at, submitted_at, expected_delivery_date, actual_delivery_date, total_amount, currency_id, notes, attached_quote_id (vendor quote), source_project_id (nullable for project-specific)
- `purchase_order_lines` — line items: po_id, pricebook_item_id (nullable for free-text), description, qty, unit_cost, tax_code_id, line_total, qty_received, status_id, expected_delivery, source_project_phase_id (nullable), source_cost_center_id
- `po_receipts` — receiving events: po_id, received_by, received_at, receipt_number, attached_packing_slip_url, attached_photo_urls[], notes
- `po_receipt_lines` — per-line receipt: receipt_id, po_line_id, qty_received, condition (Good/Damaged/Partial), serial_numbers[] (for serialized), location_id (where received)
- `stock_takes` — physical counts: name, locations_in_scope[], started_by, started_at, completed_at, finalized_at, finalized_by, total_variance_value
- `stock_take_lines` — per-item count: stocktake_id, item_id, location_id, expected_qty (system), counted_qty (manual), variance, variance_reason_id, counted_by, counted_at
- `inventory_adjustments` — manual corrections: item_id, location_id, qty_delta, reason_id, reason_notes, executed_by, executed_at
- `inventory_returns` — returns to vendor: vendor_id, return_number, original_po_id (nullable), status_id, reason_id, total_value, credit_received, credit_received_at
- `inventory_alerts` — low stock + reorder: type, item_id, location_id, message, severity, triggered_at, dismissed_at, dismissed_by, snoozed_until
- `vendor_catalog_sync_state` — per-vendor sync: vendor_id, last_sync_at, next_scheduled_sync, mapping_rules_jsonb, items_synced, items_with_conflicts

### Status lookup tables (6)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `inventory_location_types` | Warehouse, Branch Office, Vehicle, Project Site, Customer Site (Consignment), Transit Buffer, Quarantine | accounting flag, can-be-assigned-to-employee, requires-location-detail |
| `inventory_movement_types` | Receive (from PO), Issue to Project, Issue to Job, Transfer Location-to-Location, Manual Adjustment, Return to Vendor, Write-Off, Stocktake Variance, Reserve for Project, Release Reservation | accounting posting, requires-reason, requires-approval-over-threshold |
| `purchase_order_statuses` | Draft, Pending Approval, Approved, Sent to Vendor, Acknowledged, Partially Received, Fully Received, Cancelled, Closed (post-invoice) | allows-edit, vendor-visible, accounting-trigger |
| `po_line_statuses` | Pending, Partially Received, Fully Received, Cancelled, Backordered, Substituted | qty-tracking, alert generation |
| `stock_take_statuses` | Planning, In Progress, Counting Complete, Pending Approval, Posted (adjustments applied), Cancelled | allows-edit, posts-to-accounting |
| `inventory_serial_statuses` | Available, Reserved (for project), Issued (sent to project), Installed (at customer site), Returned (back to vendor), Lost, Damaged, Decommissioned | scheduling eligibility, warranty status |

## 7.5 Actions (~95 actions)

**Item catalog (12):** viewList, viewDetail, create, edit, archive, setInventoried, setMinMax, viewStockLevels, viewMovementHistory, exportCatalog, importCatalog (CSV), bulkUpdateCosts.

**Vendor catalog sync (6):** triggerSync, viewSyncHistory, mapVendorItem, resolveConflict, scheduleRecurring, viewLastSyncReport.

**Locations (8):** viewList, viewDetail, create, edit, archive, assignToEmployee (truck/van), viewStockAtLocation, mergeLocations.

**Stock movements (12):** viewLedger, viewDetail, recordReceive, recordIssue, recordTransfer, recordAdjustment, recordReturn, recordWriteOff, reserveForProject (lock stock), releaseReservation, reverseMovement (with audit), bulkRecord (CSV).

**Purchase orders (18):** viewList, viewMy, viewDetail, create (wizard), createFromProject (auto-populate from project requirements), edit, addLine, editLine, deleteLine, submit, approve, conditionalApprove, reject, send (email PDF to vendor), resend, cancel, close (post-invoice), exportPdf, requestSubstitution.

**PO receipts (8):** viewList, recordReceipt (full), recordPartialReceipt, recordSerialNumbersOnReceive, recordDamagedReceipt, attachPackingSlip, attachReceivePhotos, reverseReceipt (with audit).

**Stocktakes (10):** viewList, viewDetail, create, scheduleRecurring, startTaking, recordCount, recordVariance, finalize, postAdjustments, exportVarianceReport, cancel.

**Adjustments (5):** viewList, create, bulkAdjust, viewAuditTrail, reverseAdjustment.

**Returns (6):** viewList, createReturnAuthorization, processReturn, recordCreditNote, markCompleted, exportPdf.

**Serials (10):** viewList, viewDetail, scanSerial (mobile barcode), reserveSerial, issueSerial, installSerial, markLost, markDamaged, markDecommissioned, exportSerialReport.

**Alerts (5):** viewList, dismiss, snooze, configureThresholds, viewAlertHistory.

**Reports (8):** viewLowStock, viewAgedStock, viewValuation (FIFO), viewMovementReport, viewPriceDiscrepancy, viewVendorPerformance, viewStockTakeVariance, exportInventoryToAccounting.

**Default grants:**
- **PM:** viewList, viewDetail, create POs (project-related), receive, viewStockLevels
- **Tech:** viewLocation (own truck), recordIssue (own work), recordReceive (when delivered to truck), scanSerial
- **A:** full
- **Acc:** viewList, viewDetail, viewValuation, viewPriceDiscrepancy, postAdjustments, exportToAccounting
- **SR:** viewList (no costs), viewStockLevels (availability check for quoting)
- **VO:** viewList only (no costs)

## 7.6 Views

### Inventory dashboard (`/inventory`)

KPI tiles: Total inventory value (FIFO) / Low-stock alerts count / Pending PO approvals / In-transit value / Recent movements last 7 days / Aged stock (>90 days no movement) value. Recent activity feed. Pending alerts panel. Quick actions: Create PO, Record Receive, Start Stocktake, Transfer Stock.

### Item catalog (`/inventory/items`)

Extended pricebook view from Module 5 — adds columns: On Hand (total across locations), On Order (pending POs), Reserved, Available, Min Level Reached (boolean), Last Movement Date. Filter by category, vendor, low-stock-only, serialized-only, non-inventoried-only.

Click item → detail with tabs: Overview / Stock Levels by Location / Movement History / Serial Numbers (if serialized) / Vendors (multiple vendors per item with pricing) / Custom Fields / Audit Log.

### Stock matrix (`/inventory/stock-matrix`)

Items × Locations grid. Cells show on_hand qty. Color-coded: red (below min), yellow (approaching min), green (healthy), gray (zero). Filter by category, vendor. Export to CSV.

### PO wizard (`/inventory/purchase-orders/new`)

Multi-step:
1. Vendor selection (with vendor pricing visible)
2. PO type (Stock replenishment / Project-specific / Direct-to-job)
3. Add line items (search pricebook + qty + unit cost + tax + delivery location)
4. Auto-suggest from low-stock alerts (one-click add reorder items)
5. Auto-suggest from project requirements (if project selected, list materials needed but not yet ordered)
6. Review totals + expected delivery
7. Submit for approval OR direct-send if self-approve eligible

### Receive screen (`/inventory/receive`)

Mobile-friendly. Scan PO barcode OR select from list. PO lines with expected qty. For each line: enter received qty, condition (Good/Damaged), serial numbers (scan or type), location received to. Photo capture: packing slip + damage. Submit → stock levels updated, movement ledger entry, accounting posting.

### Stocktake wizard

1. Plan: locations in scope, count date, assigned counters
2. Print/email count sheets (PDF with expected qty hidden — blind count)
3. Mobile count interface: scan barcode → enter qty → next
4. Variance review: side-by-side expected vs counted
5. Variance reason capture (Damage / Theft / Mis-Count / Found / Lost / Other)
6. Finalize → adjustments posted to ledger + accounting

### Serial scanner (mobile)

Camera-based barcode scanner. Scan serial → shows item info + current location + history. Action menu: Reserve / Issue / Install / Mark Damaged.

### Movement ledger (`/inventory/movements`)

Append-only audit trail. Every stock change visible: timestamp, item, qty, from-location, to-location, movement type, reference, executed_by, unit cost. Filter by date range, item, location, type. Export.

### Vendor catalog sync (`/inventory/vendor-sync`)

Per-vendor sync configuration: Last sync timestamp / Next scheduled / Items synced / Items with mapping conflicts / Mapping rules / Manual sync trigger / Conflict resolution interface.

## 7.7 Field-level treatment

Heavily gated cost visibility:

- `visibility.inventory.unitCost` — A, Acc, PM (always). Hides unit cost from SR/Tech/VO.
- `visibility.inventory.totalValuation` — A, Acc, PM.
- `visibility.inventory.vendorPricing` — A, Acc, PM-with-perm.
- `visibility.inventory.marginPerSale` — A, PM, Acc.
- `visibility.inventory.fifoLayers` — A, Acc only.
- `visibility.po.totalAmount` — A, Acc, PM.
- `visibility.po.unitPricing` — A, Acc, PM.

## 7.8 Custom-field surfaces

Per-item custom fields in Settings → Custom Fields → Inventory Items. Common security-integrator examples: Manufacturer, Model Number, Firmware Version, Spec Sheet URL, ULC Listed (boolean), Country of Origin, Lead Time Days, Hazardous Materials flag.

Per-location custom fields: Manager Name, Storage Capacity, Climate Controlled flag.

## 7.9 Status surfaces

6 lookup tables (see §7.4).

## 7.10 Cross-module relationships

### Reads

- **Pricebook (M5):** master item catalog (this module extends with stock tracking)
- **Vendors (M8):** vendor entity, pricing, contacts, catalog
- **Projects (M6):** project requirements drive PO suggestions; project-reserved stock locks; commissioned serials link to projects
- **Employees (M2):** truck/van assignments; receive permissions; serial scan attribution
- **Settings (M3):** tax codes, currencies, approval workflows, alert thresholds, vendor catalog sync rules

### Writes

- **Project costing (M6):** committed when PO raised; actual when received + consumed
- **Invoices (M9):** COGS calculation
- **Financials (M11):** inventory valuation balance, accounting postings for movements
- **Audit on every movement**

### Events emitted

`inventory.item_created`, `inventory.stock_level_changed`, `inventory.alert_triggered`, `inventory.movement_recorded`, `po.*` (created, submitted, approved, sent, partially_received, fully_received, cancelled), `stocktake.*` (started, completed, variance_recorded, posted), `serial.*` (received, reserved, issued, installed, returned), `vendor_catalog.synced`, `inventory.return_authorized`, `inventory.credit_received`.

## 7.11 Competitive floor delta

Combines best of:
- **simPRO:** Storage devices with employee assignment, FIFO, Min/Restock levels with alerts, Minimum Pack Quantity, Mobile inventory module, Barcoding portal, Vendor catalog sync, Accounting integration
- **ServiceTitan:** Mobile-first warehouse receive, Real-time truck inventory, Vendor punch-out

**Nexvelon-unique:**
- **Serial number tracking with full lifecycle** (received → reserved → issued → installed → warranty → decommissioned) per security-equipment requirements
- **Photo capture on receive** (packing slip + damage evidence)
- **Project-reserved stock locking** at quote acceptance (prevents double-allocation)
- **Eight-layer print protection on PO PDFs** (consistent with M5/M6 pattern for vendor-facing documents)
- **Mobile barcode scan-and-go** for serial tracking
- **Vendor performance scoring** (on-time delivery, price accuracy, damage rate)
- **Price discrepancy auto-flagging** (PO unit cost vs invoice unit cost mismatch)

## 7.12 Permissions design implications (items 45-49)

45. **Stock movements are append-only ledger.** Reversals create new entries (no UPDATE/DELETE). Audit immutability per PRINCIPLES §4.
46. **Serial number tracking with append-only history.** Every status change creates a new row.
47. **Multi-location stock with field-level cost visibility.** SR/Tech see availability but not cost.
48. **PO approval workflow per value threshold** consistent with quote pattern. Defaults: <$1k self-approve, $1-10k → PM, >$10k → Admin.
49. **Stock-take adjustment audit trail** captures expected vs counted vs variance reason per line; cannot be deleted after finalize.

## 7.13 Open questions — RESOLVED IN SESSION I

1. ✅ **Valuation method:** FIFO (Canadian GAAP standard).
2. ✅ **Mobile inventory:** responsive web at v1; mobile-optimized but no native app.
3. ✅ **Barcode scanning:** YES — camera + standard 1D/2D barcodes.
4. ✅ **Consignment stock:** YES — vendor-owned stock, separate location type.
5. ✅ **Returns-to-customer:** basic at v1; RMA workflow Phase 2.
6. ✅ **Stock-take frequency:** operator-defined per location; recommendation engine Phase 2.
7. ✅ **Multi-currency POs:** YES — vendor's currency converted to base at receive with exchange rate snapshot.
8. ✅ **Vendor portal for PO acknowledgment:** Phase 2; email PDF at v1.

Remaining:
9. **Inventory cycle counting** (continuous partial vs full annual) — Recommendation: support both at v1.
10. **Multi-warehouse transfer-in-transit tracking** — Recommendation: YES; "Transit Buffer" location type.
11. **Equipment kit/bundle inventory** (kit SKU referencing component SKUs) — Recommendation: YES; auto-decrement on kit issue.

## 7.14 Acceptance criteria (~48 scenarios)

### Functional — Item catalog (1-6)
1. Add new inventoried item.
2. Sync vendor catalog (mock vendor API); conflicts flagged.
3. Toggle is_inventoried on existing pricebook item.
4. Set min/restock levels per location.
5. Bulk import items via CSV.
6. Archive item with stock on hand → blocked with warning.

### Functional — Stock movements (7-14)
7. PO receive — full receipt creates FIFO layer + movement entry + stock level update.
8. Partial receipt — line Partially Received; remaining Backordered.
9. Transfer van A → van B.
10. Issue to project — stock decremented; project cost flow.
11. Reverse movement — new offsetting entry.
12. Write-off damaged stock.
13. Manual adjustment + audit trail.
14. Bulk import movements via CSV.

### Functional — Purchase orders (15-22)
15. Create PO from project requirements.
16. PO approval thresholds: <$1k self-approve / $5k → PM / $15k → Admin.
17. Send PO to vendor via email (eight-layer protected PDF).
18. Partial receive marks lines.
19. PO closure on invoice match.
20. PO cancellation with reason.
21. Backorder tracking.
22. Substitution request.

### Functional — Stocktake (23-28)
23. Schedule stocktake for specific locations.
24. Blind count → variance auto-calculated.
25. Variance reason required for finalize.
26. Finalize posts adjustments.
27. Export variance report.
28. Recurring schedule (monthly warehouse, quarterly trucks).

### Functional — Serial tracking (29-34)
29. Receive serialized item → scan serials.
30. Issue serial to project → Available → Reserved → Issued.
31. Install serial at site → Installed; warranty clock starts.
32. Mark serial damaged → write-off + alert.
33. Serial history shows full lifecycle.
34. Search by serial number returns history.

### Functional — Alerts & reorder (35-37)
35. Stock drops below min → alert generated.
36. Configure thresholds per item per location.
37. One-click reorder from alert → opens PO wizard pre-filled.

### Functional — Permissions (38-43)
38. SR sees catalog without costs.
39. Tech sees only own truck/van inventory.
40. PM creates PO under self-approve threshold.
41. Approval routes correctly per value.
42. Acc views valuation report; PM sees only own-project-related.
43. Stock movement attribution captures executor.

### Functional — Performance & integrity (44-48)
44. List 5000 items with stock-level join → <3s.
45. Receive 100-line PO → all lines update + accounting post <2s.
46. Movement ledger query for one item across 1 year → <2s.
47. RLS blocks unauthorized item cost visibility.
48. Append-only ledger enforces no-update on existing rows.

---

═══════════════════════════════════════════════════════════════════
# Modules 8-13: pending walk
═══════════════════════════════════════════════════════════════════

- §8 — Vendors
- §9 — Invoices
- §10 — Subcontractors
- §11 — Financials
- §12 — Scheduling
- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary

*Running count: ~785 actions across 7 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7).*

## 100. Final sidebar tree

*Locked through Session D — see §0.7.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*49 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5, 38-44 M6, 45-49 M7).*

## 103. Cumulative acceptance criteria

*~336 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5 + ~58 M6 + ~48 M7).*

---

**End of v0.8.** Modules 1-7 complete. Inventory module scoped with serial number lifecycle tracking, FIFO valuation, multi-location stock (warehouses + vehicles + project sites), append-only movement ledger, vendor catalog sync, photo-on-receive, project-reserved stock locking, and eight-layer print protection on PO PDFs. Cross-cutting commitments from Sessions C-I propagate forward.

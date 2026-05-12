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
> **Status:** v0.9 — Modules 1-8 fully scoped through Sessions C-J.
> Modules 9-13 pending. M1-M7 condensed to headline stats per
> file-size management pattern; current module gets full content.

---

## 0. How to use this document

### 0.1-0.7

Per v0.8 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; ten dimensions of permission control; baseline gaps from Session C. Sidebar architecture locked Session D. Walk order updated to mark M8 complete.

### 0.4 Permissions model — locked commitments

Through Sessions B + C + D + E + F + G + H + I + J:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widget definitions + quote terms snapshots + change order amendments + commissioning records + FIFO inventory layers + vendor-side T&C clauses.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages, PO PDFs to vendors, remittance advice, T5018 forms).
10. **Comprehensive logging visibility** per PRINCIPLES §4. **Append-only ledgers** for inventory movements, commissioning records, acceptance records, vendor performance scoring.

### 0.6 Walk order

1. Clients + Sites + Contacts *(complete §1)*
2. Employees + Permissions *(complete §2)*
3. Settings *(complete §3)*
4. Dashboard *(complete §4)*
5. Quotes *(complete §5)*
6. Projects *(complete §6)*
7. Inventory *(complete §7)*
8. **Vendors** *(complete §8)*
9. Invoices
10. Subcontractors
11. Financials
12. Scheduling
13. Reports

### 0.7 Sidebar architecture *(Session D — unchanged)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People (parent — Clients, Sites, Employees, Vendors, Contractors, Misc Contacts)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials
📈 Reports
⚙️ Settings
```

---

═══════════════════════════════════════════════════════════════════
# 1. Module: Clients + Sites + Contacts
═══════════════════════════════════════════════════════════════════

23 routes, ~110 actions, 15 lookup tables, 14 field visibilities. Per-site SLAs with precedence. Contractual integrity exception. 16 customer types. Holdback (10%/Excl/45 Ontario Construction Act). Communication log first-class. 54 acceptance criteria. Permissions design implications: items 1-14.

(Full content preserved in v0.2 commit history at `073b393`.)

---

═══════════════════════════════════════════════════════════════════
# 2. Module: Employees + Permissions
═══════════════════════════════════════════════════════════════════

25 routes, ~80 actions, 11 lookup tables, 14 field visibilities. Six-tab permissions editor. 25+ seeded certification types. Multi-territory model. Resource Absences. Request-admin-access workflow. Effective-permissions caching. Field-level encryption on banking/SIN/access codes. 55 acceptance criteria. Permissions design implications: items 15-22.

(Full content preserved in v0.3 commit history at `4dc0cc2`.)

---

═══════════════════════════════════════════════════════════════════
# 3. Module: Settings
═══════════════════════════════════════════════════════════════════

~70 sub-pages, ~270 actions, 16 Settings-specific tables, 4 status surfaces. 29 operator-editable lookups with uniform guided-creation wizard. 12 custom-field-definition entity managers. Workflow Rules condition-action table at v1. Email/PDF templates with Handlebars + live preview + per-language versioning. Settings change preview. API keys as scoped permissions. OAuth tokens encrypted in Supabase Vault. 42 acceptance criteria. Permissions design implications: items 23-27.

(Full content preserved in v0.4 commit history at `87a9fc8`.)

---

═══════════════════════════════════════════════════════════════════
# 4. Module: Dashboard
═══════════════════════════════════════════════════════════════════

3 routes, ~35 actions, 5 owned tables, 3 status surfaces. ~20 seeded widgets across 6 role default layouts. Three-way widget visibility gate. UI presentation locked as 10th dimension of permission control. 25 acceptance criteria. Permissions design implications: items 28-30.

(Full content preserved in v0.5 commit history at `6283d0f`.)

---

═══════════════════════════════════════════════════════════════════
# 5. Module: Quotes
═══════════════════════════════════════════════════════════════════

18 routes + 1 signed-URL portal, ~85 actions, 12 owned tables, 5 status surfaces. Three quote types (Service / Project / Service Contract). Online portal acceptance (signed URL, no login, 90d expiry, e-signature). Immutable send snapshots. Eight-layer print protection on revenue PDFs. T&C auto-composition from M1 onboarding gates. Value + discount threshold approval routing. Per-cost-centre tax codes (Canadian). Holdback in totals. Field-level margin visibility. 52 acceptance criteria. Permissions design implications: items 31-37.

(Full content preserved in v0.6 commit history at `5633e25`.)

---

═══════════════════════════════════════════════════════════════════
# 6. Module: Projects
═══════════════════════════════════════════════════════════════════

24 routes, ~110 actions, 12 owned tables, 8 status surfaces. Three-state costing (Estimated/Committed/Actual) with real-time forecast-at-completion. Change order workflow with customer signature. Commissioning workflow with per-equipment test results + ULC fire-alarm verification auto-attachment. Handover package auto-assembly triggering warranty clock. Progress invoicing (Canadian Construction Act compliance). Trade Contractor lien deadline tracking (Ontario 60-day). Eight-layer print on commissioning certs + handover packages. Append-only commissioning + acceptance records. 58 acceptance criteria. Permissions design implications: items 38-44.

(Full content preserved in v0.7 commit history at `bafb708`.)

---

═══════════════════════════════════════════════════════════════════
# 7. Module: Inventory
═══════════════════════════════════════════════════════════════════

26 routes, ~95 actions, 15 owned tables, 6 status surfaces. Multi-location stock (Warehouse, Branch, Vehicle, Project Site, Consignment, Transit Buffer, Quarantine). FIFO valuation. Append-only inventory_movements ledger. Serial number lifecycle tracking. Photo capture on receive. Project-reserved stock locking. Eight-layer print on PO PDFs. Mobile barcode scan-and-go. Vendor catalog sync from major security distributors. Vendor performance scoring + price discrepancy auto-flagging. 48 acceptance criteria. Permissions design implications: items 45-49.

(Full content preserved in v0.8 commit history at `f7cee0d`.)

---

═══════════════════════════════════════════════════════════════════
# 8. Module: Vendors
═══════════════════════════════════════════════════════════════════

## 8.1 Purpose

Master entity for suppliers/vendors. Three primary vendor categories:

1. **Equipment Distributors** — security equipment manufacturers and their distributors (Avigilon, Genetec, Bosch, Honeywell, Lenel, Paxton, DSC, Software House distributors)
2. **Material Suppliers** — local supply houses for cable, racks, conduits, fasteners, tools
3. **Service Vendors** — software/SaaS subscriptions, monitoring services, technology partners (non-labor)

**Key difference from Subcontractors (Module 10):** Vendors sell us *stuff*; Subcontractors sell us *labor*. Some entities are both — handled by cross-linking flag (`is_also_contractor`) but separate tables because banking, onboarding gates, tax forms, and workflows differ.

**Key difference from Clients (M1):** Banking is for AP (we pay them), not AR. Tax forms reversed (we issue T5018 to them; they provide W9/W8-BEN to us). Performance scoring instead of credit limit. No SLAs or holdback.

Much pre-established by M7: PO flow references `vendor_id`; `vendor_catalog_sync_state` lives in M7; vendor performance scoring conceptualized in M7. Module 8 fleshes out the vendor master entity, onboarding compliance, banking AP setup, T5018 tax tracking, and consolidated history views.

## 8.2 Sidebar surface

Under 👥 People parent → Vendors sub-item per §0.7.

## 8.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/people/vendors` | Vendor list | `vendors:viewList` |
| `/people/vendors/new` | Sectioned create drawer | `vendors:create` |
| `/people/vendors/[id]` | Vendor detail (Overview tab) | `vendors:viewDetail` |
| `/people/vendors/[id]/contacts` | Vendor contacts | `vendors:viewContacts` |
| `/people/vendors/[id]/banking` | Banking + AP config | `vendors:viewBankingDetails` |
| `/people/vendors/[id]/pricing` | Per-item pricing | `vendors:viewPricing` |
| `/people/vendors/[id]/performance` | Performance scorecard | `vendors:viewPerformance` |
| `/people/vendors/[id]/po-history` | All POs from this vendor | `vendors:viewPoHistory` |
| `/people/vendors/[id]/invoice-history` | Invoices received from vendor | `vendors:viewInvoiceHistory` |
| `/people/vendors/[id]/payment-history` | Payments made to vendor | `vendors:viewPaymentHistory` |
| `/people/vendors/[id]/onboarding` | Gate fulfillment | `vendors:viewOnboardingRequirements` |
| `/people/vendors/[id]/insurance` | Insurance certs with expiry | `vendors:viewInsurance` |
| `/people/vendors/[id]/tax-forms` | T5018/W9/W8-BEN | `vendors:viewTaxForms` |
| `/people/vendors/[id]/documents` | All vendor documents | `vendors:viewDocuments` |
| `/people/vendors/[id]/communication-log` | Email/call/SMS | `vendors:viewCommunicationLog` |
| `/people/vendors/[id]/custom-fields` | Operator fields | inherits view |
| `/people/vendors/[id]/audit-log` | Module audit | `vendors:viewAuditLog` |
| `/people/vendors/t5018-report` | Annual T5018 generation (Canada) | `vendors:generateT5018` |

## 8.4 Resources

### Owned tables (8)

- `vendors` — header: entity_type (Company/Individual), legal_name, common_name, vendor_code (auto), category_id, status_id, currency_id, language_id, time_zone, business_phone, alt_phone, fax, general_email, website, cra_business_number, hst_gst_number, addr fields, ship_to_addr fields (multiple supported via separate table for multi-warehouse), banking_account_name (encrypted), routing_number (encrypted), bank_account_number (encrypted), payment_method_id, payment_terms_days, payment_terms_basis, default_tax_code_id, t5018_required (Canada flag), t5018_ytd_amount, w9_on_file (US), w8_ben_on_file (US foreign), wsib_clearance_expiry, insurance_cert_expiry, msa_signed_at, account_manager_user_id, preferred_for_categories[], is_also_contractor (link flag), internal_notes, archived_at, custom_fields jsonb
- `vendor_contacts` — many contacts per vendor: vendor_id, first_name, last_name, role_id (Sales/AR/Technical/Logistics/Executive), email, phone, preferred_channel, is_primary
- `vendor_pricing` — vendor's price for each item: vendor_id, pricebook_item_id, unit_cost, minimum_order_qty, lead_time_days, volume_discount_tiers jsonb, last_updated_at, source (manual / catalog_sync)
- `vendor_performance_scores` — append-only metrics: vendor_id, period_start, period_end, on_time_delivery_pct, price_accuracy_pct, damage_rate_pct, total_po_value, total_pos, performance_grade (A/B/C/D), computed_at
- `vendor_onboarding_requirements` — per-vendor gate config: vendor_id, gate_type_id, required, fulfilled, due_date, expiry_date
- `vendor_onboarding_gate_fulfillments` — fulfillment records: requirement_id, attached_doc_url, fulfilled_at, fulfilled_by, expiry_date, status
- `vendor_insurance_certs` — versioned cert tracking: vendor_id, cert_type (Liability/WSIB/Auto/Workers Comp), policy_number, carrier, coverage_amount, expiry_date, attached_doc_url, status (Current/Expiring Soon/Expired/Pending Renewal)
- `vendor_t5018_records` — annual T5018 records (Canada compliance): vendor_id, tax_year, total_paid, t5018_issued_at, t5018_pdf_url

### Status lookup tables (4)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `vendor_categories` | Equipment Distributor, Material Supplier, Software/SaaS Vendor, Service Vendor, IT/Tech Partner, Logistics/Shipping, Office Supplies, Professional Services, Other | default payment terms, T5018 required default, accounting category |
| `vendor_statuses` | Lead, Active, Inactive, On Hold (PO blocked), Archived | allows-po, allows-payment, terminal flag |
| `vendor_onboarding_gate_types` | Insurance Cert, Business License, Banking Info, T5018 Registration, W9 Form, W8-BEN, WSIB Clearance, Anti-Corruption Declaration, NDA, MSA, Privacy Compliance | clause text for vendor-side T&C composition, default-required-at-category, expiry-tracking |
| `vendor_payment_term_basis` | from_invoice (Net X), after_eom (X days post end-of-month), cod, prepay, milestone-based | calculation rule (mirrors client model) |

## 8.5 Actions (~65 actions across 11 categories)

**Vendor lifecycle (15):** viewList, viewDetail, viewMy (AM-assigned), create, editBasic, promoteStatus, editAddress, editBilling, viewBankingDetails, editBankingDetails, editPaymentTerms, putOnHold (blocks PO creation), releaseHold, archive, unarchive, hardDelete (A only), merge, exportCsv, importCsv.

**Contacts (5):** viewList, create, edit, delete, setPrimary.

**Banking (4, heavily gated):** viewBankingDetails (A/Acc; audit-on-read), editBankingDetails (A/Acc), addPaymentMethod, archivePaymentMethod.

**Pricing (8):** viewList, editPricing (manual override), viewPricingHistory, importFromCatalogSync (triggers M7 sync flow), exportPricing, applyVolumeDiscount, setLeadTime, setMinOrderQty.

**Performance (5):** viewScorecard, viewPerformanceHistory, exportPerformanceReport, triggerRescoring (recompute on demand), viewVendorComparison.

**PO history (3):** viewPoHistory, viewOpenPOs, viewBackorderedItems.

**Invoice/Payment history (4):** viewInvoiceHistory, viewPaymentHistory, viewAccountsPayableBalance, sendRemittanceAdvice (eight-layer protected PDF).

**Onboarding & compliance (10):** viewOnboardingRequirements, editOnboardingRequirements, viewInsurance, uploadInsurance, recordInsuranceExpiry, viewTaxForms, uploadTaxForm (W9/W8-BEN), recordT5018, generateT5018Report (A/Acc annual; eight-layer protected), viewWsibClearance.

**Documents (4):** viewList, upload, download, archive.

**Communication (4):** viewLog, logCommunication, sendEmail, generateLetter.

**Reports (5):** vendorSpendByPeriod, vendorByCategory, openPoByVendor, priceTrendByVendor, performanceComparisonReport.

**Default grants:**
- **A:** full access including hardDelete
- **PM:** viewList, viewDetail, viewPricing, viewPerformance, create POs from vendor (via M7); cannot edit banking
- **Acc:** viewList, viewDetail, viewBankingDetails (audit-on-read), viewTaxForms, viewPaymentHistory, generate T5018, send remittance, viewAccountsPayableBalance
- **SR:** viewList, viewDetail (no pricing, no banking, no performance) — for sourcing material info during quoting
- **Tech:** viewList minimal — contact info for shipments coordination
- **VO:** viewList only

## 8.6 Views

### Vendor list (`/people/vendors`)

Filter chips: category, status, payment terms, currency, country, insurance-expiring-soon, T5018-required, preferred-for-category. Sortable columns: vendor name, category, status, last PO date, total spend YTD, performance grade.

### Vendor create drawer

Sectioned wizard:
1. Identity — entity type (Company/Individual), legal name, common name, vendor code (auto-generated)
2. Classification — category, currency, language, time zone
3. Contact — phones, email, website
4. Tax & Registration — CRA/HST/GST numbers, T5018 required flag, W9 if US vendor
5. Location — primary address
6. Shipping — ship-to addresses (multiple)
7. Banking & AP (gated to A/Acc creator) — account info encrypted at rest
8. Payment Terms — terms days, basis, default tax code
9. Onboarding gates — required gates auto-suggested by category
10. Account Manager assignment
11. Internal notes

### Vendor detail page — 13 tabs

1. **Overview** — header card (status, category, AM, key metrics: total spend YTD, open POs, last activity), quick actions
2. **Contacts** — vendor contacts table with role chips
3. **Banking & AP** — banking details (gated, audit-on-read), payment methods, AP balance, payment terms
4. **Pricing** — per-item pricing inherited from catalog sync + manual overrides, volume discount tiers, lead times, min order quantities
5. **Performance** — scorecard with on-time delivery %, price accuracy %, damage rate %, grade A-D, trend chart
6. **PO History** — all POs from this vendor with status, value, receive date variance
7. **Invoice History** — vendor invoices received with payment status
8. **Payment History** — payments made with method, date, reference
9. **Onboarding** — gate fulfillment status with attached docs
10. **Insurance & Compliance** — insurance certs with expiry tracking + alert badges; WSIB clearance; tax forms
11. **Documents** — all vendor documents (MSA, NDA, certs, contracts)
12. **Communication Log** — emails, calls, letters
13. **Audit Log** — module audit drilldown

### Performance scorecard

KPI tiles: Performance Grade (A/B/C/D with color), On-Time Delivery %, Price Accuracy %, Damage Rate %. Trend charts over last 12 months. Compare-to-category-average. Auto-degrade alert if grade drops C/D → preferred status removed → notification to A.

### T5018 annual report (`/people/vendors/t5018-report`)

A/Acc only. Annual tax year selector. Lists all T5018-required vendors with YTD totals. Generate batch T5018 PDFs (eight-layer protected). Submit-to-CRA export format. Audit trail of generation.

### Insurance expiry dashboard

Cross-vendor view of expiring certs. Color-coded: red (expired), orange (within 30 days), yellow (within 60 days), green (current). One-click email vendor to request renewal.

## 8.7 Field-level treatment

7 visibility flags:

- `visibility.vendors.bankingDetails` — A, Acc only (encrypted at rest, audit-on-read; account # masked)
- `visibility.vendors.taxFormCopies` — A, Acc only
- `visibility.vendors.unitPricing` — A, PM, Acc (SR sees availability not cost)
- `visibility.vendors.performanceScores` — A, PM, Acc
- `visibility.vendors.creditTerms` — A, Acc, PM
- `visibility.vendors.internalNotes` — A only (vendor relationship sensitive)
- `visibility.vendors.t5018YtdAmount` — A, Acc only (tax-sensitive)

## 8.8 Custom-field surfaces

Per-vendor custom fields managed in Settings → Custom Fields → Vendors. Common examples:
- Preferred Distributor (Y/N)
- Direct Manufacturer Account (Y/N)
- Account Manager Email
- Spending Tier (computed)
- Strategic Partner flag
- Rebate Program Eligible
- Net Terms Negotiated Date
- Annual Volume Commitment
- ULC-Listed Equipment Supplier (Y/N)
- Diversity-Owned Business (M/W/Indigenous)

## 8.9 Status surfaces

4 lookup tables (see §8.4). Each with behavior bindings:

- `vendor_categories` drives default payment terms + T5018 required default + accounting category
- `vendor_statuses` drives PO/payment eligibility (On Hold blocks PO creation; Archived terminal)
- `vendor_onboarding_gate_types` provides clause text for vendor-side T&C composition
- `vendor_payment_term_basis` calculation rules mirror client model from M1

## 8.10 Cross-module relationships

### Reads

- **Settings (M3):** vendor_categories, vendor_statuses, onboarding gate types, payment terms, tax codes, T&C clauses
- **Employees (M2):** account manager assignment
- **Settings (M3):** vendor-side T&C clauses for MSA/NDA/Anti-Corruption composition

### Read by

- **Inventory (M7):** POs reference vendor_id; vendor_catalog_sync_state owned by M7 but vendor master from M8; vendor_performance_scores derived from M7 movements + PO accuracy
- **Invoices (M9):** vendor bills are inbound invoices linked to vendor
- **Financials (M11):** AP aging, payment runs, T5018 reporting
- **Settings (M3):** vendor lookups managed here

### Writes

- **Communication log (M1):** all vendor communications
- **Audit events on every state change**

### Events emitted

`vendor.created`, `vendor.updated`, `vendor.status_changed`, `vendor.on_hold`, `vendor.released`, `vendor.banking_updated` (Acc audit), `vendor.insurance_uploaded`, `vendor.insurance_expiring` (30/60/90 day alerts), `vendor.insurance_expired`, `vendor.wsib_expiring`, `vendor.wsib_expired`, `vendor.t5018_issued`, `vendor.performance_score_calculated`, `vendor.performance_degraded` (auto-removes preferred status if grade drops to C/D), `vendor.tax_form_uploaded`, `vendor.merge_completed`.

## 8.11 Competitive floor delta

Combines best of:
- **simPRO suppliers:** vendor master, multiple contacts, catalog sync, supplier performance, supplier quotes
- **ServiceTitan vendors:** vendor master, vendor pricing, vendor invoicing
- **Sedona Office:** basic AP vendor master

**Nexvelon-unique:**
- **T5018 YTD tracking + annual report generation** (Canada compliance for sub-contractor payments — distinct from W9/W8-BEN for US vendors). No competitor in field service space handles Canadian T5018 natively.
- **Vendor onboarding gate framework** mirroring client onboarding gates from Module 1 (extends clause-per-gate pattern to vendor-side T&C: MSA, NDA, Anti-Corruption, Privacy Compliance)
- **Insurance certificate expiry tracking** with 30/60/90-day alerts (auto-blocks PO creation if cert expired)
- **WSIB clearance tracking** (Ontario regulatory — required for vendors providing labor; auto-blocks PO if expired)
- **Vendor performance scoring with auto-degrade-of-preferred-status** — when grade drops to C/D, preferred-for-category flag auto-removed; SR/PM see warning when selecting this vendor for new POs
- **Eight-layer print protection** on remittance advice PDFs + T5018 forms
- **Vendor banking encrypted at rest with audit-on-read** (mirrors client banking pattern from M1)
- **Per-vendor lead time + minimum order qty + volume discount tiers** used by M7 PO suggestions
- **Vendor-side T&C versioning** (extends §0.4 #8 versioning commitment to vendor-side legal docs)
- **Cross-link flag** with Subcontractors (Module 10) so entity master is unified at the operational level despite separate tables

## 8.12 Permissions design implications (items 50-53)

50. **Vendor banking encrypted at rest with audit-on-read.** Same pattern as client banking from M1. Account # masked except on explicit reveal action; audit row written on every reveal. PRINCIPLES §4 alignment.

51. **Vendor T5018 YTD as gated field.** A/Acc only. Tax-sensitive. Mirrors employee SIN and client banking patterns.

52. **Vendor performance auto-degrade workflow.** Preferred-for-category flag auto-removed when performance grade drops to C/D. Manual re-grant requires A approval with reason captured. Audit trail.

53. **Vendor onboarding gate composition** generates vendor-side T&C for MSA + NDA + Anti-Corruption + Privacy. Mirrors client-side T&C clause-per-gate pattern from Module 1.

## 8.13 Open questions — RESOLVED IN SESSION J

1. ✅ **Vendors vs Subcontractors as separate entities:** YES, with cross-linking via `is_also_contractor` flag (and reverse on Module 10). Banking, onboarding, workflows differ enough to warrant separation.
2. ✅ **Multi-warehouse vendors:** YES — vendor can have multiple ship-to addresses.
3. ✅ **Vendor portal:** Phase 2 (consistent with M7 decision).
4. ✅ **Vendor-managed inventory (VMI):** Phase 2.
5. ✅ **Vendor scorecard visibility to vendor:** Phase 2 (portal feature).
6. ✅ **Vendor consolidated billing (multiple POs on one invoice):** YES — supported at v1 via invoice line items linking back to PO lines.
7. ✅ **Vendor catalog sync conflict resolution UI:** scoped here in M8; M7 owns the underlying sync state.
8. ✅ **Vendor-side T&C versioning** consistent with client-side: YES per §0.4 #8.
9. ✅ **Vendor anti-corruption attestation annual renewal:** YES — operator-configurable per gate; auto-expiry tracking with renewal reminder.

Remaining:

10. **Vendor diversity tracking** for diversity-spend reporting (M/W/Indigenous-owned businesses)? *Recommendation: YES via custom field at v1; dedicated reporting Phase 2.*
11. **Vendor 1099 (US equivalent of T5018):** *Recommendation: NO at v1; Canadian-first; expand to US Phase 2.*

## 8.14 Acceptance criteria (~35 scenarios)

### Functional — Vendor lifecycle (1-6)

1. Create new vendor via sectioned wizard. All required gates pre-suggest per category.
2. Set category Equipment Distributor → default payment terms Net 30 applied; T5018 required defaults FALSE; tax category set.
3. Promote vendor Lead → Active. PO creation now allowed.
4. Banking info encrypted at rest. Acc reveals → audit row written. PM cannot reveal.
5. On Hold blocks PO creation. PM attempts new PO → blocked with reason.
6. Archive vendor with no open POs succeeds. Archive vendor with open POs blocked with warning.

### Functional — Banking & AP (7-10)

7. Banking visible to Acc only. SR/Tech/VO see masked.
8. Audit-on-read writes row when Acc reveals account #.
9. Payment method management: add bank transfer, archive old method.
10. Remittance advice generation. PDF eight-layer protected. Email to vendor.

### Functional — Pricing (11-14)

11. Vendor-specific pricing per item. Item X $50 from Vendor A, $48 from Vendor B.
12. Volume discount tiers (1-9 units $50, 10-49 units $45, 50+ $40).
13. Lead time + min order qty captured; used by M7 PO suggestions.
14. Catalog sync vs manual override. Manual override persists; next sync flags conflict.

### Functional — Performance (15-18)

15. Performance scoring computed quarterly: on-time delivery, accuracy, damage rate.
16. Vendor grade drops C → preferred-for-category flag auto-removed → A notified.
17. Manual re-grant of preferred status by A with reason captured.
18. Scorecard view per role: PM sees own-experience POs only; A sees all.

### Functional — Compliance (19-24)

19. Insurance certificate uploaded with expiry. 30/60/90-day alerts triggered.
20. Insurance expired → PO creation auto-blocked.
21. WSIB clearance tracking. Expiry triggers alert + PO block.
22. T5018 YTD accumulated from vendor payments throughout year.
23. Annual T5018 report generation (Canada). PDF batch generated. Eight-layer protected. Audit row written.
24. W9 upload (US vendor). W8-BEN for foreign US vendor.

### Functional — Onboarding gates (25-27)

25. Vendor onboarding gate config: select required gates per vendor.
26. Gate fulfillment with attached doc. Status updates to Fulfilled.
27. Vendor-side T&C auto-composition for MSA from gates + Vendor T&C clause library.

### Functional — Permissions (28-33)

28. SR sees no pricing.
29. Acc sees banking only with audit.
30. Banking edit gated to A.
31. T5018 YTD gated to A/Acc.
32. Insurance certificate uploadable by AM only.
33. Vendor On Hold blocks PO creation.

### Functional — Performance & security (34-35)

34. List 1000 vendors with filter applied → <2s.
35. RLS blocks unauthorized banking detail read. API attempt returns 403 + audit row.

---

═══════════════════════════════════════════════════════════════════
# Modules 9-13: pending walk
═══════════════════════════════════════════════════════════════════

- §9 — Invoices
- §10 — Subcontractors (also "Contractors")
- §11 — Financials
- §12 — Scheduling
- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary

*Running count: ~850 actions across 8 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7 + ~65 M8).*

## 100. Final sidebar tree

*Locked through Session D — see §0.7.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*53 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5, 38-44 M6, 45-49 M7, 50-53 M8).*

## 103. Cumulative acceptance criteria

*~371 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5 + ~58 M6 + ~48 M7 + ~35 M8).*

---

**End of v0.9.** Modules 1-8 complete. Vendor module scoped with T5018 YTD tracking + annual report generation (Canada compliance), vendor onboarding gate framework mirroring client onboarding, insurance + WSIB expiry tracking with auto-PO-block, vendor performance scoring with auto-degrade-of-preferred-status, eight-layer print protection on remittance advice + T5018 PDFs, banking encrypted at rest with audit-on-read. Cross-cutting commitments from Sessions C-J propagate forward.

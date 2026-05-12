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
> **Status:** v0.11 — Modules 1-10 fully scoped through Sessions C-L.
> Modules 11-13 pending. M1-M9 condensed to headline stats per
> file-size management pattern; current module gets full content.

---

## 0. How to use this document

### 0.1-0.7

Per v0.10 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; ten dimensions of permission control; baseline gaps from Session C.

### 0.4 Permissions model — locked commitments

Through Sessions B-L:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widgets + quote terms snapshots + change order amendments + commissioning records + FIFO inventory layers + vendor-side T&C clauses + invoice send snapshots + contractor WO terms snapshots + labor rate snapshots.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages, PO PDFs, remittance advice, T5018 forms, invoices, credit notes, statements, contractor WOs, MSA forms).
10. **Comprehensive logging visibility** per PRINCIPLES §4. **Append-only ledgers** for inventory movements, commissioning records, acceptance records, vendor/contractor performance scoring, GL postings.
11. **Separation of duties** enforcement (AP bill creator ≠ approver; payment run creator ≠ approver).
12. **Regulatory expiry auto-block enforcement** (insurance + WSIB expired → PO/WO creation blocked; manual override requires A approval + reason).

### 0.6 Walk order

1. Clients + Sites + Contacts *(complete §1)*
2. Employees + Permissions *(complete §2)*
3. Settings *(complete §3)*
4. Dashboard *(complete §4)*
5. Quotes *(complete §5)*
6. Projects *(complete §6)*
7. Inventory *(complete §7)*
8. Vendors *(complete §8)*
9. Invoices *(complete §9)*
10. **Subcontractors** *(complete §10)*
11. Financials
12. Scheduling
13. Reports

### 0.7 Sidebar architecture *(unchanged from Session K)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People (parent — Clients, Sites, Employees, Vendors, Contractors, Misc Contacts)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials (parent — 12 sub-items spanning M9 + M11)
📈 Reports
⚙️ Settings
```

---

═══════════════════════════════════════════════════════════════════
# 1-9. Modules 1-9 — condensed headline stats
═══════════════════════════════════════════════════════════════════

## §1. Clients + Sites + Contacts

23 routes, ~110 actions, 15 lookup tables, 14 field visibilities. Per-site SLAs with precedence. Contractual integrity exception. Holdback (10%/Excl/45 Ontario Construction Act). Communication log first-class. 54 acceptance criteria. Permissions: items 1-14. (Full content at commit `073b393`.)

## §2. Employees + Permissions

25 routes, ~80 actions, 11 lookup tables, 14 field visibilities. Six-tab permissions editor. 25+ seeded certification types. Multi-territory model. Resource Absences. Request-admin-access workflow. Effective-permissions caching. 55 acceptance criteria. Permissions: items 15-22. (Full content at commit `4dc0cc2`.)

## §3. Settings

~70 sub-pages, ~270 actions, 16 Settings-specific tables, 4 status surfaces. 29 operator-editable lookups. 12 custom-field-definition entity managers. Workflow Rules condition-action table. Email/PDF templates with Handlebars + per-language versioning. Settings change preview. 42 acceptance criteria. Permissions: items 23-27. (Full content at commit `87a9fc8`.)

## §4. Dashboard

3 routes, ~35 actions, 5 owned tables, 3 status surfaces. ~20 seeded widgets across 6 role default layouts. Three-way widget visibility gate. UI presentation locked as 10th dimension of permission control. 25 acceptance criteria. Permissions: items 28-30. (Full content at commit `6283d0f`.)

## §5. Quotes

18 routes + 1 signed-URL portal, ~85 actions, 12 owned tables, 5 status surfaces. Three quote types. Online portal acceptance. Immutable send snapshots. Eight-layer print on revenue PDFs. T&C auto-composition. Value + discount threshold approval routing. 52 acceptance criteria. Permissions: items 31-37. (Full content at commit `5633e25`.)

## §6. Projects

24 routes, ~110 actions, 12 owned tables, 8 status surfaces. Three-state costing (Estimated/Committed/Actual). Change order workflow with customer signature. Commissioning workflow with per-equipment test results + ULC fire-alarm verification auto-attachment. Handover package auto-assembly. Progress invoicing (Canadian Construction Act compliance). Trade Contractor lien deadline tracking (Ontario 60-day). 58 acceptance criteria. Permissions: items 38-44. (Full content at commit `bafb708`.)

## §7. Inventory

26 routes, ~95 actions, 15 owned tables, 6 status surfaces. Multi-location stock. FIFO valuation. Append-only inventory_movements ledger. Serial number lifecycle tracking. Photo capture on receive. Project-reserved stock locking. Eight-layer print on PO PDFs. Mobile barcode scan-and-go. Vendor catalog sync. 48 acceptance criteria. Permissions: items 45-49. (Full content at commit `f7cee0d`.)

## §8. Vendors

18 routes, ~65 actions, 8 owned tables, 4 status surfaces. T5018 YTD tracking + annual report (Canada). W9/W8-BEN for US. Vendor onboarding gate framework. Insurance + WSIB expiry tracking with auto-PO-block. Vendor performance scoring with auto-degrade. Banking encrypted at rest with audit-on-read. 35 acceptance criteria. Permissions: items 50-53. (Full content at commit `f3a763a`.)

## §9. Invoices

22 routes + 1 customer payment portal, ~115 actions, 14 owned tables, 5 status surfaces. Two parallel flows (AR + AP). Customer payment portal with Stripe (CC + EFT + ACH + wire). 3-way match automated. Separation of duties (creator ≠ approver). T5018 YTD auto-update on AP payments. Canadian Construction Act holdback release timing. Eight-layer print on invoice/credit note/statement PDFs. Immutable send snapshots. Multi-currency. 55 acceptance criteria. Permissions: items 54-58. (Full content at commit `681b2ad`.)

---

═══════════════════════════════════════════════════════════════════
# 10. Module: Subcontractors
═══════════════════════════════════════════════════════════════════

## 10.1 Purpose

Subcontractor master entity. Sells us **labor** (not stuff — that's vendors). Three categories:

1. **Trade Subcontractors** — Electricians, cable installers, alarm techs, fire alarm installers, network specialists, ULC technicians
2. **Service Subcontractors** — Monitoring services, equipment programming specialists, AHJ inspectors, ULC certifiers
3. **Specialty Subcontractors** — Commissioning specialists, training providers, engineering consultants

**Key differences from Vendors (M8):**
- WSIB clearance **critical** (Ontario regulatory; auto-blocks WO assignment if expired)
- T5018 **mandatory** in Canada for labor payments (vs optional for material vendors)
- Labor rates (hourly/daily/per-job + overtime/weekend/holiday multipliers)
- Skills inventory (which trades they can do — references M2 certification_types)
- Service territories (where they can work)
- Worker manifest (individual workers on their crew with individual certs verified)

**Cross-link with Vendors:** `is_also_vendor` flag (reverse of M8's `is_also_contractor`). Some entities provide both (e.g., an electrical contractor who also sells electrical supplies).

Much of the framework already established:
- Onboarding gate pattern from M8 vendors
- Banking encryption + audit-on-read from M1/M8
- T5018 YTD tracking pattern from M8 (now mandatory)
- Insurance + WSIB expiry tracking from M8 (WSIB now auto-blocks WO creation)
- Performance scoring with auto-degrade from M8
- Eight-layer print protection patterns
- Lien deadline tracking from M6 (now surfaces here per-WO)
- Regulatory expiry auto-block enforcement (now §0.4 #12)

## 10.2 Sidebar surface

Under 👥 People parent → Contractors sub-item per §0.7. Badge: contractors with expiring WSIB/insurance (30/60/90-day windows) + WOs pending acknowledgement + WOs in lien period approaching deadline.

## 10.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/people/contractors` | List view | `contractors:viewList` |
| `/people/contractors/new` | Sectioned create drawer | `contractors:create` |
| `/people/contractors/[id]` | Detail (Overview tab) | `contractors:viewDetail` |
| `/people/contractors/[id]/contacts` | Contractor contacts | `contractors:viewContacts` |
| `/people/contractors/[id]/banking` | Banking + AP config | `contractors:viewBankingDetails` |
| `/people/contractors/[id]/labor-rates` | Versioned labor rate table | `contractors:viewLaborRates` |
| `/people/contractors/[id]/skills` | Skills inventory | `contractors:viewSkills` |
| `/people/contractors/[id]/territories` | Service territories | `contractors:viewTerritories` |
| `/people/contractors/[id]/worker-manifest` | Crew composition | `contractors:viewWorkerManifest` |
| `/people/contractors/[id]/performance` | Performance scorecard | `contractors:viewPerformance` |
| `/people/contractors/[id]/work-order-history` | All WOs to this contractor | `contractors:viewWoHistory` |
| `/people/contractors/[id]/onboarding` | Gate fulfillment | `contractors:viewOnboardingRequirements` |
| `/people/contractors/[id]/insurance` | Insurance certs with expiry | `contractors:viewInsurance` |
| `/people/contractors/[id]/wsib` | WSIB clearance + history | `contractors:viewWsib` |
| `/people/contractors/[id]/tax-forms` | T5018 tracking | `contractors:viewTaxForms` |
| `/people/contractors/[id]/documents` | All contractor documents | `contractors:viewDocuments` |
| `/people/contractors/[id]/communication-log` | Email/call/SMS | `contractors:viewCommunicationLog` |
| `/people/contractors/[id]/audit-log` | Module audit | `contractors:viewAuditLog` |
| `/people/contractors/work-orders` | All WOs across contractors | `contractor_work_orders:viewList` |
| `/people/contractors/work-orders/[woId]` | WO detail | `contractor_work_orders:viewDetail` |
| `/people/contractors/skill-matcher` | Skill-based matching for project | `contractors:useSkillMatcher` |
| `/people/contractors/t5018-report` | Annual T5018 (Canada mandatory) | `contractors:generateT5018` |
| `/people/contractors/lien-dashboard` | Cross-WO lien deadline dashboard | `contractor_work_orders:viewLienDashboard` |

## 10.4 Resources

### Owned tables (13)

- `contractors` — header: entity_type, legal_name, common_name, contractor_code, category_id, status_id, currency_id, language_id, time_zone, business_phone, alt_phone, general_email, website, cra_business_number, hst_gst_number, addr fields, ship_to_addr fields, banking_account_name (encrypted), routing_number (encrypted), bank_account_number (encrypted), payment_method_id, payment_terms_days, payment_terms_basis, default_tax_code_id, t5018_required (TRUE default for labor), t5018_ytd_amount, wsib_required (TRUE default), wsib_clearance_expiry, insurance_cert_expiry, msa_signed_at, account_manager_user_id, crew_size_typical, labor_rate_basis (Hourly/Daily/Per-Job), default_overtime_multiplier (1.5 default), default_weekend_multiplier, default_holiday_multiplier, is_also_vendor (cross-link to M8), internal_notes, archived_at, custom_fields jsonb
- `contractor_contacts` — many contacts per contractor
- `contractor_labor_rates` — versioned rate table: contractor_id, role_label (e.g., "Senior Tech"), base_rate, overtime_rate, weekend_rate, holiday_rate, travel_rate, effective_from, effective_to (nullable for current), currency_id
- `contractor_skills` — M:N to certification_types: contractor_id, certification_type_id, proficiency_level (1-5), years_experience, primary_skill flag
- `contractor_territories` — M:N: contractor_id, territory_id, territory_type (Primary/Secondary), max_travel_distance_km
- `contractor_worker_manifest` — individual workers: contractor_id, worker_name, worker_role, worker_certs jsonb, worker_id_doc, worker_photo_url, is_active, hired_at, terminated_at
- `contractor_performance_scores` — append-only: contractor_id, period_start, period_end, on_time_completion_pct, quality_score, safety_incidents_count, total_wo_value, total_wos, performance_grade, computed_at
- `contractor_onboarding_requirements` — per-contractor gate config
- `contractor_onboarding_gate_fulfillments`
- `contractor_insurance_certs` — versioned (Liability/Workers Comp/Auto)
- `contractor_wsib_records` — versioned WSIB clearance: contractor_id, clearance_number, expiry_date, attached_doc_url, status
- `contractor_t5018_records` — annual T5018 (mandatory)
- `contractor_work_orders` — WO header: wo_number, contractor_id, project_id (nullable), project_phase_id (nullable), source_quote_line_id (nullable), status_id, scope_description, scope_line_items jsonb, scheduled_start, scheduled_end, actual_start, actual_end, agreed_rate, total_estimated, total_actual, retention_pct, retention_amount, retention_release_date (substantial_completion + 45 days), lien_deadline (substantial_completion + 60 days), sent_to_contractor_at, signed_by_contractor_at, contractor_signature_image_url, customer_signed_at, customer_signature_image_url, snapshot_terms jsonb (versioned vendor-side T&C at send)
- `contractor_wo_line_items` — line items on WOs (qty, hours, labor vs materials breakdown)

### Status lookup tables (5)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `contractor_categories` | Trade Sub (Electrician/Cable/Alarm/Fire/Network), Service Sub (Monitoring/Programming/Inspector/ULC), Specialty Sub (Commissioning/Training/Engineering), Other | default WSIB/T5018 required, payment terms, accounting category |
| `contractor_statuses` | Lead, Active, Inactive, On Hold (WO blocked), Archived | allows-wo, allows-payment, terminal flag |
| `contractor_onboarding_gate_types` | Insurance Cert (Liability + Workers Comp), Business License, Banking Info, T5018 Registration (mandatory CA), WSIB Clearance (mandatory ON), Trades Certifications, Anti-Corruption Declaration, NDA, MSA, Safety Compliance Affidavit, Drug Test Certificate, Confidentiality Agreement, Privacy Compliance | clause text for vendor-side T&C composition, mandatory-for-category, expiry tracking |
| `contractor_wo_statuses` | Draft, Sent to Contractor, Acknowledged, In Progress, Completed, Inspection Required, Approved, Disputed, Cancelled, Lien Period (60-day clock), Closed (lien deadline passed), Retention Released | allows-edit, triggers-lien-clock, allows-payment, allows-retention-release |
| `contractor_labor_rate_types` | Hourly, Daily, Per-Job, Per-Square-Foot, Per-Unit | calculation rule for cost flow |

## 10.5 Actions (~75 actions across 13 categories)

**Contractor lifecycle (15):** viewList, viewDetail, viewMy, create, editBasic, promoteStatus, editAddress, editBilling, viewBankingDetails, editBankingDetails, editPaymentTerms, putOnHold, releaseHold, archive, unarchive, hardDelete (A only), merge, exportCsv, importCsv.

**Contacts (5):** viewList, create, edit, delete, setPrimary.

**Banking (4 gated):** viewBankingDetails, editBankingDetails, addPaymentMethod, archivePaymentMethod.

**Labor rates (8):** viewList, viewHistory, edit, addNewRate (effective-dated), archive (mark inactive), applyMultiplier, setEffectiveDate, viewByRole.

**Skills (5):** viewList, addSkill, removeSkill, updateProficiency, viewCertExpiry.

**Territories (4):** viewList, assign, remove, setMaxDistance.

**Worker manifest (6):** viewList, addWorker, editWorker, removeWorker, verifyWorkerCert, exportRoster.

**Performance (5):** viewScorecard, viewHistory, exportReport, triggerRescoring, viewComparison.

**Work orders (15):** viewList, viewDetail, create (typically from M6 project), edit, send, recordAcknowledgement, recordInProgress, recordCompleted, requestInspection, approve, dispute, manageRetention, startLienPeriod (auto on substantial completion), closeWO (post-lien deadline), exportPdf, eightLayerPrint.

**Onboarding (10):** viewRequirements, editRequirements, gate fulfillment workflow, T&C composition for contractor MSA, uploadGateDoc, markFulfilled, viewClause, viewVendorSideTerms, exportMsaPdf, recordSignature.

**Compliance (8):** viewInsurance, uploadInsurance, viewWsib, uploadWsib (auto-block WO on expiry), viewT5018Ytd, generateT5018Report, recordTradeCertification, recordSafetyCompliance.

**Skill matcher (3):** viewMatcher, findContractorsForProject (skill + territory + availability), viewMatchResults.

**Reports (5):** spendByContractor, performanceComparison, openWorkOrders, lienPeriodReport, t5018Annual.

**Default grants:**
- **A:** full
- **PM:** viewList, viewDetail, viewLaborRates, viewPerformance, viewWoHistory; create/manage WOs for own projects; cannot edit banking
- **Acc:** viewList, viewDetail, viewBankingDetails (audit-on-read), viewTaxForms, viewWsib, generate T5018, viewAccountsPayableBalance
- **SR:** viewList minimal (read contact info for quote sourcing if labor required)
- **Tech:** viewList minimal — contact info for coordination
- **VO:** viewList only

## 10.6 Views

### Contractor list (`/people/contractors`)

Filter chips: category, status, WSIB expiring soon, insurance expiring soon, primary territory, skill (multi-select), available now (no active WO), preferred-for-trade. Sortable columns: name, category, status, last WO date, total spend YTD, performance grade, WSIB expiry, insurance expiry.

### Contractor create drawer

Sectioned wizard (12 sections):
1. Identity (entity type, legal name, common name)
2. Classification (category, currency, language, time zone)
3. Contact info
4. Tax & Registration (T5018 mandatory if Canadian labor sub)
5. Location
6. Banking & AP (gated; encrypted)
7. Payment Terms
8. Default Labor Rate Basis + multipliers
9. Skills (select certifications from M2 list)
10. Territories
11. Onboarding gates (WSIB mandatory if Ontario)
12. Account Manager + internal notes

### Contractor detail page — 15 tabs

1. Overview / 2. Contacts / 3. Banking & AP / 4. Labor Rates / 5. Skills / 6. Territories / 7. Worker Manifest / 8. Performance / 9. Work Order History / 10. Onboarding / 11. Insurance / 12. WSIB / 13. Tax Forms / 14. Documents / 15. Audit Log

### Work order detail

Header: WO number, contractor, project, status, agreed value. Scope description + line items. Schedule (start/end). Retention tracking (amount, release date). Lien deadline tracking (60-day Ontario; visible countdown). Customer sign-off section. Communication log. Audit trail.

### Skill matcher

Project requirements input → matches contractors who have:
- Required certifications
- Service territory covering project site
- WSIB + insurance currently valid
- Available capacity

Ranks by: performance grade, distance, cost (labor rate), availability.

### T5018 annual report

A/Acc only. Annual tax year selector. Lists all contractors with YTD totals. Batch T5018 PDFs (eight-layer protected). Submit-to-CRA export. Audit trail.

### Lien dashboard (`/people/contractors/lien-dashboard`)

Cross-WO view of lien periods. Color-coded countdown (red <7 days, orange 7-14, yellow 15-30, green 30+). Drill into individual WO. Auto-alert PM when deadline approaching.

### WSIB expiry dashboard

Cross-contractor view of expiring WSIB. Color-coded by expiry. Auto-WO-block status visible.

## 10.7 Field-level visibility (7 flags)

- `visibility.contractors.bankingDetails` — A, Acc only (encrypted at rest, audit-on-read)
- `visibility.contractors.laborRates` — A, PM, Acc
- `visibility.contractors.unitCost` (markup applied for project costing) — A, Acc
- `visibility.contractors.performanceScores` — A, PM, Acc
- `visibility.contractors.workerManifest` — A, PM (project-scoped), AM
- `visibility.contractors.t5018YtdAmount` — A, Acc only
- `visibility.contractors.internalNotes` — A only

## 10.8 Custom-field surfaces

Per-contractor custom fields managed in Settings → Custom Fields → Contractors. Examples: Trade Union Member (Y/N), Preferred Project Type, Equipment Provided (Y/N), Vehicle Provided, Drug Testing Required, Background Check Date, Safety Score Source, Annual Volume Commitment, Strategic Partner flag, Indigenous Business (Y/N).

## 10.9 Status surfaces

5 lookup tables (see §10.4).

## 10.10 Cross-module relationships

### Reads

- **Settings (M3):** contractor_categories, contractor_statuses, onboarding gate types, payment terms, certification_types (from M2 used for skills)
- **Employees (M2):** account manager assignment, certification_types catalog, territories catalog
- **Settings (M3):** vendor-side T&C clauses for MSA/NDA/Anti-Corruption composition

### Read by

- **Projects (M6):** subcontractor work orders dispatched from project; retention tracking; lien deadline tracking surfaces in M6
- **Invoices (M9):** AP bills from contractors (separation of duties enforced)
- **Vendors (M8):** cross-link via is_also_vendor flag
- **Scheduling (M12):** contractor availability + work blocks
- **Financials (M11):** contractor AP aging, T5018 annual reporting

### Writes

- **Communication log (M1):** all contractor communications
- **Audit events on every state change**

### Events emitted

`contractor.*`, `worker.*`, `work_order.*` (drafted, sent, acknowledged, in_progress, completed, approved, disputed, lien_period_started, lien_deadline_approaching, lien_deadline_passed, retention_released, closed).

## 10.11 Competitive floor delta

Combines best of:
- **simPRO contractor portal:** WO dispatch, contractor rates, performance, retention/holdback
- **ServiceTitan subcontractor management:** WO portal, performance scoring
- **Procore:** Trade contractor management, lien tracking

**Nexvelon-unique:**
- **WSIB clearance auto-block on expiry** — WO creation auto-blocked if contractor's WSIB expired (Ontario regulatory enforcement no competitor does natively)
- **T5018 YTD tracking mandatory for labor sub-contractors** (Canada compliance)
- **Trade Contractor lien deadline tracking** (Ontario Construction Act 60-day) per WO with visible countdown
- **Worker manifest with individual cert verification** — each worker on contractor's crew has individual certs verified
- **Skill-based + territory-based contractor matching** for project assignment
- **Cross-link with Vendors** via `is_also_vendor` flag
- **Versioned labor rate tables** with effective-dating
- **Append-only contractor performance ledger** with auto-degrade-of-preferred
- **Eight-layer print protection** on contractor MSAs, T5018 forms, WO PDFs
- **Banking encrypted at rest with audit-on-read** (extends M1/M8 patterns)

## 10.12 Permissions design implications (items 59-62)

59. **Subcontractor WSIB auto-block on expiry** — WO creation blocked at action level when contractor's WSIB expired. Manual override requires A approval + reason + audit row.

60. **Worker manifest with project-scoped visibility.** PM sees worker manifests for contractors on own projects only; A sees all. AM sees assigned contractors.

61. **Contractor labor rates as gated field.** A/PM/Acc only. SR sees availability not cost. Versioned with effective dates; rate snapshot captured at WO creation for legal durability.

62. **Cross-link sync workflow.** Entity flagged as both `is_also_vendor` (M8) and contractor (M10) — banking sync between records; onboarding gate fulfillment can be shared. Audit captures sync events.

## 10.13 Open questions — RESOLVED IN SESSION L

1. ✅ **Trade Contractor lien deadline UI** — per-WO visible countdown + cross-WO lien dashboard at v1.
2. ✅ **Worker manifest verification enforcement** — verify each worker has correct certs at WO creation; mobile check-in Phase 2.
3. ✅ **Skill-based matching algorithm** — YES at v1, simple matching on certification + territory + availability + performance grade.
4. ✅ **Pay-when-paid clause tracking** — basic at v1 (flag on WO); advanced Phase 2.
5. ✅ **Contractor portal** — Phase 2.
6. ✅ **Crew tracking** — YES at v1 (worker manifest with individual cert tracking).
7. ✅ **WSIB form auto-generation** (Form 5 incident report, Form 7 return-to-work) — YES at v1.
8. ✅ **Sub-contractor self-onboarding signup** — Phase 2.

Remaining:

9. **Trade union compliance tracking** — YES via custom field at v1; reporting Phase 2.
10. **Contractor scorecard visible to contractor** (Phase 2 portal feature).
11. **Equipment-provided-by-contractor tracking** — YES via custom field at v1.

## 10.14 Acceptance criteria (~38 scenarios)

### Functional — Contractor lifecycle (1-6)

1. Create contractor via sectioned wizard; WSIB + T5018 gates auto-suggested for Canadian labor sub.
2. Set category Trade Sub → WSIB mandatory; T5018 mandatory; insurance both Liability + Workers Comp required.
3. Promote Lead → Active; WO creation enabled.
4. Banking encrypted; Acc reveals → audit row written.
5. On Hold blocks WO creation.
6. Archive contractor with no open WOs succeeds.

### Functional — Banking & AP (7-9)

7. Banking visible to Acc only.
8. Audit-on-read writes row.
9. Cross-link with vendor (is_also_vendor) — banking sync prompt on update.

### Functional — Labor rates (10-12)

10. Add labor rate per role (Senior Tech $85/hr; Apprentice $45/hr); effective date set.
11. Schedule future rate (effective 30 days out).
12. Multipliers applied correctly (OT 1.5x, weekend 1.75x, holiday 2x).

### Functional — Skills (13-15)

13. Add ULC fire alarm cert with proficiency 4/5.
14. Cert expiry alert.
15. Skill matcher finds contractors with ULC cert + territory match.

### Functional — Territories (16-17)

16. Assign primary territory.
17. Skill matcher respects territory + travel distance.

### Functional — Worker manifest (18-20)

18. Add worker to crew with individual certs.
19. Verify worker cert (attached doc).
20. Worker cert expiry alert.

### Functional — Performance (21-22)

21. Performance scoring computed; grade A-D.
22. Auto-degrade: grade C → preferred-for-trade flag removed.

### Functional — Compliance/WSIB (23-27)

23. Insurance uploaded; expiry alerts at 30/60/90 days.
24. Insurance expired → WO creation blocked.
25. WSIB uploaded; expiry tracked.
26. WSIB expired → WO creation auto-blocked + alert.
27. Manual WSIB override by A with reason captured.

### Functional — T5018 (28-29)

28. T5018 YTD accumulated from contractor payments throughout year.
29. Annual T5018 report generation; eight-layer protected PDFs; audit trail.

### Functional — Work orders (30-34)

30. Create WO from M6 project; pre-fills with project context.
31. Send WO to contractor; eight-layer protected PDF email.
32. Contractor signs back; status In Progress.
33. WO completion → lien period (Ontario 60-day) → retention release at 45 days.
34. Lien deadline approaching → alert to PM.

### Functional — Permissions (35-36)

35. SR sees no labor rates; PM sees rates; Acc sees full cost.
36. PM sees worker manifest for own project's contractors only.

### Functional — Performance & security (37-38)

37. List 500 contractors with filters → <2s.
38. RLS blocks unauthorized banking detail read.

---

═══════════════════════════════════════════════════════════════════
# Modules 11-13: pending walk
═══════════════════════════════════════════════════════════════════

- §11 — Financials
- §12 — Scheduling (major reader of M1+M2+M3 surfaces)
- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary

*Running count: ~1040 actions across 10 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7 + ~65 M8 + ~115 M9 + ~75 M10).*

## 100. Final sidebar tree

*Refined Session K — see §0.7.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*62 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5, 38-44 M6, 45-49 M7, 50-53 M8, 54-58 M9, 59-62 M10).*

## 103. Cumulative acceptance criteria

*~464 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5 + ~58 M6 + ~48 M7 + ~35 M8 + ~55 M9 + ~38 M10).*

---

**End of v0.11.** Modules 1-10 complete. Subcontractors module scoped with WSIB auto-block on expiry (Ontario regulatory), T5018 mandatory tracking + annual report (Canada compliance), Trade Contractor lien deadline tracking (Ontario 60-day) with cross-WO dashboard, worker manifest with individual cert verification, skill-based + territory-based contractor matching, versioned labor rate tables with effective-dating, cross-link with Vendors (is_also_vendor flag), append-only performance ledger with auto-degrade-of-preferred-status, eight-layer print on MSAs + T5018 + WO PDFs, banking encrypted at rest with audit-on-read. New cross-cutting commitment locked: regulatory expiry auto-block enforcement (§0.4 #12). Cross-cutting commitments from Sessions C-L propagate forward.

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
> **Status:** v0.14 — **AUDIT COMPLETE.** All 13 of 13 modules
> scoped through Sessions C-O. Audit phase closed. Next phase:
> Permissions module design pass (ROADMAP item 2).
> M1-M12 condensed to headline stats; M13 full content.

---

## 0. How to use this document

### 0.1-0.7

Per v0.13 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; ten dimensions of permission control; baseline gaps from Session C.

### 0.4 Permissions model — locked commitments

Through Sessions B-O (FINAL):

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widgets + quote terms snapshots + change order amendments + commissioning records + FIFO inventory layers + vendor-side T&C clauses + invoice send snapshots + contractor WO terms snapshots + labor rate snapshots + GL period locking + SLA response time snapshots on appointments + report snapshots for audit/legal durability.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages, PO PDFs, remittance advice, T5018 forms, invoices, credit notes, statements, contractor WOs, MSA forms, tax filings, financial reports, executive reports).
10. **Comprehensive logging visibility** per PRINCIPLES §4. **Append-only ledgers** for inventory movements, commissioning records, acceptance records, vendor/contractor performance scoring, GL postings, schedule change log, report snapshots.
11. **Separation of duties** enforcement (AP bill creator ≠ approver; payment run creator ≠ approver; GL manual entry creator ≠ poster; hard close requires A + Acc co-sign).
12. **Regulatory expiry auto-block enforcement** (insurance + WSIB + certification expired → PO/WO/appointment creation blocked; manual override requires A approval + reason).
13. **Geolocation privacy retention** (mobile clock-in/out geolocation data retained 30 days default; operator-configurable).

### 0.6 Walk order — COMPLETE

1. Clients + Sites + Contacts *(complete §1)*
2. Employees + Permissions *(complete §2)*
3. Settings *(complete §3)*
4. Dashboard *(complete §4)*
5. Quotes *(complete §5)*
6. Projects *(complete §6)*
7. Inventory *(complete §7)*
8. Vendors *(complete §8)*
9. Invoices *(complete §9)*
10. Subcontractors *(complete §10)*
11. Financials *(complete §11)*
12. Scheduling *(complete §12)*
13. **Reports** *(complete §13)*

**🏁 ALL 13 MODULES WALKED.** Audit phase closed.

### 0.7 Sidebar architecture *(unchanged from Session K)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People (parent)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials (parent — 16 sub-items spanning M9 + M11)
📈 Reports                ← Module 13 surface
⚙️ Settings
```

---

═══════════════════════════════════════════════════════════════════
# 1-12. Modules 1-12 — condensed headline stats
═══════════════════════════════════════════════════════════════════

## §1. Clients + Sites + Contacts
23 routes, ~110 actions, 15 lookup tables, 14 field visibilities. Per-site SLAs with precedence. Contractual integrity exception. Holdback (10%/Excl/45 Ontario). 54 acceptance criteria. Permissions: items 1-14. (Full at `073b393`.)

## §2. Employees + Permissions
25 routes, ~80 actions, 11 lookup tables, 14 field visibilities. Six-tab permissions editor. 25+ seeded certifications. Multi-territory. 55 acceptance criteria. Permissions: items 15-22. (Full at `4dc0cc2`.)

## §3. Settings
~70 sub-pages, ~270 actions, 16 tables, 4 status surfaces. 29 operator-editable lookups. Workflow Rules. Email/PDF templates. 42 acceptance criteria. Permissions: items 23-27. (Full at `87a9fc8`.)

## §4. Dashboard
3 routes, ~35 actions, 5 owned tables, 3 status surfaces. ~20 seeded widgets, 6 role layouts. Three-way visibility gate. UI as 10th dimension. 25 acceptance criteria. Permissions: items 28-30. (Full at `6283d0f`.)

## §5. Quotes
18 routes + 1 portal, ~85 actions, 12 owned tables, 5 status surfaces. Three quote types. Online portal acceptance. Immutable send snapshots. T&C auto-composition. 52 acceptance criteria. Permissions: items 31-37. (Full at `5633e25`.)

## §6. Projects
24 routes, ~110 actions, 12 owned tables, 8 status surfaces. Three-state costing. Change order workflow. Commissioning + ULC verification. Handover with warranty clock. 58 acceptance criteria. Permissions: items 38-44. (Full at `bafb708`.)

## §7. Inventory
26 routes, ~95 actions, 15 owned tables, 6 status surfaces. Multi-location stock. FIFO valuation. Append-only movements ledger. Serial lifecycle. Vendor catalog sync. 48 acceptance criteria. Permissions: items 45-49. (Full at `f7cee0d`.)

## §8. Vendors
18 routes, ~65 actions, 8 owned tables, 4 status surfaces. T5018 YTD + annual report. Vendor onboarding gates. Insurance/WSIB expiry tracking. Performance scoring with auto-degrade. Banking encrypted. 35 acceptance criteria. Permissions: items 50-53. (Full at `f3a763a`.)

## §9. Invoices
22 routes + 1 portal, ~115 actions, 14 owned tables, 5 status surfaces. AR + AP parallel flows. Customer payment portal with Stripe. 3-way match. Separation of duties on AP. T5018 auto-update. Canadian Construction Act holdback. 55 acceptance criteria. Permissions: items 54-58. (Full at `681b2ad`.)

## §10. Subcontractors
23 routes, ~75 actions, 13 owned tables, 5 status surfaces. WSIB auto-block (§0.4 #12). T5018 mandatory. Lien deadline tracking. Worker manifest with cert verification. Skill + territory matching. 38 acceptance criteria. Permissions: items 59-62. (Full at `4c0b33b`.)

## §11. Financials
26 routes, ~90 actions, 12 owned tables, 6 status surfaces. Built-in GL with source-back traceability. Canadian-first tax compliance. Period close with separation of duties. FX revaluation. Bank reconciliation. QBO/Xero/Sage 50 export. 45 acceptance criteria. Permissions: items 63-67. (Full at `b60caf7`.)

## §12. Scheduling
20 routes, ~75 actions, 10 owned tables, 4 status surfaces. Heaviest cross-module reader (M1+M2+M3+M6+M10). Five-dimensional auto-suggest engine. Certification expiry auto-block. SLA response time auto-enforcement. Cross-resource scheduling. Mobile clock-in geolocation. 50 acceptance criteria. Permissions: items 68-72. (Full at `06261f6`.)

---

═══════════════════════════════════════════════════════════════════
# 13. Module: Reports
═══════════════════════════════════════════════════════════════════

## 13.1 Purpose

Cross-module reporting layer. This module sits *above* the per-module reports (which each module M5-M12 already includes) and covers:

1. **Standard report library per role** — ~40 pre-built cross-module reports
2. **Operator-defined custom reports** — basic copy-and-modify at v1; full report builder Phase 2
3. **Scheduled report delivery** — email PDFs on a schedule
4. **Report subscriptions** — users subscribe to reports they care about
5. **Saved report snapshots** — historical instances for audit/legal durability (immutable per §0.4 #10)
6. **Export formats** — CSV, Excel, PDF (eight-layer protected for sensitive reports)
7. **Cross-module reports** — reports spanning 2+ modules

**Key design distinction:**
- M4 Dashboard = real-time KPI widgets on landing page (operational)
- M11 Financials Reports = P&L, Balance Sheet, Cash Flow, Tax (financial)
- M13 Reports = broader cross-module analytical reports + custom + scheduled delivery (analytical)

For security integrators specifically: reports for WSIB/insurance expiry calendars consuming M2+M8+M10; ULC certification status from M2; T5018 readiness from M8+M10; SLA performance by response type from M12+M1; project margin by customer tier from M6+M1; commissioning completion rate from M6.

## 13.2 Sidebar surface

Top-level 📈 Reports per §0.7. Badge: scheduled report failures + pending subscriptions awaiting first delivery.

## 13.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/reports` | Reports hub with category cards | `reports:view` |
| `/reports/library` | Full standard report library | `reports:viewLibrary` |
| `/reports/library/[reportId]` | Single report render | `reports:viewReport:[id]` |
| `/reports/category/[categoryId]` | Reports by category | `reports:viewByCategory` |
| `/reports/custom` | Custom reports list | `custom_reports:viewList` |
| `/reports/custom/new` | Create custom report | `custom_reports:create` |
| `/reports/custom/[id]` | Custom report detail | `custom_reports:viewDetail` |
| `/reports/scheduled` | Scheduled deliveries management | `scheduled_reports:viewList` |
| `/reports/scheduled/new` | Schedule new delivery | `scheduled_reports:create` |
| `/reports/subscriptions` | My subscriptions | `subscriptions:viewMy` |
| `/reports/history` | Historical report snapshots | `report_snapshots:viewList` |
| `/reports/history/[snapshotId]` | View historical snapshot | `report_snapshots:viewDetail` |
| `/reports/audit-log` | Module audit | `reports:viewAuditLog` |

## 13.4 Resources

### Owned tables (7)

- `report_definitions` — built-in + custom report metadata: report_code (unique), name, category_id, description, query_spec jsonb (parametrized query), parameter_schema jsonb, default_role_access jsonb, output_formats[] (CSV/Excel/PDF), is_custom, is_active, created_by, created_at
- `custom_reports` — operator-defined: name, source_report_id (copied from standard library), modifications jsonb, owner_user_id, shared_with_user_ids[], shared_with_role_ids[], status, last_run_at
- `report_subscriptions` — user subscriptions: user_id, report_id, parameter_values jsonb, delivery_schedule_id, delivery_format, delivery_channels[] (email/in-app), is_active, last_delivered_at, next_delivery_at
- `scheduled_report_deliveries` — execution records: subscription_id, scheduled_at, executed_at, status (Pending/Success/Failed), generated_pdf_url, generated_csv_url, recipient_emails[], delivery_error_log
- `report_snapshots` — historical instances (immutable per §0.4 #10): report_id, parameters jsonb, executed_at, executed_by, output_pdf_url, output_csv_url, retention_until (per operator policy)
- `report_execution_log` — full execution history: report_id, executed_by, executed_at, parameters jsonb, duration_ms, row_count, success flag, error_log
- `report_dashboards` — operator-defined report groupings: name, description, report_ids[], owner_user_id, shared_with_role_ids[]

### Status lookup tables (4)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `report_categories` | Sales, Operations, Field Service, Financial, Compliance, Performance, Executive, Custom | display order, icon, role default access |
| `report_statuses` | Active, Archived, Draft, Deprecated | allows-execution, list visibility |
| `delivery_schedules` | Daily, Weekly (Monday), Weekly (Friday), Monthly (1st), Monthly (Last), Quarterly, Annually, On Demand | calculation rule for next_delivery_at |
| `report_export_formats` | CSV, Excel (xlsx), PDF (eight-layer), JSON | content type, file extension, protection flag |

## 13.5 Actions (~55 actions across 10 categories)

**Report library (10):** viewLibrary, viewReport (gated per report-role-mapping), runReport, viewParameters, configureParameters, viewLastResults, viewHistoricalRuns, viewMappings, exportPdf (eight-layer for sensitive), exportCsv, exportExcel.

**Custom reports (8):** viewList, viewMyCustomReports, create (copy + modify at v1; full builder Phase 2), edit, duplicate, share (users/roles), archive, viewSourceData.

**Scheduled deliveries (6):** viewList, create, edit, pause, resume, cancel.

**Subscriptions (5):** viewMy, subscribe, unsubscribe, configurePreferences, viewSubscriptionHistory.

**Snapshots (4):** viewList, viewSnapshot, exportHistoricalSnapshot, deleteSnapshot (A only with reason).

**Categories (3):** viewList, viewByCategory, configureCategories (A only).

**Permissions (5):** viewRoleDefaults, configureRoleAccess (A only), configureUserOverride (A only), viewReportAccessAudit, runOnBehalf (A only).

**Dashboards (4):** viewDashboards, createDashboard, shareDashboard, viewSharedDashboard.

**Reports of reports (7):** reportExecutionTrend, mostUsedReports, scheduledDeliverySuccess, customReportUsage, reportLatency, executiveSummaryUsage, complianceReportRunCadence.

**Audit (3):** viewAuditLog, viewExecutionLog, exportAuditTrail.

**Default grants:**
- **A:** full access
- **PM:** library for Operations + Field Service + Compliance (own team/project scoped); create custom reports
- **SR:** library for Sales (own clients scoped); subscribe to favourites
- **Tech:** library for Field Service (own work scoped); subscribe to "My Schedule This Week"
- **Acc:** library for Financial + Compliance + Performance; cross-user data with grant
- **VO:** library for Executive (top-level; no margin); view-only
- **Executive (custom role):** library for Executive; cross-user permitted

## 13.6 Views

### Reports hub (`/reports`)

Category cards (8 categories — Sales / Operations / Field Service / Financial / Compliance / Performance / Executive / Custom). Each card: report count + most-used report + quick subscribe link. Recently run reports list.

### Standard library (`/reports/library`)

Filter chips: category, role-default-availability, has-parameters, scheduled, has-snapshot-history. List view with: report name, category, last-run, format, role access. Click → run report.

### Report execution

Parameters panel (operator-configurable values: date range, client filter, project filter). Run button → executes → table view + chart + export buttons. Long-running reports queued + executed async.

### Custom report builder (basic at v1)

1. Choose source report from library
2. Modify parameters / filters / columns
3. Save with name + share settings
4. Run anytime

Phase 2 full builder: drag-drop fields from data model, joins across modules, custom aggregations, scheduled refresh.

### Scheduled deliveries (`/reports/scheduled`)

List of active scheduled deliveries with last status. Configure new: report + parameters + schedule + recipients (email or in-app inbox) + format.

### Subscriptions (`/reports/subscriptions`)

User's own subscriptions. Configure: which reports, frequency, format, delivery channel.

### Historical snapshots (`/reports/history`)

Per-report list of past instances. Each snapshot is immutable. Click → view that exact historical state. Useful for audit/legal/compliance.

### Standard report library (~40 reports across 7 categories)

**Sales (~6):** Quote pipeline by stage, Quote conversion rate by SR, Win/loss analysis, Quote aging by status, Average quote value trend, New leads + conversion.

**Operations (~7):** Project status overview, Project margin by customer tier, Project delay analysis, Change order impact analysis, Commissioning completion rate, Inventory turnover by category, Open POs by vendor.

**Field Service (~7):** Tech utilization by employee, SLA performance by response type, First-time fix rate, Customer satisfaction trend, Service call volume by site, Emergency dispatch metrics, Mobile completion rate.

**Financial (~5):** AR aging by sales rep, Vendor spend trend, Contractor spend YTD, Holdback liability outstanding, Late fee revenue.

**Compliance (~5):** WSIB expiry calendar (M2+M8+M10), Insurance renewal calendar (M2+M8+M10), ULC certification status (M2), T5018 readiness (M8+M10), Audit trail summary by module.

**Performance (~5):** Employee performance ranking (M2+M6+M12), Contractor performance ranking, Vendor performance ranking, SR pipeline + conversion ranking, PM project margin ranking.

**Executive (~5):** Revenue trend, Customer acquisition, Top accounts, Cost trends, Cash flow forecast.

## 13.7 Field-level visibility (3 flags)

- `visibility.reports.executiveReports` — A, executives, VO (limited)
- `visibility.reports.payrollReports` — A, HR-role, Acc
- `visibility.reports.crossUserData` — A, role-with-grant

## 13.8 Custom-field surfaces

Limited custom fields here — report parameters are operator-configurable per report. Custom reports themselves are the operator extensibility surface.

## 13.9 Status surfaces

4 lookup tables (see §13.4).

## 13.10 Cross-module relationships

### Reads from ALL modules

Reports query data from every module (M1-M12). Permission-aware queries: each report respects executing user's data scopes per ten-dimensional permissions model. Cross-user data requires explicit grant.

### Writes

- **Communication log (M1):** scheduled delivery records sent emails
- **Audit on every report execution + custom report change + subscription change**

### Events emitted

`report.executed`, `report.exported`, `report.scheduled_delivery_sent`, `report.scheduled_delivery_failed`, `custom_report.created`, `custom_report.edited`, `custom_report.shared`, `subscription.created`, `subscription.cancelled`, `report_snapshot.captured`.

## 13.11 Competitive floor delta

Combines best of:
- **ServiceTitan reports:** ~80 built-in library, scheduled delivery, custom reports
- **simPRO BI reporting:** 70+ built-in + premium custom add-on, multi-format export
- **QuickBooks reports:** financial focus
- **Sage Intacct dimensions:** flexible reporting by department/project/location

**Nexvelon-unique:**
- **Cross-module reports built-in** — 40+ cross-module reports (most competitors silo reports per module)
- **Permission-aware queries end-to-end** — each report respects executing user's data scopes + field visibility
- **Report subscriptions with scheduled email + in-app delivery**
- **Saved report snapshots** for audit/legal durability (immutable per §0.4 #10)
- **Role-default availability + per-user override**
- **Multi-language reports** (en + fr at v1)
- **Eight-layer print protection** on sensitive reports
- **Operator-defined custom reports** via copy-and-modify at v1
- **Source-back traceability** in financial reports (drill from P&L line to source GL entries to source module events)

## 13.12 Permissions design implications (items 73-76)

73. **Report library access role-default with per-user override** — consistent with ten-dimensional permissions model.
74. **Cross-user data in reports gated** — reports showing data across multiple users require explicit cross-user permission.
75. **Scheduled report subscriptions audit** — every recipient + every delivery captured.
76. **Saved report snapshots are immutable** — per §0.4 #10 append-only commitment.

## 13.13 Open questions — RESOLVED IN SESSION O

1. ✅ **Full report builder UI at v1 or Phase 2:** Phase 2 (basic copy-and-modify at v1).
2. ✅ **AI-generated insights:** Phase 2.
3. ✅ **Report version control:** Phase 2 (manual naming at v1).
4. ✅ **Cross-company reports:** Phase 2 (multi-entity deferred).
5. ✅ **Email vs in-app delivery:** Both.
6. ✅ **Standard library count:** ~40 reports across 7 categories.
7. ✅ **Snapshot retention:** operator-configurable per category; default 7 years compliance, 2 years operational.

Remaining:
8. **Real-time vs batched execution:** batched at v1 (5-min cache); real-time for executive dashboards Phase 2.
9. **Admin subscription footprint view:** YES at v1.

## 13.14 Acceptance criteria (~35 scenarios)

### Functional — Report library (1-7)
1. View reports hub; category cards per role default.
2. Sales category: SR sees Quote pipeline + own SR conversion rate.
3. Run "Quote conversion rate by SR" — A sees all; SR sees self.
4. Run with parameters (date range, client filter).
5. Export to CSV.
6. Export to PDF (eight-layer for executive).
7. Execution log shows recent runs.

### Functional — Custom reports (8-11)
8. Copy standard → modify → save.
9. Share with specific user.
10. Share with role (all PMs).
11. Edit custom report; old snapshot retained.

### Functional — Subscriptions (12-15)
12. Subscribe to "Weekly Quote Pipeline."
13. Configure schedule (every Monday).
14. Email PDF delivery.
15. In-app inbox delivery.

### Functional — Scheduled deliveries (16-19)
16. Acc schedules "Monthly AR Aging" → finance team monthly.
17. Failure logged + retry.
18. Pause; resume later.
19. Cancel.

### Functional — Snapshots (20-22)
20. Quarterly P&L → snapshot captured immutably.
21. View historical snapshot.
22. Delete (A only with reason).

### Functional — Permissions (23-28)
23. SR runs cross-user report → blocked.
24. A grants cross-user → PM can run.
25. PM sees Operations reports for own team.
26. Tech sees Field Service for own work.
27. Acc sees Financial + Compliance.
28. VO sees Executive top-level.

### Functional — Cross-module reports (29-31)
29. Project margin by customer tier (M6+M1).
30. Quote conversion rate by SR (M5+M2).
31. WSIB expiry calendar (M2+M8+M10).

### Functional — Performance & security (32-35)
32. Report with 100k rows <10s.
33. Permission-aware query respects scopes.
34. RLS blocks unauthorized cross-user data.
35. PDF eight-layer on payroll + executive.

---

═══════════════════════════════════════════════════════════════════
# 🏁 AUDIT COMPLETE
═══════════════════════════════════════════════════════════════════

## All 13 modules walked. Final stats:

- **13 of 13 modules** scoped through Sessions C-O
- **~1260 cumulative actions** across all modules
- **76 permissions design implications** (items 1-76)
- **~594 acceptance criteria** across all modules
- **13 cross-cutting commitments** locked (§0.4 #1-13)
- **140+ owned tables** across all modules
- **75+ operator-editable lookup tables**
- **Sidebar architecture** locked at top-level + parent menu structure
- **Module dependency graph** populated below

## 99. Consolidated action vocabulary

| Module | Actions | Tables | Status surfaces | Acceptance criteria |
|---|---|---|---|---|
| M1 Clients + Sites + Contacts | ~110 | 8+ | 15 | 54 |
| M2 Employees + Permissions | ~80 | 20 | 11 | 55 |
| M3 Settings | ~270 | 16 | 4 | 42 |
| M4 Dashboard | ~35 | 5 | 3 | 25 |
| M5 Quotes | ~85 | 12 | 5 | 52 |
| M6 Projects | ~110 | 12 | 8 | 58 |
| M7 Inventory | ~95 | 15 | 6 | 48 |
| M8 Vendors | ~65 | 8 | 4 | 35 |
| M9 Invoices | ~115 | 14 | 5 | 55 |
| M10 Subcontractors | ~75 | 13 | 5 | 38 |
| M11 Financials | ~90 | 12 | 6 | 45 |
| M12 Scheduling | ~75 | 10 | 4 | 50 |
| M13 Reports | ~55 | 7 | 4 | 35 |
| **TOTAL** | **~1260** | **152** | **80** | **594** |

## 100. Final sidebar tree *(locked Session K — see §0.7)*

```
🧭 Sidebar
─────────
📊 Dashboard
👥 People (parent: Clients / Sites / Employees / Vendors / Contractors / Misc Contacts)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials (parent: 16 sub-items spanning M9 + M11)
📈 Reports
⚙️ Settings
```

## 101. Module dependency graph

**Foundation modules (read by everything):**
- M1 Clients + Sites + Contacts
- M2 Employees + Permissions
- M3 Settings

**Revenue modules:**
- M5 Quotes — reads M1, M2, M3; writes Communication Log, generates Project on conversion
- M6 Projects — reads M1, M2, M3, M5, M7, M8, M10; writes M9, M11, Communication Log

**Operations modules:**
- M7 Inventory — reads M3, M5 (pricebook), M8; writes M6 costing, M11 GL
- M8 Vendors — reads M3; read by M7, M9, M11
- M10 Subcontractors — reads M3, M2 (certs/territories); read by M6, M9, M12

**Financial modules:**
- M9 Invoices — reads M1, M5, M6, M7, M8, M10; writes M11 GL
- M11 Financials — reads ALL modules (GL destination); writes nothing back

**Operational scheduling:**
- M12 Scheduling — heaviest reader: M1, M2, M3, M6, M10; writes M1 Communication Log, M6 timesheets

**Presentation/analytical:**
- M4 Dashboard — reads ALL modules (KPI widgets)
- M13 Reports — reads ALL modules (cross-module analytical reports)

## 102. Cumulative permissions design implications (76 items)

Items 1-14 (M1), 15-22 (M2), 23-27 (M3), 28-30 (M4), 31-37 (M5), 38-44 (M6), 45-49 (M7), 50-53 (M8), 54-58 (M9), 59-62 (M10), 63-67 (M11), 68-72 (M12), 73-76 (M13).

Key cross-cutting patterns synthesized for Permissions design pass:
- **Ten-dimensional permission control** (§0.4 #6)
- **Field-level visibility** consistent across M1, M2, M5, M6, M7, M8, M9, M10, M11, M12, M13
- **Append-only ledgers** (§0.4 #10) — inventory movements, commissioning records, acceptance records, performance scoring, GL postings, schedule change log, report snapshots
- **Separation of duties** (§0.4 #11) — AP bill approval, payment runs, GL manual entries, hard close
- **Regulatory expiry auto-block** (§0.4 #12) — insurance + WSIB + certification expired → blocks PO/WO/appointment
- **Versioned snapshots for legal durability** (§0.4 #8) — quote terms, change orders, commissioning, FIFO layers, vendor T&C, invoice send, contractor WO, labor rates, GL period locking, SLA response time, report snapshots
- **Eight-layer print protection** (§0.4 #9) — extensive list of sensitive PDF documents
- **Banking encrypted at rest with audit-on-read** — M1 clients, M2 employees, M8 vendors, M10 contractors
- **Cross-link patterns** — M8 ↔ M10 (vendor + contractor dual-role); M9 ↔ M6 (invoice → project); M7 ↔ M5 (pricebook → inventory)
- **Auto-degrade workflows** — vendor performance, contractor performance, preferred-status removal
- **Geolocation privacy retention** (§0.4 #13) — 30-day default operator-configurable

## 103. Cumulative acceptance criteria (~594 scenarios)

By module:
54 M1 + 55 M2 + 42 M3 + 25 M4 + 52 M5 + 58 M6 + 48 M7 + 35 M8 + 55 M9 + 38 M10 + 45 M11 + 50 M12 + 35 M13 = **594 total acceptance scenarios** for v1 build phase QA.

## 104. Phase 2 deferrals catalog

Consolidated from across all modules:
- Multi-company / multi-entity (M3, M8, M11)
- SSO/SAML (M2)
- Personal API tokens (M2)
- Role hierarchy (M2)
- Crew assignments (M2)
- Two-tier permissions model (M2)
- Workflow rules visual flowchart editor (M3)
- SMS templates (M3)
- BIM/CAD integration (M3)
- Real-time WebSocket push for critical widgets (M4)
- Native mobile app (M4, M12)
- Operator-defined custom widgets (M4)
- Multi-currency in single quote (M5)
- Financing integrations Phase 2 (M5)
- Volume discount rules engine (M5)
- Real-time co-authoring (M5)
- Customer status portal full version (M6)
- Multiple PMs per project (M6)
- Customer self-service scheduling portal (M12)
- Continuous geolocation tracking (M12)
- In-app dispatcher-tech chat (M12)
- Plaid live bank feed (M11)
- Bidirectional QBO/Xero sync (M11)
- Full report builder UI (M13)
- AI-generated insights (M13)
- Report version control (M13)
- Vendor portal full version (M8)
- VMI vendor-managed inventory (M8)
- Contractor portal full version (M10)
- Sub-contractor self-onboarding signup (M10)
- Mobile worker check-in verification (M10)
- Audit-trail report for external auditor (M11)
- Equipment firmware tracking integration (M7)
- RMA workflow for customer returns (M7)

---

**End of v0.14. AUDIT COMPLETE.** All 13 modules scoped through Sessions C-O. Next phase: Permissions module design pass (ROADMAP item 2). Consumes ~1260 actions + 76 permissions design implications + 13 cross-cutting commitments + ten-dimensional model + 80 status surfaces with behavior bindings.

🏁 Phase 1 audit complete. Phase 2 begins with Permissions architecture.

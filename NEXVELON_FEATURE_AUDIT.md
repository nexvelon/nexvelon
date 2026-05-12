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
> **Status:** v0.7 — Modules 1-6 fully scoped through Sessions C-H.
> Modules 7-13 pending.

---

## 0. How to use this document

### 0.1-0.5

Per v0.6 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; ten dimensions of permission control; baseline gaps from Session C.

### 0.4 Permissions model — locked commitments

Through Sessions B + C + D + E + F + G + H:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widget definitions + quote terms snapshots + change order amendments + commissioning records.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages).
10. **Comprehensive logging visibility** per PRINCIPLES §4.

### 0.6 Walk order

1. **Clients + Sites + Contacts** *(complete §1)*
2. **Employees + Permissions** *(complete §2)*
3. **Settings** *(complete §3)*
4. **Dashboard** *(complete §4)*
5. **Quotes** *(complete §5)*
6. **Projects** *(complete §6)*
7. Inventory
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
👥 People (parent — hover expands)
   ├── Clients
   ├── Sites
   ├── Employees
   ├── Vendors
   ├── Contractors
   └── Misc Contacts
💰 Quotes
📋 Projects               ← Module 6 surface
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

## 1.1 Purpose

Customer master record. Companies + Individuals. Sites belong to clients (M:N contacts). SLAs per-site (not per-client). Banking, payment terms, holdback, credit at client level. Onboarding gates auto-inject T&C language via clause-per-gate composition.

## 1.2-1.14 Headline stats

- 23 routes, ~110 actions, 15 lookup tables, 14 field visibilities
- Per-site SLAs with precedence resolution (site SLA > site response > client response > tier default)
- Contractual integrity exception: `clients:overrideSlaResponseTime` Admin-only
- 8-section client drawer (Identity, Classification, Contact, Location, Billing, Banking & AR, Holdback & PO, Notes & Risk)
- 13 client detail tabs
- 16 customer types seeded
- Holdback config (10%/Excl/45 Ontario Construction Act default)
- Communication log first-class entity
- Service contracts as separate first-class entity from SLAs
- 54 acceptance criteria
- Permissions design implications: items 1-14

(Full schema, action tables, acceptance scenarios preserved in v0.2 commit history at `073b393`.)

---

═══════════════════════════════════════════════════════════════════
# 2. Module: Employees + Permissions
═══════════════════════════════════════════════════════════════════

## 2.1 Purpose

The substrate every module reads from. **Employees** — internal staff. **Permissions** — ten-dimensional access control surface.

## 2.2-2.14 Headline stats

- 25 routes, ~80 actions, 11 lookup tables, 14 field visibilities
- Six-tab permissions editor (Role & Overrides / Data & Field Access / Workflows & Delegations / Security & Sessions / UI & Audit / API & SSO)
- 25+ seeded certification types (Kantech, Genetec, C-CURE, DSC, Honeywell, Bosch, Avigilon, Lenel, Paxton, ESA, ULC, CFAA, CSA, OSHA-30, WHMIS, Working at Heights, etc.)
- Multi-territory model (Primary/Secondary/Relocation per Salesforce pattern)
- Resource Absences with approval workflow + balance tracking
- Request-admin-access workflow (per FieldWire pattern, extended)
- Effective-permissions caching (sub-10ms via jsonb column)
- Field-level encryption: banking, SIN, access codes
- Eight-layer print protection on payroll/HR docs
- 55 acceptance criteria
- Permissions design implications: items 15-22
- Phase 2 deferrals: SSO/SAML, personal API tokens, role hierarchy, multi-company, crew assignments, two-tier permissions

(Full content preserved in v0.3 commit history at `4dc0cc2`.)

---

═══════════════════════════════════════════════════════════════════
# 3. Module: Settings
═══════════════════════════════════════════════════════════════════

## 3.1 Purpose

The configuration spine. ~70 sub-pages in 10 categories. Every module reads from Settings.

## 3.2-3.14 Headline stats

- ~70 sub-pages organized in categories A-J
- ~270 actions (heavily templated — most CRUD-on-lookup variants)
- 16 Settings-specific configuration tables
- 4 status surfaces
- 29 operator-editable lookups with uniform guided-creation wizard
- 12 custom-field-definition entity managers
- Workflow Rules editor: condition-action table at v1
- Workflow rule sandboxing: 30s timeout / 100 actions / auto-disable after 3 failures
- Email/PDF templates with Handlebars merge tags + live preview + per-language versioning + stale-translation flagging
- Settings change preview for behavior-binding changes
- API keys as scoped permissions (action allowlist) with one-time display
- OAuth tokens encrypted in Supabase Vault
- 42 acceptance criteria
- Permissions design implications: items 23-27
- Phase 2 deferrals: SMS templates, SSO config, multi-company, subscription billing, JSON export, per-key rate limiting, visual flowchart editor, BIM/CAD

(Full content preserved in v0.4 commit history at `87a9fc8`.)

---

═══════════════════════════════════════════════════════════════════
# 4. Module: Dashboard
═══════════════════════════════════════════════════════════════════

## 4.1 Purpose

Per-role landing page. Presentation layer composing widgets from every other module.

## 4.2-4.14 Headline stats

- 3 routes (/, /dashboard, /dashboard/configure)
- ~35 actions (13 module-specific + ~20 per-widget gates)
- 5 new owned tables (widget_definitions, role_layouts, user_layouts, data_cache, company_settings)
- 3 status surfaces
- ~20 seeded widgets, code-defined
- Six default role layouts (A: 8 widgets, PM: 6, SR: 6, Tech: 5, Acc: 7, VO: 3)
- Three-way widget visibility gate (source-permission AND widget-enabled AND user-not-hidden)
- UI presentation locked as 10th dimension of permission control
- Per-user customization (drag-drop, resize, hide/show) with role-default override
- Per-user landing page choice (any module list view as alternate)
- 5-min cached refresh + critical on-focus + manual always
- CSV export per tabular widget (data-scoped)
- 25 acceptance criteria
- Permissions design implications: items 28-30
- Phase 2 deferrals: operator-defined custom widgets (saved-report-as-widget), real-time WebSocket push, native mobile app

(Full content preserved in v0.5 commit history at `6283d0f`.)

---

═══════════════════════════════════════════════════════════════════
# 5. Module: Quotes
═══════════════════════════════════════════════════════════════════

## 5.1 Purpose

Heart of the sales pipeline. Three quote types: Service Quote (one-off), Project Quote (multi-milestone), Service Contract Quote (recurring revenue).

## 5.2-5.14 Headline stats

- 18 internal routes + 1 public-facing signed-URL portal
- ~85 actions across 11 categories
- 12 new owned tables (quotes, line_items, taxes, discounts, revisions, approvals, views, acceptance_records, terms_snapshots, templates, pricebook_items, pricebook_categories, pre_built_assemblies, cost_centers)
- 5 status surfaces (quote_statuses with 13 seeded values, approval_statuses, revision_reasons, quote_types, cost_center_defaults)
- Three quote types drive workflow variants + conversion targets (project / job / service_contract)
- Online portal acceptance with signed URL (no login, 90-day expiry) + e-signature
- Immutable send snapshots (line items + pricing + T&C captured for legal durability)
- Eight-layer print protection on revenue PDFs
- T&C auto-composition from Module 1 onboarding gates
- Value + discount threshold approval routing (combined AND logic, configurable per role)
- Per-cost-centre tax codes (Canadian split-tax compliance)
- Holdback in quote totals (Ontario Construction Act compliance)
- Field-level margin visibility (A/PM default; SR per-user override)
- Quote → Project conversion locks source (read-only post-conversion)
- Pre-built assemblies + cost centres + pricebook with vendor catalog sync
- 52 acceptance criteria
- Permissions design implications: items 31-37
- Phase 2 deferrals: multi-currency single quote, financing integrations, volume discount engine, real-time co-authoring, quote import, dynamic pricing engine, line-item custom fields

(Full content preserved in v0.6 commit history at `5633e25`.)

---

═══════════════════════════════════════════════════════════════════
# 6. Module: Projects
═══════════════════════════════════════════════════════════════════

## 6.1 Purpose

Lifecycle management for converted Project Quotes. Multi-phase work with sections, cost centres carrying through from quote, tasks, change orders (variations), timesheets, project costing (three-state Estimated/Committed/Actual), commissioning workflow, customer sign-off, progress invoicing, subcontractor coordination, document management.

For security integrators specifically: phases like Site Survey → Cable Install → Equipment Mount → Programming → Commissioning → Training → Closeout. Each phase carries cost centres (Equipment / Labor / Materials / Sub-Contractor / Travel / Commissioning / Training / Misc) inherited from quote. Change orders are common (scope adjustments mid-project) and have their own approval workflow with customer signature.

Project is what a converted Project Quote becomes. Service Quote converts to a single Job (lighter weight). Service Contract Quote generates a `service_contracts` row in Module 1.

## 6.2 Sidebar surface

Top-level **📋 Projects** in sidebar per §0.7. Badge logic on Projects parent: aggregated count of projects At Risk + projects past target end date + projects with overdue change orders + projects with unapproved timesheets. Operator-configurable in Settings.

## 6.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/projects` | List view with status Kanban toggle | `projects:viewList` |
| `/projects/new` | Wizard (rare; usually via quote conversion) | `projects:create` |
| `/projects/[id]` | Detail page (Overview tab) | `projects:viewDetail` |
| `/projects/[id]/phases` | Phases tab | `phases:viewList` |
| `/projects/[id]/phases/[phaseId]` | Phase detail | `phases:viewDetail` |
| `/projects/[id]/tasks` | Tasks across all phases | `tasks:viewList` |
| `/projects/[id]/tasks/[taskId]` | Task detail | `tasks:viewDetail` |
| `/projects/[id]/schedule` | Project schedule view | `projects:viewSchedule` |
| `/projects/[id]/costing` | Three-state costing (Estimated/Committed/Actual) | `projects:viewCosting` |
| `/projects/[id]/change-orders` | Change order list | `change_orders:viewList` |
| `/projects/[id]/change-orders/[coId]` | Change order detail | `change_orders:viewDetail` |
| `/projects/[id]/change-orders/new` | Create change order wizard | `change_orders:create` |
| `/projects/[id]/timesheets` | Timesheets for project | `timesheets:viewProject` |
| `/projects/[id]/subcontractors` | Subcontractor work orders | `projects:viewSubcontractors` |
| `/projects/[id]/inventory` | Materials usage | `projects:viewInventory` |
| `/projects/[id]/documents` | Document storage | `projects:viewDocuments` |
| `/projects/[id]/commissioning` | Commissioning workflow | `commissioning:view` |
| `/projects/[id]/handover` | Final customer sign-off | `handover:view` |
| `/projects/[id]/communication` | Communication log | `projects:viewCommunication` |
| `/projects/[id]/progress-billing` | Progress invoices | `projects:viewProgressBilling` |
| `/projects/[id]/activity` | Project activity feed | inherits view |
| `/projects/[id]/audit-log` | Module audit | `projects:viewAuditLog` |
| `/projects/templates` | Project templates by vertical | `project_templates:viewList` |
| `/projects/templates/[id]` | Template detail | `project_templates:viewDetail` |
| `/projects/gantt` | Cross-project Gantt chart | `projects:viewGantt` |

Public-facing (Phase 2):
| `/proj/[token]` | Customer status portal (Phase 2) | signed URL |

## 6.4 Resources

### Owned tables (12)

- `projects` — header: originating_quote_id, client_id, site_id, name, project_type_id, status, start_date, target_end_date, actual_end_date, pm_user_id, am_user_id, total_estimate, total_committed, total_actual, gross_margin_calculated, currency_id, custom_fields jsonb, warranty_start_date, warranty_period_months
- `project_phases` — sections (Site Survey, Cable Install, etc.): project_id, name, sort_order, status_id, target_start, target_end, actual_start, actual_end, completion_pct, parent_phase_id (for sub-phases)
- `project_cost_centers` — inherited from quote at conversion + project-specific additions: project_id, phase_id (nullable), name, sort_order, default_tax_code_id, completion_pct
- `project_tasks` — granular work units: phase_id, name, description, assignee_user_id, due_date, status_id, dependencies_jsonb, completion_pct, custom_fields
- `project_change_orders` — variations: project_id, co_number (auto-generated), status_id, reason_id, scope_delta_jsonb, price_delta, schedule_delta_days, customer_signature, customer_signed_at, customer_signed_ip, internal_approved_at, internal_approved_by, terms_snapshot_id (for legal durability)
- `project_documents` — drawings, permits, photos, signed acceptance, commissioning reports: project_id, doc_type, file_url, version, uploaded_by, uploaded_at, is_customer_facing
- `project_timesheets` — time entries: employee_id, project_id, phase_id, cost_center_id, task_id (nullable), start_time, end_time, hours, billable flag, hourly_rate (snapshot), notes, approved_by, approved_at, locked flag
- `project_costing_snapshots` — periodic rollups for change tracking: project_id, snapshot_at, estimated jsonb, committed jsonb, actual jsonb, forecast_at_completion jsonb
- `project_commissioning_records` — per-item commissioning: project_id, equipment_identifier, test_results_jsonb, photo_evidence_urls[], customer_initials, customer_signed_at, signed_off_by_user_id
- `project_handover_records` — final customer sign-off: project_id, handover_package_url, warranty_start_date, customer_signature, customer_signed_at, customer_signed_ip
- `project_acceptance_records` — append-only customer sign-off events (immutable per §0.4 #9 print protection extension)
- `project_progress_invoices` — generated billing claims: project_id, type_id (deposit/progress/final/retention), amount, invoice_id (FK to M9 invoices), generated_at, sent_at, paid_at

### Status lookup tables (8)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `project_statuses` | Planning, Active, On Hold, At Risk, Completed, Closed, Archived | allows-edit, allows-billing, allows-scheduling, terminal flag |
| `project_types` | New Install, Retrofit, Maintenance, Emergency Repair, Inspection, Service Contract Recurring, Upgrade | default phase template, commissioning required flag, warranty period default |
| `phase_statuses` | Not Started, In Progress, Blocked, Completed, Skipped | scheduling eligibility, completion contribution to project |
| `task_statuses` | Not Started, In Progress, Blocked, Review, Completed, Cancelled | assignee notification rules |
| `change_order_statuses` | Draft, Submitted, Pending Customer Approval, Approved, Rejected, Implemented, Withdrawn | allows-edit, requires-customer-signature, billing impact |
| `change_order_reasons` | Customer Request, Scope Change, Site Conditions, Material Substitution, Regulatory Requirement, Internal Discovery | reporting tag, approval routing |
| `commissioning_statuses` | Not Started, In Progress, Awaiting Customer, Completed, Conditional Pass (with deficiency list) | sign-off required, deficiency tracking |
| `progress_billing_types` | Deposit, Progress Claim (% based), Phase Completion, Final Claim, Retention/Holdback Release | invoice generation trigger, timing rules |

## 6.5 Actions (~110 actions across 13 categories)

### Project lifecycle (15)

| ID | Description | Default | Audit |
|---|---|---|---|
| `projects:viewList` | See project list | A, PM, Acc, SR (scoped) | — |
| `projects:viewDetail` | Open project | A, PM, Acc, SR (own quotes' projects) | — |
| `projects:viewMy` | See assigned/own | All employees (scoped) | — |
| `projects:create` | Create new project | A, PM (auto: via quote conversion) | `project_created` |
| `projects:editBasic` | Edit basics | A, PM | `project_updated` |
| `projects:changeStatus` | Change status | A, PM | `project_status_changed` |
| `projects:assignPM` | Assign/reassign PM | A | `project_pm_assigned` |
| `projects:assignAM` | Assign AM | A, PM | `project_am_assigned` |
| `projects:putOnHold` | Pause project | A, PM (with reason) | `project_on_hold` |
| `projects:resumeFromHold` | Resume | A, PM | `project_resumed` |
| `projects:markAtRisk` | Flag At Risk | A, PM | `project_at_risk` |
| `projects:markComplete` | Mark completed | A, PM | `project_completed` |
| `projects:closeProject` | Close (financially) | A, PM | `project_closed` |
| `projects:archive` | Archive | A | `project_archived` |
| `projects:hardDelete` | Permanent delete | A only | `project_hard_deleted` |
| `projects:reopenClosed` | Reopen | A only | `project_reopened` |

### Phases (8), Tasks (10), Change orders (12), Timesheets (10), Costing & margin (8 heavily gated), Documents (5), Commissioning (8), Handover (6), Subcontractor coordination (8), Progress invoicing (8), Communication (4), Reports (5)

Each follows the established pattern from M1-M5 (viewList, viewDetail, create, edit, archive + module-specific actions).

**Total: ~110 actions.** Default grant pattern:
- **SR:** minimal — viewMy (originated quotes' projects), viewBasic detail
- **Tech:** viewAssigned, tasks:markComplete (own), timesheets:submitMy
- **PM:** full management for team-scoped projects; approve timesheets; create/submit change orders; viewMargin
- **A:** full
- **Acc:** viewList, viewDetail, viewCosting, generate invoices, lock timesheets before payroll cutoff
- **VO:** list + detail; no costing/margin

## 6.6 Views

### Project list (`/projects`)

Filter chips: status, PM, AM, client, site, project type, expiring-soon, at-risk, over-budget. View toggle: List (table) / Kanban (by status) / Gantt (by date). Bulk actions: assign PM, change status, exportCsv.

### Project detail page — 14 tabs

1. **Overview** — header card (status, % complete, total estimate vs actual, margin), quick actions, key dates, team
2. **Phases** — section list with completion %, target/actual dates, drill-into-phase
3. **Tasks** — across all phases with filters (assignee, due-soon, status, blocked)
4. **Schedule** — calendar / Gantt view showing phases + tasks + scheduled appointments
5. **Costing** — three-state Estimated/Committed/Actual breakdown by cost-centre + variance + forecast-at-completion
6. **Change Orders** — list with status, value impact, customer signature status
7. **Timesheets** — entries per employee, filterable, approval queue for PM
8. **Subcontractors** — work orders, status, retention tracking, performance scoring
9. **Inventory** — materials reserved, consumed, on order for project
10. **Documents** — folders (Drawings / Permits / Photos / Contracts / Commissioning / Handover) with revision control
11. **Commissioning** — per-equipment test results, customer sign-off workflow, certificate generation
12. **Handover** — final sign-off, warranty package, customer satisfaction survey
13. **Communication** — log of all customer communications related to project
14. **Activity & Audit Log** — chronological activity feed + full audit drilldown

### Phase detail page

Cost centres for this phase, tasks, schedule, materials assigned, contractor work orders, sub-phases, photos timeline, daily progress log, dependencies on/from other phases.

### Change order workflow page

Wizard-style: scope delta editor (line items add/remove/modify) → price delta calculator → schedule delta picker → reason selection → internal approval routing → customer signature capture (signed URL portal like quotes) → implementation → audit trail visualization.

### Costing dashboard (per project)

Big-number tiles: Estimated $X / Committed $Y / Actual $Z / Variance $V / Forecast-at-completion $F. Burndown chart showing budget consumed over time. Margin trend line (real-time as costs accumulate). Variance alerts when actual exceeds estimate by configurable threshold.

### Commissioning workflow

Step-by-step per-equipment checklist. Each item: equipment_identifier, test_type, expected_result, actual_result, pass/fail/conditional, customer_initials (touchscreen), photo evidence (date/GPS stamped via mobile capture). Conditional pass allows deficiency list capture. Final commissioning certificate generated as PDF with eight-layer print protection.

### Handover package

Auto-assembled PDF package: signed contract + change orders + commissioning records + as-built drawings + equipment manuals + warranty terms + service contact info. Customer signs final acceptance → warranty clock starts → Service Contract Quote auto-generated if applicable.

### Gantt chart (`/projects/gantt`)

Cross-project view. Filter by status, PM, client. Read-only at v1 (edit-via-Gantt Phase 2). Color-coded by phase status. Critical path highlighted.

## 6.7 Field-level treatment

8 visibility flags (similar to M5 patterns):

- `visibility.projects.marginCalculated` — A, PM (always); SR per-user override only
- `visibility.projects.actualCosts` — A, PM, Acc
- `visibility.projects.committedCosts` — A, PM, Acc
- `visibility.projects.subcontractorMarkup` — A, Acc only
- `visibility.projects.internalNotes` — A, PM, assigned SR (originating quote)
- `visibility.timesheets.hourlyRate` — A, Acc, PM-with-perm; Tech sees own only
- `visibility.timesheets.cost` — A, Acc only
- `visibility.commissioning.internalDeficiencyNotes` — A, PM (internal-only deficiencies not on customer report)

## 6.8 Custom-field surfaces

Project-level custom fields managed in Settings → Custom Fields → Projects per §3.3 C. Common examples for security integrators:
- Permit Number
- Inspector Name
- Local Authority Having Jurisdiction (AHJ)
- ULC Verification Required (boolean)
- Equipment Manufacturer Primary (Avigilon / Genetec / Bosch / Honeywell / etc.)
- Subcontractor Lead
- Project Phase Type (Greenfield / Brownfield / Retrofit)
- Code/Standard Compliance (ULC ULC-S536 / CAN/ULC-S524 / NFPA 72 / etc.)
- Insurance Requirement Special
- Bonding Required

Phase-level + Task-level custom fields: Phase 2.

## 6.9 Status surfaces

8 lookup tables (see §6.4). Each with behavior bindings.

**Operationally critical:**
- `project_types` — drives default phase template, commissioning required flag, warranty period default
- `change_order_reasons` — affects approval routing (Customer Request routes faster; Regulatory Requirement may require manager review)
- `commissioning_statuses` — Conditional Pass triggers deficiency list workflow
- `progress_billing_types` — Retention/Holdback Release timing per Ontario Construction Act 45-day rule

## 6.10 Cross-module relationships

### Reads

- **Quotes (M5):** origin via `originating_quote_id`; line items inherited at conversion; T&C carried; pricing snapshot retained
- **Clients (M1):** all standard; on_stop blocks billing; holdback config; banking for receipts
- **Sites (M1):** project location, access info
- **Contacts (M1):** customer communication recipients
- **Employees (M2):** PM/AM/Tech assignments; hourly rates for cost calculation; certifications for assignment matching
- **Settings (M3):** project templates, phase templates, change order workflow templates, T&C versions, holdback config, tax codes
- **Inventory (M7):** materials availability, PO generation
- **Vendors (M8):** material purchasing
- **Contractors (M10):** subcontractor work orders + retention tracking

### Writes

- **Invoices (M9):** progress claims, final claim, retention release
- **Service Contracts (M1):** on handover with recurring service generation
- **Communication Log (M1):** all customer communications
- **Scheduling (M12):** phases/tasks drive scheduling appointments
- **Financials (M11):** project costs (real-time cost flow)
- **Audit events on every state change**

### Events emitted

`project.*` (created_from_quote, status_changed, phase_completed, at_risk_triggered, completed, closed), `change_order.*` (drafted, submitted, internal_approved, sent_to_customer, customer_signed, implemented, rejected, withdrawn), `task.*`, `timesheet.*` (submitted, approved, rejected, locked), `commissioning.*` (initiated, item_completed, customer_signed, certificate_generated), `handover.*` (initiated, package_assembled, customer_signed, warranty_started), `progress_invoice.*` (generated, sent, paid).

## 6.11 Competitive floor delta

### Combines best of

- **simPRO:** Project sections + cost centres carrying through from quote, three-state Estimated/Committed/Actual costing, Variations (change orders), Progress claims with retention, Subcontractor work orders, Project copy/template, Forecast revision during project, Gantt chart, WIP report, Memberships for recurring service
- **ServiceTitan:** Project dashboard helicopter view, Real-time costing visibility, Subcontractor portal integration
- **Procore:** Change order workflow with customer signature, Document management with revision control, Daily logs / progress photos
- **Buildertrend:** Customer communication portal during project, Progress photos timeline

### Nexvelon-unique

- **Commissioning workflow with per-equipment test results + customer per-item sign-off** — critical for security-integrator vertical; no competitor has this depth
- **ULC fire-alarm verification document auto-attachment** to commissioning certificate (Ontario regulatory compliance — ULC-S536 verification reports auto-attach)
- **Eight-layer print protection on commissioning certificates + handover packages** (beyond any competitor for regulatory-grade documents)
- **Service Contract Quote auto-generation from completed project** for recurring revenue
- **Trade Contractor lien deadline tracking** (Ontario Construction Act 60-day) for AR/Financials integration
- **Append-only commissioning records** with photo + GPS evidence (date-stamped from mobile capture)
- **Field-level margin visibility per project** (separating who-can-do from who-sees per ten-dimensional model)
- **Request-admin-access workflow** for elevated change order approval (via Module 2 framework)
- **Three-state cost tracking with real-time forecast-at-completion** — operator sees margin erosion in real-time as costs accumulate
- **Versioned change order amendments** legally tied to original quote_terms_snapshot

## 6.12 Permissions design implications (items 38-44)

38. **Project margin visibility field-level gated.** A/PM default; SR per-user override (similar to quotes:viewMargin pattern). `projects:viewMargin` is the visibility flag distinguishing who-sees from who-can-do.

39. **Change orders use separate approval thresholds from quotes.** Configurable per role in Settings. Defaults: <$2k self-approve, $2-10k → PM, >$10k → Admin. Discount/scope thresholds: <5% scope change self-approve, 5-15% → PM, >15% → Admin.

40. **Commissioning records append-only (immutable)** with one-way hash on photo evidence. Aligns with quote acceptance record pattern from Module 5.

41. **Handover sign-off triggers warranty clock.** Warranty terms versioned (snapshot at sign per §0.4 #8). Subsequent service contract work references this warranty snapshot.

42. **Progress invoicing respects holdback config from Module 1.** Canadian Construction Act compliance: holdback 10%/Excl/45-day default from client config; release triggers separate invoice at 45-day post-substantial-completion mark.

43. **Project document downloads gated to project members** (PM + assigned techs + AM); Admin always. Customer-facing documents have separate visibility flag for portal access.

44. **Subcontractor work orders generate audit trail** showing internal approval + external dispatch + retention application + lien deadline tracking.

## 6.13 Open questions — RESOLVED IN SESSION H

1. ✅ **Project templates per industry/vertical:** YES — operator-defined templates in Settings (phase sequence, default cost centres, default tasks). Seeded with security-integrator patterns: Camera install, Access control install, Fire alarm install, Intrusion alarm install, Integration project, Maintenance contract setup.
2. ✅ **Change order vs new quote threshold:** Change orders for in-progress projects; new quote for substantially-different scope (>50% scope change). Operator can manually convert CO to new quote.
3. ✅ **Timesheet approval workflow:** Self-submit → PM approves → Acc locks before payroll cutoff date (Settings-configurable per pay period).
4. ✅ **Progress billing automation:** Automatic generation per phase completion; manual generation for % milestones; operator approval before send.
5. ✅ **Commissioning customer attendance:** Recommended but not required; conditional sign-off available (deficiency list captured) with follow-up obligation tracked.
6. ✅ **Subcontractor portal access during project:** Phase 2 (read-only view of work order assignments at v1 via email links; full portal Phase 2).
7. ✅ **Project Gantt chart in v1:** YES — read-only at v1; edit-via-Gantt Phase 2.

Remaining:

8. **Multiple PMs per project** — primary PM + secondary PMs? *Recommendation: single primary PM at v1 with assistant PMs as Phase 2.*
9. **Project budget vs project cost separation** — budget (estimated to spend) vs cost (actual spend). *Recommendation: YES — track both separately; budget locked at quote acceptance.*
10. **Customer portal for project status visibility** — read-only view of progress, photos, schedule. *Recommendation: Phase 2; signed-URL view-only at v1.*
11. **Daily logs / progress photos** — daily mandatory log entry by PM/Tech? *Recommendation: optional in v1; mandatory enforcement via Settings flag Phase 2.*
12. **Project meeting notes** — built-in meeting scheduler with minutes? *Recommendation: Phase 2; manual document attachment at v1.*

## 6.14 Acceptance criteria (~58 scenarios)

### Functional — Project creation (1-6)

1. **Convert Project Quote to Project.** Accepted Project Quote → Convert button → wizard pre-fills (client, site, line items as cost-centres, phases from template) → project created → originating_quote_id FK set → source quote locked.
2. **Apply project template.** PM creates project from "Camera Install" template → phases pre-populate (Site Survey, Cable Install, Equipment Mount, Programming, Commissioning, Training, Closeout) with default cost centres.
3. **Direct project creation (rare).** PM creates project without quote conversion → wizard captures client, site, name, type, PM → project in Planning status.
4. **Project type drives commissioning requirement.** Project type "New Install Fire Alarm" → commissioning_required flag set → commissioning workflow required for completion.
5. **Project copy.** PM clones existing project → copies phases, cost centres, tasks, custom fields → assigns new client/site.
6. **Status promotion Planning → Active.** PM moves project to Active → triggers scheduling availability + costing capture begin.

### Functional — Phases & tasks (7-14)

7. Add phase mid-project.
8. Reorder phases drag-drop.
9. Mark phase complete (auto-updates project completion %).
10. Block phase with dependency unmet.
11. Sub-phase nesting.
12. Add task to phase with assignee + due date.
13. Set task dependency (task B blocked until task A complete).
14. Task completion notification to PM.

### Functional — Change orders (15-22)

15. **Create change order.** PM creates CO with scope additions + price delta $5k + 5-day schedule delta + reason "Customer Request".
16. **Internal approval routing.** CO $5k routes to PM (under $10k threshold) → PM approves → status Pending Customer Approval.
17. **Customer signature flow.** CO sent to customer via signed URL portal → customer signs → status Approved → Implementation triggered.
18. **Implementation updates project.** Approved CO adds line items to project; updates total_estimate; extends target_end_date by 5 days; generates audit trail.
19. **Amended invoice if billing started.** Project with progress invoice $30k already paid → CO implemented adds $5k → next progress invoice reflects updated total minus already-billed.
20. **CO withdrawal.** Draft CO withdrawn before send → status Withdrawn → audit row.
21. **CO rejected by customer.** Customer rejects on portal → status Rejected → reason captured → original project terms unchanged.
22. **CO threshold routing.** $15k CO routes to Admin (over $10k); $1k CO self-approved by PM under $2k.

### Functional — Timesheets (23-27)

23. **Self-submit timesheet.** Tech logs hours per project + phase + cost-centre + task → submits → enters PM approval queue.
24. **PM approves batch.** PM views queue → bulk approves with note → timesheets locked.
25. **Acc locks before payroll cutoff.** Acc sets cutoff date past Friday → timesheets prior to Friday locked from further edit.
26. **Hourly rate snapshot at submit.** Tech's hourly rate captured at submit time; future rate change doesn't retroactively alter past timesheets.
27. **Billable vs non-billable distinction.** Tech marks travel time non-billable → cost flows to project but not customer invoice.

### Functional — Costing three-state (28-33)

28. **Estimated baseline from quote.** Project total_estimate carried from quote at conversion; baseline locked.
29. **Committed captures POs + WOs.** Material PO $5k raised → committed +$5k. Contractor WO $3k issued → committed +$3k.
30. **Actual captures delivery + execution.** Material delivered + invoice received → actual +$5k. Timesheet hours approved + payroll posted → actual + labor cost.
31. **Variance real-time.** PM views costing dashboard → estimated $50k / committed $48k / actual $42k → variance shown in real time.
32. **Forecast-at-completion.** Algorithm: actual + committed-not-yet-actual + projected remaining estimated = forecast. Updates on every cost event.
33. **At Risk auto-flag.** Forecast exceeds estimated by configurable threshold (default 10%) → project auto-marked At Risk + PM + Admin notified.

### Functional — Progress invoicing (34-37)

34. **Deposit invoice generation.** Project Active → deposit invoice generated per client config (e.g., 25% deposit) → sent for payment → status Sent.
35. **Phase completion triggers progress claim.** Phase 1 marked complete → progress claim auto-generated with phase value → operator reviews → operator approves → sent.
36. **% milestone claim.** Project at 50% completion → progress claim generated for 50% of total - deposit + holdback retention applied.
37. **Retention/holdback release.** Project marked Completed → 45 days pass (Ontario Construction Act) → retention release invoice auto-generated → sent.

### Functional — Commissioning (38-43)

38. **Initiate commissioning.** Project reaches commissioning phase → workflow initiated → per-equipment checklist displayed.
39. **Per-equipment test capture.** Tech tests Camera #1 → records pass/fail + photo evidence (date/GPS stamped) → saves.
40. **Customer per-item sign-off.** Customer walks through with PM → initials each item → recorded.
41. **Conditional pass with deficiency list.** Customer accepts overall but flags Camera #3 as deficient → conditional pass → deficiency list captured → follow-up task auto-created.
42. **Commissioning certificate generation.** All items passed → certificate PDF generated with eight-layer protection → signed by customer + PM + AHJ if applicable → attached to project documents.
43. **ULC verification auto-attach.** Fire alarm project → ULC-S536 verification document auto-attached to commissioning certificate.

### Functional — Handover (44-46)

44. **Initiate handover.** Commissioning complete + final inspection passed → handover initiated.
45. **Handover package assembly.** System assembles: signed contract + COs + commissioning records + as-builts + manuals + warranty terms + service contact info → PDF package generated.
46. **Customer final sign-off triggers warranty.** Customer signs handover acceptance → warranty_start_date captured → warranty period begins → Service Contract Quote auto-generated if applicable.

### Permissions (47-52)

47. **SR project visibility scope.** SR sees only projects originating from own quotes.
48. **PM team-scoped view.** PM sees own + team's SRs' projects.
49. **Margin visibility default vs override.** SR doesn't see margin by default; Admin grants override → SR sees margin.
50. **Timesheet approve scope.** PM approves timesheets for own team only.
51. **Costing access.** Acc sees full costing; PM sees costing for own projects; SR sees no costing.
52. **Customer-facing documents.** Documents flagged customer-facing visible in customer portal (Phase 2); internal-only documents not visible externally.

### Functional — Performance & security (53-58)

53. **List 200 projects with filters.** Loads <2s.
54. **Project detail with 500 line items + 50 tasks + 20 timesheet entries + 10 COs.** Loads <3s.
55. **Gantt chart rendering 100 projects.** Loads <5s.
56. **Costing snapshot calculation.** Real-time recalc on cost event <500ms.
57. **Commissioning record immutability.** DB-level update attempt on `project_commissioning_records` blocked by RLS.
58. **Cross-project data scope.** SR API call attempting to read another SR's project → 403 + audit row.

---

═══════════════════════════════════════════════════════════════════
# Modules 7-13: pending walk
═══════════════════════════════════════════════════════════════════

- §7 — Inventory
- §8 — Vendors
- §9 — Invoices
- §10 — Subcontractors
- §11 — Financials
- §12 — Scheduling (major reader of M1+M2+M3 surfaces)
- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary

*Running count: ~690 actions across 6 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6).*

## 100. Final sidebar tree

*Locked through Session D — see §0.7.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*44 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5, 38-44 M6).*

## 103. Cumulative acceptance criteria

*~288 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5 + ~58 M6).*

---

**End of v0.7.** Modules 1-6 complete. First operations module (Projects) scoped with three-state costing, change order workflow with customer signature, commissioning workflow with per-equipment sign-off, handover package, progress invoicing with Canadian Construction Act compliance, ULC fire-alarm verification auto-attachment. Cross-cutting commitments from Sessions C-H propagate forward.

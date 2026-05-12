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
> **Status:** v0.4 — Modules 1 (Clients + Sites + Contacts),
> 2 (Employees + Permissions), and 3 (Settings) fully scoped
> through Sessions C + D + E. Modules 4-13 pending. Cross-cutting
> decisions from Sessions C + D + E propagate forward.

---

## 0. How to use this document

The audit is a per-module worksheet. **The same fourteen subsections
for every module.**

### 0.1 The per-module rubric

1. **Purpose** — what this module is for in the integrator's workflow.
2. **Sidebar surface** — current vs. proposed.
3. **Routes & sub-routes** — full URL tree with gates.
4. **Resources** — DB entities owned + read/written.
5. **Actions** — canonical permission vocabulary.
6. **Views** — list/detail/drawer/modal/widget surfaces.
7. **Field-level treatment** — per-user hideable fields.
8. **Custom-field surfaces** — where operator-defined fields appear.
9. **Status surfaces** — lookup tables with behavior bindings.
10. **Cross-module relationships** — reads/writes + bus events.
11. **Competitive floor delta** — where Nexvelon exceeds §3 floors.
12. **Permissions design implications** — input for ROADMAP item 2.
13. **Open questions** — operator decisions before build.
14. **Acceptance criteria** — test scenarios validating the build.

### 0.2 Role abbreviations

**A** Admin · **PM** ProjectManager · **SR** SalesRep · **Tech**
Technician · **Sub** Subcontractor · **Acc** Accountant · **VO**
ViewOnly. `†` = data-scope-conditional grant.

### 0.3 Action table columns

ID · Description · Default grants · F? (field-scope) · Audit event
· Status (Built / Stub / Not yet).

### 0.4 Permissions model — locked commitments

Through Sessions B + C + D + E:

1. **Role default + bidirectional per-user override.** Effective
   permission = role default ∪ user-added − user-subtracted.
2. **Three UI states per gated control:** hidden / disabled /
   interactive.
3. **Fine-grained by default.** Split when in doubt.
4. **Lookup-table rows carry behavior bindings, not just labels.**
5. **Guided creation, never lazy creation.** Every "+ Add" lookup
   flow is a wizard: identity → smart defaults inherited from
   closest existing → behavior bindings → workflow inheritance →
   preview → save.
6. **Ten dimensions of permission control** per §1.12 + §2.12 +
   §3.12 — role definition, per-user override, data scope,
   field-level visibility, action gates, approval workflows,
   system policy, UI presentation, audit visibility, lookup/template
   management.
7. **Contractual integrity exception to bidirectional override:**
   `clients:overrideSlaResponseTime` is Admin-only and cannot be
   granted via per-user override.
8. **Versioned T&C clauses + workflow rules.** Already-sent quotes
   retain their clause version; already-running workflow executions
   carry the rule version they started with.
9. **Eight-layer print protection** for sensitive PDFs (quotes,
   contracts, payroll, HR docs).
10. **Comprehensive logging visibility** per PRINCIPLES §4 — every
    change writes an audit row; per-record audit tab, system-wide
    activity feed, per-user activity report, notification rules
    from audit, 7-year retention.

### 0.5 Baseline gaps (from Session C)

**Gap 1** — Runtime matrix ≪ UI catalog (~11 enforced vs ~85
defined). Permissions build reconciles.
**Gap 2** — No route-level permission gates today. Auth only.
**Gap 3** — Sidebar is binary, not three-state. No "hidden" branch.
**Gap 4** — Field visibilities + data scopes defined as types but
unwired.
**Gap 5** — Bidirectional per-user override not modeled. Pure
role-based today.

### 0.6 Walk order

1. **Clients + Sites + Contacts** *(complete §1)*
2. **Employees + Permissions** *(complete §2)*
3. **Settings** *(complete §3)*
4. Dashboard
5. Quotes
6. Projects
7. Inventory
8. Vendors
9. Invoices
10. Subcontractors (also called "Contractors")
11. Financials
12. Scheduling
13. Reports

### 0.7 Sidebar architecture — People parent menu *(Session D)*

The top-level sidebar restructures around a unified **People** menu
that hover-expands to all entity-management sub-items. This
consolidates what would otherwise be six separate top-level entries
into one parent surface — operator's mental model is *"I want to
add/find a person or company"* → People → pick the type.

```
🧭 Sidebar (top-level after restructuring)
─────────────────────────────────────────
📊 Dashboard
👥 People                ← parent (hover/tap expands)
   ├── Clients          ← Module 1 list view
   ├── Sites            ← global view across all clients
   ├── Employees        ← Module 2 list view
   ├── Vendors          ← Module 8 list view
   ├── Contractors      ← Module 10 list view (subcontractors)
   └── Misc Contacts    ← unaffiliated contacts (inspectors,
                          insurance brokers, lawyers, bankers,
                          ULC certifiers, etc.)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials
📈 Reports
⚙️ Settings              ← Module 3 surface (bottom of sidebar)
```

**Sub-item behavior:**
- Click parent People → "People overview" page with counts +
  recent-activity feed across all six sub-types.
- Click sub-item → that sub-type's list view + filters + "+ Add"
  button.
- Each sub-type's "+ Add" opens the appropriate creation drawer.
- **Three-state per sub-item** — operator might see some sub-items
  disabled (greyed with tooltip) and others hidden entirely based
  on their permissions.

**Misc Contacts implementation:** extends the existing `contacts`
table from Module 1 — adds nullable `client_id`, plus
`misc_category` FK to a `misc_contact_categories` lookup (seeded:
Inspector, Insurance Broker, Lawyer, Banker, ULC Certifier, City
Official, Real Estate Agent, Other).

**Terminology lock-in:** "Employees" replaces "Users" throughout
the system. Action prefixes use `employees:*`, not `users:*`. UI
labels say "Employees." The word "User" appears only in
technical/system contexts (e.g., `user_id` FKs in database, "user
session" in audit logs).

---

═══════════════════════════════════════════════════════════════════
# 1. Module: Clients + Sites + Contacts
═══════════════════════════════════════════════════════════════════

## 1.1 Purpose

Customer master record. A client is either a **Company** (corporate
entity with legal name, BIN, website) or an **Individual** (person
with legal first + last name). Sites are physical locations
belonging to clients — one client, many sites. Contacts are people
at clients/sites — many-to-many across sites.

Foundation for every other module. **SLAs attach per-site**, not
per-client. Banking, payment terms, holdback, credit configuration,
and onboarding gates attach at the client level. Onboarding gates
auto-inject T&C language into quotes via clause-per-gate composition.

## 1.2 Sidebar surface

**Resolved by §0.7** — Clients lives under the People parent menu
as a sub-item. Sites and Misc Contacts are siblings of Clients
under People.

**Badge logic on People parent:** aggregated count of issues across
all six sub-types — slow-pay clients, expiring SLAs, expiring
certifications, suspended vendors, etc. Operator-configurable in
Settings.

## 1.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/people` | Overview (counts + recent activity all sub-types) | `people:viewOverview` |
| `/clients` | Clients list view | `clients:viewList` |
| `/clients/new` | Create drawer | `clients:create` |
| `/clients/[id]` | Client detail (Overview) | `clients:viewDetail` |
| `/clients/[id]/sites` | Sites under client | `sites:view` |
| `/clients/[id]/sites/[siteId]` | Site detail | `sites:view` |
| `/clients/[id]/sites/[siteId]/equipment` | Installed equipment | `sites:viewEquipment` |
| `/clients/[id]/sites/[siteId]/access` | Gate/alarm codes | `sites:viewAccess` |
| `/clients/[id]/sites/[siteId]/sla` | SLA (active + history) | `slas:view` |
| `/clients/[id]/sites/[siteId]/service-contracts` | Recurring plans | `service_contracts:view` |
| `/clients/[id]/contacts` | Client's contacts | `contacts:view` |
| `/clients/[id]/quotes` | Quote history | `clients:viewQuoteHistory` |
| `/clients/[id]/projects` | Project history | `clients:viewProjectHistory` |
| `/clients/[id]/service-history` | Historic jobs | `clients:viewServiceHistory` |
| `/clients/[id]/invoices` | Invoice history | `clients:viewInvoiceHistory` |
| `/clients/[id]/documents` | Files | `clients:viewDocuments` |
| `/clients/[id]/banking` | Banking + AR config | `clients:viewBankingDetails` |
| `/clients/[id]/onboarding` | Gate config | `clients:viewOnboardingRequirements` |
| `/clients/[id]/communication-log` | Email/call/SMS | `clients:viewCommunicationLog` |
| `/clients/[id]/custom-fields` | Operator fields | inherits view |
| `/clients/[id]/audit-log` | Module audit | `clients:viewAuditLog` |
| `/sites` | Global sites view across clients | `sites:viewGlobal` |
| `/contacts` | Global contacts + misc | `contacts:globalSearch` |

## 1.4 Resources

### Owned tables

**Core:** `clients`, `sites`, `contacts`, `contact_site_links` (M:N),
plus per-entity `*_custom_field_definitions` and
`*_custom_field_values`.

### Client schema

**Identity:** `entity_type` (Company/Individual), `common_name`,
`legal_name`, `legal_first_name`, `legal_last_name`, `client_code`
(auto-generated; UI label "Client ID"), `logo_url`.

**Classification:** `customer_type_id`, `client_status_id`,
`tier_id`, `industry_id`, `lead_source_id`, `currency_id`,
`language_id`, `time_zone`.

**Contact:** `business_phone`, `alt_phone`, `fax`, `general_email`,
`website`, `cra_business_number`.

**Location:** `addr_line1`, `addr_line2`, `city`, `province`,
`postal_code`, `country`. Coords for mapping.

**Billing address:** same fields with `billing_` prefix;
`billing_same_as_location` flag.

**Banking (encrypted at rest):** `bank_account_name`,
`routing_number`, `bank_account_number`.

**AR/Credit:** `credit_limit`, `on_stop`, `on_stop_reason`,
`on_stop_at`, `on_stop_by_user_id`, `payment_method_id`,
`payment_terms_days`, `payment_terms_basis`.

**Holdback:** `holdback_applies`, `holdback_pct` (default 10%),
`holdback_tax_basis` (Excl/Incl), `holdback_release_days` (45).

**PO:** `po_required`, `default_po_format`.

**Late fee:** `late_fee_pct`, `late_fee_compounding`,
`late_fee_grace_days`, `late_fee_auto_apply`.

**Response time fallback:** `response_time_id` (used only if no
site SLA + no site response time).

**Notes:** `internal_notes`, `risk_tags[]`.

**Account:** `account_manager_user_id`.

**Onboarding:** `onboarding_requirements_set_at`.

**Standard:** `id`, `created_at`, `created_by`, `updated_at`,
`updated_by`, `deleted_at`.

### Site schema (additions)

- `response_time_id` (overrides client when set)
- `active_sla_id` (FK; null if none)
- Access fields (gate_code, alarm_code, key_location,
  on_arrival_contact_id) — encrypted at rest

### Contacts schema (extended for Misc per §0.7)

- `client_id` — **nullable** (null for misc contacts)
- `misc_category_id` — FK to `misc_contact_categories` lookup; null
  for client-attached contacts
- All other standard contact fields (name, phone, email,
  preferred_channel, decision_authority, etc.)

### New tables introduced by Module 1

- `service_level_agreements` (FK to **site_id**)
- `sla_response_overrides` (audit of admin overrides)
- `service_contracts` (recurring plans per site)
- `onboarding_gate_types` (master list + clause text per gate)
- `client_onboarding_requirements` (per-client gate config)
- `onboarding_gate_fulfillments` (status per client-gate)
- `communication_log` (emails/calls/SMS per client)
- `misc_contact_categories` (lookup; seeded values below)

### Status lookup tables

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `client_statuses` | Lead, Prospect, Active, Inactive, Archived | quote/project/invoice allowed; auto-promote rules |
| `customer_types` | 16 industry values (Charity, Commercial Real Estate, Condo, Construction, Facility Services, Financial Institutions, Food, Health Care, IT and Technology, Power and Infrastructure, Retail and Office, Transportation, TV and Film Production, Residential, Government, Other) | quote template, form variant, panel-cert req |
| `client_tiers` | Diamond, Platinum, Gold, Silver, Bronze | SLA default, discount %, payment terms, credit limit, AM-required, notify rules |
| `site_statuses` | Active, Inactive, Under Construction, Decommissioned | scheduling eligibility |
| `site_types` | Office, Warehouse, Retail, Industrial, Multi-Family, SFR, etc. | default equipment template |
| `contact_roles` | Primary, Billing, Technical, Site Manager, Decision Maker | M:N per link |
| `response_time_types` | Emergency (1hr 24/7), Type A Same Day, Type B Next Day, Type C This Week, Type D Recurring | max hours, 24/7 flag, escalation |
| `payment_methods` | EFT, Cheque, CC, Wire, PAD, ACH, Cash, On Account | label only |
| `payment_term_basis` | from_invoice, after_eom, cod, last_day_of_month | calculation rule |
| `lead_sources` | Referral, Cold call, Web inquiry, Trade show, Repeat, Partner, Other | reporting tag |
| `currencies` | CAD, USD | symbol, decimals, ISO |
| `languages` | en, fr | locale, default PDF templates |
| `sla_statuses` | Draft, Active, Expired, Terminated | enforce flag |
| `service_contract_statuses` | Draft, Active, Expired, Cancelled, Renewed | billing trigger |
| `onboarding_gate_types` | Insurance Cert, MSA, Deposit, Credit App, T5018, W9, Bond Letter, NDA, BG Check | clause text, default-required-at-tier, expiry |
| `misc_contact_categories` | Inspector, Insurance Broker, Lawyer, Banker, ULC Certifier, City Official, Real Estate Agent, Other | label only |

## 1.5 Actions (~110 actions)

**Clients (~30):** viewList, viewDetail, create, editBasic,
promoteStatus, editAddress, editBilling, viewBankingDetails,
editBankingDetails, viewCreditInfo, editCreditTerms, setOnStop,
releaseOnStop, editHoldback, editPoRequirement, viewInternalNotes,
editInternalNotes, editRiskTags, assignAccountManager,
editResponseTime, **overrideSlaResponseTime (A only, no per-user
override permitted)**, archive, unarchive, hardDelete, merge,
viewServiceHistory, viewQuoteHistory, viewProjectHistory,
viewInvoiceHistory, viewContracts, viewDocuments, uploadDocument,
deleteDocument, viewOnboardingRequirements,
editOnboardingRequirements, viewCommunicationLog, logCommunication,
editCustomFieldValues, editCustomFieldDefinitions, exportCsv,
importCsv, setUserVisibility, viewAuditLog.

**Sites (~15):** view, create, editBasic, editResponseTime,
viewEquipment, editEquipment, viewAccess (audit-read exception),
editAccess, viewServiceContract, editServiceContract, archive,
transferToClient, viewServiceHistory, editCustomFieldValues,
editCustomFieldDefinitions.

**Contacts (~13):** view, create, editBasic, editPreferredChannel,
editDecisionAuthority, archive, linkToSite, unlinkFromSite,
viewLinkedSites, globalSearch, **viewMisc, editMisc (misc-category
specific)**, editCustomFieldValues, editCustomFieldDefinitions.

**SLAs (per-site, 8):** view, create, edit, uploadSignedDoc,
activate, terminate, renew, viewHistory.

**Service contracts (6):** view, create, edit, viewBilling, cancel,
renew.

**Onboarding gates (7):** view, create, editClause, fulfillments
(view, submit, approve, reject).

(Full action tables retained as committed in v0.2 — see Module 1
session reference for default grants, field-scope, audit events,
status flags per action.)

## 1.6 Views

(Per v0.2 spec, unchanged.) Client create/edit sectioned drawer
with 11 sections; client detail with 13 tabs; site detail with
SLA tab; SLA management surface; On Stop banner; eight-layer print
protection; drawers/modals/widgets/reports as catalogued.

## 1.7 Field-level treatment

14 visibility flags: creditInfo, bankingDetails, internalNotes,
riskTags, holdbackConfig, lateFeeConfig, commissions (Phase 2),
accessCodes (encrypted + audit-on-read), serviceContractValue,
equipmentSerial, personalPhone, decisionAuthority, signedTerms,
responseTimes.

## 1.8 Custom-field surfaces

Clients / Sites / Contacts / SLAs / Service Contracts all support
operator-defined custom fields via the standard pattern
(definitions + values tables; appearing in drawers, lists, detail
headers, filters, PDFs, reports, exports).

## 1.9 Status surfaces

15 lookup tables (see §1.4). Each row carries behavior bindings per
§0.4 #4. Each "+ Add" flow uses guided-creation wizard per §0.4 #5.

## 1.10 Cross-module relationships

Read by Quotes (client/site/contact, SLA, onboarding, On Stop,
billing terms), Projects (quote.client, status, SLA), Invoices
(billing config, holdback, PO), Scheduling (site response via
precedence), Service History (derived), Financials (AR aging,
holdback releases).

Events: client.*, site.*, contact.*, sla.*, service_contract.*,
onboarding_gate.*, communication.logged.

## 1.11 Competitive floor delta

Beats Sedona Office (stacked detail vs 4-tab navigation),
ServiceTrade (global contact search day-one), simPRO/ServiceFusion
(M:N site-contact linking), most competitors (field-level
internal-notes separation, eight-layer print protection,
per-site SLAs with precedence resolution, contractual integrity
exception, encrypted access codes with audit-on-read, onboarding
gate auto-T&C composition, communication log as native first-class,
service contracts separate from SLAs).

## 1.12 Permissions design implications

14 items captured in v0.2. Highlights: DATA_SCOPES wiring, 14 new
field visibilities, bidirectional override UI, audit-read
exception for `sites:viewAccess`, encryption at rest, three-state
per tab, merge audit captures both sides, contractual integrity
exception for SLA override, ten dimensions of control, approval
delegation framework, time-bounded grants, guided creation wizard,
workflow rule data model, versioning.

## 1.13 Open questions

14 items captured in v0.2. Highlights: gate code encryption
method, contact-client multiplicity, client merge mechanics,
service history scope, site equipment first-class vs custom-field,
risk tag values, top-clients widget gating for SR, late fee
compounding default, holdback default, approval delegation v1
defaults, service contract billing cycles seeding, SLA per-service-type
(Phase 2), communication log Twilio integration timing.

## 1.14 Acceptance criteria

54 test scenarios captured in v0.2 covering: Client lifecycle (1-6),
Banking & AR (7-13), SLA & Response Time (14-17), Onboarding gates
& T&C (18-21), Permissions / 10 dimensions (22-36), Logging
visibility (37-41), Print protection (42-45), Performance (46-49),
Security (50-54).

---

═══════════════════════════════════════════════════════════════════
# 2. Module: Employees + Permissions
═══════════════════════════════════════════════════════════════════

## 2.1 Purpose

The substrate every module reads from. Two coupled concerns:

**Employees** — people who work for your company. Office staff
(Admin / PM / SalesRep / Accountant) and field staff (Technicians
/ Field-Hybrid). Records include identity, contact, payroll,
certifications, territories, equipment assignments, operating
hours, absences.

**Permissions** — the access control surface. Ten dimensions
locked in §0.4: role × per-user override × data scope × field
visibility × action gates × approval workflows × system policy ×
UI presentation × audit visibility × lookup/template management.

Coupled because every permission decision is about *which employee*
gets *which access* to *which records*.

## 2.2 Sidebar surface

Per §0.7 — Employees lives under People parent menu. Same sub-item
treatment as Clients/Sites/Vendors/Contractors/Misc Contacts.

Three-state per sub-item: a SalesRep can see Employees disabled
(can't manage staff) while having Clients fully interactive.
Custom roles with zero employee permissions hide it entirely.

## 2.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/employees` | List view (filters: role, status, last active, certs-expiring) | `employees:viewList` |
| `/employees/new` | Invite drawer | `employees:invite` |
| `/employees/[id]` | Detail (Overview tab) | `employees:viewDetail` |
| `/employees/[id]/profile` | Basic info + custom fields | inherits view |
| `/employees/[id]/permissions` | **Ten-dimensional control page** | `employees:viewPermissions` |
| `/employees/[id]/certifications` | License + cert tracking | `employees:viewCertifications` |
| `/employees/[id]/territories` | Geographic assignment | `employees:viewTerritories` |
| `/employees/[id]/availability` | Working hours + absences | `employees:viewAvailability` |
| `/employees/[id]/equipment` | Vehicle/tools/devices | `employees:viewEquipment` |
| `/employees/[id]/payroll` | Rates, banking (heavily gated) | `employees:viewPayroll` |
| `/employees/[id]/activity` | Audit feed for this employee | `employees:viewActivity` |
| `/employees/[id]/sessions` | Active sessions with sign-out | `employees:viewSessions` |
| `/employees/[id]/notifications` | Notification preferences | inherits view |
| `/employees/[id]/api-tokens` | Personal tokens (rare; Phase 2 default off) | `employees:viewApiTokens` |
| `/employees/[id]/documents` | Uploaded docs (contract, photo ID, etc.) | `employees:viewDocuments` |
| `/employees/[id]/audit-log` | Module audit for this employee's edits | `employees:viewAuditLog` |
| `/employees/roles` | Role catalog | `roles:viewList` |
| `/employees/roles/[id]` | Role detail (permission matrix) | `roles:viewDetail` |
| `/employees/roles/new` | Create role wizard (guided creation) | `roles:create` |
| `/employees/permissions-catalog` | Read-only catalog view | `permissions_catalog:view` |
| `/employees/audit-log` | System-wide audit | `audit:viewSystemWide` |
| `/employees/approval-workflows` | Workflow builder | `approval_workflows:view` |
| `/employees/security-policy` | System-wide security policy | `security_policy:view` |
| `/employees/map` | Map view of employees (per simPRO) | `employees:viewMap` |
| `/employees/licence-matrix` | Licence Matrix Report (per simPRO) | `employees:viewLicenceMatrix` |

## 2.4 Resources

(Per v0.3 spec — see Session D handoff for full schema.)

Key tables: `employees`, `roles`, `permissions`, `role_permissions`,
`user_permission_overrides`, `user_field_visibility_overrides`,
`user_data_scopes`, `employee_certifications`, `certification_types`
(25+ seeded), `employee_certification_records`, `employee_territories`,
`territories`, `employee_availability`, `employee_absences`,
`employee_equipment_assignments`, `equipment`, `approval_workflows`,
`approval_workflow_steps`, `user_approval_delegations`,
`security_policies`, `access_requests` (per FieldWire pattern),
`user_sessions`, `permission_grant_audit`.

11 lookup tables with behavior bindings: `employee_statuses`,
`employee_types`, `certification_types`, `territory_types`,
`absence_types`, `mfa_methods`, `session_duration_options`,
`data_scope_types`, `approval_workflow_step_types`, `equipment_types`,
`access_request_statuses`.

## 2.5 Actions

~80 actions across 14 categories: Employee management (15),
Role management (10), Per-employee permission overrides (8),
Data scope (8), Field visibility (6), Certifications (10),
Territories (5), Availability/absences (7), Equipment assignments
(5), Payroll/rates (5, heavily gated), Approval workflows (7),
Security policy (7), Audit (6), Sessions (3), Access requests (4),
Bulk operations (4).

(Full action tables retained as committed in v0.3.)

## 2.6 Views

Six-tab permissions editor at `/employees/[id]/permissions`:
Role & Overrides / Data & Field Access / Workflows & Delegations /
Security & Sessions / UI & Audit / API & SSO.

Other key views: employee list with filter chips, color-coded
technician profiles (per ServiceTrade), map view at `/employees/map`
(per simPRO), Licence Matrix Report (per simPRO), role catalog
with create-role wizard, approval workflow builder UI, security
policy editor, system-wide audit log, employee availability
calendar, bulk operations modals, invite drawer flow,
request-admin-access workflow (per FieldWire pattern, extended).

## 2.7 Field-level treatment

14 visibility flags for employee records (email, personalPhone,
address, emergencyContact, lastIp, lastDeviceFingerprint,
failedLoginCount, passwordResetHistory, hourlyBillRate,
hourlyCostRate, payHistory, bankingDetails, sinNumber, dob).

## 2.8 Custom-field surfaces

Employees support operator-defined custom fields (managed in
Settings → Custom Fields → Employees per §3.3 C).

## 2.9 Status surfaces

11 lookup tables (see §2.4). Each with behavior bindings per §6.

## 2.10 Cross-module relationships

Read by every other module — permission checks happen on every
page render, server action, data query.

Specifically: Clients (account_manager_user_id), Quotes
(assigned_to_user_id), Projects (pm_user_id, tech_assignments[]),
Scheduling (major reader — territory, cert, availability, absence,
capacity), Financials (payroll Phase 2, rates, commission),
Inventory (truck assignments), Vendors/Contractors (AM assignment).

Events: employee.*, permission_override.*, certification.*,
absence.*, session.*, security_policy.*, access_request.*.

## 2.11 Competitive floor delta

Beats every named competitor: ten-dimensional permission control,
contractual integrity exception, certification tracking with
scheduling auto-match + critical flag + 30/60/90 day alerts,
request-admin-access workflow for any gated action, color-coded
profiles + map view + Licence Matrix Report, Resource Absences
with approval + scheduling impact + balance tracking,
eight-layer print protection on payroll/HR docs, field-level
encryption-at-rest on banking + SIN + access codes.

## 2.12 Permissions design implications

Items 15-22: effective-permissions caching (sub-10ms), code-defined
permission catalog, role hierarchy Phase 2, SSO Phase 2, personal
API tokens Phase 2, certifications drive scheduling, absences drive
scheduling, two-tier permission model Phase 2.

## 2.13 Open questions

4 items: multi-company/departments (Phase 2 placeholder column),
crew assignments (Phase 2), Service Resource vs Employee distinction
(separate), Employee Portal pattern (full app for everyone at v1).

## 2.14 Acceptance criteria

55 test scenarios captured in v0.3 covering Employee CRUD (1-8),
Certifications (9-14), Territories & availability (15-18),
Permissions / 10 dimensions (19-37), Request-admin-access (38-39),
Logging visibility (40-43), Sessions (44-46), Print protection
(47-49), Performance (50-52), Security (53-55).

---

═══════════════════════════════════════════════════════════════════
# 3. Module: Settings
═══════════════════════════════════════════════════════════════════

## 3.1 Purpose

Settings is the **configuration surface** that controls how the
other 12 modules behave. Not a feature module — the operator's
control panel for bending the platform to your workflow without
touching code.

Every operator-editable thing in the system lives here: lookup
table management (the ~30 status/type/tier/role lookups named
across M1+M2), custom field definitions per entity, workflow
rules editor, approval workflow templates, security policy per
role, email/PDF/SMS templates, notification rules, integration
connections, company profile, branding, audit retention, backups,
and the Nexvelon-self subscription/billing.

## 3.2 Sidebar surface

**Bottom of sidebar** per §0.7 layout. Top-level item: ⚙️ Settings.
Single entry; drilldown to sub-pages organized in categories.

## 3.3 Routes & sub-routes (~70 sub-pages, organized in categories)

### A. Company identity & branding (3 pages)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/company-profile` | Legal name, BIN, GST/HST, addresses, logo, signing authority, default currency, default language, time zone, fiscal year end, default holdback | `company_profile:view` |
| `/settings/branding` | Brand colors, theme (light/dark/system), PDF letterhead per language, email signature defaults | `branding:view` |
| `/settings/formats` | Number format, date format, time format, default currency display | `formats:view` |

### B. Lookup management (29 sub-pages — uniform pattern, each with guided-creation wizard per §0.4 #5)

| Route | Manages lookup |
|---|---|
| `/settings/lookups` | Index of all lookups with row count + last modified |
| `/settings/lookups/client-statuses` | client_statuses |
| `/settings/lookups/customer-types` | customer_types (16 seeded) |
| `/settings/lookups/client-tiers` | client_tiers (5 seeded with behavior bindings) |
| `/settings/lookups/site-statuses` | site_statuses |
| `/settings/lookups/site-types` | site_types |
| `/settings/lookups/contact-roles` | contact_roles |
| `/settings/lookups/response-time-types` | response_time_types |
| `/settings/lookups/payment-methods` | payment_methods |
| `/settings/lookups/lead-sources` | lead_sources |
| `/settings/lookups/currencies` | currencies |
| `/settings/lookups/languages` | languages |
| `/settings/lookups/onboarding-gate-types` | onboarding_gate_types (includes T&C clause text editor) |
| `/settings/lookups/misc-contact-categories` | misc_contact_categories (8 seeded) |
| `/settings/lookups/sla-statuses` | sla_statuses |
| `/settings/lookups/service-contract-statuses` | service_contract_statuses |
| `/settings/lookups/service-contract-billing-cycles` | service_contract_billing_cycles |
| `/settings/lookups/quote-statuses` | quote_statuses |
| `/settings/lookups/project-statuses` | project_statuses |
| `/settings/lookups/invoice-statuses` | invoice_statuses |
| `/settings/lookups/vendor-statuses` | vendor_statuses |
| `/settings/lookups/contractor-statuses` | contractor_statuses |
| `/settings/lookups/certification-types` | certification_types (25+ seeded) |
| `/settings/lookups/territories` | territories (geographic zones) |
| `/settings/lookups/territory-types` | territory_types |
| `/settings/lookups/absence-types` | absence_types |
| `/settings/lookups/equipment-types` | equipment_types |
| `/settings/lookups/tax-codes` | tax_codes (HST/GST/PST/state) |
| `/settings/lookups/labor-rate-types` | labor_rate_types |
| `/settings/lookups/employee-statuses` | employee_statuses |
| `/settings/lookups/employee-types` | employee_types |

### C. Custom field definitions per entity (12 sub-pages)

| Route | Manages |
|---|---|
| `/settings/custom-fields/clients` | Client custom fields |
| `/settings/custom-fields/sites` | Site custom fields |
| `/settings/custom-fields/contacts` | Contact custom fields |
| `/settings/custom-fields/quotes` | Quote custom fields |
| `/settings/custom-fields/projects` | Project custom fields |
| `/settings/custom-fields/inventory-items` | Inventory item custom fields |
| `/settings/custom-fields/vendors` | Vendor custom fields |
| `/settings/custom-fields/contractors` | Contractor custom fields |
| `/settings/custom-fields/employees` | Employee custom fields |
| `/settings/custom-fields/service-contracts` | Service contract custom fields |
| `/settings/custom-fields/slas` | SLA custom fields |
| `/settings/custom-fields/misc-contacts` | Misc contact custom fields |

Each: list of defined fields + "+ Add Field" wizard (name, type
[text/number/dropdown/date/boolean/multi-select/file], required,
default value, show_in_list, show_in_header, show_on_pdf, sensitive
flag, sort order, archived).

### D. Workflow & automation (4 pages)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/workflow-rules` | Data-driven rules editor (condition-action table at v1; visual flowchart Phase 2). Operator can view, clone, edit, disable seeded rules. | `workflow_rules:view` |
| `/settings/approval-workflows` | Per-action approval flow templates (quotes:approve, invoices:approve, etc.). Sequence of approver steps with value thresholds + time bounds. | `approval_workflow_templates:view` |
| `/settings/notifications` | Audit-driven alert rules. "When [event] AND [condition], notify [recipient] via [channel]." | `notification_rules:view` |
| `/settings/sidebar-badges` | Which flags drive badge counts on each sidebar item (slow-pay, SLA expiring, overdue invoices, etc.) | `sidebar_badges:view` |

### E. Templates (3 pages)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/email-templates` | Per-language editor for ~25 seeded email types (welcome, password-reset, 2FA-enrollment, invite, quote-sent, quote-approved, invoice-sent, invoice-overdue, payment-received, cert-expiring-90d/60d/30d, sla-expiring-90d, absence-approved, etc.). Split-pane Handlebars editor with live preview + merge-tag autocomplete. | `email_templates:view` |
| `/settings/pdf-templates` | Per-language editor for quote/invoice/work-order/commissioning/sla PDFs. Letterhead, body, footer; merge tags. | `pdf_templates:view` |
| `/settings/sms-templates` | Phase 2 (Twilio integration deferred per §2.13) | Phase 2 |

### F. Security policy (4 pages)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/security/role-policies` | Per-role: 2FA requirement (Required/Optional/Exempt + which methods), session timeout, IP allowlist, device limit, force-reauth actions | `security:view` |
| `/settings/security/password-policy` | Complexity rules, expiry, history, minimum length | `security:view` |
| `/settings/security/api-keys` | Admin-issued integration keys (scoped, with expiry, audit on every use) | `api_keys:view` |
| `/settings/security/sso` | Phase 2 placeholder | Phase 2 |

### G. Audit & compliance (2 pages)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/audit/retention` | Retention period (7-year default per PRINCIPLES §4), cold storage rotation config, manual rotation with reason | `audit_retention:view` |
| `/settings/audit/notification-rules` | Cross-link to `/settings/notifications` (audit-driven alerts) | `notification_rules:view` |

### H. Integrations (single page with tabs)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/integrations` | Tabbed layout: QuickBooks Online / Slack / Twilio (Phase 2) / Email Provider / Mapping API / Calendar / File Storage / Accounting Export / BIM/CAD (Phase 2). Each tab shows connection status, last sync, mapping config, manual sync, disconnect. | `integrations:view` |

### I. System (3 pages)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/holdback-defaults` | Default holdback %, tax basis, release days (seeded with Ontario Construction Act standard 10%/Excl/45) | `holdback_defaults:view` |
| `/settings/backups` | Automated DB backup schedule, retention, restore-test status | `backups:view` |
| `/settings/multi-company` | Phase 2 placeholder; schema includes `company_id` column for future migration per §2.13 | Phase 2 |

### J. Subscription/billing (1 page)

| Route | Renders | Primary gate |
|---|---|---|
| `/settings/subscription` | Your Nexvelon subscription, billing history, license count, plan tier. Phase 2 placeholder until productized for external customers. | Phase 2 |

**Total: ~70 sub-pages.** Sounds substantial but ~30 wrap lookup
CRUD and ~12 wrap custom-field-definition CRUD via shared components.

## 3.4 Resources

**No new entity tables.** Module 3 surfaces existing tables from
M1+M2 plus configuration-specific tables.

### New owned tables specific to Settings

- `company_profile` — single row (check constraint enforces one
  company per install)
- `branding_settings` — single row
- `display_format_settings` — single row
- `email_templates` — per language + event type (~50 rows seeded)
- `pdf_templates` — per language + document type (~20 rows seeded)
- `notification_rules` — operator-defined audit-driven alerts
- `sidebar_badge_config` — per role + sub-item: which flags drive count
- `api_keys` — Admin-issued integration keys with scopes + expiry
- `integration_connections` — OAuth tokens (encrypted in Supabase
  Vault) + sync state per integration
- `password_policy` — single row
- `audit_retention_settings` — single row
- `backup_settings` — single row
- `holdback_defaults` — single row
- `workflow_rules` — Phase 2 data-driven rule store; v1 ships
  seeded rules with read access + clone capability
- `workflow_rule_executions` — audit of every rule firing
- `approval_workflow_templates` — per-action approval flow
  definitions (consumed by `approval_workflows` runtime in M2)

### Existing tables this module manages CRUD on

All status/type/lookup tables enumerated in §3.3 B (29 lookups),
plus custom field definition tables per entity (12 entities ×
`*_custom_field_definitions` + `*_custom_field_values`).

## 3.5 Actions

**~270 actions** in Module 3. Heavily templated — most are
CRUD-on-lookup variants. Pattern per lookup × 29 lookups + per
custom-field-entity × 12 entities + module-specific actions.

### Lookup CRUD pattern (uniform across 29 lookups)

| Pattern | Default | F? | Audit |
|---|---|---|---|
| `lookups:view` | A, PM | — | — |
| `<lookup>:view` | A, PM (some Acc) | — | — |
| `<lookup>:create` (guided wizard) | A | — | `<lookup>_created` |
| `<lookup>:edit` | A | — | `<lookup>_updated` |
| `<lookup>:archive` | A | — | `<lookup>_archived` |
| `<lookup>:reorder` | A | — | `<lookup>_reordered` |
| `<lookup>:hardDelete` | A | — | `<lookup>_hard_deleted` (only when unused; protected if referenced) |

### Custom field definition pattern (uniform across 12 entities)

| Pattern | Default | F? | Audit |
|---|---|---|---|
| `custom_fields:view` | A, PM | — | — |
| `<entity>_custom_fields:view` | A, PM | — | — |
| `<entity>_custom_fields:create` | A | — | `<entity>_custom_field_created` |
| `<entity>_custom_fields:edit` | A | — | `<entity>_custom_field_updated` |
| `<entity>_custom_fields:archive` | A | — | `<entity>_custom_field_archived` |
| `<entity>_custom_fields:reorder` | A | — | `<entity>_custom_field_reordered` |

### Module-specific Settings actions (~30 unique)

| ID | Description | Default | Audit |
|---|---|---|---|
| `company_profile:view` | View company info | A, PM, Acc, VO | — |
| `company_profile:edit` | Edit company info | A | `company_profile_updated` |
| `branding:view` | View branding | A, PM, Acc, VO | — |
| `branding:edit` | Edit colors/themes/letterhead | A | `branding_updated` |
| `formats:view` | View display formats | All employees | — |
| `formats:edit` | Edit company-wide formats | A | `display_formats_updated` |
| `formats:editUserOverride` | Override format for self | All employees | `display_formats_user_override` |
| `email_templates:view` | View templates | A, PM | — |
| `email_templates:edit` | Edit templates | A | `email_template_updated` |
| `email_templates:preview` | Send test email | A | `email_template_preview_sent` |
| `pdf_templates:view` | View PDF templates | A, PM | — |
| `pdf_templates:edit` | Edit PDF templates | A | `pdf_template_updated` |
| `pdf_templates:preview` | Render preview | A | `pdf_template_preview_rendered` |
| `notification_rules:view` | View rules | A | — |
| `notification_rules:create` | Create rule | A | `notification_rule_created` |
| `notification_rules:edit` | Edit rule | A | `notification_rule_updated` |
| `notification_rules:disable` | Disable rule | A | `notification_rule_disabled` |
| `sidebar_badges:view` | View badge config | A | — |
| `sidebar_badges:edit` | Configure badge logic per role | A | `sidebar_badges_updated` |
| `workflow_rules:view` | View rules (read-only at v1) | A | — |
| `workflow_rules:clone` | Clone seeded rule for customization | A | `workflow_rule_cloned` |
| `workflow_rules:edit` | Edit custom rule (Phase 2) | A | `workflow_rule_updated` |
| `workflow_rules:disable` | Disable a rule | A | `workflow_rule_disabled` |
| `workflow_rules:viewExecutionLog` | See execution history | A | — |
| `approval_workflow_templates:view` | View templates | A | — |
| `approval_workflow_templates:edit` | Edit template | A | `approval_workflow_template_updated` |
| `security:view` | View security policy | A | — |
| `security:editRolePolicy` | Edit per-role 2FA/session/etc. | A | `security_role_policy_updated` |
| `security:editPasswordPolicy` | Edit complexity rules | A | `password_policy_updated` |
| `api_keys:view` | View issued keys (masked) | A | — |
| `api_keys:create` | Issue new API key (one-time display) | A | `api_key_created` |
| `api_keys:revoke` | Revoke key | A | `api_key_revoked` |
| `api_keys:viewUsageLog` | See usage history | A | — |
| `integrations:view` | View integration status | A | — |
| `integrations:connect` | OAuth connect | A | `integration_connected` |
| `integrations:disconnect` | Revoke connection | A | `integration_disconnected` |
| `integrations:editMapping` | Edit field mapping | A | `integration_mapping_updated` |
| `integrations:triggerSync` | Manual sync | A | `integration_sync_triggered` |
| `integrations:viewSyncLog` | See sync history | A | — |
| `audit_retention:view` | View settings | A | — |
| `audit_retention:edit` | Edit retention | A | `audit_retention_updated` |
| `audit_retention:rotate` | Manual rotate to cold storage | A | `audit_rotated` |
| `backups:view` | View backup status | A | — |
| `backups:editSchedule` | Edit schedule | A | `backup_schedule_updated` |
| `backups:trigger` | Manual backup | A | `backup_triggered` |
| `backups:restoreTest` | Test restore | A | `backup_restore_tested` |
| `holdback_defaults:view` | View defaults | A, PM, Acc | — |
| `holdback_defaults:edit` | Edit construction-act defaults | A | `holdback_defaults_updated` |
| `subscription:view` | View Nexvelon subscription | A | — |
| `subscription:edit` | Edit subscription (Phase 2) | A | `subscription_updated` |
| `settings:viewChangePreview` | Preview impact before save | A | — |

**Default grants pattern:** Settings is heavily Admin-gated. PM
can view a subset (lookups for entities they manage, templates,
holdback defaults). Acc can view financial-relevant settings
(payment methods, tax codes, holdback defaults). VO can view
company profile + branding only.

## 3.6 Views

### Settings hub page (`/settings`)

Categorized index with search box. Each category (A-J from §3.3)
is a section with sub-page tiles showing icon + name + brief
description + "last modified" timestamp. Mobile-friendly.

### Uniform lookup sub-page pattern

- Header: lookup name + count + "+ Add" button + filter chips
- Table view with sort, filter, search, archive toggle
- Click row → drawer with full edit (same form as guided-creation
  wizard, pre-filled)
- Archive vs hard-delete (hard-delete only for unused rows;
  blocked if referenced with link to references)
- Audit log link per row

### Uniform custom-field-definition sub-page pattern

Same as lookup pattern, but form differs (field name, type,
options for dropdowns, default, visibility flags, sort).

### Bespoke editors

- **Workflow Rules editor** (`/settings/workflow-rules`) —
  condition-action table at v1 (per §3.13 #1 decision). Each row:
  WHEN [trigger event] WHERE [conditions joined by AND] THEN
  [action]. Drag-reorder. Disable toggle per row. Clone button
  duplicates with "(copy)" suffix. Visual flowchart Phase 2.
- **Approval Workflow Template editor** — drag-drop step builder
  showing sequential / parallel / value-threshold / conditional
  steps. Visual flow preview.
- **Email/PDF template editor** — split-pane: Handlebars editor
  on left, live preview on right. Merge-tag autocomplete dropdown
  shows available variables for that template type ({{client.*}},
  {{quote.*}}, {{site.*}}, etc.). "Send test" button uses
  current logged-in employee's email.
- **Integrations page** — tabbed layout. Each tab: connection
  status badge, last sync timestamp, mapping config table,
  "Sync now" button, "Disconnect" button, sync log link.
- **Notification rules builder** — form: WHEN [event] AND [conditions]
  → recipients (specific users / role / dynamic from record),
  channel (email / Slack / in-app), template selector. Test fire
  with sample event payload.

### Settings change preview (per §3.13 #6)

For behavior-binding changes (e.g., editing tier SLA hours), the
"Save" button is preceded by a preview modal: "This affects N
records. Apply to new only / apply to all existing." Operator
chooses scope; audit captures the choice + the count snapshot.

## 3.7 Field-level treatment

Mostly Admin-only access — field-level less relevant. Exceptions:

- `visibility.api_keys.fullKey` — full key visible **only once
  at creation** (one-time display modal); after that, masked
  everywhere with last 4 chars visible
- `visibility.integrations.credentials` — OAuth tokens never
  displayed in UI; only "Connected" indicator + last sync time
- `visibility.email_templates.testRecipientAddress` — masked in
  audit log for privacy

## 3.8 Custom-field surfaces

Settings entities don't have their own custom fields (they're
config, not business records). But Settings is **where the custom
field definitions for all M1+M2+M4-13 entities ARE managed** —
see §3.3 C.

## 3.9 Status surfaces (Settings-specific)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `api_key_statuses` | Active, Revoked, Expired | usable flag, rate limit applied |
| `integration_connection_statuses` | Connected, Disconnected, Auth Error, Syncing, Sync Failed | sync trigger, alert rules |
| `notification_rule_statuses` | Enabled, Disabled, Auto-disabled-after-failures | execution flag, alert escalation |
| `workflow_rule_statuses` | Enabled, Disabled, Auto-disabled-after-failures | execution flag |

## 3.10 Cross-module relationships

**Every module reads from Settings.** This is the configuration
spine.

- **Clients/Sites/Contacts** (M1) reads: tier defaults, status
  behaviors, response time bindings, onboarding gate clauses, T&C
  templates, payment methods, currencies, languages, customer types
- **Employees** (M2) reads: role definitions, security policies,
  certification types, territory definitions, MFA methods,
  session duration options, absence types
- **All future modules** (M4-M13) read their respective status
  surfaces from Settings lookups

**Events emitted:** `settings.*` — every config change. High
volume; subscription rules filter to relevant subsets.

**Critical cross-module impact:** Changes to behavior-bound lookup
rows immediately affect every consuming module on next read.
**Versioning critical per §0.4 #8** — when tier SLA defaults
change, already-sent quotes carry the version they were sent with.
Settings change preview (§3.6) lets operator opt to apply to new
records only when appropriate.

## 3.11 Competitive floor delta

Beats every competitor on **breadth of operator-editability**:

- **simPRO** — lookup management partial; some lookups require
  support tickets; templates editable but limited
- **ServiceTitan** — lookups partially editable; many hardcoded
- **FieldWire** — construction-project focused; configuration
  depth limited
- **ServiceTrade** — lookups limited; templates limited
- **Salesforce Field Service** — powerful but requires Setup-page
  navigation; complex UI; partner consultancy often needed
- **Sedona Office** — rigid; many lookups admin-tier paid feature

**Nexvelon:** every status, type, tier, role, template, and
workflow rule editable by Admin from within the app. No support
tickets. No code updates needed. Guided-creation wizards make every
"+ Add" approachable. Plus: **email + PDF template editor with
live preview + merge-tag autocomplete + per-language versioning**.
Plus: **Settings change preview** showing impact count before save
(competitive-unique).

## 3.12 Permissions design implications

Items 23-27:

23. **Settings is heavily Admin-gated by default.** PM can be
    granted specific views via per-user override; Acc can view
    financial-relevant settings. The per-user override pattern
    (§1.12) handles edge cases without role proliferation.

24. **Lookup table CRUD audit must capture before/after state.**
    Especially for behavior-binding fields — changing a tier's
    SLA default is operationally significant and must be reversible.
    Audit row includes the row state snapshot pre + post.

25. **API keys are scoped permissions, not full access.** Each
    API key carries a list of allowed actions from the standard
    catalog. Integration key for QBO gets `invoices:read`,
    `payments:write`, `customers:sync` — not full access.

26. **Integration OAuth tokens are encrypted at rest** in Supabase
    Vault. Never displayed in UI. Rotated on disconnect.

27. **Workflow rule edits ship versioned.** Already-running
    executions carry the rule version they started with. New
    triggers use latest. Same versioning pattern as T&C clauses
    (§0.4 #8).

## 3.13 Open questions — RESOLVED IN SESSION E

1. **Workflow Rules editor UX:** ✅ Condition-action table at v1.
   Visual flowchart Phase 2.
2. **Email template merge-tag library scope:** ✅ Handlebars-syntax
   with safe subset; simple conditionals + basic arithmetic;
   no loops in v1.
3. **Per-user vs per-company display formats:** ✅ Company-wide
   default with per-user override allowed (stored on employee
   record).
4. **Workflow rule sandboxing:** ✅ Rule execution timeout 30s,
   max 100 actions per firing, audit + alert on rule failures,
   auto-disable after 3 consecutive failures.
5. **Settings backup/restore as JSON export:** ✅ Phase 2; useful
   for multi-company expansion later.
6. **Settings change preview** (impact count before save): ✅ Yes
   for behavior-binding changes. Modal shows "This affects N
   records" + apply scope choice.

Remaining open questions:

7. **API key rate limiting:** per-key requests/minute cap?
   *Recommendation: Phase 2; ship with global rate limit at v1.*
8. **Multi-language template translation flow:** if Admin edits
   the English `quote.sent` template, does the system flag the
   French version as "stale"? *Recommendation: yes — flag stale
   translations with visual indicator + Admin notification.*
9. **Workflow rule library seeding:** how many seeded rules ship
   at v1? *Recommendation: ~15 essential rules covering
   cert-expiry alerts, SLA breach alerts, On Stop holds,
   approval routing, onboarding gate enforcement.*

## 3.14 Acceptance criteria

40+ test scenarios:

### Functional — Lookup management (1-6)

1. **Add new customer type via guided wizard.** Admin clicks
   "+ Add" on customer-types. Wizard steps: name → smart
   defaults (inherited from closest existing) → behavior bindings
   (quote template, form variant, panel-cert requirement) → preview
   → save. Appears in client-create dropdown immediately.
2. **Edit tier's SLA default with change preview.** Admin changes
   Platinum SLA from 2hr to 1hr. Preview modal shows: "This
   affects 23 Platinum clients with auto-generated SLAs." Operator
   selects "Apply to new only." Audit captures choice + 23-count
   snapshot.
3. **Archive unused lookup row.** Admin archives "Test Vendor
   Type" (zero references). Row disappears from dropdowns but
   retained in DB.
4. **Block archive of referenced lookup row.** Admin tries to
   archive "Active" client_status (used by 200 clients). System
   blocks with "Reassign 200 clients before archiving."
5. **Reorder lookup rows.** Admin drag-reorders client_tiers.
   New order persists; dropdown reflects in next render.
6. **Hard delete only when unreferenced.** Admin tries hard-delete
   a referenced row → blocked. Tries hard-delete an unreferenced
   row → confirms; row gone; audit retained.

### Functional — Custom field definitions (7-9)

7. **Add custom field to Clients.** Admin defines "Account
   Manager Backup" as dropdown (employees). Field appears in
   client create/edit drawer, list column toggle, filters, PDF.
8. **Hide custom field on PDF.** Admin toggles `show_on_pdf=off`
   on existing custom field. Field appears in app UI but absent
   from generated quote PDFs immediately.
9. **Sensitive custom field gated.** Admin marks custom field
   "SSN" as sensitive → automatically gets field visibility
   wired to Admin+Acc only.

### Functional — Templates (10-14)

10. **Edit email template with live preview.** Admin opens
    `quote.sent` template (en). Edits subject. Live preview
    re-renders with current merge-tag autocomplete.
11. **Send test email.** Admin clicks "Send test" → email
    delivers to logged-in employee's address with sample
    rendered content + audit row.
12. **Per-language version snapshot.** Admin sends a quote in
    English. Two weeks later edits English template. Re-sent
    quote uses NEW template; original quote retains the version
    sent.
13. **Stale translation flag.** Admin edits English `quote.sent`.
    System flags French version with visual indicator + sends
    notification to Admin to update fr template.
14. **PDF template preview renders.** Admin edits letterhead
    block in quote PDF template. Preview button renders sample
    PDF with current branding settings + sample quote.

### Functional — Workflow rules & automation (15-19)

15. **Workflow rule fires on event.** Seeded rule "cert-expiring-30d"
    triggers when certification.expiring_30d event fires.
    Execution log captures the firing + actions taken.
16. **Auto-disable after 3 failures.** Notification rule fails 3
    consecutive times (email provider unreachable). Auto-disabled.
    Admin notified.
17. **Clone seeded rule for customization.** Admin clones
    cert-expiring-30d. Customizes recipient list. Saves. Original
    seeded rule preserved.
18. **Workflow rule sandbox limits.** Custom rule attempts 200
    actions in one firing → blocked at 100 + alert + audit row.
19. **Approval workflow with value threshold.** Quote $30k
    submitted. Workflow template `quotes:approve` routes to PM
    (under $50k threshold). PM approves; audit captures full chain.

### Functional — Notifications (20-22)

20. **Notification rule create + fire.** Admin creates rule:
    "When any employee terminated, email me." Employee terminated
    → email arrives within 30s + audit row of rule firing.
21. **Rule with condition filter.** Rule "When quote over $50k
    sent, alert Admin." $30k quote sent → no fire. $60k quote
    sent → alert fires.
22. **Multi-channel notification.** Rule with email + Slack
    channels. Both deliver. Each delivery audited separately.

### Functional — Security & API keys (23-27)

23. **Per-role 2FA enforcement.** Admin sets Acc role 2FA Required.
    Existing Acc forced enrollment on next login.
24. **Password policy edit.** Admin sets min length 12. Existing
    accounts grandfathered; new passwords must meet new rule.
25. **API key scoped enforcement.** Admin issues key with
    `invoices:read` only. Key tries `clients:create` → blocked
    with 403 + audit row.
26. **API key revocation.** Admin revokes key. Next API call
    using that key → 401 + audit row.
27. **API key one-time display.** New key shown in modal once.
    User dismisses. Key never re-displayable; only masked last-4
    visible thereafter.

### Functional — Integrations (28-30)

28. **OAuth connect QuickBooks.** Admin clicks Connect → OAuth
    flow → returns to integrations page with "Connected" + last
    sync timestamp.
29. **Manual sync trigger.** Admin clicks "Sync now" on QBO tab.
    Sync runs, log updates, audit row written.
30. **Disconnect revokes tokens.** Admin clicks Disconnect.
    OAuth tokens deleted from Supabase Vault. Subsequent sync
    attempts fail gracefully with "Reconnect required."

### Functional — Company profile & branding (31-33)

31. **Edit company logo.** Admin uploads new logo. Appears on
    next-generated PDFs + sidebar header + email templates that
    reference {{company.logo}}.
32. **Branding color change.** Admin updates primary brand color.
    Next page render reflects new color. Existing PDFs unchanged.
33. **Display format per-user override.** Employee sets personal
    date format MM/DD/YYYY (overriding company default
    YYYY-MM-DD). Their views show MM/DD/YYYY; others unchanged.

### Functional — Audit & backups (34-36)

34. **Manual audit rotation.** Admin clicks "Rotate to cold
    storage" → enters reason → confirms → rotation runs +
    audit row with reason captured.
35. **Backup trigger + restore test.** Admin triggers backup +
    restore test. Restore-test status updates with timestamp.
36. **Audit retention edit.** Admin extends retention from 7 to
    10 years. Existing audit rows retained per new policy.

### Permissions & access (37-40)

37. **Settings hidden from non-Admin.** SR loads `/settings` →
    redirected to dashboard with toast. Direct nav to
    `/settings/lookups/client-tiers` → 403.
38. **PM granular grant.** Admin grants PM `email_templates:view`
    + `pdf_templates:view` only. PM sees Templates section in
    Settings hub; other sections absent.
39. **Three-state Settings sub-pages.** PM with no settings
    permissions: Settings item completely absent from sidebar.
    PM with partial: Settings present; un-permitted sub-pages
    absent.
40. **Per-user format override does not require Settings
    permission.** Tech edits own date format from profile page;
    no Settings access needed.

### Performance & integrity (41-42)

41. **Lookup load with 500 rows.** Lookup list with 500 entries
    loads <2s with filters.
42. **Settings change preview accuracy.** Tier SLA change
    preview count matches actual affected records (verified by
    direct query).

---

═══════════════════════════════════════════════════════════════════
# Modules 4-13: pending walk
═══════════════════════════════════════════════════════════════════

Walked in subsequent sessions. Same 14-subsection rubric. Each
will be substantial but cross-cutting commitments from Modules
1 + 2 + 3 (ten dimensions, behavior-bound lookups, guided creation,
SLA precedence, T&C composition, eight-layer print, request-admin-
access, certification-driven scheduling, People menu structure,
Settings as config spine) propagate forward.

- §4 — Dashboard (light)
- §5 — Quotes (revenue module — major)
- §6 — Projects
- §7 — Inventory
- §8 — Vendors
- §9 — Invoices
- §10 — Subcontractors (also "Contractors")
- §11 — Financials
- §12 — Scheduling (major reader of M1+M2+M3 surfaces)
- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs (populated at end of full walk)
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary
*Populated after all 13 modules walked.*

## 100. Final sidebar tree
*Locked through Session D — see §0.7.*

## 101. Module dependency graph
*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications
*27 items so far. Populated fully after all 13 modules walked.*

## 103. Cumulative acceptance criteria
*~150 scenarios so far. Populated fully after all 13 modules walked.*

---

**End of v0.4.** Modules 1 + 2 + 3 complete and operator-validated.
Modules 4-13 pending. Settings as the configuration spine locked
in §3. Cross-cutting commitments from Sessions C + D + E propagate
forward.

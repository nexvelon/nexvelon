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
> **Status:** v0.5 — Modules 1 (Clients + Sites + Contacts),
> 2 (Employees + Permissions), 3 (Settings), and 4 (Dashboard)
> fully scoped through Sessions C + D + E + F. Modules 5-13
> pending. Cross-cutting decisions from Sessions C + D + E + F
> propagate forward.

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

Through Sessions B + C + D + E + F:

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
   §3.12 + §4.12 — role definition, per-user override, data scope,
   field-level visibility, action gates, approval workflows,
   system policy, **UI presentation (sidebar + dashboard layout +
   landing page)**, audit visibility, lookup/template management.
7. **Contractual integrity exception to bidirectional override:**
   `clients:overrideSlaResponseTime` is Admin-only and cannot be
   granted via per-user override.
8. **Versioned T&C clauses + workflow rules + dashboard widget
   definitions.** Already-sent quotes retain their clause version;
   already-running workflow executions carry the rule version they
   started with.
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
4. **Dashboard** *(complete §4)*
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
that hover-expands to all entity-management sub-items.

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard            ← Module 4 surface
👥 People               ← parent (hover/tap expands)
   ├── Clients          ← Module 1 list view
   ├── Sites            ← global view across all clients
   ├── Employees        ← Module 2 list view
   ├── Vendors          ← Module 8 list view
   ├── Contractors      ← Module 10 list view
   └── Misc Contacts    ← unaffiliated contacts
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
- Three-state per sub-item based on permissions.

**Misc Contacts implementation:** extends existing `contacts` table
with nullable `client_id` + `misc_category` FK to
`misc_contact_categories` lookup (Inspector, Insurance Broker,
Lawyer, Banker, ULC Certifier, City Official, Real Estate Agent,
Other).

**Terminology lock-in:** "Employees" replaces "Users" throughout.
Action prefixes use `employees:*`. UI labels say "Employees."
Database column `user_id` stays as technical naming.

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

(Full action tables with default grants, F? flag, audit events,
status — preserved in v0.2 commit history. Section 1.5 here is
the consolidated index.)

## 1.6 Views

Client create/edit sectioned drawer with 11 sections (Identity,
Classification, Contact, Location, Billing, Banking & AR, Holdback
& PO, Notes & Risk, AM Assignment, Custom Fields, Onboarding); client
detail with 13 tabs (Overview, Sites, Contacts, Quotes, Projects,
Service History, Invoices, Documents, Banking, Onboarding, Communication
Log, Custom Fields, Audit Log); site detail with SLA tab; SLA
management surface with versioned terms history; On Stop banner with
release workflow; eight-layer print protection on quote/contract PDFs;
drawers/modals/widgets/reports as catalogued.

## 1.7 Field-level treatment

14 visibility flags:
- `visibility.clients.creditInfo` — A, Acc only
- `visibility.clients.bankingDetails` — A, Acc; account# always masked
- `visibility.clients.internalNotes` — A, PM
- `visibility.clients.riskTags` — A, PM, Acc
- `visibility.clients.holdbackConfig` — A, Acc, PM-with-perm
- `visibility.clients.lateFeeConfig` — A, Acc
- `visibility.clients.commissions` — Phase 2
- `visibility.sites.accessCodes` — encrypted + audit-on-read
- `visibility.sites.serviceContractValue` — A, PM, Acc
- `visibility.sites.equipmentSerial` — A, PM, Tech
- `visibility.contacts.personalPhone` — A, PM, SR
- `visibility.contacts.decisionAuthority` — A, PM, SR
- `visibility.clients.signedTerms` — A, Acc
- `visibility.sla.responseTimes` — A, PM (visible to consumers)

## 1.8 Custom-field surfaces

Clients / Sites / Contacts / SLAs / Service Contracts all support
operator-defined custom fields via the standard pattern (definitions
table + values table per entity; appearing in create/edit drawers,
list view columns, detail header KPI badges if `show_in_header`, filters,
PDF documents if `show_on_pdf`, reports, CSV exports). Definitions
managed in Settings → Custom Fields per §3.3 C.

## 1.9 Status surfaces

15 lookup tables (see §1.4). Each row carries behavior bindings per
§0.4 #4. Each "+ Add" flow uses guided-creation wizard per §0.4 #5.

## 1.10 Cross-module relationships

**Read by Quotes** (client/site/contact, SLA, onboarding gates, On Stop
state, billing terms, holdback config, PO requirement, late fee config).
**Read by Projects** (quote.client→project.client, status, SLA).
**Read by Invoices** (billing config, holdback %, PO requirement, late
fee, payment terms basis). **Read by Scheduling** (site response time
via precedence: site SLA > site response field > client response field
> tier default). **Read by Service History** (derived from completed
work orders linked to sites). **Read by Financials** (AR aging, holdback
releases due, commission tracking Phase 2). **Read by Dashboard** (Top
clients widget, On Stop alerts widget, SLA breach widget).

Events emitted: `client.*` (created, status_changed, on_stop_set,
on_stop_released, merged, archived), `site.*` (created, sla_set,
sla_terminated, access_codes_changed), `contact.*` (created, linked,
unlinked, archived), `sla.*` (created, activated, terminated, renewed),
`service_contract.*` (created, billed, cancelled, renewed),
`onboarding_gate.*` (configured, fulfilled, expired),
`communication.logged`.

## 1.11 Competitive floor delta

Beats **Sedona Office** (stacked detail vs 4-tab navigation),
**ServiceTrade** (global contact search day-one),
**simPRO/ServiceFusion** (M:N site-contact linking),
most competitors (field-level internal-notes separation,
eight-layer print protection, per-site SLAs with precedence
resolution, contractual integrity exception, encrypted access codes
with audit-on-read, onboarding gate auto-T&C composition,
communication log as native first-class, service contracts separate
from SLAs).

## 1.12 Permissions design implications (items 1-14)

1. DATA_SCOPES wired end-to-end (own/assigned/mirror/attribute/specific)
2. 14 new field visibilities for clients/sites/contacts
3. Bidirectional override UI mounted at /employees/[id]/permissions
4. Audit-read exception for `sites:viewAccess` (read writes audit row)
5. Encryption at rest for banking + access codes
6. Three-state per tab/section based on permissions
7. Client merge audit captures both sides + the merged-into reference
8. Contractual integrity exception for `clients:overrideSlaResponseTime`
9. Ten dimensions of permission control
10. Approval delegation framework for sensitive operations
11. Time-bounded permission grants
12. Guided creation wizard for every lookup
13. Workflow rule data model surfaced in Settings
14. Versioned T&C clauses tied to quote-sent timestamp

## 1.13 Open questions

14 items (per v0.2 spec). Highlights: gate code encryption method
(recommend libsodium + Supabase Vault), contact-client multiplicity
(M:N), client merge mechanics (with audit capturing both sides), service
history scope, site equipment first-class vs custom-field (recommend
first-class), risk tag values, top-clients widget gating for SR, late
fee compounding default (recommend daily compounding), holdback default
(10%/Excl/45 per Ontario Construction Act), approval delegation v1
defaults, service contract billing cycles seeding, SLA per-service-type
(Phase 2), communication log Twilio integration timing.

## 1.14 Acceptance criteria

54 test scenarios covering:
- Client lifecycle (1-6): create individual/company, status promote, archive, hard delete, merge
- Banking & AR (7-13): credit limit, On Stop set/release, holdback config, payment terms, late fee accumulation
- SLA & Response Time (14-17): per-site SLA, precedence resolution, override audit, contractual integrity test
- Onboarding gates & T&C (18-21): clause composition, gate fulfillment, T&C versioning, expiry tracking
- Permissions / 10 dimensions (22-36)
- Logging visibility (37-41)
- Print protection (42-45)
- Performance (46-49)
- Security (50-54)

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
| `/employees/[id]/api-tokens` | Personal tokens (Phase 2) | `employees:viewApiTokens` |
| `/employees/[id]/documents` | Uploaded docs | `employees:viewDocuments` |
| `/employees/[id]/audit-log` | Module audit | `employees:viewAuditLog` |
| `/employees/roles` | Role catalog | `roles:viewList` |
| `/employees/roles/[id]` | Role detail (permission matrix) | `roles:viewDetail` |
| `/employees/roles/new` | Create role wizard (guided creation) | `roles:create` |
| `/employees/permissions-catalog` | Read-only catalog view | `permissions_catalog:view` |
| `/employees/audit-log` | System-wide audit | `audit:viewSystemWide` |
| `/employees/approval-workflows` | Workflow builder | `approval_workflows:view` |
| `/employees/security-policy` | System-wide security policy | `security_policy:view` |
| `/employees/map` | Map view (per simPRO) | `employees:viewMap` |
| `/employees/licence-matrix` | Licence Matrix Report (per simPRO) | `employees:viewLicenceMatrix` |

## 2.4 Resources

### Owned tables — new for Module 2

**Identity & access:** `employees`, `roles`, `permissions`,
`role_permissions`, `user_permission_overrides`,
`user_field_visibility_overrides`, `user_data_scopes`.

**Workforce-specific:** `employee_certifications` (M:N),
`certification_types` (25+ seeded), `employee_certification_records`,
`employee_territories` (M:N with Primary/Secondary/Relocation type),
`territories`, `employee_availability`, `employee_absences`,
`employee_equipment_assignments`, `equipment`.

**Approval & policy:** `approval_workflows`, `approval_workflow_steps`,
`user_approval_delegations`, `security_policies`, `access_requests`
(per FieldWire pattern).

**Session & audit:** `user_sessions`, `permission_grant_audit`.

### Employee schema

**Identity:** entity_type (Internal Employee / Contractor-with-login),
legal_first_name, legal_last_name, preferred_name, employee_code
(auto-generated; UI label "Employee ID"), avatar_url, email,
personal_phone, office_phone.

**Address:** standard fields + time_zone + preferred_language.

**Emergency contact:** name, phone, relationship.

**Employment:** hire_date, termination_date, employee_type_id,
employee_status_id, manager_user_id (reports-to), department,
cost_center_id.

**Authentication:** auth_user_id (FK Supabase Auth), email_verified_at,
last_login_at, last_login_ip, failed_login_count, account_locked_at,
password_reset_required, mfa_enrolled, mfa_method.

**Permissions:** role_id, effective_permissions_cache (jsonb,
computed on grant/revoke events).

**Payroll/rates (highly gated):** hourly_cost_rate (A, Acc only),
hourly_bill_rate (A, Acc, PM-with-perm), salary_amount,
salary_frequency, commission_pct, commission_basis,
payroll_provider_id.

**Banking (encrypted):** bank_account_name, routing_number,
bank_account_number, sin_number.

**Identification/regulatory:** government_id_number,
government_id_document_url, wsib_number,
personal_insurance_certificate_url.

**Scheduling-relevant:** default_territory_id, truck_id,
working_hours_pattern (jsonb), available_for_emergency_call,
service_radius_km.

**Internal:** internal_notes (HR-gated), custom_fields.

### Status lookup tables (with behavior bindings)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `employee_statuses` | Active, Pending Invite, Suspended, On Leave, Terminated, Archived | scheduling eligibility, login allowed, billing implications |
| `employee_types` | Office Staff, Field Technician, Hybrid, Apprentice, Contractor-with-login | default permission set, scheduling visibility |
| `certification_types` | 25+ seeded — Kantech KT-300/400; Genetec Synergis, Mission Control; Software House C-CURE 9000; DSC PowerSeries; Honeywell ProWatch, Galaxy; Bosch B/G-series; Avigilon ACC/ACM; Lenel OnGuard; Paxton Net2; ESA (Ontario); ULC fire alarm; CFAA; CSA; CCTV; Forklift; Working at Heights; Confined Space; OSHA-30; WHMIS 2015; First Aid+CPR; ASP/CSP; LEED AP | critical flag (blocks scheduling), expiry tracking, renewal cadence, regulatory authority |
| `territory_types` | By City, By Region, By Postal Prefix, By Map Polygon, By Province | scope calculation |
| `absence_types` | Vacation, Sick, Personal, Training, Bereavement, Parental, Jury Duty, WSIB Claim, Unpaid Leave | paid flag, requires_approval, deducts_from_balance, max_consecutive_days |
| `mfa_methods` | TOTP, SMS, Email, Hardware Key | strength rating, audit flag |
| `session_duration_options` | 8h, 24h, 7d, 30d, Custom | security strength rating |
| `data_scope_types` | All / Own / Assigned / User Mirror / Attribute Filter / Specific Records | computation pattern |
| `approval_workflow_step_types` | Single approver, Parallel (any-of), Sequential, Value-threshold, Conditional | execution semantics |
| `equipment_types` | Service Truck, Cargo Van, Test Kit, Laptop, Mobile Device, Programmer Cable, Other | tracking template |
| `access_request_statuses` | Pending, Approved, Denied, Auto-Expired | TTL, notification rules |

## 2.5 Actions (~80 actions across 14 categories)

- Employee management (15 actions)
- Role management (10)
- Per-employee permission overrides (8)
- Data scope (8)
- Field visibility (6)
- Certifications (10)
- Territories (5)
- Availability & absences (7)
- Equipment assignments (5)
- Payroll/rates (5, heavily gated)
- Approval workflows (7)
- Security policy (7)
- Audit (6)
- Sessions (3)
- Access requests (4)
- Bulk operations (4)

Default grant pattern: nearly all Admin-only. Self-service exceptions:
`*:viewMy`, `employee_absences:request`, `audit:viewMyActivity`,
`sessions:viewMy`, `access_requests:request`,
`employees:editMyProfile`.

(Full action tables with default grants, audit events preserved in
v0.3 commit history at `4dc0cc2`.)

## 2.6 Views

**Permissions editor — six tabs at `/employees/[id]/permissions`:**
Role & Overrides / Data & Field Access / Workflows & Delegations /
Security & Sessions / UI & Audit / API & SSO.

Each tab shows role default alongside effective value. "Reset to
role default" button per section. Audit row on every change.

**Other key views:** employee list with filter chips; color-coded
technician profiles (per ServiceTrade); map view at `/employees/map`
(per simPRO); Licence Matrix Report (per simPRO); role catalog with
guided-creation wizard; approval workflow builder UI; security policy
editor per role; system-wide audit log with filters; employee
availability calendar; bulk operations modals; invite drawer flow
(email → password+2FA → profile completion); request-admin-access
workflow (per FieldWire pattern, extended to every gated action).

## 2.7 Field-level treatment

14 visibility flags: email (partial for non-admin), personalPhone (A
+ self), address (A only), emergencyContact (A only), lastIp (A
only), lastDeviceFingerprint (A only), failedLoginCount (A/Acc),
passwordResetHistory (A only), hourlyBillRate (A, Acc, PM-with-perm),
hourlyCostRate (A, Acc only), payHistory (A, Acc), bankingDetails
(A, Acc only; account# masked), sinNumber (A, Acc only), dob (A,
HR-role only).

## 2.8 Custom-field surfaces

Employees support custom fields via standard pattern. Definitions
managed in Settings → Custom Fields → Employees per §3.3 C.

## 2.9 Status surfaces

11 lookup tables (see §2.4). Each with behavior bindings.

## 2.10 Cross-module relationships

**Read by every other module.** Permission checks happen on every
page render, server action, data query. Specifically: Clients
(account_manager_user_id), Quotes (assigned_to_user_id), Projects
(pm_user_id, tech_assignments[]), Scheduling (territory, cert,
availability, absence, capacity — major reader), Financials (payroll
Phase 2, rates, commission), Inventory (truck assignments),
Vendors/Contractors (AM assignment), Dashboard (permissions catalog
for widget visibility).

Events: `employee.*` (15+ events), `permission_override.*`,
`certification.*` (with 30/60/90 day alerts), `absence.*`,
`session.*`, `security_policy.*`, `access_request.*`.

## 2.11 Competitive floor delta

Beats every named competitor:
- Ten-dimensional permission control (vs Salesforce's profiles+sets, ServiceTitan's flat roles, simPRO's Security Groups, FieldWire's two-tier)
- Contractual integrity exception
- Certification tracking with scheduling auto-match + critical flag + 30/60/90 day alerts (combines simPRO + ServiceTrade + Salesforce features)
- Request-admin-access workflow for every gated action (FieldWire pattern, extended)
- Color-coded employee profiles + map view + Licence Matrix Report (combines ServiceTrade + simPRO)
- Resource Absences with approval workflow + scheduling block + balance tracking per type
- Eight-layer print protection on payroll/HR docs
- Field-level encryption-at-rest on banking + SIN + access codes

## 2.12 Permissions design implications (items 15-22)

15. Effective-permissions computation sub-10ms (cache pattern with
    `effective_permissions_cache` jsonb invalidated on grant/revoke)
16. Permission catalog is code-defined; operators configure who-gets-what
17. Role hierarchy is Phase 2
18. SSO/SAML is Phase 2
19. Personal API tokens are Phase 2
20. Certifications drive scheduling via `cert_match` work rule
21. Absences drive scheduling (approved block, pending tentative)
22. Two-tier permission model (account + project) Phase 2

## 2.13 Open questions

4 items: multi-company/departments (Phase 2 placeholder column
`company_id`); crew assignments (Phase 2 with Scheduling);
Service Resource vs Employee distinction (Contractors module owns
subs separately); Employee Portal pattern (full app at v1).

## 2.14 Acceptance criteria

55 test scenarios covering:
- Employee CRUD (1-8): invite, expiry, edit, suspend, terminate, hard delete
- Certifications (9-14): add, critical flag blocks scheduling, renewal alerts, Licence Matrix Report
- Territories & availability (15-18): multi-territory, availability pattern, absence request flow
- Permissions / 10 dimensions (19-37): role default, custom roles, additive/subtractive overrides, time-bounded grants, data scopes, field visibility, approval workflows, delegations, 2FA, session timeout, IP allowlist, force re-auth, hidden vs disabled sidebar
- Request-admin-access (38-39): workflow + auto-expire
- Logging visibility (40-43): per-employee activity, system-wide audit, audit-driven notifications, audit immutability
- Sessions (44-46): view own, force sign-out self, force sign-out other
- Print protection (47-49)
- Performance (50-52)
- Security (53-55)

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
Drilldown to sub-pages organized in categories A-J.

## 3.3 Routes & sub-routes (~70 sub-pages organized in 10 categories)

### A. Company identity & branding (3 pages)

- `/settings/company-profile` — legal name, BIN, GST/HST, addresses, logo, signing authority, default currency, default language, time zone, fiscal year end, default holdback
- `/settings/branding` — brand colors, theme, PDF letterhead per language, email signature defaults
- `/settings/formats` — number format, date format, time format, default currency display

### B. Lookup management (29 sub-pages, uniform guided-creation wizard)

`/settings/lookups` (index) + 29 sub-pages:
client-statuses, customer-types, client-tiers, site-statuses,
site-types, contact-roles, response-time-types, payment-methods,
lead-sources, currencies, languages, onboarding-gate-types (with
T&C clause editor), misc-contact-categories, sla-statuses,
service-contract-statuses, service-contract-billing-cycles,
quote-statuses, project-statuses, invoice-statuses, vendor-statuses,
contractor-statuses, certification-types, territories, territory-types,
absence-types, equipment-types, tax-codes, labor-rate-types,
employee-statuses, employee-types.

### C. Custom field definitions per entity (12 sub-pages)

clients, sites, contacts, quotes, projects, inventory-items,
vendors, contractors, employees, service-contracts, slas,
misc-contacts. Each: list + "+ Add Field" wizard (name, type
[text/number/dropdown/date/boolean/multi-select/file], required,
default, show_in_list, show_in_header, show_on_pdf, sensitive,
sort, archived).

### D. Workflow & automation (4 pages)

- `/settings/workflow-rules` — data-driven rules editor (condition-action table at v1; visual flowchart Phase 2). View, clone, edit, disable seeded rules. ~15 seeded rules at v1.
- `/settings/approval-workflows` — per-action approval flow templates
- `/settings/notifications` — audit-driven alert rules
- `/settings/sidebar-badges` — badge logic per sidebar item

### E. Templates (3 pages)

- `/settings/email-templates` — per-language Handlebars editor with live preview + merge-tag autocomplete + ~25 seeded email types
- `/settings/pdf-templates` — per-language editor for quote/invoice/work-order/commissioning/sla PDFs
- `/settings/sms-templates` — Phase 2 (Twilio deferred)

### F. Security policy (4 pages)

- `/settings/security/role-policies` — per-role: 2FA, session timeout, IP allowlist, device limit, force-reauth
- `/settings/security/password-policy` — complexity, expiry, history, min length
- `/settings/security/api-keys` — Admin-issued, scoped, with expiry
- `/settings/security/sso` — Phase 2 placeholder

### G. Audit & compliance (2 pages)

- `/settings/audit/retention` — 7-year default, cold storage rotation
- `/settings/audit/notification-rules` — cross-link to /settings/notifications

### H. Integrations (single page with tabs)

QuickBooks Online / Slack / Twilio (Phase 2) / Email Provider /
Mapping API (OSM Nominatim default) / Calendar / File Storage /
Accounting Export / BIM/CAD (Phase 2). Each tab: connection status,
last sync, mapping config, manual sync, disconnect.

### I. System (3 pages)

- `/settings/holdback-defaults` — Ontario Construction Act standard 10%/Excl/45
- `/settings/backups` — automated schedule, retention, restore-test
- `/settings/multi-company` — Phase 2 placeholder

### J. Subscription/billing (1 page)

`/settings/subscription` — Phase 2 placeholder until productized externally.

**Total: ~70 sub-pages.** ~30 wrap lookup CRUD via uniform component;
~12 wrap custom-field-definition CRUD.

## 3.4 Resources

**No new entity tables.** Module 3 surfaces existing tables from
M1+M2 plus 16 Settings-specific configuration tables.

### New Settings-specific tables (16)

`company_profile` (single row), `branding_settings` (single row),
`display_format_settings`, `email_templates` (per language + event),
`pdf_templates` (per language + doc type), `notification_rules`,
`sidebar_badge_config`, `api_keys`, `integration_connections` (OAuth
tokens encrypted in Supabase Vault), `password_policy`,
`audit_retention_settings`, `backup_settings`, `holdback_defaults`,
`workflow_rules`, `workflow_rule_executions`,
`approval_workflow_templates`.

### Status surfaces

- `api_key_statuses` — Active / Revoked / Expired (usable flag, rate limit)
- `integration_connection_statuses` — Connected / Disconnected / Auth Error / Syncing / Sync Failed
- `notification_rule_statuses` — Enabled / Disabled / Auto-disabled-after-failures
- `workflow_rule_statuses` — Enabled / Disabled / Auto-disabled

## 3.5 Actions (~270 actions, heavily templated)

**Lookup CRUD pattern** (uniform across 29 lookups): view, create
(guided wizard), edit, archive, reorder, hardDelete (only if unused).
Default: Admin only by default. Audit on every change with before/after snapshot.

**Custom field definition pattern** (uniform across 12 entities):
view, create, edit, archive, reorder. Default: Admin only.

**Module-specific Settings actions (~30 unique):**
company_profile (view/edit), branding (view/edit), formats
(view/edit/editUserOverride), email_templates (view/edit/preview),
pdf_templates (view/edit/preview), notification_rules
(view/create/edit/disable), sidebar_badges (view/edit),
workflow_rules (view/clone/edit/disable/viewExecutionLog),
approval_workflow_templates (view/edit), security (view, editRolePolicy,
editPasswordPolicy), api_keys (view/create/revoke/viewUsageLog),
integrations (view/connect/disconnect/editMapping/triggerSync/viewSyncLog),
audit_retention (view/edit/rotate), backups (view/editSchedule/trigger/restoreTest),
holdback_defaults (view/edit), subscription (view/edit),
settings:viewChangePreview.

**Default grants pattern:** heavily Admin-gated. PM can view subset
(lookups for entities they manage, templates, holdback defaults).
Acc can view financial-relevant settings. VO can view company
profile + branding only.

## 3.6 Views

**Settings hub** (`/settings`) — categorized index with search,
each category section showing sub-page tiles with icon + name +
description + last-modified.

**Uniform lookup sub-page pattern:** header with count + Add button;
table with sort/filter/search/archive toggle; click row → drawer
with edit form (same as wizard, pre-filled); archive vs hard-delete
(blocked when referenced); audit log link per row.

**Uniform custom-field-definition pattern:** same as lookup, form
differs.

**Bespoke editors:**
- Workflow Rules editor: condition-action table at v1 (WHEN trigger
  WHERE conditions THEN action). Drag-reorder, disable toggle, clone.
- Approval Workflow Template editor: drag-drop step builder with
  sequential/parallel/value-threshold/conditional steps.
- Email/PDF template editor: split-pane Handlebars editor + live
  preview + merge-tag autocomplete + "Send test" button + per-language
  versioning + stale-translation flagging.
- Integrations page: tabbed layout per connection.
- Notification rules builder: WHEN event AND conditions → recipients
  (specific/role/dynamic) + channel (email/Slack/in-app) + template.

**Settings change preview** (per §3.13 #6): for behavior-binding
changes (e.g., tier SLA hours), Save button preceded by modal:
"This affects N records. Apply to new only / apply to all
existing." Operator chooses; audit captures choice + count snapshot.

## 3.7 Field-level treatment

Mostly Admin-only — field-level less relevant. Exceptions:
`visibility.api_keys.fullKey` (one-time display modal at creation;
masked thereafter with last 4 visible); `visibility.integrations.credentials`
(OAuth tokens never displayed in UI; only "Connected" indicator);
`visibility.email_templates.testRecipientAddress` (masked in audit).

## 3.8 Custom-field surfaces

Settings entities don't have custom fields themselves. But Settings
manages custom field definitions for all M1+M2+M4-13 entities per
§3.3 C.

## 3.9 Status surfaces

4 lookup tables (see §3.4 status surfaces section).

## 3.10 Cross-module relationships

**Every module reads from Settings.** Configuration spine.

- M1 reads: tier defaults, status behaviors, response time bindings,
  onboarding gate clauses, T&C templates, payment methods, currencies,
  languages, customer types
- M2 reads: role definitions, security policies, certification types,
  territory definitions, MFA methods, session duration options,
  absence types
- All future modules read their respective status surfaces

**Critical cross-module impact:** Changes to behavior-bound lookup
rows immediately affect every consuming module. Versioning critical
per §0.4 #8.

Events: `settings.*` (high-volume; subscription rules filter to
relevant subsets).

## 3.11 Competitive floor delta

Beats every competitor on **breadth of operator-editability**:
simPRO has partial lookup management (some require support tickets),
ServiceTitan has partial (many hardcoded), FieldWire is
construction-project focused (limited config depth), ServiceTrade
limited, Salesforce powerful but complex (Setup-page navigation +
often requires partner), Sedona Office rigid.

Nexvelon: every status/type/tier/role/template/workflow rule editable
by Admin from within the app. No support tickets. No code updates.
Guided-creation wizards. Plus: email + PDF template editor with live
preview + merge-tag autocomplete + per-language versioning + stale
translation flagging. Plus: Settings change preview with impact count
+ apply-scope choice.

## 3.12 Permissions design implications (items 23-27)

23. Settings is heavily Admin-gated by default; PM/Acc/VO get
    specific views via per-user override pattern
24. Lookup table CRUD audit captures before/after state snapshots
25. API keys are scoped permissions (action allowlist), not full
    access
26. Integration OAuth tokens encrypted at rest in Supabase Vault
27. Workflow rule edits ship versioned (running executions carry
    their start-version)

## 3.13 Open questions — RESOLVED IN SESSION E

1. ✅ Workflow Rules editor: condition-action table at v1
2. ✅ Merge tag scope: Handlebars safe subset (simple conditionals
   + arithmetic; no loops)
3. ✅ Display formats: company default + per-user override allowed
4. ✅ Workflow sandboxing: 30s/100 actions max/auto-disable after 3
   failures
5. ✅ Settings backup/restore (JSON): Phase 2
6. ✅ Settings change preview: yes for behavior-binding changes

Remaining: API key per-key rate limiting (Phase 2); multi-language
template stale-flagging (yes recommended); workflow rule library v1
seed count (~15 essential rules).

## 3.14 Acceptance criteria

42 test scenarios:
- Lookup management (1-6): add via wizard, edit with change preview, archive unused/block referenced, reorder, hard delete protection
- Custom field definitions (7-9): add to Clients, hide on PDF, sensitive flag wiring
- Templates (10-14): edit with live preview, send test, per-language version snapshot, stale translation flag, PDF preview render
- Workflow rules (15-19): fire on event, auto-disable after failures, clone for customization, sandbox limits, approval workflow value threshold
- Notifications (20-22): create + fire, condition filter, multi-channel
- Security & API keys (23-27): 2FA enforcement, password policy, scoped enforcement, revocation, one-time display
- Integrations (28-30): OAuth connect, manual sync, disconnect token revoke
- Company profile & branding (31-33): logo, color change, per-user format override
- Audit & backups (34-36): manual rotation, backup trigger + restore test, retention edit
- Permissions & access (37-40): Settings hidden from non-Admin, PM granular grant, three-state sub-pages, per-user format override no Settings perm needed
- Performance & integrity (41-42)

---

═══════════════════════════════════════════════════════════════════
# 4. Module: Dashboard
═══════════════════════════════════════════════════════════════════

## 4.1 Purpose

Per-role landing page. Composes widgets reading from every other
module. Not a feature module — a **presentation layer** that surfaces
the highest-priority info for each role's daily workflow.

Operator's mental model: "When I log in, show me what I need to act
on today."

## 4.2 Sidebar surface

Top-level **📊 Dashboard** item per §0.7. Always visible to all
employees. Widgets within respect field-level visibility and
source-module permissions.

## 4.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/` | Redirect to user's chosen landing page (default: /dashboard) | none |
| `/dashboard` | Main dashboard with user's effective layout | `dashboard:view` |
| `/dashboard/configure` | Drag-drop layout configuration | `dashboard:configureMyLayout` |

## 4.4 Resources

### New owned tables (5)

- `dashboard_widget_definitions` — code-defined widget catalog (~20
  widgets at v1). Each: widget_key, name, description, default_size
  (rows × cols), default_period, source_module, required_permission,
  query_signature, supports_csv_export, refresh_strategy (cached_5min
  / on_focus / manual_only), is_critical.
- `dashboard_role_layouts` — per-role default layouts. Seeded for
  A/PM/SR/Tech/Acc/VO.
- `user_dashboard_layouts` — per-user customizations override role
  default. Each: user_id, widget_arrangements jsonb, landing_page.
- `widget_data_cache` — 5-min TTL cache keyed by widget_key +
  user_id + period.
- `widget_company_settings` — per-company enable/disable + critical-flag overrides per widget.

### Status lookup tables

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `widget_statuses` | Active, Disabled (company-wide), Hidden (per-user), Loading, Error | display flag, alert flag |
| `dashboard_layout_types` | Role Default, User Custom, Mobile Layout | precedence order |
| `widget_refresh_strategies` | Cached 5min, On Focus, Manual Only, Real-time | TTL value, focus listener |

## 4.5 Actions (~35 actions = 13 module-specific + ~20 per-widget gates)

### Module-specific actions (13)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `dashboard:view` | View own dashboard | All employees | — | — | Not yet |
| `dashboard:configureMyLayout` | Rearrange own widgets | All employees | — | `dashboard_layout_updated` | Not yet |
| `dashboard:resetToDefault` | Reset to role default | All employees | — | `dashboard_reset_to_default` | Not yet |
| `dashboard:hideWidget` | Hide widget from own layout | All employees | — | `widget_hidden` | Not yet |
| `dashboard:showWidget` | Add widget back to own layout | All employees | — | `widget_shown` | Not yet |
| `dashboard:setLandingPage` | Pick alternate landing | All employees | — | `landing_page_changed` | Not yet |
| `dashboard:editRoleDefaults` | Set default layout per role | A | — | `dashboard_role_default_updated` | Not yet |
| `dashboard:enableDisableWidget` | Company-wide enable/disable | A | — | `widget_company_setting_updated` | Not yet |
| `dashboard:viewKPIDetail` | Drill-through to source module | All employees | — | — | Not yet |
| `dashboard:exportWidgetData` | CSV export per widget | All employees (data-scoped) | — | `widget_exported` | Not yet |
| `dashboard:refreshWidget` | Manual refresh (bypass cache) | All employees | — | — | Not yet |
| `dashboard:viewRoleLayouts` | View configured role defaults | A | — | — | Not yet |
| `dashboard:cloneRoleLayout` | Clone role layout for new role | A | — | `dashboard_role_layout_cloned` | Not yet |

### Per-widget gates (~20)

Each seeded widget has a `dashboard:viewWidget:<widget_key>` permission. Granted by default if user has source-module list permission. Admin can revoke per-user via override.

Examples:
- `dashboard:viewWidget:revenue_this_period` — requires `financials:viewSummary`
- `dashboard:viewWidget:my_quote_pipeline` — requires `quotes:viewList`
- `dashboard:viewWidget:sla_breach_incidents` — requires `slas:viewList`
- `dashboard:viewWidget:cert_expirations` — requires `employee_certifications:viewList`
- `dashboard:viewWidget:ar_aging` — requires `invoices:viewList`
- `dashboard:viewWidget:todays_schedule` — requires `scheduling:viewList`

## 4.6 Views

### Dashboard page (`/dashboard`)

Responsive 12-column grid. Header: period selector (Today / This Week
/ This Month / This Quarter / YTD / Custom) cascading to all
period-bound widgets. Each widget header has title + period
selector inheritance indicator + drill-through link + refresh button
+ hide button + CSV-export button (where applicable). Footer:
last-refreshed timestamp + data-scope tag.

### Layout configuration page (`/dashboard/configure`)

Drag-drop to rearrange / resize / add / remove widgets. Side panel
shows "Available widgets" (not currently in layout). Reset button
restores role default. Save persists to `user_dashboard_layouts`.

### Widget library (~20 seeded widgets)

**Admin default layout (8 widgets):**
1. Revenue this period (gross + net + comparison vs prior period)
2. Outstanding AR (with aging buckets 0-30 / 31-60 / 61-90 / 90+)
3. Quotes pending approval (count + total $ value)
4. Top 10 clients by revenue (this period)
5. SLA breach incidents (last 30 days)
6. Pending access requests (count + oldest)
7. Recent audit highlights (top 10 events past 24h)
8. Cert/license expirations (30/60/90 day buckets)

**PM default layout (6 widgets):**
1. My projects (active / at risk / completed this period)
2. Pending approvals in my queue
3. Today's scheduled jobs (across my projects)
4. SLA escalations on my projects
5. My team's quote pipeline
6. Resource availability heatmap (this week)

**SR default layout (6 widgets):**
1. My quote pipeline (Kanban by status)
2. Quotes pending my action
3. My recent activity feed
4. My top clients (this period)
5. Lead source performance (my quotes)
6. This month's bookings (signed quotes)

**Tech default layout (5 widgets):**
1. Today's schedule
2. This week preview
3. My open jobs (with priority indicators)
4. Time entries pending log (this week)
5. My cert expirations (30/60/90 day buckets)

**Acc default layout (7 widgets):**
1. AR aging summary
2. Overdue invoices (sortable)
3. Cash collection trend (this period)
4. On Stop alerts
5. Holdback releases due
6. Tax remittance reminders
7. Recent payments received

**VO default layout (3 widgets):** Revenue summary (no margin),
Project status overview, This week's schedule.

### Mobile dashboard

Responsive single-column stack. Widgets ordered by
`priority_for_mobile` field on widget definition. Native app
Phase 2.

## 4.7 Field-level treatment

Widgets respect source-module field-level visibility. Example: SR
lacking `visibility.quotes.marginPercent` sees "My quote pipeline"
widget but margin column hidden within. Financial widgets respect
`visibility.financials.*` flags.

**Widget-level visibility:** if source-module list permission denied
OR widget disabled company-wide OR user has hidden it → widget
absent from layout entirely (not greyed/empty).

## 4.8 Custom-field surfaces

**Phase 2.** v1 ships seeded widgets only (code-defined). Phase 2
introduces "saved-report-as-widget" — operator builds a saved
report in Reports module, pins to dashboard.

## 4.9 Status surfaces

3 new lookup tables (see §4.4). Widget data itself queried live or
from `widget_data_cache`.

## 4.10 Cross-module relationships

**Reads from every module.** Each widget is a saved query against a
source. Critical reader of:
- Clients (top clients widget, on-stop alerts widget)
- Sites (SLA breach widget)
- Employees (cert expirations, access requests)
- Settings (widget definitions, role defaults, company widget settings)
- Quotes (pipeline widgets, bookings) [M5]
- Projects (my projects, today's jobs) [M6]
- Inventory (low stock Phase 2) [M7]
- Invoices (AR aging, overdue) [M9]
- Financials (revenue, cash collection) [M11]
- Scheduling (today's schedule, availability) [M12]

Events: `dashboard.widget_rendered` (analytics),
`dashboard.layout_updated`, `dashboard.role_default_updated`,
`dashboard.widget_disabled_company_wide`,
`dashboard.landing_page_changed`.

## 4.11 Competitive floor delta

- ServiceTitan: powerful dashboards but role-locked layouts; limited per-user customization
- simPRO: drag-drop but limited widget library
- Salesforce: extremely flexible (Lightning App Builder) but complex; usually requires partner setup
- FieldWire: simpler project-centric; not role-aware
- ServiceTrade: KPI dashboards with drill-through but role-fixed

**Nexvelon:** per-role defaults + per-user override + per-company
widget enable/disable + drill-through everywhere + permission-aware
data queries + responsive mobile + period selector at dashboard
level + custom landing page choice + CSV export per widget +
three-way widget visibility gate (source-permission AND
widget-enabled AND user-not-hidden).

## 4.12 Permissions design implications (items 28-30)

28. Widget visibility = source-module permission AND
    widget-enabled-company-wide AND user-not-hidden. Three-way gate.
29. Per-user dashboard layout = 10th dimension of permission control
    (UI presentation). Role default exists; user can override own
    but not others'. Admin edits role default but not specific users'
    overrides.
30. Widget data queries are permission-aware end-to-end. Drill-through
    works only if user has list permission on source. CSV export
    respects data scope.

## 4.13 Open questions — RESOLVED IN SESSION F

1. ✅ Widget refresh interval: 5-min cached default; critical widgets
   refresh on focus; manual refresh always available
2. ✅ Mobile: responsive single-column at v1; native app Phase 2
3. ✅ Operator-defined custom widgets: NO at v1; Phase 2 saved-
   report-as-widget pattern
4. ✅ Per-user landing page alternative: YES — any module list view
5. ✅ Widget CSV export: YES for all tabular widgets, data-scoped

Remaining: real-time push for critical widgets (Phase 2; poll-on-focus
at v1).

## 4.14 Acceptance criteria (~25 scenarios)

### Functional — Widget rendering (1-8)

1. Admin default layout renders 8 widgets
2. PM default 6 widgets
3. SR default 6 widgets
4. Tech default 5 widgets
5. Acc default 7 widgets
6. VO default 3 widgets
7. Widget data matches direct query
8. Period selector cascades to all period-bound widgets

### Functional — Per-user customization (9-13)

9. Hide widget removes from own layout only
10. Show hidden widget re-adds
11. Drag-rearrange persists across sessions
12. Resize widget persists
13. Reset to default deletes user override

### Functional — Landing page choice (14-15)

14. Set landing to /clients
15. Reset landing to /dashboard

### Functional — Permissions (16-21)

16. Widget hidden when source perm denied (financial widget absent for SR with no financials:view)
17. Widget hidden when company-disabled (Admin disable → disappears for all)
18. Drill-through respects source perm (SR's "My quote pipeline" drills to own records only)
19. CSV export data-scoped
20. Field-level visibility within widget (SR no marginPercent → margin column hidden in pipeline widget)
21. Per-user override on layout takes precedence over role default

### Functional — Admin operations (22-25)

22. Edit role default for SR; new SRs get widget on first login; existing SRs with custom layout unchanged
23. Disable widget company-wide → gone from all dashboards immediately
24. Clone role layout as starting point for new role
25. Manual widget refresh updates cache + timestamp

---

═══════════════════════════════════════════════════════════════════
# Modules 5-13: pending walk
═══════════════════════════════════════════════════════════════════

Walked in subsequent sessions. Same 14-subsection rubric.
Cross-cutting commitments from Modules 1+2+3+4 (ten dimensions,
behavior-bound lookups, guided creation, SLA precedence, T&C
composition, eight-layer print, request-admin-access, certification-
driven scheduling, People menu structure, Settings as config spine,
Dashboard as presentation layer, UI presentation as 10th permission
dimension) propagate forward.

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

*Populated after all 13 modules walked. Running count: ~495 actions
across 4 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4).*

## 100. Final sidebar tree

*Locked through Session D — see §0.7.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*30 items so far (items 1-14 from M1, 15-22 from M2, 23-27 from M3,
28-30 from M4). Populated fully after all 13 modules walked.*

## 103. Cumulative acceptance criteria

*~175 scenarios so far (54 M1 + 55 M2 + 42 M3 + ~25 M4).*

---

**End of v0.5.** Modules 1 + 2 + 3 + 4 complete and operator-validated.
Modules 5-13 pending. Dashboard as the per-role presentation layer
that composes widgets from every other module is locked in §4. UI
presentation as 10th permission dimension fully scoped (sidebar +
dashboard layout + landing page). Cross-cutting commitments from
Sessions C + D + E + F propagate forward into every subsequent module.

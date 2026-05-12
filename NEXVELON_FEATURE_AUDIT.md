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
> **Status:** v0.3 — Modules 1 (Clients + Sites + Contacts) and 2
> (Employees + Permissions) fully scoped through Sessions C + D.
> Modules 3-13 pending. Cross-cutting decisions from Sessions C + D
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

Through Sessions B + C + D:

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
6. **Ten dimensions of permission control** per §1.12 + §2.12 —
   role definition, per-user override, data scope, field-level
   visibility, action gates, approval workflows, system policy,
   UI presentation, audit visibility, lookup/template management.
7. **Contractual integrity exception to bidirectional override:**
   `clients:overrideSlaResponseTime` is Admin-only and cannot be
   granted via per-user override.
8. **Versioned T&C clauses.** Already-sent quotes retain their
   clause version.
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
3. Settings
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

### 0.7 Sidebar architecture — People parent menu *(NEW — Session D)*

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
⚙️ Settings
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
Official, Real Estate Agent, Other). Does not warrant a separate
table; the same contact entity covers both client-attached and
unaffiliated contacts.

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
| `misc_contact_categories` *(new)* | Inspector, Insurance Broker, Lawyer, Banker, ULC Certifier, City Official, Real Estate Agent, Other | label only |

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

### Owned tables — new for Module 2

**Identity & access:**
- `employees` — Nexvelon employee record (extends/replaces
  `profiles`)
- `roles` — role definitions (custom + 7 seeded)
- `permissions` — action catalog (populated by audit §99)
- `role_permissions` — role × permission junction
- `user_permission_overrides` — additive/subtractive grants
- `user_field_visibility_overrides` — field hide/show per employee
- `user_data_scopes` — scope rules per employee

**Workforce-specific (security integrator additions):**
- `employee_certifications` — M:N junction
- `certification_types` — lookup (25+ seeded)
- `employee_certification_records` — per-employee per-cert with
  cert#, issued/expiry dates, document URL, status, critical flag
- `employee_territories` — M:N to `territories`; type field
  (Primary/Secondary/Relocation per Salesforce pattern)
- `territories` — geographic zones (postal prefix / region / city
  / map polygon)
- `employee_availability` — weekly recurring hours
- `employee_absences` — vacation / sick / training / personal
  blocks with start/end + approval state
- `employee_equipment_assignments` — vehicle / tools / devices
- `equipment` — master inventory of company-owned equipment

**Approval & policy:**
- `approval_workflows` — per-action workflow definitions
- `approval_workflow_steps` — ordered steps with approver +
  value-threshold + time bound
- `user_approval_delegations` — temporary delegation grants
- `security_policies` — per role: 2FA req, session timeout, IP
  allowlist, device limit, force_reauth_actions[]
- `access_requests` — request-admin-access workflow queue (per
  FieldWire pattern)

**Session & audit:**
- `user_sessions` — active sessions with device fingerprint, IP,
  last_active
- `permission_grant_audit` — every grant/revoke event captured

### Employee schema

**Identity:** `entity_type` (Internal Employee / Contractor-with-login),
`legal_first_name`, `legal_last_name`, `preferred_name`,
`employee_code` (auto-generated; UI label "Employee ID"),
`avatar_url`, `email`, `personal_phone`, `office_phone`.

**Address:** standard fields + `time_zone` + `preferred_language`.

**Emergency contact:** `emergency_contact_name`,
`emergency_contact_phone`, `emergency_contact_relationship`.

**Employment:** `hire_date`, `termination_date`, `employee_type_id`,
`employee_status_id`, `manager_user_id` (reports-to), `department`,
`cost_center_id`.

**Authentication:** `auth_user_id` (FK to Supabase Auth), `email_verified_at`,
`last_login_at`, `last_login_ip`, `failed_login_count`,
`account_locked_at`, `password_reset_required`, `mfa_enrolled`,
`mfa_method` (TOTP/SMS/Email/HardwareKey).

**Permissions:** `role_id` (FK), `effective_permissions_cache`
(jsonb, computed on grant/revoke events).

**Payroll/rates** (highly gated):
- `hourly_cost_rate` — internal cost for margin (A, Acc only)
- `hourly_bill_rate` — external billing rate (A, Acc, PM-with-perm)
- `salary_amount`, `salary_frequency` (annual/monthly/biweekly)
- `commission_pct`, `commission_basis`
- `payroll_provider_id` (for export integration Phase 2)

**Banking (encrypted at rest):**
- `bank_account_name`, `routing_number`, `bank_account_number`
- `sin_number` (for T4 reporting; null for non-Canadian)

**Identification/regulatory:**
- `government_id_number` (driver's licence or equivalent)
- `government_id_document_url`
- `wsib_number` (Workplace Safety Insurance — Ontario specific;
  similar in other provinces with different field name)
- `personal_insurance_certificate_url`

**Scheduling-relevant:**
- `default_territory_id`
- `truck_id` (FK to equipment)
- `working_hours_pattern` (jsonb — weekly schedule)
- `available_for_emergency_call` (boolean)
- `service_radius_km` (optional override)

**Internal:**
- `internal_notes` (HR-gated)
- `custom_fields` (jsonb or join to definitions/values per §6
  decision)

**Standard:** `created_at`, `created_by`, `updated_at`, `updated_by`,
`deleted_at`.

### Status lookup tables (with behavior bindings)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `employee_statuses` | Active, Pending Invite, Suspended, On Leave, Terminated, Archived | scheduling eligibility, login allowed, billing implications |
| `employee_types` | Office Staff, Field Technician, Hybrid (Office+Field), Apprentice, Contractor-with-login | default permission set, default scheduling visibility |
| `certification_types` | 25+ seeded — Kantech KT-300, KT-400; Genetec Synergis, Mission Control; Software House C-CURE 9000; DSC PowerSeries, MaxSys; Honeywell ProWatch, Galaxy; Bosch B-series, G-series; Avigilon Control Center, ACM; Lenel OnGuard; Paxton Net2; ESA (Ontario electrical); ULC fire alarm installer/verifier; CFAA fire alarm tech; CSA fire alarm; CCTV technician; Forklift; Working at Heights; Confined Space; OSHA-30; WHMIS 2015; First Aid + CPR; ASP/CSP; LEED AP | critical flag (blocks scheduling when expired), expiry tracking, renewal cadence, regulatory authority |
| `territory_types` | By City, By Region, By Postal Prefix, By Map Polygon, By Province | scope calculation method |
| `absence_types` | Vacation, Sick, Personal, Training, Bereavement, Parental, Jury Duty, WSIB Claim, Unpaid Leave | paid flag, requires_approval flag, deducts_from_balance flag, max_consecutive_days |
| `mfa_methods` | TOTP, SMS, Email, Hardware Key (YubiKey/Titan) | strength rating, audit flag |
| `session_duration_options` | 8h, 24h, 7d, 30d, Custom | security strength rating |
| `data_scope_types` | All / Own / Assigned / User Mirror / Attribute Filter / Specific Records | computation pattern |
| `approval_workflow_step_types` | Single approver, Parallel (any-of), Sequential, Value-threshold, Conditional | execution semantics |
| `equipment_types` | Service Truck, Cargo Van, Test Kit, Laptop, Mobile Device, Programmer Cable, Other | tracking template |
| `access_request_statuses` | Pending, Approved, Denied, Auto-Expired | TTL, notification rules |

## 2.5 Actions

**~75 actions across the module.** Organized by category:

### Employee management (15 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employees:viewList` | See employee directory | A, PM | — | — | Not yet |
| `employees:viewDetail` | Open employee profile | A, PM | — | — | Not yet |
| `employees:viewMy` | View self profile | All employees | — | — | Not yet |
| `employees:invite` | Send invitation email | A | — | `employee_invited` | Not yet |
| `employees:resendInvite` | Re-send pending invite | A | — | `employee_invite_resent` | Not yet |
| `employees:cancelInvite` | Cancel pending invite | A | — | `employee_invite_cancelled` | Not yet |
| `employees:editProfile` | Edit basic profile (others) | A | — | `employee_updated` | Not yet |
| `employees:editMyProfile` | Edit self profile | All employees | — | `employee_self_updated` | Not yet |
| `employees:editEmail` | Change email (triggers re-verification) | A | Y | `employee_email_changed` | Not yet |
| `employees:adminResetPassword` | Force password reset | A | — | `employee_password_force_reset` | Not yet |
| `employees:suspend` | Block login without deletion | A | — | `employee_suspended` | Not yet |
| `employees:unsuspend` | Restore login | A | — | `employee_unsuspended` | Not yet |
| `employees:putOnLeave` | Move to On Leave status | A | — | `employee_on_leave` | Not yet |
| `employees:returnFromLeave` | Return to Active | A | — | `employee_returned_from_leave` | Not yet |
| `employees:terminate` | Process termination (workflow) | A | — | `employee_terminated` | Not yet |
| `employees:archive` | Soft-delete | A | — | `employee_archived` | Not yet |
| `employees:hardDelete` | Permanent delete (Admin only, heavily audited) | A | — | `employee_hard_deleted` | Not yet |
| `employees:exportCsv` | Export employee list | A | — | `employees_exported` | Not yet |
| `employees:importCsv` | Bulk import from CSV | A | — | `employees_imported` | Not yet |

### Role management (10 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `roles:viewList` | See role catalog | A, PM | — | — | Not yet |
| `roles:viewDetail` | Open role permission matrix | A | — | — | Not yet |
| `roles:create` | Create custom role (guided wizard) | A | — | `role_created` | Not yet |
| `roles:editBasic` | Edit role name, description, color | A | — | `role_updated` | Not yet |
| `roles:editPermissions` | Add/remove permissions from role | A | — | `role_permissions_updated` | Not yet |
| `roles:editHierarchy` | Set role inheritance (Phase 2) | A | — | `role_hierarchy_updated` | Not yet |
| `roles:clone` | Clone existing role as template | A | — | `role_cloned` | Not yet |
| `roles:archive` | Archive role (warns affected users) | A | — | `role_archived` | Not yet |
| `roles:unarchive` | Restore archived role | A | — | `role_unarchived` | Not yet |
| `roles:applyToUser` | Assign role to employee | A | — | `employee_role_assigned` | Not yet |

### Per-employee permission overrides (8 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_permissions:viewEffective` | Show computed effective permissions | A | — | — | Not yet |
| `employee_permissions:grantAdditive` | Give employee a permission their role doesn't have | A | — | `permission_grant_additive` | Not yet |
| `employee_permissions:grantSubtractive` | Remove a permission their role does have | A | — | `permission_grant_subtractive` | Not yet |
| `employee_permissions:setTimeBounded` | Add expires_at to a grant | A | — | `permission_grant_time_bounded` | Not yet |
| `employee_permissions:revokeOverride` | Remove an override | A | — | `permission_override_revoked` | Not yet |
| `employee_permissions:bulkApplyTemplate` | Apply override template to multiple users | A | — | `permission_template_applied` | Not yet |
| `employee_permissions:viewGrantHistory` | See all past overrides | A | — | — | Not yet |
| `employee_permissions:resetToRoleDefault` | Wipe all overrides for an employee | A | — | `permissions_reset_to_role` | Not yet |

### Data scope (8 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_data_scope:view` | See an employee's scope rules | A | — | — | Not yet |
| `employee_data_scope:setAll` | Grant full visibility | A | — | `data_scope_all` | Not yet |
| `employee_data_scope:setOwn` | Restrict to own records | A | — | `data_scope_own` | Not yet |
| `employee_data_scope:setAssigned` | Restrict to assigned records | A | — | `data_scope_assigned` | Not yet |
| `employee_data_scope:setMirror` | Mirror another user's scope | A | — | `data_scope_mirror` | Not yet |
| `employee_data_scope:setAttribute` | Scope by attribute (territory, client, etc.) | A | — | `data_scope_attribute` | Not yet |
| `employee_data_scope:setRecordGrant` | Grant access to specific record | A | — | `data_scope_record` | Not yet |
| `employee_data_scope:revokeAll` | Wipe all scope grants | A | — | `data_scope_revoked` | Not yet |

### Field visibility (6 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_field_visibility:view` | See per-user field overrides | A | — | — | Not yet |
| `employee_field_visibility:hideField` | Hide field from employee | A | — | `field_hidden` | Not yet |
| `employee_field_visibility:showField` | Override to show field | A | — | `field_shown` | Not yet |
| `employee_field_visibility:resetToRoleDefault` | Reset visibility to role default | A | — | `field_visibility_reset` | Not yet |
| `employee_field_visibility:applyTemplate` | Apply visibility template | A | — | `field_visibility_template_applied` | Not yet |

### Certifications (10 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_certifications:view` | See an employee's certs | A, PM, self | — | — | Not yet |
| `employee_certifications:viewList` | See cert inventory across all employees | A, PM | — | — | Not yet |
| `employee_certifications:add` | Add cert to employee | A, PM | — | `certification_added` | Not yet |
| `employee_certifications:edit` | Edit cert details | A, PM | — | `certification_updated` | Not yet |
| `employee_certifications:uploadDoc` | Attach certificate PDF | A, PM, self | — | `certification_doc_uploaded` | Not yet |
| `employee_certifications:markRenewed` | Update expiry on renewal | A, PM | — | `certification_renewed` | Not yet |
| `employee_certifications:archive` | Soft-delete cert | A | — | `certification_archived` | Not yet |
| `employee_certifications:setCriticalFlag` | Toggle blocks-scheduling-on-expiry | A | — | `certification_critical_toggled` | Not yet |
| `employee_certifications:viewExpiryReport` | Licence Matrix expiry view | A, PM | — | — | Not yet |
| `employee_certifications:sendRenewalReminder` | Manual reminder push | A, PM | — | `certification_reminder_sent` | Not yet |
| `employee_certifications:bulkImport` | Import certs from CSV | A | — | `certifications_imported` | Not yet |

### Territories (5 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_territories:view` | See territory assignments | A, PM, self | — | — | Not yet |
| `employee_territories:assign` | Add territory | A, PM | — | `territory_assigned` | Not yet |
| `employee_territories:removeAssignment` | Remove territory | A, PM | — | `territory_removed` | Not yet |
| `employee_territories:setPrimary` | Set primary territory | A, PM | — | `territory_primary_set` | Not yet |
| `employee_territories:setRelocationDates` | Set temporary relocation window | A, PM | — | `territory_relocation_set` | Not yet |

### Availability & absences (7 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_availability:view` | See availability calendar | A, PM, self | — | — | Not yet |
| `employee_availability:edit` | Edit weekly hours pattern | A, PM | — | `availability_updated` | Not yet |
| `employee_absences:request` | Request absence (self) | All employees | — | `absence_requested` | Not yet |
| `employee_absences:approve` | Approve absence request | A, PM | — | `absence_approved` | Not yet |
| `employee_absences:deny` | Deny absence request | A, PM | — | `absence_denied` | Not yet |
| `employee_absences:cancel` | Cancel approved absence | A, PM, self | — | `absence_cancelled` | Not yet |
| `employee_absences:viewCalendar` | See absence calendar | A, PM | — | — | Not yet |

### Equipment assignments (5 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_equipment:view` | See assigned equipment | A, PM, self | — | — | Not yet |
| `employee_equipment:assignVehicle` | Assign truck/van | A, PM | — | `equipment_vehicle_assigned` | Not yet |
| `employee_equipment:assignTool` | Assign test kit / device | A, PM | — | `equipment_tool_assigned` | Not yet |
| `employee_equipment:unassign` | Remove assignment | A, PM | — | `equipment_unassigned` | Not yet |
| `employee_equipment:viewAssetHistory` | See historical assignments | A, PM | — | — | Not yet |

### Payroll/rates (5 actions, heavily gated)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employee_payroll:viewRates` | See cost + bill rates | A, Acc | Y | — | Not yet |
| `employee_payroll:editRates` | Edit rates | A, Acc | Y | `employee_rates_updated` | Not yet |
| `employee_payroll:viewBankingDetails` | See banking info (masked) | A, Acc | Y | `employee_banking_viewed` | Not yet |
| `employee_payroll:editBankingDetails` | Edit banking info | A, Acc | Y | `employee_banking_updated` | Not yet |
| `employee_payroll:viewPayHistory` | See historical payroll runs | A, Acc | Y | — | Not yet |

### Approval workflows (7 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `approval_workflows:viewList` | See all workflows | A | — | — | Not yet |
| `approval_workflows:create` | Define new workflow | A | — | `approval_workflow_created` | Not yet |
| `approval_workflows:edit` | Edit existing workflow | A | — | `approval_workflow_updated` | Not yet |
| `approval_workflows:addStep` | Add step to workflow | A | — | `approval_workflow_step_added` | Not yet |
| `approval_workflows:setDelegation` | Configure temporary delegations | A | — | `approval_delegation_set` | Not yet |
| `approval_workflows:viewMyDelegations` | See delegations active for self | All employees | — | — | Not yet |
| `approval_workflows:claimDelegation` | Accept/decline delegation | All employees | — | `approval_delegation_claimed` | Not yet |

### Security policy (7 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `security_policy:view` | See policy config | A | — | — | Not yet |
| `security_policy:setRoleSession` | Set session timeout per role | A | — | `security_session_set` | Not yet |
| `security_policy:setRole2FA` | 2FA requirement per role | A | — | `security_2fa_set` | Not yet |
| `security_policy:setIpAllowlist` | IP allowlist (per role or user) | A | — | `security_ip_allowlist_set` | Not yet |
| `security_policy:setDeviceLimit` | Max concurrent sessions per user | A | — | `security_device_limit_set` | Not yet |
| `security_policy:setForceReauth` | Force re-auth for specific actions | A | — | `security_force_reauth_set` | Not yet |
| `security_policy:viewLoginAttempts` | Failed login audit | A | — | — | Not yet |

### Audit (6 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `audit:viewSystemWide` | System-wide audit log | A | — | — | Not yet |
| `audit:viewModule` | Per-module audit | A, PM | — | — | Not yet |
| `audit:viewMyActivity` | Own activity (self) | All employees | — | — | Not yet |
| `audit:viewOtherUserActivity` | Another employee's activity | A | — | — | Not yet |
| `audit:exportCsv` | Export audit log | A | — | `audit_exported` | Not yet |
| `audit:createNotificationRule` | Set audit-driven alerts | A | — | `audit_notification_rule_created` | Not yet |

### Sessions (3 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `sessions:viewMy` | See own active sessions | All employees | — | — | Not yet |
| `sessions:viewEmployeeSessions` | See another employee's sessions | A | — | — | Not yet |
| `sessions:forceSignOut` | Force-logout a session | A, self (own only) | — | `session_force_signed_out` | Not yet |

### Access requests (4 actions — per FieldWire pattern)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `access_requests:request` | Request access to an action | All employees | — | `access_request_submitted` | Not yet |
| `access_requests:viewQueue` | See pending requests | A | — | — | Not yet |
| `access_requests:approve` | Approve request | A | — | `access_request_approved` | Not yet |
| `access_requests:deny` | Deny request | A | — | `access_request_denied` | Not yet |

### Bulk operations (4 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `employees:bulkAssignRole` | Assign role to N employees | A | — | `employees_bulk_role_assigned` | Not yet |
| `employees:bulkSuspend` | Suspend N employees | A | — | `employees_bulk_suspended` | Not yet |
| `employees:bulkExport` | Export selected employees | A | — | `employees_bulk_exported` | Not yet |
| `employees:bulkImport` | Import N employees from CSV | A | — | `employees_bulk_imported` | Not yet |

**Module 2 total: ~80 actions.** Almost all Admin-only by default
(this is the meta-module). Self-service exceptions: `*:viewMy`,
`employee_absences:request`, `audit:viewMyActivity`,
`sessions:viewMy`, `access_requests:request`,
`employees:editMyProfile`.

## 2.6 Views

### Permissions editor — six tabs at `/employees/[id]/permissions`

1. **Role & Overrides** — current role + table of bidirectional
   overrides (permission, direction, expires_at, reason,
   granted_by). Search box, group-by-module filter, "compare to
   role default" toggle. Add Override button opens a drawer.
2. **Data & Field Access** — data scope rules + field visibility
   overrides per resource. Visualization of "what records this
   employee can see" with sample preview.
3. **Workflows & Delegations** — approval authority + temporary
   delegations they hold.
4. **Security & Sessions** — 2FA enrollment status, current
   sessions list with sign-out buttons, security policy applied,
   force-reauth event log, recent login attempts.
5. **UI & Audit** — landing page selection, dashboard widget
   selection, audit visibility scope, sidebar visibility per
   module.
6. **API & SSO** — personal API tokens (rare — Phase 2 default
   off), SSO link (Phase 2).

Each tab shows **role default alongside effective value**. "Reset
to role default" button per section. Audit row on every change.

### Other key views

- **Employee list** with filter chips (role, status, last active,
  has-overrides, locked, certifications-expiring, territory,
  employee-type, manager). Bulk action toolbar appears on
  selection.
- **Color-coded technician profiles** (per ServiceTrade) — name
  + role badge + active-cert badges in lists.
- **Map view** at `/employees/map` (per simPRO) — see field staff
  geographically; useful for dispatcher mental model. Pin per
  employee colored by status.
- **Licence Matrix Report** at `/employees/licence-matrix` (per
  simPRO) — table view of all employees × all certification types,
  color-coded (Active green / Expiring 30d yellow / Expiring 60d
  amber / Expired red / Missing gray). Drilldown to cert detail.
- **Role catalog page** with create-role wizard (guided creation
  per §0.4 #5; inherit from closest existing role; behavior
  binding step where operator picks default permissions in groups
  rather than one-by-one).
- **Approval workflow builder UI** — drag-drop step builder with
  branching for value-threshold + conditional rules. Visual flow
  preview.
- **Security policy editor** per role with audit on every change.
- **System-wide audit log** with filters: user, date range,
  entity type, action type, IP.
- **Employee availability calendar** — month/week/day views.
- **Bulk operations modals** for role assignment, suspend,
  export, import.

### Invite flow

1. Admin clicks "+ Invite Employee" from `/employees` list.
2. Drawer opens — fields: email (required), first name, last name,
   choose role (dropdown of available roles), choose employee
   type (Office Staff / Field Tech / Hybrid / Apprentice /
   Contractor-with-login), optional welcome message.
3. System sends invitation email with unique signup link (24-hour
   expiry, refresh-able).
4. Invitee clicks link → password setup + 2FA enrollment (if
   required by role policy) → fills remaining profile (phone,
   address, emergency contact) → submits.
5. Account becomes Active; first login welcomed with
   role-appropriate landing page.

### Request-admin-access workflow (per FieldWire pattern)

When a non-Admin tries an action they don't have permission for,
instead of just "Access denied", they see a "Request access" button
that opens a modal:
- Pre-filled context (action attempted, on which record)
- Required reasoning field
- Optional urgency selector (Routine / Urgent / Critical)
- Submit creates `access_requests` row + emails all Admins

Admins see queue at `/employees/access-requests`. Each row shows
employee + action + record + reason + age. One-click Approve/Deny
buttons; approve creates the appropriate per-user override
automatically with optional `expires_at`.

## 2.7 Field-level treatment

14 visibility flags for employee records:

- `visibility.employees.email` — non-admins see partial
- `visibility.employees.personalPhone` — Admin + self only
- `visibility.employees.address` — Admin only
- `visibility.employees.emergencyContact` — Admin only
- `visibility.employees.lastIp` — Admin only
- `visibility.employees.lastDeviceFingerprint` — Admin only
- `visibility.employees.failedLoginCount` — Admin/Acc
- `visibility.employees.passwordResetHistory` — Admin only
- `visibility.employees.hourlyBillRate` — A, Acc, PM-with-perm
- `visibility.employees.hourlyCostRate` — A, Acc only (most sensitive)
- `visibility.employees.payHistory` — A, Acc
- `visibility.employees.bankingDetails` — A, Acc only; account#
  always masked
- `visibility.employees.sinNumber` — A, Acc only
- `visibility.employees.dob` — A, HR-role only

## 2.8 Custom-field surfaces

Custom fields on Employees appear in:
- Create/invite drawer
- Profile detail page (KPI badges if `show_in_header`)
- List view (optional columns if `show_in_list`)
- Filters
- HR/payroll exports
- Reports
- Per-employee CSV exports

Definitions managed in Settings → Custom Fields → Employees.

## 2.9 Status surfaces

11 lookup tables (see §2.4). Each with behavior bindings per §6.
Each "+ Add" uses guided-creation wizard per §0.4 #5.

**Operationally critical:**
- `certification_types` — drives scheduling auto-match. Site
  requires Kantech-cert tech → only employees with active Kantech
  cert appear as candidates. Operator can add new cert type with
  one form (e.g., "Genetec Mission Control 6.0 specialist").
- `absence_types` — carries `paid`, `requires_approval`,
  `deducts_from_balance`, `max_consecutive_days` flags. Different
  from "label only" lookup.

## 2.10 Cross-module relationships

**Read by every other module.** Every page render, every server
action, every data query goes through permissions.

**Specifically:**
- **Clients** — `account_manager_user_id` FK; data scope filters
- **Quotes** — `assigned_to_user_id`; approval workflow + delegation
- **Projects** — `pm_user_id`, `tech_assignments[]`; cert matching
- **Scheduling** — major reader — territory, cert, availability,
  absence, capacity
- **Financials** — payroll integration (Phase 2); rates for labor
  cost; commission tracking
- **Inventory** — equipment assignments link employees to trucks
- **Vendors/Contractors** — AM assignment

**Events emitted:**
- `employee.*` — 15+ events (invited, joined, profile_updated,
  role_changed, suspended, on_leave, terminated, etc.)
- `permission_override.*` — granted, revoked, expired,
  auto_expired
- `certification.*` — added, renewed, expired, expiring_soon
  (30/60/90 day alerts)
- `absence.*` — requested, approved, denied, started, ended,
  cancelled
- `session.*` — created, signed_out, expired, force_signed_out
- `security_policy.*` — changed (per role)
- `access_request.*` — submitted, approved, denied,
  auto_expired

## 2.11 Competitive floor delta

Module 2 beats every named competitor materially:

- **Ten-dimensional permission control** — Salesforce has profiles
  + permission sets (single-direction override); ServiceTitan flat
  role-based; simPRO Security Groups with limited dimensions;
  FieldWire two-tier but project+account only. Nexvelon's ten
  dimensions with bidirectional overrides + time-bounded grants +
  audit-on-every-change is category-leading.
- **Contractual integrity exception** — none have a "this action
  cannot be delegated even by Admin" enforcement.
- **Certification tracking with scheduling auto-match + critical
  flag + 30/60/90 day renewal alerts** — simPRO has parts;
  ServiceTrade has parts; Salesforce has skills+levels. Nexvelon
  combines all and adds operator-editable cert types with
  guided-creation wizard.
- **Request-admin-access workflow** for any gated action — FieldWire
  has this for projects only; we extend to every action.
- **Color-coded employee profiles + map view + Licence Matrix
  Report** — ServiceTrade has color; simPRO has map + matrix.
  Nexvelon combines all three; map applies to all employees not
  just techs.
- **Resource Absences with approval workflow + scheduling impact
  + balance tracking per absence type** — Salesforce has absences;
  Nexvelon adds approval flow + balance per type + auto-block on
  scheduling assignments during absence windows.
- **Eight-layer print protection on employee payroll/HR docs** —
  beyond any competitor.
- **Field-level encryption-at-rest** on banking + SIN + access
  codes — unique.

## 2.12 Permissions design implications

Adding to Module 1's 14 items (§1.12):

15. **Effective-permissions computation must be fast** — sub-10ms
    per check. Cache pattern: compute on permission change →
    store in `effective_permissions_cache` per user (jsonb) →
    invalidate on relevant events.
16. **Permission catalog is code-defined**, not operator-defined.
    Operators configure WHO gets WHAT; they don't add new
    permission types. Catalog exposed read-only.
17. **Role hierarchy is Phase 2.** v1 flat roles; hierarchy adds
    UI complexity and complicates effective-perm computation.
18. **SSO/SAML is Phase 2.** v1 ships email+password+2FA; add SSO
    when first enterprise customer demands.
19. **Personal API tokens are Phase 2.** No current use case;
    integrations via Admin-issued keys.
20. **Certifications drive scheduling.** `cert_match` work rule
    reads `employee_certification_records` +
    `certification_types.critical` to block/allow assignments.
    Ships seeded in v1.
21. **Absences drive scheduling.** Approved absences block
    assignments. Pending absences show as tentative blocks
    visually distinct.
22. **Two-tier permission model (account + project)** Phase 2.
    Per FieldWire pattern. v1 system-wide roles only.

## 2.13 Open questions

1. **Multi-company / departments concept** (per simPRO) — single-
   tenant today, multi-company maybe later. *(Recommendation:
   single-company at v1; schema includes `company_id` placeholder
   column for future migration.)*
2. **Crew assignments** (per Salesforce) — team of techs on one
   job? *(Recommendation: Phase 2 with Scheduling; v1 lists
   multiple individuals per job.)*
3. **Service Resource vs Employee** distinction (per Salesforce) —
   should subcontractors be in Employees or separate?
   *(Recommendation: Contractors module owns subs; Employees
   module owns internal. Both assignable via uniform interface.)*
4. **Employee Portal pattern** (per simPRO) — stripped-down "no
   license" portal for techs needing only schedule + time logging?
   *(Recommendation: full app for everyone at v1; licensing-driven
   portal optimization Phase 2.)*

## 2.14 Acceptance criteria

55 test scenarios for Module 2 build phase QA bar:

### Functional — Employee CRUD (1-8)
1. **Invite employee end-to-end.** Admin sends invite; recipient
   gets email; clicks link; sets password + 2FA; completes profile;
   account Active; first login lands on role-appropriate page.
2. **Invite expiry.** Unused invite expires at 24h. Admin can
   refresh expiry.
3. **Cancel pending invite.** Admin cancels; recipient's link no
   longer works; audit row written.
4. **Edit profile (self).** Employee edits own phone + emergency
   contact. Cannot edit own role, rates, or banking.
5. **Edit profile (admin).** Admin edits another employee's name,
   email (triggers re-verify), role.
6. **Suspend employee.** Admin suspends; login blocked
   immediately; existing sessions force-signed-out; audit row.
7. **Terminate employee.** Admin runs termination workflow;
   status changes; all active assignments offboarded; audit row;
   data retained for compliance.
8. **Hard delete (Admin only).** Triple-confirmation modal;
   audit row preserved; FK references nulled; employee disappears.

### Functional — Certifications (9-14)
9. **Add certification.** Admin adds Kantech cert to John (Tech)
   with issue/expiry dates + uploaded PDF. Appears in his profile.
10. **Critical flag blocks scheduling.** John's Kantech cert
    expires. Scheduler tries to assign him to Kantech site → blocked
    with "Required cert expired" message.
11. **30/60/90 day renewal alerts.** Cert expires in 90 days →
    employee + AM notified; 60 days → escalated to Admin; 30 days
    → daily reminder until renewed or marked critical.
12. **Licence Matrix Report.** Loads all employees × all cert types
    with color-coded status. Filter by expiring-in-X-days. Export
    to CSV.
13. **Mark renewed.** Admin clicks Mark Renewed; new expiry date
    captured; old cert record archived with history preserved.
14. **Bulk import certs.** CSV upload with employee email + cert
    type + issue + expiry; system validates + creates records;
    errors reported per row.

### Functional — Territories & availability (15-18)
15. **Multi-territory assignment.** John has Primary = GTA, Secondary
    = Hamilton, Relocation = Ottawa (with end date). Scheduler shows
    him in GTA queue prominently; Hamilton secondary; Ottawa only
    until relocation end.
16. **Availability pattern.** John works Mon-Fri 8-4. Scheduling
    blocks assignments outside this window unless `available_for_emergency_call`
    is true.
17. **Absence request.** John requests vacation 2026-08-01 to 08-05.
    PM gets notification; approves. Scheduling blocks assignments
    in that window. John's absence balance decremented.
18. **Pending absence visual.** Pending request shows as tentative
    block in calendar with distinct hatched pattern.

### Functional — Permissions (the 10 dimensions) (19-37)
19. **Role default.** Fresh SR: views Clients, creates quotes, edits
    drafts. Cannot view financials, set On Stop, override SLA.
20. **Custom role creation.** Admin clicks New Role wizard; inherits
    from SalesRep; renames "Senior SR"; adds `quotes:viewMargin`,
    `quotes:approve` (under $25k); saves; appears in dropdown.
21. **Additive override.** Admin grants John (SR) `clients:viewCreditInfo`;
    John sees credit info; other SRs don't.
22. **Subtractive override.** Admin removes `clients:editBasic` from
    Jane (SR); Jane views but can't edit; other SRs can.
23. **Time-bounded grant.** John granted bank visibility until
    2026-06-30. On 2026-07-01, system auto-revokes; audit row;
    notification to John + grantor.
24. **Data scope: own records.** Sarah (SR) sees only her own clients.
    Admin grants her one specific client of John's → appears in her
    list with "shared" tag. Others invisible.
25. **Data scope: user mirror.** Sarah mirrors John → sees all of
    John's records.
26. **Data scope: attribute filter.** Sarah scoped to "Manufacturing
    tier" clients only → sees only those.
27. **Data scope: territory.** John (Tech) scoped to GTA only →
    schedule shows only GTA jobs.
28. **Field visibility: hide.** PM sees inventory cost. SR doesn't.
    PM denied `visibility.cost` via override → PM loses cost column.
29. **Approval workflow.** SR submits quote $30k for approval. PM
    queued (because under $50k); approves; audit captures both
    submit + approve events.
30. **Approval delegation.** Admin out for week; delegates
    `quotes:approve` to PM Sarah until [date]; Sarah's queue
    receives the SR's submission; approval audit shows delegation
    chain.
31. **2FA enforcement.** Admin sets Acc role 2FA required. Existing
    Accs forced enrollment on next login.
32. **Session timeout.** SR role = 8h. SR logs in, idles 8h+1min →
    redirect to login. PM role = 7d.
33. **IP allowlist.** SR account allowlisted to office IPs. SR tries
    login from home → blocked with helpful error message.
34. **Force re-auth on print.** Quote PDF download re-prompts
    password even when logged in.
35. **Hidden vs disabled sidebar.** SR no `financials:view`: item
    completely absent. SR has view but no `financials:viewPL`:
    item present; P&L tab hidden inside.
36. **Audit visibility scope.** Admin reads system-wide. PM reads
    Clients + Projects audit only. SR cannot read at all.
37. **Lookup management — new role.** Admin creates new role
    "Junior PM" via wizard inheriting from PM. Behavior bindings
    pre-filled from PM. Operator adjusts down. Save → appears in
    role dropdowns immediately. Audit row written.

### Functional — Request-admin-access (38-39)
38. **Request access workflow.** SR tries to set On Stop on a
    client (no perm). Modal prompts: "Request access?" SR fills
    reason "Customer hasn't paid in 90 days, need to hold." Submit
    → Admin gets email + system inbox row. Admin clicks Approve →
    grant created with `expires_at = +30 days`; SR re-tries action,
    succeeds.
39. **Auto-expire access request.** Admin doesn't action within 72h;
    request auto-expires; SR notified.

### Functional — Logging visibility (40-43)
40. **Per-employee activity tab.** Admin opens John's profile →
    Activity tab → reverse-chronological feed of everything John
    has done; expand each to before/after snapshot.
41. **System-wide audit feed.** Admin loads `/employees/audit-log`;
    filters by user=John AND date_range=last week; sees all his
    actions; exports to CSV.
42. **Audit-driven notification rule.** Admin creates rule:
    "Alert me when any employee is terminated." John gets terminated
    → Admin receives email + Slack within 30s.
43. **Audit immutability.** DB admin attempts UPDATE on `auth_audit_log`
    row → RLS rejects.

### Functional — Sessions (44-46)
44. **View own sessions.** Tech views `/employees/[self]/sessions`
    → sees current desktop + mobile sessions with last_active.
45. **Force sign-out self.** Tech signs out remote browser session
    from his mobile. Browser tab loses access within 5s.
46. **Force sign-out other.** Admin force-signs-out compromised
    employee account. All sessions invalidated within 5s. Employee
    receives email notification.

### Functional — Eight-layer print protection (47-49)
47. **Payroll report PDF gated.** Acc downloads payroll PDF;
    server-generated; audit row written. SR cannot access endpoint
    (403).
48. **HR doc watermark.** Draft employment contract has diagonal
    watermark with operator name + timestamp on every print.
49. **Banking print blocked.** Banking details PDF generation
    blocked for any non-A/Acc user even if URL guessed.

### Performance (50-52)
50. **Permission check latency.** Sub-10ms per gate check at p95
    (cached path); sub-100ms at p99 (cache miss + recompute).
51. **Employee list with 500 employees.** Loads <2s with all
    filters applied.
52. **Licence Matrix Report.** 500 employees × 20 cert types =
    10k cells. Loads <3s.

### Security (53-55)
53. **Privilege escalation via override API.** SR crafts API call
    granting himself `clients:hardDelete` → blocked at perms check
    (Admin-only action).
54. **Banking data leakage.** Network tab during SR session never
    shows full bank_account_number — backend masks before sending.
55. **SLA override impersonation (cross-Module 1 reference).** SR
    crafts API call → blocked even if granted via override
    (contractual integrity exception).

---

═══════════════════════════════════════════════════════════════════
# Modules 3-13: pending walk
═══════════════════════════════════════════════════════════════════

Walked in subsequent sessions. Same 14-subsection rubric. Each
will be substantial but cross-cutting commitments from Modules
1 + 2 (ten dimensions, behavior-bound lookups, guided creation,
SLA precedence, T&C composition, eight-layer print, request-admin-
access, certification-driven scheduling, People menu structure)
propagate forward.

- §3 — Settings
- §4 — Dashboard
- §5 — Quotes
- §6 — Projects
- §7 — Inventory
- §8 — Vendors
- §9 — Invoices
- §10 — Subcontractors (also "Contractors")
- §11 — Financials
- §12 — Scheduling
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
*Populated after all 13 modules walked.*

## 103. Cumulative acceptance criteria
*Populated after all 13 modules walked.*

---

**End of v0.3.** Modules 1 + 2 complete and operator-validated.
Modules 3-13 pending. People menu sidebar architecture locked in
§0.7. Cross-cutting commitments from Sessions C + D propagate
forward into every subsequent module.

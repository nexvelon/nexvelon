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
> **Status:** v0.6 — Modules 1 (Clients + Sites + Contacts),
> 2 (Employees + Permissions), 3 (Settings), 4 (Dashboard), and
> 5 (Quotes) fully scoped through Sessions C + D + E + F + G.
> Modules 6-13 pending. Cross-cutting decisions from Sessions
> C + D + E + F + G propagate forward.

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

Through Sessions B + C + D + E + F + G:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings, not just labels.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control** — role definition, per-user override, data scope, field-level visibility, action gates, approval workflows, system policy, UI presentation, audit visibility, lookup/template management.
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widget definitions + quote terms snapshots.**
9. **Eight-layer print protection** for sensitive PDFs including quote PDFs.
10. **Comprehensive logging visibility** per PRINCIPLES §4.

### 0.5 Baseline gaps (from Session C)

Gap 1 — Runtime matrix ≪ UI catalog. Gap 2 — No route-level permission gates today. Gap 3 — Sidebar is binary, not three-state. Gap 4 — Field visibilities + data scopes unwired. Gap 5 — Bidirectional per-user override not modeled.

### 0.6 Walk order

1. **Clients + Sites + Contacts** *(complete §1)*
2. **Employees + Permissions** *(complete §2)*
3. **Settings** *(complete §3)*
4. **Dashboard** *(complete §4)*
5. **Quotes** *(complete §5)*
6. Projects
7. Inventory
8. Vendors
9. Invoices
10. Subcontractors (also called "Contractors")
11. Financials
12. Scheduling
13. Reports

### 0.7 Sidebar architecture — People parent menu *(Session D)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People               ← parent (hover/tap expands)
   ├── Clients
   ├── Sites
   ├── Employees
   ├── Vendors
   ├── Contractors
   └── Misc Contacts
💰 Quotes               ← Module 5 surface
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials
📈 Reports
⚙️ Settings
```

(People menu sub-item behavior, Misc Contacts implementation, and Employees terminology lock-in per v0.3-0.5 unchanged.)

---

═══════════════════════════════════════════════════════════════════
# 1. Module: Clients + Sites + Contacts
═══════════════════════════════════════════════════════════════════

## 1.1 Purpose

Customer master record. A client is either a **Company** (corporate entity with legal name, BIN, website) or an **Individual** (person with legal first + last name). Sites are physical locations belonging to clients — one client, many sites. Contacts are people at clients/sites — many-to-many across sites.

Foundation for every other module. **SLAs attach per-site**, not per-client. Banking, payment terms, holdback, credit configuration, and onboarding gates attach at the client level. Onboarding gates auto-inject T&C language into quotes via clause-per-gate composition.

## 1.2 Sidebar surface

Resolved by §0.7 — Clients lives under People parent menu as a sub-item. Sites and Misc Contacts are siblings under People. Badge logic on People parent: aggregated count of issues across all six sub-types — operator-configurable in Settings.

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

**Core:** `clients`, `sites`, `contacts`, `contact_site_links` (M:N), plus per-entity `*_custom_field_definitions` and `*_custom_field_values`.

### Client schema

**Identity:** `entity_type` (Company/Individual), `common_name`, `legal_name`, `legal_first_name`, `legal_last_name`, `client_code` (auto-generated; UI label "Client ID"), `logo_url`.

**Classification:** `customer_type_id`, `client_status_id`, `tier_id`, `industry_id`, `lead_source_id`, `currency_id`, `language_id`, `time_zone`.

**Contact:** `business_phone`, `alt_phone`, `fax`, `general_email`, `website`, `cra_business_number`.

**Location:** `addr_line1`, `addr_line2`, `city`, `province`, `postal_code`, `country`. Coords for mapping.

**Billing address:** same fields with `billing_` prefix; `billing_same_as_location` flag.

**Banking (encrypted at rest):** `bank_account_name`, `routing_number`, `bank_account_number`.

**AR/Credit:** `credit_limit`, `on_stop`, `on_stop_reason`, `on_stop_at`, `on_stop_by_user_id`, `payment_method_id`, `payment_terms_days`, `payment_terms_basis`.

**Holdback:** `holdback_applies`, `holdback_pct` (default 10%), `holdback_tax_basis` (Excl/Incl), `holdback_release_days` (45).

**PO:** `po_required`, `default_po_format`.

**Late fee:** `late_fee_pct`, `late_fee_compounding`, `late_fee_grace_days`, `late_fee_auto_apply`.

**Response time fallback:** `response_time_id` (used only if no site SLA + no site response time).

**Notes:** `internal_notes`, `risk_tags[]`.

**Account:** `account_manager_user_id`.

**Onboarding:** `onboarding_requirements_set_at`.

**Standard:** `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`.

### Site schema (additions)

- `response_time_id` (overrides client when set)
- `active_sla_id` (FK; null if none)
- Access fields (gate_code, alarm_code, key_location, on_arrival_contact_id) — encrypted at rest

### Contacts schema (extended for Misc per §0.7)

- `client_id` — **nullable** (null for misc contacts)
- `misc_category_id` — FK to `misc_contact_categories` lookup
- All other standard contact fields (name, phone, email, preferred_channel, decision_authority, etc.)

### New tables introduced by Module 1

- `service_level_agreements` (FK to **site_id**)
- `sla_response_overrides` (audit of admin overrides)
- `service_contracts` (recurring plans per site)
- `onboarding_gate_types` (master list + clause text per gate)
- `client_onboarding_requirements` (per-client gate config)
- `onboarding_gate_fulfillments` (status per client-gate)
- `communication_log` (emails/calls/SMS per client)
- `misc_contact_categories`

### Status lookup tables (15)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `client_statuses` | Lead, Prospect, Active, Inactive, Archived | quote/project/invoice allowed; auto-promote |
| `customer_types` | 16 industry values | quote template, form variant, panel-cert req |
| `client_tiers` | Diamond, Platinum, Gold, Silver, Bronze | SLA default, discount %, payment terms, credit limit |
| `site_statuses` | Active, Inactive, Under Construction, Decommissioned | scheduling eligibility |
| `site_types` | Office, Warehouse, Retail, Industrial, Multi-Family, SFR | default equipment template |
| `contact_roles` | Primary, Billing, Technical, Site Manager, Decision Maker | M:N per link |
| `response_time_types` | Emergency, Type A/B/C/D | max hours, 24/7 flag, escalation |
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

Clients (~30): viewList, viewDetail, create, editBasic, promoteStatus, editAddress, editBilling, viewBankingDetails, editBankingDetails, viewCreditInfo, editCreditTerms, setOnStop, releaseOnStop, editHoldback, editPoRequirement, viewInternalNotes, editInternalNotes, editRiskTags, assignAccountManager, editResponseTime, **overrideSlaResponseTime** (A only, no per-user override), archive, unarchive, hardDelete, merge, viewServiceHistory, viewQuoteHistory, viewProjectHistory, viewInvoiceHistory, viewContracts, viewDocuments, uploadDocument, deleteDocument, viewOnboardingRequirements, editOnboardingRequirements, viewCommunicationLog, logCommunication, editCustomFieldValues, editCustomFieldDefinitions, exportCsv, importCsv, setUserVisibility, viewAuditLog.

Sites (~15), Contacts (~13), SLAs (8), Service contracts (6), Onboarding gates (7). Full action tables with default grants, F? flag, audit events preserved in v0.2 commit history.

## 1.6 Views

Client create/edit sectioned drawer with 11 sections; client detail with 13 tabs; site detail with SLA tab; SLA management surface with versioned terms history; On Stop banner with release workflow; eight-layer print protection on quote/contract PDFs.

## 1.7 Field-level treatment

14 visibility flags: creditInfo, bankingDetails, internalNotes, riskTags, holdbackConfig, lateFeeConfig, commissions (Phase 2), accessCodes (encrypted + audit-on-read), serviceContractValue, equipmentSerial, personalPhone, decisionAuthority, signedTerms, responseTimes.

## 1.8 Custom-field surfaces

Clients / Sites / Contacts / SLAs / Service Contracts all support operator-defined custom fields. Definitions managed in Settings → Custom Fields per §3.3 C.

## 1.9 Status surfaces

15 lookup tables (see §1.4). Each with behavior bindings per §0.4 #4.

## 1.10 Cross-module relationships

Read by Quotes (everything), Projects (quote.client→project.client, status, SLA), Invoices (billing config, holdback, PO), Scheduling (site response via precedence), Service History (derived), Financials (AR aging, holdback releases). Events: client.*, site.*, contact.*, sla.*, service_contract.*, onboarding_gate.*, communication.logged.

## 1.11 Competitive floor delta

Beats Sedona Office, ServiceTrade, simPRO/ServiceFusion. Differentiators: per-site SLAs with precedence resolution, contractual integrity exception, encrypted access codes with audit-on-read, onboarding gate auto-T&C composition, communication log first-class, service contracts separate from SLAs.

## 1.12 Permissions design implications (items 1-14)

Per v0.2 spec. Highlights: DATA_SCOPES wiring, 14 field visibilities, bidirectional override UI, audit-read exception for sites:viewAccess, encryption at rest, three-state per tab, merge audit captures both sides, contractual integrity exception, ten dimensions of control, approval delegation framework, time-bounded grants, guided creation wizard, workflow rule data model, versioning.

## 1.13 Open questions

14 items captured in v0.2. See Session C handoff.

## 1.14 Acceptance criteria

54 test scenarios covering Client lifecycle, Banking & AR, SLA & Response Time, Onboarding gates & T&C, Permissions / 10 dimensions, Logging visibility, Print protection, Performance, Security.

---

═══════════════════════════════════════════════════════════════════
# 2. Module: Employees + Permissions
═══════════════════════════════════════════════════════════════════

## 2.1 Purpose

The substrate every module reads from. **Employees** — people who work for your company (Office, Field, Hybrid, Apprentice, Contractor-with-login). **Permissions** — the ten-dimensional access control surface.

## 2.2 Sidebar surface

Per §0.7 — Employees under People parent menu.

## 2.3 Routes & sub-routes

25 routes including /employees, /employees/new, /employees/[id]/{profile, permissions, certifications, territories, availability, equipment, payroll, activity, sessions, notifications, api-tokens, documents, audit-log}, /employees/roles, /employees/roles/[id], /employees/roles/new, /employees/permissions-catalog, /employees/audit-log, /employees/approval-workflows, /employees/security-policy, /employees/map, /employees/licence-matrix.

## 2.4 Resources

### Owned tables (~20)

Identity & access: `employees`, `roles`, `permissions`, `role_permissions`, `user_permission_overrides`, `user_field_visibility_overrides`, `user_data_scopes`.

Workforce-specific: `employee_certifications` (M:N), `certification_types` (25+ seeded), `employee_certification_records`, `employee_territories` (M:N with Primary/Secondary/Relocation type), `territories`, `employee_availability`, `employee_absences`, `employee_equipment_assignments`, `equipment`.

Approval & policy: `approval_workflows`, `approval_workflow_steps`, `user_approval_delegations`, `security_policies`, `access_requests`.

Session & audit: `user_sessions`, `permission_grant_audit`.

### Employee schema highlights

Identity, address, emergency contact, employment (hire_date, manager_user_id, department, cost_center), authentication (auth_user_id, mfa_method), permissions (role_id, effective_permissions_cache jsonb), payroll/rates (heavily gated: hourly_cost_rate A/Acc only, hourly_bill_rate A/Acc/PM-with-perm), banking (encrypted: bank_account_name, routing_number, bank_account_number, sin_number), identification/regulatory (government_id, wsib_number, personal_insurance_certificate), scheduling-relevant (default_territory, truck_id, working_hours_pattern, available_for_emergency_call), internal_notes.

### Status lookup tables (11)

employee_statuses, employee_types, certification_types (25+ seeded: Kantech KT-300/400, Genetec Synergis/Mission Control, C-CURE 9000, DSC PowerSeries, Honeywell ProWatch/Galaxy, Bosch B/G-series, Avigilon ACC/ACM, Lenel OnGuard, Paxton Net2, ESA Ontario, ULC fire alarm, CFAA, CSA, CCTV, Forklift, Working at Heights, Confined Space, OSHA-30, WHMIS 2015, First Aid+CPR, ASP/CSP, LEED AP), territory_types, absence_types, mfa_methods, session_duration_options, data_scope_types, approval_workflow_step_types, equipment_types, access_request_statuses.

## 2.5 Actions (~80 across 14 categories)

Employee management (15), Role management (10), Per-employee permission overrides (8), Data scope (8), Field visibility (6), Certifications (10), Territories (5), Availability/absences (7), Equipment (5), Payroll/rates (5 heavily gated), Approval workflows (7), Security policy (7), Audit (6), Sessions (3), Access requests (4), Bulk operations (4).

## 2.6 Views

Six-tab permissions editor at `/employees/[id]/permissions`: Role & Overrides / Data & Field Access / Workflows & Delegations / Security & Sessions / UI & Audit / API & SSO. Employee list with filter chips. Color-coded technician profiles. Map view. Licence Matrix Report. Role catalog with guided-creation wizard. Approval workflow builder. Security policy editor. System-wide audit log. Employee availability calendar. Bulk operations. Invite drawer flow. Request-admin-access workflow.

## 2.7 Field-level treatment

14 visibility flags: email (partial non-admin), personalPhone (A+self), address (A only), emergencyContact (A only), lastIp (A only), lastDeviceFingerprint (A only), failedLoginCount (A/Acc), passwordResetHistory (A only), hourlyBillRate (A/Acc/PM-with-perm), hourlyCostRate (A/Acc only), payHistory (A/Acc), bankingDetails (A/Acc only; account# masked), sinNumber (A/Acc only), dob (A/HR-role only).

## 2.8 Custom-field surfaces

Employees support custom fields via standard pattern. Definitions in Settings → Custom Fields → Employees.

## 2.9 Status surfaces

11 lookup tables (see §2.4).

## 2.10 Cross-module relationships

Read by every other module. Critical reader for Scheduling (territory, cert, availability, absence, capacity). Events: employee.*, permission_override.*, certification.* (with 30/60/90 alerts), absence.*, session.*, security_policy.*, access_request.*.

## 2.11 Competitive floor delta

Ten-dimensional permission control, contractual integrity exception, certification tracking with scheduling auto-match + critical flag + 30/60/90 day alerts, request-admin-access workflow for any gated action, color-coded profiles + map view + Licence Matrix Report, Resource Absences with approval + scheduling block + balance tracking, eight-layer print protection on payroll/HR docs, field-level encryption-at-rest on banking + SIN + access codes.

## 2.12 Permissions design implications (items 15-22)

15. Effective-permissions caching (sub-10ms).
16. Permission catalog code-defined.
17. Role hierarchy Phase 2.
18. SSO/SAML Phase 2.
19. Personal API tokens Phase 2.
20. Certifications drive scheduling.
21. Absences drive scheduling.
22. Two-tier (account + project) permission model Phase 2.

## 2.13 Open questions

4 items: multi-company/departments (Phase 2 placeholder column); crew assignments (Phase 2); Service Resource vs Employee distinction (separate); Employee Portal pattern (full app at v1).

## 2.14 Acceptance criteria

55 test scenarios covering Employee CRUD, Certifications, Territories & availability, Permissions (10 dimensions), Request-admin-access, Logging visibility, Sessions, Print protection, Performance, Security.

---

═══════════════════════════════════════════════════════════════════
# 3. Module: Settings
═══════════════════════════════════════════════════════════════════

## 3.1 Purpose

The configuration spine. Every module reads from Settings. ~70 sub-pages in 10 categories covering company identity, lookups, custom fields, workflow rules, templates, security, audit, integrations, system, subscription.

## 3.2 Sidebar surface

Bottom of sidebar. ⚙️ Settings.

## 3.3 Routes — ~70 sub-pages organized in categories

**A. Company identity & branding (3):** /settings/company-profile, /settings/branding, /settings/formats.

**B. Lookup management (29 sub-pages, uniform guided-creation wizard):** /settings/lookups (index) + sub-pages for client-statuses, customer-types, client-tiers, site-statuses, site-types, contact-roles, response-time-types, payment-methods, lead-sources, currencies, languages, onboarding-gate-types (with T&C clause editor), misc-contact-categories, sla-statuses, service-contract-statuses, service-contract-billing-cycles, quote-statuses, project-statuses, invoice-statuses, vendor-statuses, contractor-statuses, certification-types, territories, territory-types, absence-types, equipment-types, tax-codes, labor-rate-types, employee-statuses, employee-types.

**C. Custom field definitions per entity (12):** /settings/custom-fields/{clients, sites, contacts, quotes, projects, inventory-items, vendors, contractors, employees, service-contracts, slas, misc-contacts}.

**D. Workflow & automation (4):** workflow-rules (condition-action table at v1; flowchart Phase 2), approval-workflows, notifications, sidebar-badges.

**E. Templates (3):** email-templates (Handlebars editor with live preview, ~25 seeded), pdf-templates, sms-templates (Phase 2).

**F. Security policy (4):** role-policies, password-policy, api-keys, sso (Phase 2).

**G. Audit & compliance (2):** retention (7-year default), notification-rules cross-link.

**H. Integrations (1 page tabbed):** QBO / Slack / Twilio (Phase 2) / Email Provider / Mapping API (OSM Nominatim default) / Calendar / File Storage / Accounting Export / BIM/CAD (Phase 2).

**I. System (3):** holdback-defaults (Ontario 10%/Excl/45), backups, multi-company (Phase 2 placeholder).

**J. Subscription (1):** /settings/subscription (Phase 2 until productized).

## 3.4 Resources

No new entity tables. 16 Settings-specific configuration tables:

`company_profile` (single row), `branding_settings` (single row), `display_format_settings`, `email_templates` (per language + event), `pdf_templates` (per language + doc type), `notification_rules`, `sidebar_badge_config`, `api_keys`, `integration_connections` (OAuth tokens encrypted in Supabase Vault), `password_policy`, `audit_retention_settings`, `backup_settings`, `holdback_defaults`, `workflow_rules`, `workflow_rule_executions`, `approval_workflow_templates`.

### Status surfaces (4)

api_key_statuses (Active/Revoked/Expired), integration_connection_statuses (Connected/Disconnected/Auth Error/Syncing/Sync Failed), notification_rule_statuses (Enabled/Disabled/Auto-disabled), workflow_rule_statuses (Enabled/Disabled/Auto-disabled).

## 3.5 Actions (~270 actions, heavily templated)

Lookup CRUD pattern (uniform across 29 lookups): view, create (guided wizard), edit, archive, reorder, hardDelete. Admin-only default. Audit with before/after snapshot.

Custom field definition pattern (uniform across 12 entities): view, create, edit, archive, reorder. Admin-only default.

Module-specific (~30 unique): company_profile, branding, formats (including editUserOverride for per-user), email_templates (view/edit/preview), pdf_templates (view/edit/preview), notification_rules (CRUD + disable), sidebar_badges (view/edit), workflow_rules (view/clone/edit/disable/viewExecutionLog), approval_workflow_templates (view/edit), security (view/editRolePolicy/editPasswordPolicy), api_keys (view/create/revoke/viewUsageLog), integrations (view/connect/disconnect/editMapping/triggerSync/viewSyncLog), audit_retention (view/edit/rotate), backups (view/editSchedule/trigger/restoreTest), holdback_defaults (view/edit), subscription (view/edit), settings:viewChangePreview.

Default grants: heavily Admin. PM gets subset (templates, lookups for managed entities). Acc gets financial-relevant settings. VO gets company profile + branding only.

## 3.6 Views

Settings hub with categorized index + search. Uniform lookup sub-page pattern. Uniform custom-field-definition pattern. Bespoke editors: Workflow Rules condition-action table at v1; Approval Workflow Template drag-drop step builder; Email/PDF template split-pane Handlebars editor with live preview + merge-tag autocomplete + per-language versioning + stale-translation flagging; Integrations tabbed; Notification rules builder. Settings change preview modal for behavior-binding changes ("affects N records" + apply-scope choice).

## 3.7 Field-level treatment

Mostly Admin-only. Exceptions: api_keys.fullKey (one-time display at creation; masked thereafter), integrations.credentials (OAuth tokens never in UI), email_templates.testRecipientAddress (masked in audit).

## 3.8 Custom-field surfaces

Settings entities don't have custom fields themselves; Settings manages custom field definitions for all M1+M2+M4-13 entities.

## 3.9 Status surfaces

4 lookup tables (see §3.4).

## 3.10 Cross-module relationships

Every module reads from Settings. Critical cross-module impact: behavior-bound lookup changes immediately affect consuming modules. Versioning critical per §0.4 #8. Events: settings.* (high-volume).

## 3.11 Competitive floor delta

Beats simPRO, ServiceTitan, FieldWire, ServiceTrade, Salesforce, Sedona Office on breadth of operator-editability. Every status/type/tier/role/template/workflow rule editable by Admin from within the app. Guided-creation wizards. Email/PDF template editor with live preview + merge-tag autocomplete + per-language versioning + stale flagging. Settings change preview with impact count.

## 3.12 Permissions design implications (items 23-27)

23. Settings heavily Admin-gated by default.
24. Lookup CRUD audit captures before/after snapshots.
25. API keys are scoped permissions (action allowlist), not full access.
26. Integration OAuth tokens encrypted at rest in Supabase Vault.
27. Workflow rule edits ship versioned.

## 3.13 Open questions — RESOLVED IN SESSION E

1. ✅ Workflow Rules editor: condition-action table at v1.
2. ✅ Merge tag scope: Handlebars safe subset.
3. ✅ Display formats: company default + per-user override.
4. ✅ Workflow sandboxing: 30s/100 actions/auto-disable after 3 failures.
5. ✅ Settings backup/restore JSON: Phase 2.
6. ✅ Settings change preview: yes for behavior-binding changes.

Remaining: API key per-key rate limiting (Phase 2); multi-language template stale-flagging (yes); workflow rule library v1 seed count (~15 essential rules).

## 3.14 Acceptance criteria

42 test scenarios covering Lookup management, Custom field definitions, Templates, Workflow rules, Notifications, Security & API keys, Integrations, Company profile & branding, Audit & backups, Permissions & access, Performance & integrity.

---

═══════════════════════════════════════════════════════════════════
# 4. Module: Dashboard
═══════════════════════════════════════════════════════════════════

## 4.1 Purpose

Per-role landing page. Composes widgets reading from every other module. Not a feature module — a presentation layer.

## 4.2 Sidebar surface

Top-level 📊 Dashboard. Always visible to all employees.

## 4.3 Routes

`/` (redirect to landing), `/dashboard` (main with effective layout), `/dashboard/configure` (drag-drop layout).

## 4.4 Resources

5 new tables: `dashboard_widget_definitions` (code-defined catalog, ~20 widgets), `dashboard_role_layouts` (per-role defaults seeded for A/PM/SR/Tech/Acc/VO), `user_dashboard_layouts` (per-user override with landing_page choice), `widget_data_cache` (5-min TTL), `widget_company_settings` (per-company enable/disable).

3 status surfaces: widget_statuses, dashboard_layout_types, widget_refresh_strategies.

## 4.5 Actions (~35 = 13 module-specific + ~20 per-widget gates)

dashboard:view (all), configureMyLayout (all), resetToDefault (all), hideWidget (all), showWidget (all), setLandingPage (all), editRoleDefaults (A), enableDisableWidget (A, company-wide), viewKPIDetail (drill-through), exportWidgetData (all data-scoped), refreshWidget (all), viewRoleLayouts (A), cloneRoleLayout (A).

Per-widget gates: `dashboard:viewWidget:<widget_key>` granted by default if user has source-module list permission. Admin can revoke per-user via override.

## 4.6 Views

Responsive 12-column grid. Period selector at top cascades to period-bound widgets. Each widget: drill-through, refresh, hide, CSV-export buttons. Configuration page: drag-drop add/remove/resize.

**~20 seeded widgets across 6 role default layouts:**

- **Admin (8):** Revenue this period, Outstanding AR (aging), Quotes pending approval, Top clients, SLA breach incidents, Pending access requests, Recent audit highlights, Cert expirations
- **PM (6):** My projects, Pending approvals queue, Today's scheduled jobs, SLA escalations, Team quote pipeline, Resource availability heatmap
- **SR (6):** Quote pipeline (Kanban), Quotes pending action, Activity feed, Top clients, Lead source performance, Bookings this month
- **Tech (5):** Today's schedule, Week preview, Open jobs, Time entries pending log, Cert expirations
- **Acc (7):** AR aging, Overdue invoices, Cash collection trend, On Stop alerts, Holdback releases due, Tax remittance reminders, Recent payments
- **VO (3):** Revenue summary (no margin), Project status overview, Schedule

Mobile: responsive single-column ordered by `priority_for_mobile`.

## 4.7 Field-level treatment

Widgets respect source-module field-level visibility. Widget-level: source-module list perm AND widget enabled company-wide AND user not hidden — three-way gate.

## 4.8 Custom-field surfaces

Phase 2 (saved-report-as-widget pattern).

## 4.9 Status surfaces

3 lookup tables (see §4.4).

## 4.10 Cross-module relationships

Reads from every module. Each widget is a saved query against a source. Events: dashboard.widget_rendered, dashboard.layout_updated, dashboard.role_default_updated, dashboard.widget_disabled_company_wide, dashboard.landing_page_changed.

## 4.11 Competitive floor delta

Per-role defaults + per-user override + per-company widget enable/disable + drill-through + permission-aware data queries + responsive mobile + period selector + custom landing page + CSV export + three-way visibility gate.

## 4.12 Permissions design implications (items 28-30)

28. Widget visibility = source-module permission AND widget-enabled-company-wide AND user-not-hidden.
29. Per-user dashboard layout = 10th dimension of permission control (UI presentation).
30. Widget data queries permission-aware end-to-end.

## 4.13 Open questions — RESOLVED IN SESSION F

1. ✅ Widget refresh: 5-min cached + critical on-focus + manual always.
2. ✅ Mobile: responsive at v1; native app Phase 2.
3. ✅ Operator-defined custom widgets: NO at v1; Phase 2 saved-report-as-widget.
4. ✅ Per-user landing page alternative: YES (any module list view).
5. ✅ Widget CSV export: YES (data-scoped).

Remaining: real-time WebSocket push for critical widgets (Phase 2).

## 4.14 Acceptance criteria

25 scenarios covering widget rendering per role, per-user customization, landing page choice, permissions (three-way gate, source perm denial, company disable, drill-through scope, CSV scope, field visibility, per-user override precedence), Admin operations (edit role default, disable company-wide, clone role layout, manual refresh).

---

═══════════════════════════════════════════════════════════════════
# 5. Module: Quotes
═══════════════════════════════════════════════════════════════════

## 5.1 Purpose

Heart of the sales pipeline. Three quote types:

- **Service Quote** — one-off jobs: emergency repairs, single-site installs, small commissioning. Quick turnaround. Often converts directly to a job rather than a full project.
- **Project Quote** — multi-milestone work: large installs, multi-site rollouts, commissioning with phases. Converts to a Project (Module 6) with full project management lifecycle.
- **Service Contract Quote** — recurring revenue with monthly/quarterly billing. Generates `service_contracts` row in Module 1 on acceptance.

For security integrators specifically: equipment + labor + materials + sub-contracted work + commissioning + training + recurring service all need to coexist in a single quote with cost-centre grouping.

Quote → Project conversion is one of the most operationally significant transitions in the system. Quote signing creates legal commitment; pricing snapshot + T&C snapshot must be immutable from that point forward.

## 5.2 Sidebar surface

Top-level **💰 Quotes** in sidebar per §0.7. Badge logic on Quotes parent: aggregated count of quotes pending current user's action (drafts to send, pending approvals, awaiting signature, expiring soon). Operator-configurable in Settings.

## 5.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/quotes` | List view with status Kanban toggle | `quotes:viewList` |
| `/quotes/new` | Wizard-style create | `quotes:create` |
| `/quotes/[id]` | Detail page (Overview tab) | `quotes:viewDetail` |
| `/quotes/[id]/line-items` | Line item editor | `quotes:editLineItems` |
| `/quotes/[id]/pricing` | Pricing & margin tab | `quotes:editPricing` |
| `/quotes/[id]/terms` | T&C composition | `quotes:editTerms` |
| `/quotes/[id]/approvals` | Approval workflow status | `quote_approvals:view` |
| `/quotes/[id]/send` | Send modal | `quotes:send` |
| `/quotes/[id]/track` | Send & track tab | `quotes:viewTracking` |
| `/quotes/[id]/revisions` | Version history | `quotes:viewRevisions` |
| `/quotes/[id]/activity` | Quote activity feed | inherits view |
| `/quotes/[id]/documents` | Attachments | inherits view |
| `/quotes/[id]/audit-log` | Module audit for quote | `quotes:viewAuditLog` |
| `/quotes/templates` | Quote template library | `quote_templates:viewList` |
| `/quotes/templates/[id]` | Template detail | `quote_templates:viewDetail` |
| `/quotes/templates/new` | Create template | `quote_templates:create` |
| `/quotes/assemblies` | Pre-built assembly library | `assemblies:viewList` |
| `/quotes/assemblies/[id]` | Assembly detail | `assemblies:viewDetail` |
| `/quotes/assemblies/new` | Create assembly (guided wizard) | `assemblies:create` |
| `/quotes/pricebook` | Master pricebook catalog | `pricebook:viewList` |
| `/quotes/pricebook/[id]` | Pricebook item detail | `pricebook:viewDetail` |

Public-facing (no auth, signed URL):
| `/q/[token]` | Client-facing online portal for accepting quote | signed URL validation |

## 5.4 Resources

### Owned tables (12)

- `quotes` — header with client_id, site_id, sold_by_user_id, assigned_pm_user_id, status, quote_type (service/project/service_contract), currency_id, language_id, valid_until_date, total_amount, totals_snapshot jsonb (computed totals captured for legal durability)
- `quote_line_items` — line details (description, qty, unit_price, cost, margin_calculated, tax_code_id, cost_center_id, sort_order, pricebook_item_id nullable, assembly_id nullable, custom_fields jsonb)
- `quote_taxes` — applied taxes by code (handles per-cost-centre tax variation per Canadian split-tax rules)
- `quote_discounts` — line-item OR total discounts (type, amount or %, reason, requires_approval flag)
- `quote_revisions` — version history (revision_number, revision_reason_id, changed_summary jsonb, parent_quote_id)
- `quote_approvals` — approval workflow execution (workflow_step_id, approver_user_id, status, decided_at, decision_notes)
- `quote_views` — track when client views online portal (timestamp, IP, user_agent, version_viewed)
- `quote_acceptance_records` — append-only signature records (signature_image_url, signature_hash, IP, timestamp, accepted_version_id, terms_snapshot_id)
- `quote_terms_snapshots` — versioned T&C captured at send time (template_version, composed_clauses jsonb, captured_at)
- `quote_templates` — operator-defined quote templates (default line items, default T&C, default pricing rules)
- `pricebook_items` — master catalog (sku, description, default_cost, default_sell, default_margin, tax_code, vendor_id, category_id)
- `pricebook_categories` — category tree
- `pre_built_assemblies` — bundled line items (e.g., "Standard Office Camera Install")
- `cost_centers` — line-item grouping (Equipment / Labor / Materials / Sub-Contractor / Travel / Commissioning / Training / Misc)

### Status lookup tables (5)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `quote_statuses` | Draft, Pending Approval, Approved, Sent, Viewed, Negotiating, Accepted/Signed, Binding, Rejected, Withdrawn, Expired, Converted to Project, Archived | allows-edit, allows-send, allows-conversion, terminal flag |
| `approval_statuses` | Pending, Approved, Conditional Approval, Rejected, Self-Approved | execution flag, notification rules |
| `quote_revision_reasons` | Customer Feedback, Internal Change, Pricing Update, Scope Change, Re-Negotiation | reporting tag |
| `quote_types` | Service Quote, Project Quote, Service Contract Quote | template default, workflow variant, conversion target (project vs job vs contract) |
| `cost_center_defaults` | Equipment, Labor, Materials, Sub-Contractor, Travel, Commissioning, Training, Misc | sort order, default tax_code, PDF display order |

## 5.5 Actions (~85 actions)

### Quote lifecycle (25)

| ID | Description | Default | F? | Audit |
|---|---|---|---|---|
| `quotes:viewList` | See quote list | A, PM, SR (scoped), Acc | — | — |
| `quotes:viewDetail` | Open quote | A, PM, Acc, SR (scoped) | — | — |
| `quotes:viewMy` | See own quotes only | All employees | — | — |
| `quotes:create` | Create new quote | A, PM, SR | — | `quote_created` |
| `quotes:editDraft` | Edit draft quote | A, PM, SR (own) | — | `quote_updated` |
| `quotes:editLineItems` | Add/remove/edit line items | A, PM, SR (own) | — | `quote_line_items_updated` |
| `quotes:editPricing` | Adjust pricing/discount | A, PM, SR (own, within limits) | — | `quote_pricing_updated` |
| `quotes:editDiscount` | Apply discount | A, PM, SR (own, within limits) | — | `quote_discount_applied` |
| `quotes:editTerms` | Modify T&C | A, PM | — | `quote_terms_updated` |
| `quotes:applyTierDiscount` | Apply tier-based discount | auto + A, PM | — | `quote_tier_discount_applied` |
| `quotes:addAttachment` | Attach files | A, PM, SR (own) | — | `quote_attachment_added` |
| `quotes:viewAttachment` | Open attachments | A, PM, Acc, SR (own) | — | — |
| `quotes:deleteAttachment` | Remove attachment | A, PM, SR (own, before send) | — | `quote_attachment_deleted` |
| `quotes:submit` | Submit for approval | A, PM, SR (own) | — | `quote_submitted` |
| `quotes:approve` | Approve quote | A, PM (under threshold) | — | `quote_approved` |
| `quotes:conditionalApprove` | Approve with conditions | A, PM | — | `quote_conditionally_approved` |
| `quotes:reject` | Reject quote | A, PM | — | `quote_rejected` |
| `quotes:send` | Send to client | A, PM, SR (own, post-approval) | — | `quote_sent` |
| `quotes:resend` | Resend after send | A, PM, SR (own) | — | `quote_resent` |
| `quotes:cancel` | Cancel quote | A, PM, SR (own) | — | `quote_cancelled` |
| `quotes:withdraw` | Withdraw sent quote | A, PM, SR (own) | — | `quote_withdrawn` |
| `quotes:expire` | Mark as expired | auto + A | — | `quote_expired` |
| `quotes:reopen` | Reopen expired/rejected | A, PM | — | `quote_reopened` |
| `quotes:convert` | Convert to Project | A, PM | — | `quote_converted_to_project` |
| `quotes:revise` | Create new version | A, PM, SR (own, before binding) | — | `quote_revised` |
| `quotes:archive` | Archive quote | A, PM | — | `quote_archived` |
| `quotes:hardDelete` | Permanent delete | A only | — | `quote_hard_deleted` |
| `quotes:merge` | Merge duplicate quotes | A | — | `quote_merged` |

### Margin & cost (5, heavily field-gated)

| ID | Description | Default | F? | Audit |
|---|---|---|---|---|
| `quotes:viewMargin` | See margin % per line + total | A, PM (always); SR (per-user override) | Y | — |
| `quotes:editMargin` | Override margin manually | A, PM | Y | `quote_margin_overridden` |
| `quotes:viewCost` | See unit costs | A, PM (always); Acc | Y | — |
| `quotes:editCost` | Override unit cost | A, Acc | Y | `quote_cost_overridden` |
| `quotes:viewProfit` | See gross + net profit | A, PM, Acc | Y | — |

### Line items (8), Pricebook (10), Assemblies (5), Cost centers (4), Templates (5), Tracking (8), Output (5), Communication (4)

(Full tables similar pattern. Total: ~85 actions.)

### Default grants summary

- SR: own-records only for create/edit/send; view own; view margin via override
- PM: team-scoped; can approve under value threshold; view margin always
- A: full access including hardDelete, merge, override pricing
- Acc: view + cost visibility; no edit
- VO: view only, no margin

## 5.6 Views

### Quote create wizard (multi-step)

1. **Client & site selection** — pre-fills currency/language/holdback/PO from client
2. **Quote type** — Service / Project / Service Contract → drives template + workflow variant
3. **Line items** — start from template or blank; assembly picker; pricebook search; cost-centre grouping
4. **Pricing & margin** — review computed totals; apply discount; tier discount auto-suggested
5. **T&C composition** — auto-composed from client's onboarding gates per Module 1; editable
6. **Preview** — full PDF preview with eight-layer protection rendering
7. **Submit or send** — submit-for-approval if exceeds thresholds; direct send if self-approve eligible

### Quote detail page — 10 tabs

1. **Overview** — header card (status, total, client, site, dates, sold-by, assigned-PM), quick actions
2. **Line Items** — editable table grouped by cost-centre; assembly application; tax per line
3. **Pricing & Margin** — full pricing breakdown; margin view (gated); discount summary; tax calculation; holdback (if applies); grand total
4. **T&C** — composed clauses with source attribution (which onboarding gate each came from); edit (gated)
5. **Approvals** — workflow status with step-by-step progression; pending approver name; decision notes; if rejected, reason captured
6. **Send & Track** — recipient picker, send history, view events, signature record
7. **Revisions** — list of all versions with diff summary; "what changed" between versions
8. **Activity** — chronological activity feed (created, updated, submitted, approved, sent, viewed, signed)
9. **Documents** — attachments uploaded
10. **Audit Log** — module audit for this quote (drillable to before/after state per change)

### Line item editor

Inline editable table. Columns: cost-centre (group header), description, qty, unit cost (gated), unit sell, margin % (gated), discount %, tax code, line total. Row actions: edit details, delete, duplicate, move to another cost-centre, apply assembly bundle.

Assembly application: click "+ Add Assembly" → modal lists available assemblies → select → line items pre-fill (editable after add).

Pricebook search: type-ahead in description field; suggestions from pricebook_items with photo + sku + default sell.

### Pricing summary widget (right rail)

Shows in line-item view:
- Per cost-centre subtotals
- Line-item discounts total
- Subtotal
- Total discount % applied
- Net before tax
- Tax breakdown by code
- Holdback (if applies)
- **Grand Total**

Margin view toggle (gated): shows alongside total margin % + gross profit + net profit (after overhead estimate from Settings).

### T&C composition view

Auto-composed at quote creation from client's onboarding gates per Module 1 commitment. Each clause tagged with source ("Source: Insurance Cert gate"). Editable with audit on every change. Re-compose button if client's onboarding gates change after quote creation.

Live preview of final T&C as it'll appear on PDF.

### Send modal

- Recipient picker (pre-populated from client contacts with billing or decision-maker role)
- Add CC / BCC fields
- Custom message (overrides email_template if needed)
- Attachments selection (all uploaded docs by default)
- Scheduled send option (specify date/time)
- "Send test" button — sends to logged-in employee's address for review
- Preview button — renders PDF
- Send button — triggers immutable snapshot capture + PDF generation + email send

### Track tab

- Send history (each send with timestamp, recipient, version sent)
- View events (each view with timestamp, IP, version viewed)
- Signature record (signature image, IP, timestamp, accepted version)
- Reminder send button (only if not yet accepted)

### Online portal (`/q/[token]`)

- Client-facing, no login required
- Signed URL with 90-day expiry; revoked on acceptance
- Branded letterhead, line items, pricing, T&C
- Accept button → e-signature capture (touch: draw; desktop: type + checkbox)
- Auto-detects view; logs to `quote_views`
- After acceptance: "Quote accepted. A copy has been emailed to you."

### PDF generation (eight-layer protected per §0.4 #9)

1. Server-side generation only (no client-side render)
2. Force re-auth before download
3. Diagonal watermark (operator name + timestamp)
4. Audit row on every download
5. Print event capture via embedded PDF JS
6. Embedded metadata identifying generator
7. No bulk PDF export
8. 24h signed URL expiry; re-generates on re-access

### Quote list page

Filter chips: status, sold-by, assigned-PM, client, date-range, value-range, quote-type, expiring-within-7-days.
View toggle: List (table) or Kanban (by status).
Bulk actions: assign-to-PM, status-change, archive, exportCsv.
Sort: created date, last activity, value, expiry date.

## 5.7 Field-level treatment

5 visibility flags (heavily relevant for sales context):

- `visibility.quotes.marginPercent` — A, PM (always); SR (per-user override only). Hides margin column in line-item view + pricing summary.
- `visibility.quotes.costRates` — A, Acc, PM-with-perm. Hides unit cost column + cost calculations.
- `visibility.quotes.subcontractorMarkup` — A, Acc. Hides markup on sub-contractor lines.
- `visibility.quotes.internalNotes` — A, PM, SR (author). Hides internal notes field.
- `visibility.quotes.commissionDetail` — Phase 2.

## 5.8 Custom-field surfaces

Quote-level custom fields managed in Settings → Custom Fields → Quotes (per §3.3 C). Surface in: create wizard, detail Overview tab, list filters, PDF (if show_on_pdf), exports.

Common examples for security integrators: Permit Number, Inspector Name, Equipment Model (Avigilon vs Genetec vs Bosch), Project Type (New Install vs Retrofit), Subcontractor Lead, ULC Verification Required.

Line-item-level custom fields: Phase 2.

## 5.9 Status surfaces

5 lookup tables (see §5.4).

## 5.10 Cross-module relationships

### Reads

- **Clients (M1):** client info, banking, billing terms, holdback, PO required, late fee config, language, currency, tier, on-stop state (blocks send if on-stop)
- **Sites (M1):** target site, response time, equipment installed (suggests line items)
- **Contacts (M1):** recipient picker
- **SLAs (M1):** referenced if relevant
- **Onboarding gates (M1):** T&C clause auto-composition
- **Settings (M3):** templates, lookups, approval workflows, pricebook, tax codes, currencies, languages, email/PDF templates
- **Employees (M2):** Sold By (creator), assigned PM, Account Manager
- **Pricebook (own — M5):** line items, assemblies

### Writes

- **Communication log (M1):** auto-log every send + reminder
- **Projects (M6):** on conversion creates project with originating_quote_id FK
- **Service contracts (M1):** on acceptance of Service Contract Quote type
- **Audit events on every state change**

### Events emitted

`quote.created`, `quote.updated`, `quote.line_items_changed`, `quote.pricing_changed`, `quote.terms_changed`, `quote.submitted`, `quote.approved`, `quote.conditionally_approved`, `quote.rejected`, `quote.sent`, `quote.resent`, `quote.viewed` (per view event), `quote.accepted` (with signature), `quote.rejected_by_client`, `quote.withdrawn`, `quote.expired`, `quote.revised`, `quote.converted_to_project`, `quote.archived`.

## 5.11 Competitive floor delta

### Combines best of

- **simPRO:** Pre-built assemblies, Cost centres, Breakdown table for margin views, Vendor catalog sync, Service vs Project Quote distinction, Bulk import, Quote merging
- **ServiceTitan:** Online estimates with e-signature, "Sold By" credit tracking, View/sign notifications, Self-approval threshold, Item Groups (assemblies equivalent), Estimate-triggers-PO requisitions, Financing integrations (Phase 2)
- **Salesforce CPQ:** Multi-step approval workflows, Document generation, Approval routing

### Nexvelon-unique

- **T&C auto-composition from onboarding gates** (Module 1 commitment honored — no competitor does this automatically)
- **Eight-layer print protection** on quote PDFs (beyond any competitor for revenue documents)
- **Versioned T&C captured at send time** (legally durable per §0.4 #8)
- **Per-line-item field visibility** (hide cost from SR but show margin)
- **Three quote types** covering one-off + project + recurring (most competitors conflate)
- **Discount + value threshold combined approval routing** (richer than ServiceTitan's discount-only or simPRO's value-only)
- **Per-cost-centre tax codes** (Canadian split-tax-treatment compliance)
- **Holdback in quote totals** (Canadian Construction Act compliance — most competitors require manual workaround)
- **Request-admin-access workflow** for elevated margin discount (via Module 2 framework)
- **Signed URL portal with no client account required** (faster signing flow than competitors that require client portal accounts)

## 5.12 Permissions design implications (items 31-37)

31. **Margin visibility is field-level gated.** A/PM default; SR per-user override. `quotes:viewMargin` is the visibility flag, not the action — distinguishes who-can-do-action from what-they-see-in-the-action.

32. **Approval workflow uses value AND discount thresholds with AND logic.** Exceeding either triggers approval. Configurable per role in Settings.

33. **Quote send action triggers immutable snapshot.** Line items, pricing, T&C, template version captured at send time for legal/audit durability. Revisions create new snapshots; old snapshots retained.

34. **Quote PDF download triggers force-reauth + eight-layer print + audit row.** Force-reauth is per security_policies config; default required for all quote PDFs.

35. **Quote conversion locks the source quote (read-only post-conversion).** Revisions only allowed before acceptance. Post-acceptance corrections require new quote.

36. **Online portal signed URLs are scoped to that quote only.** Not general access tokens. Revoked on acceptance.

37. **Acceptance records are append-only (immutable).** Signature image stored with one-way hash. No update; only read.

## 5.13 Open questions — RESOLVED IN SESSION G

1. ✅ Approval value thresholds — configurable per role; defaults: <$5k self-approve, $5-25k→PM, $25-50k→PM+margin review (gates if margin <15%), >$50k→Admin
2. ✅ Self-approval discount thresholds — <10% self-approve, 10-25%→PM, >25%→Admin
3. ✅ Quote expiry — 30 days service quotes, 90 days project quotes (overridable per quote)
4. ✅ Multi-currency in single quote — NO; one currency per quote at v1
5. ✅ Quote vs assembly templating — both (quote templates for structure, assemblies for bundles)
6. ✅ Recurring contracts in quotes — separate "Service Contract Quote" type
7. ✅ Volume discounts — manual at v1, rule-based Phase 2
8. ✅ Third-party financing integration — Phase 2
9. ✅ Per-cost-centre tax codes — YES (Canadian split-tax compliance)
10. ✅ Online portal authentication — signed URL with 90-day expiry, no login required

Remaining:

11. **Quote co-authoring/collaboration** — multiple SRs working on same quote simultaneously? *Recommendation: simple last-write-wins with conflict detection at v1; real-time collaboration Phase 2.*
12. **Quote import from competitor systems** — CSV import format? *Recommendation: Phase 2 with simPRO/ServiceTitan format converters.*
13. **Quote pricing rules engine** — dynamic pricing based on time-of-day, urgency, season? *Recommendation: Phase 2; static pricing at v1.*

## 5.14 Acceptance criteria (~52 scenarios)

### Functional — Quote creation (1-10)

1. **Create Service Quote from scratch.** SR clicks New Quote → wizard guides through client → site → type (Service) → line items → pricing → T&C → preview → send. Quote created in Draft status.
2. **Create from template.** SR selects "Standard Camera Install" template → line items pre-populate → SR customizes qty → completes wizard.
3. **Add assembly bundle.** SR adds "5-Camera Office Bundle" assembly → 5 camera lines + cabling + NVR + labor lines added → SR adjusts qty.
4. **Pricebook search.** SR types "Avigilon" in line-item description → typeahead suggests pricebook items → SR selects model → unit price + cost pre-fills.
5. **Per cost-centre grouping.** Lines auto-group by cost-centre (Equipment / Labor / Materials / etc.) with sub-totals on PDF.
6. **Per-cost-centre tax codes.** Equipment lines get HST 13%; Labor lines get HST 13%; Materials lines get HST 13%; (in BC: Equipment gets GST 5% + PST 7%, Labor gets GST 5% only). Per Canadian compliance.
7. **Tier discount auto-applied.** Platinum tier client → 10% automatic discount visible in pricing summary.
8. **Holdback calculation.** Project Quote $100k for client with holdback config 10% Excl 45d → quote total shows $100k + tax, holdback $10k released at 45d post-completion, immediate due $90k + tax.
9. **Service Contract Quote.** SR creates Service Contract Quote with monthly recurring billing → acceptance generates service_contracts row + first invoice scheduled.
10. **Quote creation while client On Stop blocked.** Client on On Stop → quote create blocked at submit step with "Client on hold — release first" error.

### Functional — Approval workflow (11-16)

11. **Self-approve under threshold.** SR submits $3k quote → instant self-approve → ready to send.
12. **Route to PM (value threshold).** SR submits $20k quote → routes to assigned PM queue → PM approves → ready to send. Audit captures chain.
13. **PM approval + margin review.** SR submits $30k quote at 12% margin → routes to PM with "margin review required" tag (under 15%) → PM can approve / conditionally approve / reject.
14. **Route to Admin (value > $50k).** SR submits $75k → routes past PM directly to Admin queue.
15. **Discount threshold approval.** SR applies 15% discount on $10k quote → routes to PM (discount 10-25% range) even though value is under SR self-approve threshold.
16. **Conditional approval.** PM conditionally approves with note "Approved if SR adds installation insurance line" → SR adds line → re-submits → auto-approved (conditions met).

### Functional — Send & track (17-24)

17. **Send via email.** Approved quote → Send → recipient picker → custom message → Send button → email delivered with tracking link.
18. **Immutable snapshot on send.** Line items, pricing, T&C captured at send. Subsequent edits to draft only (not sent version).
19. **PDF eight-layer protection.** Download quote PDF triggers force-reauth + watermark + audit row + 24h signed URL.
20. **Client portal access.** Client clicks tracking link → portal loads → views quote → quote_views row written.
21. **E-signature capture.** Client clicks Accept → signs touch screen → signature, IP, timestamp captured in quote_acceptance_records (append-only).
22. **Multiple views logged.** Client views quote 3 times → 3 quote_views rows captured with separate timestamps + IPs.
23. **Reminder send.** Quote sent 7 days ago, not viewed → SR clicks Reminder → email re-sent with same tracking link.
24. **Reject by client.** Client clicks "Reject" on portal → reason field → status moves to Rejected → SR notified.

### Functional — Conversion (25-28)

25. **Convert to Project.** Accepted quote → Convert button → wizard pre-fills project (client, site, phases from cost-centres, line items as scopes) → project created → original quote locked (read-only) → originating_quote_id FK set.
26. **Service Quote to Job.** Accepted Service Quote converts to single job (not full project) with job_originating_quote_id FK.
27. **Service Contract Quote to recurring billing.** Accepted Service Contract Quote → service_contracts row + first invoice scheduled per billing cycle.
28. **Locked quote post-conversion.** Converted quote is read-only. Edit attempts blocked. Revision attempts blocked. New quote required for changes.

### Functional — Versioning (29-32)

29. **Create revision pre-binding.** Quote in Sent status, not accepted → Revise button → new version created → SR edits → re-submits → both versions in history.
30. **Revision blocked post-binding.** Quote in Binding status → Revise blocked.
31. **What changed summary.** Revision 2 vs Revision 1 shows: "Line item 3 qty changed 4→6; Line item 7 added; Total +$2,500."
32. **Version-at-send snapshot retained.** Each version sent captures its own line-items + pricing + T&C snapshots. Client sees the version they clicked.

### Functional — Pricing, discount, tax, holdback (33-40)

33. Line-item discount calculation.
34. Total discount calculation.
35. Mixed line + total discount logic.
36. Tax computation per line.
37. Holdback subtraction from immediate due.
38. Currency display per quote currency.
39. Per-cost-centre subtotals.
40. Grand total recalculation on any change.

### Functional — Permissions (41-46)

41. **SR sees own quotes only.** SR loads /quotes → list filtered to own.
42. **PM team-scoped view.** PM loads /quotes → list includes own + team's SRs' quotes.
43. **Margin visibility — default.** SR loads /quotes/[id]/pricing → margin column hidden. A/PM see margin.
44. **Margin visibility — granted.** Admin grants SR `quotes:viewMargin` override → SR sees margin column.
45. **Approval queue scope.** PM sees only quotes routed to them. Admin sees all.
46. **PDF download SR scope.** SR can download own quote PDFs only. PM can download team's. Admin all.

### Functional — Eight-layer print protection (47-49)

47. **Force-reauth on PDF download.** PDF download triggers password re-entry.
48. **Watermark visible.** Generated PDF has diagonal watermark with downloader name + timestamp.
49. **Audit row on download.** PDF download writes audit row with user, quote, IP, timestamp.

### Functional — Performance (50-52)

50. **List 500 quotes.** Loads <2s with all filters applied.
51. **Add 50 line items.** Line-item editor handles 50 lines without UI lag.
52. **PDF generation.** Quote PDF generated <3s server-side.

---

═══════════════════════════════════════════════════════════════════
# Modules 6-13: pending walk
═══════════════════════════════════════════════════════════════════

Walked in subsequent sessions. Same 14-subsection rubric.
Cross-cutting commitments from Modules 1+2+3+4+5 propagate.

- §6 — Projects (major; consumes Quote conversion)
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

*Running count: ~580 actions across 5 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5).*

## 100. Final sidebar tree

*Locked through Session D — see §0.7.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*37 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5).*

## 103. Cumulative acceptance criteria

*~230 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5).*

---

**End of v0.6.** Modules 1 + 2 + 3 + 4 + 5 complete and operator-validated.
Modules 6-13 pending. First revenue module (Quotes) scoped with three
quote types, online portal acceptance flow, immutable send snapshots,
eight-layer print protection on revenue PDFs, T&C auto-composition,
and value+discount threshold approval routing. Cross-cutting
commitments from Sessions C + D + E + F + G propagate forward.

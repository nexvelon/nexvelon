# NEXVELON_FEATURE_AUDIT.md

> **Comprehensive feature audit + sidebar expansion.** The scoping
> pass that lands before the permissions module is designed,
> because permissions design depends on the full action vocabulary
> across every module. Designing the ACL against an incomplete map
> guarantees a retrofit — exactly the migration cost
> `NEXVELON_PRINCIPLES.md` §1 (data preservation) is built to avoid.
>
> See `NEXVELON_ROADMAP.md` item 1 for the queue position;
> `NEXVELON_PRINCIPLES.md` §2 (granular permissions) + §6
> (extensibility & customization) for the design constraints this
> doc operationalises.
>
> A new Claude Code session reads, in order:
>   1. `NEXVELON_PRINCIPLES.md` — the six non-negotiables.
>   2. `CLAUDE_CONTEXT.md` "Current Session State" block.
>   3. `NEXVELON_SESSION_<latest>_HANDOFF.md`.
>   4. `NEXVELON_ROADMAP.md`.
>   5. **This file** — feature audit + sidebar expansion.
>
> **Status:** v0.2 — Module 1 (Clients + Sites + Contacts) fully
> scoped through Session C operator design pass. Modules 2-13
> walked in subsequent sessions following the same rubric.

---

## 0. How to use this document

The audit is a per-module worksheet. **The same fourteen subsections
for every module**, so the permissions design pass (ROADMAP item 2)
can iterate over the doc programmatically and so nothing slips
through.

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

Through Session B + C:

1. **Role default + bidirectional per-user override.** Effective
   permission = role default ∪ user-added − user-subtracted.
2. **Three UI states per gated control:** hidden / disabled /
   interactive.
3. **Fine-grained by default.** Split when in doubt.
4. **Lookup-table rows carry behavior bindings, not just labels.**
   Tier rows carry SLA + discount + payment terms; Status rows
   carry workflow gates; Type rows carry quote-template defaults.
   Extends PRINCIPLES §6: lookups are operational config, not
   decorative.
5. **Guided creation, never lazy creation.** Every "+ Add" lookup
   flow is a wizard: identity → smart defaults inherited from
   closest existing row → behavior bindings → workflow rule
   inheritance → preview → save. New rows fully operational at
   save time.
6. **Ten dimensions of permission control** per §1.12 — role
   definition, per-user override, data scope, field-level
   visibility, action gates, approval workflows, system policy,
   UI presentation, audit visibility, lookup/template management.
7. **Contractual integrity exception to bidirectional override:**
   `clients:overrideSlaResponseTime` is Admin-only and cannot be
   granted via per-user override.
8. **Versioned T&C clauses.** Already-sent quotes retain their
   clause version; edits affect only new quotes.
9. **Eight-layer print protection** for sensitive PDFs — see §1.6.
10. **Comprehensive logging visibility** per PRINCIPLES §4 — every
    change writes an audit row; visibility via per-record audit
    tab, system-wide activity feed, per-user activity report,
    notification rules driven by audit, 7-year retention.

---

## 0.5 Baseline gaps surfaced before the walk

### Gap 1 — Runtime matrix much smaller than UI catalog
Runtime: ~11 actions × 10 resources. UI catalog: ~85 perms, ~18
enforced, ~67 stubs. Permissions build reconciles.

### Gap 2 — No route-level permission gates
Only auth gates exist. URL guessing bypasses sidebar. Add via
middleware or per-module layouts.

### Gap 3 — Sidebar binary, not three-state
No "hidden" branch. Per-route hide-vs-disable call needed during
design pass.

### Gap 4 — Field visibilities and data scopes unwired
`FIELD_VISIBILITIES` and `DATA_SCOPES` exist as types only; no
runtime enforcement.

### Gap 5 — Bidirectional per-user override not modeled
Pure role-based today. No per-user grant data. Must support
additive AND subtractive overrides.

---

## 0.6 Walk order

1. **Clients + Sites + Contacts** *(complete — this section)*
2. Users + Permissions
3. Settings
4. Dashboard
5. Quotes
6. Projects
7. Inventory
8. Vendors
9. Invoices
10. Subcontractors
11. Financials
12. Scheduling
13. Reports

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
per-client, because property management firms have different
service expectations at different buildings. Banking, payment
terms, holdback, credit configuration, and onboarding gates attach
at the client level. Onboarding gates auto-inject T&C language
into quotes via clause-per-gate composition.

## 1.2 Sidebar surface

**Current:** "Clients" top-level; Sites + Contacts inside detail.

**Proposed:**
- **Clients** stays top-level
- **Contacts (global)** added — sidebar entry OR global search
  affordance (operator decides — §1.13)
- **Sites (global)** NOT top-level

**Badge logic:** count of clients with active issues — slow-pay
watch, contract renewal in 30 days, insurance lapse, overdue
invoices, On Stop, SLA expiring. Operator-configurable in Settings.

**Three-state:** VO/Tech/Sub disabled (greyed); custom roles with
zero clients permissions hidden.

## 1.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/clients` | List view | `clients:viewList` |
| `/clients/new` | Create drawer | `clients:create` |
| `/clients/[id]` | Detail (Overview) | `clients:viewDetail` |
| `/clients/[id]/sites` | Sites tab | `sites:view` |
| `/clients/[id]/sites/[siteId]` | Site detail | `sites:view` |
| `/clients/[id]/sites/[siteId]/equipment` | Installed equipment | `sites:viewEquipment` |
| `/clients/[id]/sites/[siteId]/access` | Gate/alarm codes | `sites:viewAccess` |
| `/clients/[id]/sites/[siteId]/sla` | SLA (active + history) | `slas:view` |
| `/clients/[id]/sites/[siteId]/service-contracts` | Recurring plans | `service_contracts:view` |
| `/clients/[id]/contacts` | Contacts tab | `contacts:view` |
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
| `/contacts` *(proposed)* | Global directory | `contacts:globalSearch` |

## 1.4 Resources

### Owned tables

**Core:** `clients`, `sites`, `contacts`, `contact_site_links`
(M:N), plus per-entity `*_custom_field_definitions` and
`*_custom_field_values`.

### Client schema (expanded)

**Identity:** `entity_type` (Company/Individual), `common_name`,
`legal_name`, `legal_first_name`, `legal_last_name`, `client_code`
(auto-generated; UI label "Client ID"), `logo_url`.

**Classification:** `customer_type_id`, `client_status_id`,
`tier_id`, `industry_id`, `lead_source_id`, `currency_id`,
`language_id`, `time_zone`.

**Contact:** `business_phone`, `alt_phone`, `fax`, `general_email`,
`website`, `cra_business_number`.

**Location:** `addr_line1`, `addr_line2`, `city`, `province`,
`postal_code`, `country`. Coords captured for mapping.

**Billing address:** same fields with `billing_` prefix;
`billing_same_as_location` flag.

**Banking (encrypted at rest):** `bank_account_name`,
`routing_number`, `bank_account_number`.

**AR/Credit:** `credit_limit`, `on_stop`, `on_stop_reason`,
`on_stop_at`, `on_stop_by_user_id`, `payment_method_id`,
`payment_terms_days`, `payment_terms_basis`.

**Holdback:** `holdback_applies`, `holdback_pct` (default 10%),
`holdback_tax_basis` (Excl/Incl), `holdback_release_days`
(default 45 — Ontario).

**PO:** `po_required`, `default_po_format`.

**Late fee:** `late_fee_pct`, `late_fee_compounding` (monthly/
yearly), `late_fee_grace_days`, `late_fee_auto_apply`.

**Response time fallback:** `response_time_id` (used only if no
site-level SLA + no site-level response time set).

**Notes:** `internal_notes`, `risk_tags[]`.

**Account:** `account_manager_user_id`.

**Onboarding:** `onboarding_requirements_set_at`.

**Standard:** `id`, `created_at`, `created_by`, `updated_at`,
`updated_by`, `deleted_at`.

### Site schema (additions)

- `response_time_id` (overrides client-level when set)
- `active_sla_id` (FK; null if none)
- Access fields (gate_code, alarm_code, key_location,
  on_arrival_contact_id) — encrypted at rest

### New tables introduced by Module 1

- `service_level_agreements` (FK to **site_id** — per-site SLAs)
- `sla_response_overrides` (Admin override audit trail)
- `service_contracts` (recurring service plans, per site)
- `onboarding_gate_types` (master list of possible gates + T&C
  clause text per gate)
- `client_onboarding_requirements` (per-client: required / waived
  / optional per gate type)
- `onboarding_gate_fulfillments` (status per client-gate)
- `communication_log` (emails/calls/SMS per client)

### Status lookup tables (each row carries behavior bindings)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `client_statuses` | Lead, Prospect, Active, Inactive, Archived | quote/project/invoice allowed; auto-promote rules |
| `customer_types` | 16 industry-flavored values: Charity and social work, Commercial real estate, Condo, Construction, Facility Services, Financial Institutions, Food, Health Care, IT and Technology, Power and Infrastructure, Retail and Office, Transportation, TV and Film Production, Residential, Government, Other | default quote template, form variant, panel-cert req |
| `client_tiers` | Diamond, Platinum, Gold, Silver, Bronze | SLA default, discount %, payment terms, credit limit, AM-required flag, notify rules, channel |
| `site_statuses` | Active, Inactive, Under Construction, Decommissioned | scheduling eligibility |
| `site_types` | Office, Warehouse, Retail, Industrial, Multi-Family, SFR, etc | default equipment template |
| `contact_roles` | Primary, Billing, Technical, Site Manager, Decision Maker | M:N per contact-site link |
| `response_time_types` | Emergency (1hr 24/7), Type A Same Day, Type B Next Day, Type C This Week, Type D Recurring when in area | max hours, 24/7 flag, escalation rules |
| `payment_methods` | EFT, Cheque, CC, Wire, PAD, ACH, Cash, On Account | label only |
| `payment_term_basis` | from_invoice, after_eom, cod, last_day_of_month | calculation rule |
| `lead_sources` | Referral, Cold call, Web, Trade show, Repeat, Partner, Other | reporting tag |
| `currencies` | CAD, USD | symbol, decimals, ISO |
| `languages` | en, fr | locale, default PDF templates |
| `sla_statuses` | Draft, Active, Expired, Terminated | enforce flag |
| `service_contract_statuses` | Draft, Active, Expired, Cancelled, Renewed | billing trigger |
| `onboarding_gate_types` | Insurance Cert, MSA, Deposit, Credit App, T5018, W9, Bond Letter, NDA, BG Check | T&C clause text, default-required-at-tier, expiry tracking |

All editable via guided-creation wizards per §0.4 #5.

### Read by

Quotes (client_id, site_id, contact_id; active SLA for T&C ref;
onboarding requirements for T&C injection; On Stop for send block;
payment terms + holdback + PO for invoice calc); Projects
(client_id, site_id; quote.status must = Binding); Invoices;
Scheduling (site SLA → site response → client response → tier
default precedence); Service History (derived); Financials (AR
aging, holdback releases).

## 1.5 Actions

### Clients (~30 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `clients:viewList` | See list | A, PM, SR, Tech†, Acc, VO | — | — | Built |
| `clients:viewDetail` | Open detail | A, PM, SR, Tech†, Acc, VO | — | — | Built |
| `clients:create` | Add client | A, PM, SR | — | `client_created` | Stub |
| `clients:editBasic` | Names, type, status | A, PM, SR | — | `client_updated` | Stub |
| `clients:promoteStatus` | Lifecycle status change | A, PM, SR | — | `client_status_promoted` | Not yet |
| `clients:editAddress` | Addresses | A, PM, SR | — | `client_address_updated` | Not yet |
| `clients:editBilling` | Terms, credit, etc. | A, Acc | Y | `client_billing_updated` | Not yet |
| `clients:viewBankingDetails` | See routing/account | A, Acc | Y | `client_banking_viewed` | Not yet |
| `clients:editBankingDetails` | Edit banking | A, Acc | Y | `client_banking_updated` | Not yet |
| `clients:viewCreditInfo` | Credit limit, AR | A, PM, Acc | Y | — | Not yet |
| `clients:editCreditTerms` | Credit + late fee | A, Acc | Y | `client_credit_terms_updated` | Not yet |
| `clients:setOnStop` | Place on hold | A, Acc | — | `client_on_stop_set` | Not yet |
| `clients:releaseOnStop` | Release hold | A, Acc | — | `client_on_stop_released` | Not yet |
| `clients:editHoldback` | Holdback config | A, Acc | Y | `client_holdback_updated` | Not yet |
| `clients:editPoRequirement` | PO-required flag | A, Acc, PM | — | `client_po_req_updated` | Not yet |
| `clients:viewInternalNotes` | Team-only notes | A, PM, Acc | Y | — | Not yet |
| `clients:editInternalNotes` | Write notes | A, PM | Y | `client_internal_note_updated` | Not yet |
| `clients:editRiskTags` | Risk flags | A, PM, Acc | — | `client_risk_tag_changed` | Not yet |
| `clients:assignAccountManager` | Set AM | A, PM | — | `client_am_assigned` | Not yet |
| `clients:editResponseTime` | Client-level response | A, PM | — | `client_response_time_updated` | Not yet |
| `clients:overrideSlaResponseTime` | Override SLA response time | **A only — NO per-user override permitted** | — | `client_sla_response_overridden` | Not yet |
| `clients:archive` | Soft-delete | A, PM | — | `client_archived` | Stub |
| `clients:unarchive` | Restore | A | — | `client_unarchived` | Not yet |
| `clients:hardDelete` | Permanent delete | A | — | `client_hard_deleted` | Not yet |
| `clients:merge` | Merge duplicates | A, PM | — | `clients_merged` | Not yet |
| `clients:viewServiceHistory` | Historic jobs | A, PM, SR, Tech†, Acc, VO | — | — | Stub |
| `clients:viewQuoteHistory` | Historic quotes | A, PM, SR, Acc, VO | — | — | Not yet |
| `clients:viewProjectHistory` | Historic projects | A, PM, SR, Tech†, Acc, VO | — | — | Not yet |
| `clients:viewInvoiceHistory` | Historic invoices | A, PM, Acc | Y | — | Not yet |
| `clients:viewContracts` | Active contracts | A, PM, Acc, VO | — | — | Stub |
| `clients:viewDocuments` | Docs tab | A, PM, SR, Tech†, Acc, VO | — | — | Not yet |
| `clients:uploadDocument` | Attach file | A, PM, SR | — | `client_document_uploaded` | Not yet |
| `clients:deleteDocument` | Remove file | A, PM | — | `client_document_deleted` | Not yet |
| `clients:viewOnboardingRequirements` | See required gates | A, PM, Acc | — | — | Not yet |
| `clients:editOnboardingRequirements` | Configure gates | A, PM | — | `client_onboarding_requirement_changed` | Not yet |
| `clients:viewCommunicationLog` | See logs | A, PM, SR†, Acc | Y | — | Not yet |
| `clients:logCommunication` | Manual call/touchpoint | A, PM, SR | — | `client_communication_logged` | Not yet |
| `clients:editCustomFieldValues` | Fill fields | A, PM, SR | Y | `client_custom_field_updated` | Not yet |
| `clients:editCustomFieldDefinitions` | Define schema | A | — | `client_custom_field_def_updated` | Not yet |
| `clients:exportCsv` | Export list | A, PM, Acc | — | `clients_exported` | Not yet |
| `clients:importCsv` | Bulk import | A | — | `clients_imported` | Not yet |
| `clients:setUserVisibility` | Grant user view | A | — | `client_visibility_granted` | Not yet |
| `clients:viewAuditLog` | Audit tab | A, PM | — | — | Not yet |

### Sites (~15 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `sites:view` | See sites | A, PM, SR, Tech†, Acc, VO | — | — | Not yet |
| `sites:create` | Add site | A, PM, SR | — | `site_created` | Not yet |
| `sites:editBasic` | Name, addr, type | A, PM, SR | — | `site_updated` | Not yet |
| `sites:editResponseTime` | Site response | A, PM | — | `site_response_time_updated` | Not yet |
| `sites:viewEquipment` | Installed eq | A, PM, SR, Tech†, Acc, VO | — | — | Not yet |
| `sites:editEquipment` | Add/edit eq | A, PM, Tech† | — | `site_equipment_updated` | Not yet |
| `sites:viewAccess` | Gate/alarm codes | A, PM, Tech† | Y | `site_access_viewed` (read-audit exception) | Not yet |
| `sites:editAccess` | Edit codes | A, PM | Y | `site_access_updated` | Not yet |
| `sites:viewServiceContract` | See contracts | A, PM, Acc | Y | — | Not yet |
| `sites:editServiceContract` | Edit plans | A, PM, Acc | Y | `site_service_contract_updated` | Not yet |
| `sites:archive` | Soft-delete | A, PM | — | `site_archived` | Not yet |
| `sites:transferToClient` | Move between clients | A | — | `site_transferred` | Not yet |
| `sites:viewServiceHistory` | Historic jobs | A, PM, SR, Tech†, Acc, VO | — | — | Not yet |
| `sites:editCustomFieldValues` | Fill fields | A, PM, SR, Tech† | Y | `site_custom_field_updated` | Not yet |
| `sites:editCustomFieldDefinitions` | Define schema | A | — | `site_custom_field_def_updated` | Not yet |

### Contacts (~12 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `contacts:view` | See contacts | A, PM, SR, Tech†, Sub†, Acc, VO | — | — | Not yet |
| `contacts:create` | Add | A, PM, SR | — | `contact_created` | Not yet |
| `contacts:editBasic` | Name/phone/email | A, PM, SR | — | `contact_updated` | Not yet |
| `contacts:editPreferredChannel` | Channel pref | A, PM, SR, Tech† | — | `contact_preference_updated` | Not yet |
| `contacts:editDecisionAuthority` | Signer/influencer | A, PM, SR | Y | `contact_authority_updated` | Not yet |
| `contacts:archive` | Soft-delete | A, PM | — | `contact_archived` | Not yet |
| `contacts:linkToSite` | Attach to site | A, PM, SR | — | `contact_site_linked` | Not yet |
| `contacts:unlinkFromSite` | Detach | A, PM, SR | — | `contact_site_unlinked` | Not yet |
| `contacts:viewLinkedSites` | All sites | A, PM, SR, Acc, VO | — | — | Not yet |
| `contacts:globalSearch` | Cross-client search | A, PM, SR, Acc | — | — | Not yet |
| `contacts:editCustomFieldValues` | Fill fields | A, PM, SR | Y | `contact_custom_field_updated` | Not yet |
| `contacts:editCustomFieldDefinitions` | Define schema | A | — | `contact_custom_field_def_updated` | Not yet |

### SLAs (per-site, ~8 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `slas:view` | SLA details | A, PM, Acc | Y | — | Not yet |
| `slas:create` | New SLA for site | A | — | `sla_created` | Not yet |
| `slas:edit` | Edit draft | A | — | `sla_updated` | Not yet |
| `slas:uploadSignedDoc` | Attach signed PDF | A | — | `sla_signed_doc_uploaded` | Not yet |
| `slas:activate` | Draft → Active | A | — | `sla_activated` | Not yet |
| `slas:terminate` | Early termination | A | — | `sla_terminated` | Not yet |
| `slas:renew` | Next-term SLA | A | — | `sla_renewed` | Not yet |
| `slas:viewHistory` | Historic SLAs | A, PM, Acc | — | — | Not yet |

### Service contracts (~6 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `service_contracts:view` | See contracts | A, PM, Acc, SR†, VO | — | — | Not yet |
| `service_contracts:create` | Create plan | A, PM | — | `service_contract_created` | Not yet |
| `service_contracts:edit` | Edit terms | A, PM | — | `service_contract_updated` | Not yet |
| `service_contracts:viewBilling` | Contract value | A, PM, Acc | Y | — | Not yet |
| `service_contracts:cancel` | Cancel plan | A, PM | — | `service_contract_cancelled` | Not yet |
| `service_contracts:renew` | Renew | A, PM | — | `service_contract_renewed` | Not yet |

### Onboarding gates (~7 actions)

| ID | Description | Default | F? | Audit | Status |
|---|---|---|---|---|---|
| `onboarding_gates:view` | Master list | A, PM, Acc | — | — | Not yet |
| `onboarding_gates:create` | New gate type | A | — | `onboarding_gate_type_created` | Not yet |
| `onboarding_gates:editClause` | T&C clause text | A | — | `onboarding_gate_clause_updated` | Not yet |
| `onboarding_gate_fulfillments:view` | Status per client | A, PM, Acc, SR | — | — | Not yet |
| `onboarding_gate_fulfillments:submit` | Mark submitted | A, PM, SR | — | `onboarding_gate_submitted` | Not yet |
| `onboarding_gate_fulfillments:approve` | Approve | A, PM | — | `onboarding_gate_approved` | Not yet |
| `onboarding_gate_fulfillments:reject` | Reject | A, PM | — | `onboarding_gate_rejected` | Not yet |

**Module 1 total: ~110 actions.**

## 1.6 Views

### Client create / edit drawer (sectioned)

Multi-section sheet, conditional on entity_type.

**Section 1 — Identity:** Top toggle Company / Individual.
- If Company: Common Name, Legal Name, Website, CRA BIN, Industry,
  Customer Type, Tier
- If Individual: Legal First Name, Legal Last Name, Preferred
  Name, Customer Type (defaults Residential), Tier
- Always: Time zone (auto-detect), Language, Currency, Lead source,
  Logo upload (Company only), Client ID (auto-generated)

**Section 2 — Primary Contact (inline; creates first Contact):**
Name, role, phone (numeric-only masked), email. "+ Add another"
link.

**Section 3 — Location Address:** Autocomplete via OpenStreetMap
Nominatim. City/Province/Postal/Country auto-fill on selection;
"Enter manually" fallback link. Coordinates captured.

**Section 4 — Billing Address:** "Same as Location" toggle (default
ON). If OFF, same fields.

**Section 5 — Contact Info:** Business phone, Alt phone, Fax
(all numeric-only), General email.

**Section 6 — Status & Lifecycle:** Client status, Risk tags
(multi-select).

**Section 7 — Response Time:** Dropdown of response_time_types.
Read-only banner if covered by any site-level active SLA:
*"Response times set per-site by active SLAs."*

**Section 8 — Account Management:** Account Manager dropdown
(internal users, filtered by role).

**Section 9 — Banking & AR:**
- Bank account name, Routing #, Account # (encrypted display)
- Credit limit
- On Stop checkbox (with reason field appearing on check)
- Payment method dropdown
- Payment terms: two-part picker (days + basis) plus quick-selects
- Holdback: Applies?, %, Tax basis, Release days
- PO required, Default PO format
- Late fee %, Compounding, Grace days, Apply automatically

**Section 10 — Onboarding Requirements:** Per-gate toggle
(Required / Waived / Optional). Smart defaults from tier. Preview
of T&C language that will inject.

**Section 11 — Notes & Custom Fields:** Internal notes; any
operator-defined custom fields per §1.8.

### Client detail page

Header: name, type badge, status badge, tier badge, response time
/ SLA status, AM, revenue YTD, AR balance, **On Stop red banner if
active**.

Tabs (each independently three-state-gated): Overview / Sites /
Contacts / Quotes / Projects / Service History / Invoices /
Banking / Onboarding / Communication Log / Documents / Custom
Fields / Audit Log.

### Site detail page

Header: name, type, status, address, primary contact, last service,
**active SLA badge (color-coded)**, response time resolution
display showing precedence (SLA → site → client → tier).

Tabs: Overview / Equipment / **Access (hidden, not disabled, for
users without permission)** / SLA / Service Contracts / Service
History / Documents / Custom Fields.

### SLA management surface (per site)

Active SLA card with override button (Admin only — modal §1.12),
Renew button visible 90 days before expiry, Historical SLAs list
below.

### On Stop banner

Red banner on client detail when on_stop = true: *"⚠ ON CREDIT HOLD
— Released by Admin only — Reason: [reason] — Held since [date] by
[user]"*. Blocks UI affordances for downstream actions.

### Drawers/modals
Create-edit drawers for Client, Site, Contact. Modals: Merge
clients, Transfer site, Bulk import CSV, **Override SLA response
time** (Admin only).

### Dashboard widgets
Top clients by revenue (gated), AR aging summary, On Stop count,
SLAs expiring 60 days, Onboarding gates pending.

### Reports
Client list export, AR aging, Revenue ranking, SLA breach,
Holdback releases due, Onboarding completion rate.

### Eight-layer print protection (sensitive PDFs)
1. Server-side PDF only (never client-rendered)
2. Browser quote view styled as UI editor, not print-ready
3. Diagonal watermark on unapproved views (visible + prints)
4. `@media print { .protected-content { display: none } }` for
   unapproved status
5. Every render writes audit row
6. Every PDF download writes audit row
7. Email-from-system-only (Send action triggers server email)
8. Quote URLs not shareable (auth-gated routes)

## 1.7 Field-level treatment

**Clients:** creditInfo, bankingDetails (account # always masked),
internalNotes, riskTags, holdbackConfig, lateFeeConfig, commissions
(Phase 2).

**Sites:** accessCodes (encrypted + audit-on-read), serviceContractValue,
equipmentSerial.

**Contacts:** personalPhone, decisionAuthority.

**SLAs:** signedTerms, responseTimes.

**Total new visibility flags Module 1:** 14.

## 1.8 Custom-field surfaces

Per PRINCIPLES §6:

- **Clients:** drawer, list view (optional cols), detail header
  (KPI badges), filters, Quote PDF (`show_on_quote_pdf` flag),
  Invoice PDF, Reports, CSV exports
- **Sites:** drawer, list under client, detail header, filters,
  work-order PDF, commissioning checklist PDF, reports, exports
- **Contacts:** drawer, list, detail, filters, exports;
  `show_on_quote_pdf` for recipient block
- **SLAs:** drawer, detail, reports (e.g. "escalation contact")
- **Service contracts:** drawer, detail, billing reports

Managed in Settings → Custom Fields → [entity].

## 1.9 Status surfaces

(All detailed in §1.4 Resources. Summary: 15 lookup tables
introduced by Module 1; every row carries behavior bindings per
§0.4 #4 + #5; every "+ Add" flow uses guided-creation wizard.)

## 1.10 Cross-module relationships

**Read by Quotes** — client_id, site_id, contact_id; active SLA;
onboarding requirements; On Stop block; payment terms; holdback;
PO required.

**Read by Projects** — quote.client_id; quote.status must =
Binding; client.On Stop; site SLA.

**Read by Invoices** — billing config; site holdback balance;
contract references.

**Read by Scheduling** — site response time (precedence-resolved);
On Stop block; tech panel-cert vs site equipment.

**Read by Service History** — derived from Projects + Scheduling
on client_id.

**Read by Financials** — AR aging; holdback releases due; contract
revenue recognition.

**Events emitted:** `client.*`, `site.*`, `contact.*`, `sla.*`,
`service_contract.*`, `onboarding_gate.*`, `communication.logged`.

## 1.11 Competitive floor delta

- **Sedona Office** requires 4+ tabs for service history + finance
  + contracts + open quotes. Nexvelon: stacked in detail header.
- **ServiceTrade** has no global contact search. Nexvelon: ships
  `contacts:globalSearch` day one.
- **simPRO** / **ServiceFusion** one-to-one site/contact. Nexvelon:
  M:N via `contact_site_links`.
- Most competitors lack **field-level internal-notes separation**.
  Nexvelon: gated, never on PDFs.
- **Custom fields:** Sedona rigid; Wisetrack limited; simPRO paid
  tiers. Nexvelon: first-class on every entity, free, real-time
  editable.
- **Per-site SLAs with precedence resolution** (SLA → site → client
  → tier). Sedona: client-level only. ServiceTrade: flat field, no
  contractual enforcement. simPRO: supports SLAs but no
  override-with-warning audit. **Nexvelon's contractual integrity
  protection is genuinely unique.**
- **Site access codes** separately-gated, encrypted-at-rest,
  audit-on-read — none of the named competitors do this.
- **Onboarding gates with auto-injected T&C composition** — none
  of the named competitors do this. Every integrator gets bitten;
  Nexvelon closes the loop contractually.
- **Eight-layer print protection** — enterprise-grade defense-in-
  depth vs competitors' simple-permission approach.
- **Communication log** as native first-class.
- **Service contracts** separate from SLAs as first-class — most
  competitors conflate the two.

## 1.12 Permissions design implications

Input for ROADMAP item 2 (permissions design pass):

1. **`DATA_SCOPES` wiring critical.** SR/Tech/Sub default own-
   records-only. Override extends to data scope (specific record /
   user mirror / attribute / full).
2. **`FIELD_VISIBILITIES` extensions.** 14 new flags from Module 1.
3. **Bidirectional override UI complexity.** Senior SR granted
   `clients:viewCreditInfo` (additive) AND denied
   `clients:editInternalNotes` (subtractive) — both shown clearly.
4. **Audit-read exception.** `sites:viewAccess` reads audited
   (`site_access_viewed`). Permission model supports per-action
   "audit reads" opt-in flag.
5. **Encryption at rest** for site access codes and bank account
   numbers. pgcrypto + Supabase Vault.
6. **Three-state per tab** — every tab on `/clients/[id]`
   independently gated.
7. **Merge audit captures both sides** in jsonb metadata.
8. **Contractual integrity exception** —
   `clients:overrideSlaResponseTime` is Admin-only and CANNOT be
   granted via per-user override.
9. **Ten dimensions of permission control** (Session C):
   - Role definition (bundled perms per role)
   - Per-user override (add/remove on top of role)
   - Data scope (which records visible)
   - Field-level visibility (within a record)
   - Action gates (what operations)
   - Approval workflows (who approves what + thresholds)
   - System policy (2FA, session timeout, IP allowlist, device
     limit, force re-auth on sensitive actions)
   - UI presentation (sidebar show/hide, landing page, widgets)
   - Audit visibility (who reads logs)
   - Lookup & template management
10. **Approval delegation framework.** `quotes:approve` and similar
    support delegation rules: value cap + time bound.
11. **Time-bounded grants.** Per-user grants have `expires_at`.
    System auto-revokes on expiry.
12. **Guided creation wizard** — generic component design needed,
    each lookup type plugs in its own behavior-binding fields.
13. **Workflow rule data model.** v1 ships rules hardcoded with
    sensible defaults; Phase 2 expresses as data.
14. **Versioning** — clauses, T&C templates, SLA language all
    snapshot to quotes at send time.

## 1.13 Open questions

1. Global contacts directory: sidebar entry or search-only?
2. Gate code encryption: pgcrypto column-level OR Postgres-default?
   Recommend pgcrypto + Vault.
3. Contact-client multiplicity: one client OR multi-client?
   Recommend: one client; cross-client via `merged_with_id`.
4. Client merge mechanics: FK update vs pointer? Recommend: FK
   update + soft-delete + pointer.
5. Service history scope: completed projects only OR also one-off
   jobs? Recommend: both.
6. Site equipment: first-class table OR custom field? Recommend:
   first-class.
7. Risk tag values: pre-seeded OR operator-defined? Recommend:
   lookup table with seeded defaults.
8. Top-clients widget gating for SR: revenue too sensitive OR
   sales motivation? Operator decides.
9. Late fee compounding default: monthly OR yearly? Recommend:
   yearly with monthly compounding.
10. Holdback default: 10% / Exclusive / 45-day release (Ontario
    standard)?
11. Approval delegation v1: Admin-only with UI built but no
    defaults granted?
12. Service contract billing cycles seeded: Monthly, Quarterly,
    Semi-Annual, Annual?
13. SLA per-service-type: Phase 2 (site-level covers v1)?
14. Communication log v1: email auto-logged + manual call logging?
    Twilio Phase 2?

## 1.14 Acceptance criteria

QA bar for the Clients module build phase. Each scenario is a
functional, security, or performance test that validates the
build is correct.

### Functional — Client lifecycle (1-6)

1. **Create Company client end-to-end.** All sections fill; on
   save, client + primary contact records exist with correct FK;
   client_code auto-generated; audit row written; time zone
   auto-detected from address; currency defaults CAD.
2. **Create Individual client.** Toggle to Individual hides
   company name/website/BIN; shows legal first + last name. Save:
   entity_type = 'individual'; company fields null.
3. **Address autocomplete.** Type 3 chars → Nominatim suggestions
   <1s → click → city/province/postal/country auto-fill. "Enter
   manually" link works for misses.
4. **Phone numeric-only.** Cannot type non-digits; paste normalizes
   to digits; display formatted.
5. **Lead → Active conversion gate.** Quote approved on Lead. SR
   clicks Convert → modal prompts to promote → confirm → status
   update + audit + project create in single transaction.
6. **Workflow override.** Admin changes conversion-gate Setting
   from "Strict block" to "Auto-promote at approval." Next
   approval auto-promotes without modal. Workflow rule change
   audited.

### Functional — Banking & AR (7-13)

7. **Banking encryption.** Account # stored encrypted. SR (no
   perm) doesn't see field. Acc sees masked. Admin sees full.
8. **Credit limit + On Stop independent.** $50k limit + $48k AR
   → can take $1k quote. On Stop = true → cannot take any. Release
   → unblocked.
9. **On Stop blocks downstream.** quotes:send, quotes:convert,
   projects:create, scheduling:createJob all gated; red banner
   + tooltip.
10. **Payment terms two-part picker.** 21 + "After EOM" displays
    "Net 21 after EOM." COD quick-select renders correctly.
    Custom days (17) saves and displays.
11. **Holdback calculation.** $100k pre-tax, 13% HST, 10% Excl:
    holdback = $10,000. Incl: $11,300.
12. **PO Required blocks invoice.** po_required = true: SR sends
    invoice without PO → blocked. Add PO → unblocked.
13. **Late fee.** Invoice 30 days overdue, 24%pa monthly
    compounding, 5-day grace: fee = 2% on full amount, applied
    once 5+25 days overdue.

### Functional — SLA & Response Time (14-17)

14. **Per-site SLA precedence.** Site A active SLA (1hr emergency).
    Site B same client, no SLA, site response = Type B Next Day.
    Client response = Type C. Scheduling: Site A top, B mid, C
    lower.
15. **SLA override modal.** Admin changes response time on site
    with active SLA → modal pops, warning, required reason,
    duration → confirm → audit + red banner.
16. **Override auto-expiry.** Override "Until 2026-06-30." On
    2026-07-01 system auto-reverts, audits, notifies.
17. **Non-Admin SLA override blocked.** PM granted
    `clients:overrideSlaResponseTime` via per-user additive →
    still blocked. Contractual exception holds.

### Functional — Onboarding gates & T&C (18-21)

18. **Gate selection auto-composes T&C.** One gate Required → one
    clause in PDF. Three gates → three clauses numbered.
19. **Gate clause versioning.** Quote sent with clause v1. Admin
    edits to v2. Re-download original quote → still v1. New quote
    uses v2.
20. **Gate fulfillment → Binding status.** All required gates
    approved → quote auto-promotes Sent → Binding. Convert-to-
    project now permitted.
21. **Tier-driven gate defaults.** Bronze defaults all gates
    Required. Diamond defaults Insurance only Required. New
    client inherits.

### Functional — Permissions / 10 dimensions (22-36)

22. **Role default.** Fresh SR: views list/details, creates,
    edits basic. Cannot: view banking, set On Stop, override SLA,
    view financial KPIs.
23. **Additive override.** Admin grants John (SR)
    `clients:viewCreditInfo`. John sees; others don't.
24. **Subtractive override.** Admin removes `clients:editBasic`
    from Jane (SR). Jane views but can't edit. Other SRs can.
25. **Time-bounded grant.** John granted bank visibility until
    2026-06-30. On 2026-07-01 auto-revokes.
26. **Data scope: own records.** Sarah sees own. Admin grants one
    of John's → appears with "shared" tag.
27. **Data scope: user mirror.** Sarah mirrors John → sees all of
    John's.
28. **Field visibility.** PM sees cost. SR doesn't. PM denied
    `visibility.cost` → loses cost column.
29. **Approval workflow.** SR submits → PM sees queue → Approve
    → quote Approved. Both events audited.
30. **2FA enforcement.** Admin sets Acc 2FA required. Existing
    Accs forced 2FA enrollment on next login.
31. **Session timeout.** SR session = 8h. Idle 8h+1min →
    redirect to login. PM session = 7d.
32. **Force re-auth on print.** Quote PDF download re-prompts
    password.
33. **Hidden vs disabled sidebar.** SR no `financials:view`:
    item absent. SR has view but no `financials:viewPL`:
    item present, P&L tab hidden inside.
34. **Audit visibility.** Admin reads system-wide. PM reads
    Clients + Projects audit. SR cannot read at all.
35. **Tier wizard.** Admin clicks "+ Add Tier" → wizard:
    identity → smart defaults from Platinum → bindings →
    workflow → preview → save. Diamond appears in dropdowns
    next page load. Audited.
36. **Gate creation.** Admin creates "Bond Letter" gate with
    clause text. Next quote for client with this gate Required
    auto-injects.

### Functional — Logging visibility (37-41)

37. **Per-record audit tab** on every entity. Reverse-chronological
    feed. Rows expand to before/after.
38. **System-wide activity feed.** Settings → Activity Log:
    chronological, filterable by user/date/entity/action/IP.
39. **Per-user activity report.** Settings → Users → John →
    Activity: all John's actions.
40. **Notification rule from audit.** "Alert me on client delete."
    SR deletes → Admin emailed immediately; both events audited.
41. **Audit immutability.** DB admin UPDATE on audit_log → RLS
    rejects. No code path modifies historical entries.

### Functional — Print protection (42-45)

42. **Approved quote PDF.** Server generates with letterhead;
    auth-gated download; audit row; no watermark.
43. **Draft print attempt.** SR Ctrl+P draft → blank page +
    "not approved for printing" message; view audited.
44. **Draft watermark.** Diagonal "DRAFT — NOT FOR DISTRIBUTION
    — [user] — [timestamp]" visible; prints even if CSS bypassed.
45. **Email-from-system-only.** SR cannot attach PDF to personal
    email; only system "Send" action dispatches.

### Performance (46-49)

46. **Client list load.** 1000 clients → /clients renders <2s;
    filter/sort <500ms.
47. **Autocomplete latency.** Nominatim suggestions <1.5s after
    last keystroke.
48. **Audit search.** 100k rows, filtered, first page <2s.
49. **Concurrent SLA overrides.** Two Admins simultaneous → second
    sees "already overridden by [other] at [time]" message; one
    row persists.

### Security (50-54)

50. **SQL injection** suite passes on autocomplete, search, custom
    field values.
51. **XSS in custom fields.** `<script>` in label renders as text
    everywhere.
52. **Privilege escalation.** SR crafted API call to grant himself
    `clients:hardDelete` → blocked at perms check.
53. **Banking data leakage.** Network tab never shows full
    account_number in SR session.
54. **SLA override impersonation.** SR crafted API call to
    override SLA → blocked even if `clients:overrideSlaResponseTime`
    granted (contractual exception).

---

═══════════════════════════════════════════════════════════════════
# Modules 2-13: pending walk
═══════════════════════════════════════════════════════════════════

Walked in subsequent sessions. Same 14-subsection rubric. Each
module will be substantial but most less deep than Module 1 —
Clients was the calibration walk where the rubric was proved and
many cross-cutting commitments (ten dimensions, SLA precedence, T&C
composition, eight-layer print protection, guided creation wizards,
behavior-bound lookups) were captured for application across every
subsequent module.

- §2 — Users + Permissions
- §3 — Settings
- §4 — Dashboard
- §5 — Quotes
- §6 — Projects
- §7 — Inventory
- §8 — Vendors
- §9 — Invoices
- §10 — Subcontractors
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
*Populated after all 13 modules walked.*

## 101. Module dependency graph
*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications
*Populated after all 13 modules walked.*

## 103. Cumulative acceptance criteria
*Populated after all 13 modules walked.*

---

**End of v0.2.** Module 1 complete and operator-validated through
Session C. Modules 2-13 pending. Cross-cutting commitments from
Module 1 propagate forward.

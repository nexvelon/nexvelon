# NEXVELON_ROADMAP.md

> **All known deferred work.** What's coming next, in order. Each item
> has the v1 acceptance bar baked in — so when the time comes, there's
> no re-debate about scope.
>
> A new Claude Code session reads, in order:
> `NEXVELON_PRINCIPLES.md` → `CLAUDE_CONTEXT.md` "Current Session State"
> block → `NEXVELON_SESSION_<latest>_HANDOFF.md` → **this file** for
> next-up work → any task-specific doc.
>
> When an item ships, MOVE its description into the corresponding
> session handoff doc's "what shipped" section and DELETE it from this
> file. Don't strike-through, don't comment out — the roadmap is for
> work that is still ahead.

---

## Sequence (in order — do not re-order without an explicit decision)

1. **Comprehensive feature audit + sidebar expansion** *(next scoping
   pass, before any module build)*
2. **Permissions module — design pass**
3. **Permissions module — build**
4. **Quotes v1**
5. **Projects v1**
6. **Inventory v1**
7. **Vendors v1**
8. **Invoices v1**
9. **Subcontractors v1**
10. **Financials v1**
11. **Scheduling v1**
12. **Reports v1** *(parallel-able after at least Quotes + Projects
    ship — needs real data to surface)*

Each module ships fully per §6 of `NEXVELON_PRINCIPLES.md`. No
"module lite." If a v1 can't meet the bar, it stays in this file.

---

## 1. Comprehensive feature audit + sidebar expansion

**What:** A scoping pass across the entire suite before the permissions module is designed. Walk every module surface, enumerate the actions a real security-systems integrator needs, surface anything the current navigation hides or fragments.

**🏁 COMPLETE as of Session O (2026-05-12):** All 13 of 13 modules walked through Sessions C-O. `NEXVELON_FEATURE_AUDIT.md` v0.14 is the final audit document. Total: ~1260 cumulative actions, 76 permissions design implications, ~594 acceptance criteria, 13 cross-cutting commitments locked (§0.4 #1-13), 140+ owned tables across all modules, 80 status surfaces with behavior bindings. M13 (Reports): ~55 actions, 7 new tables, 4 status surfaces, ~40 standard library cross-module reports across 7 categories, operator-defined custom reports via copy-and-modify (full builder Phase 2), scheduled delivery via email + in-app, saved report snapshots immutable per §0.4 #10, permission-aware queries end-to-end, multi-language (en + fr), eight-layer print on sensitive reports, source-back traceability for financial reports. Audit file management: v0.14 condenses M1-M12 sections to headline stats; full content preserved in git history at noted commit hashes. **Next phase: Permissions module design pass (item 2).**

**Why first:** Permissions design depends on the action vocabulary. Designing the ACL before knowing the full set of actions guarantees a retrofit later — exactly the migration cost `NEXVELON_PRINCIPLES.md` §1 (data preservation) is designed to avoid.

**Deliverable:** `NEXVELON_FEATURE_AUDIT.md` — fully populated with all 13 module sections + the consolidated action vocabulary + final sidebar tree + module dependency graph + cumulative permissions design implications + cumulative acceptance criteria.

---

## 2. Permissions module — design pass

**🚧 IN PROGRESS as of Session X (2026-05-12):** Pass 9 of 11 complete. `NEXVELON_PERMISSIONS_DESIGN.md` v0.9. Pass 1-8 condensed to one-paragraph summaries each (more compact than prior versions). Pass 9 (Effective-Permissions Caching Strategy) full content §16-§28. Four caches with detailed invalidation trigger architecture (8 event types across 4 cache tables). Lazy-fill pattern. Warm-up patterns (on login + grant change). Stale-while-revalidate <5min for dashboard widgets only. Eviction (daily expiry + weekly cleanup). Size budgets across 4 scale tiers. Read-replica capability ready (primary-only v1 default). Multi-tenant Phase 2 prep. Observability (8 metrics + 4 alerts). Recovery patterns + failure modes. Three architectural decisions: pull invalidation; single table partition-ready; read-replica capability. 7 Pass 9 open questions resolved. Migration order extended +8 steps (now 53 total). Pending: Pass 10 (Cross-cutting enforcement), Pass 11 (Migration plan).

**What:** A written design doc for the per-user, per-feature ACL
described in `NEXVELON_PRINCIPLES.md` §2. Covers the data model,
storage model for per-user overrides, three UI states
(hidden/disabled/interactive), Admin override UX, and field-level
permission storage (per §6 of PRINCIPLES).

**Why ahead of build:** the permissions data model is the substrate
every other module sits on. Getting it wrong means every subsequent
module ships against a moving target. Design first, get sign-off,
build second.

**Deliverable:** A doc (`NEXVELON_PERMISSIONS_DESIGN.md`) covering:
DB schema (likely `permissions` + `user_permission_overrides` +
`field_permissions`), API contract (`assertCan`, `useCan`,
`useFieldCan`), middleware integration, sidebar disabled-state
rendering, audit-log shape for permission grants/revokes, and the
migration strategy for replacing the current static `lib/permissions
.ts` matrix.

**Inputs from Session C** (in addition to the audit's action vocabulary):
- Ten-dimensional control model (role / per-user / data scope / field / action / approval / system / UI / audit / lookup mgmt)
- Contractual integrity exception for `clients:overrideSlaResponseTime` (cannot be granted via per-user override)
- Eight-layer print protection requirements
- Per-action "audit reads" opt-in flag (for `sites:viewAccess` and similar high-sensitivity reads)
- Time-bounded grants with `expires_at` auto-revocation
- Approval delegation framework with value caps + time bounds
- Field-level encryption-at-rest for sensitive fields (gate codes, bank account numbers) via pgcrypto + Supabase Vault
- Three-state per-tab gating on detail pages (hidden / disabled / interactive)

**Inputs from Session D** (additions from Module 2 walk):
- Effective-permissions caching pattern (sub-10ms checks via `effective_permissions_cache` jsonb column)
- Request-admin-access workflow with auto-expiry
- Six-tab permissions editor structure per `/employees/[id]/permissions`
- Certification-driven scheduling auto-match with critical flag
- Multi-territory model (Primary/Secondary/Relocation per Salesforce pattern)
- Resource Absences with approval workflow + scheduling block
- Phase 2 deferrals locked: SSO/SAML, API tokens, role hierarchy, multi-company, crews, two-tier permissions

**Inputs from Session E** (additions from Module 3 walk):
- Settings as configuration spine (Module 3) — defines which lookups, templates, workflow rules, security policies are operator-editable
- 27 cumulative permissions design implications
- Settings change preview pattern for behavior-binding changes
- API key scoped permissions model (each key carries action allowlist)
- OAuth token encryption-at-rest pattern in Supabase Vault
- Workflow rule versioning (already-running executions carry rule version)
- Per-user display format override pattern

**Inputs from Session F** (additions from Module 4 walk):
- UI presentation as 10th dimension of permission (sidebar + dashboard layout + landing page)
- Three-way widget visibility gate pattern
- Per-user dashboard layout customization with role default override
- Code-defined widget catalog (operators don't add new widget types at v1)
- Per-user landing page choice
- Permission-aware widget data queries with drill-through respecting source-module permissions

**Inputs from Session G** (additions from Module 5 walk):
- Field-level margin visibility pattern (separating who-can-do from what-they-see)
- Value + discount threshold approval routing with AND logic
- Immutable snapshot pattern at quote send time
- Online portal signed URL scoped to single quote (not general access tokens)
- Append-only acceptance records with one-way signature hash
- Quote → Project conversion lock pattern (source becomes read-only)
- Per-cost-centre tax code support (Canadian split-tax compliance)

**Inputs from Session H** (additions from Module 6 walk):
- Three-state costing pattern (Estimated/Committed/Actual) with real-time forecast
- Change order amendment versioning tied to original quote_terms_snapshot
- Commissioning record immutability with one-way photo evidence hash
- Handover warranty term snapshot at sign-off
- Project document customer-facing visibility flag for portal access
- Lien deadline tracking integration with AR/Financials
- Project margin visibility field-level pattern (A/PM default; SR per-user override)

**Inputs from Session I** (additions from Module 7 walk):
- Append-only ledger pattern (no UPDATE/DELETE; reversals create new entries)
- Serial number append-only history pattern
- FIFO layer immutability for cost integrity
- Multi-location stock visibility scoping (Tech sees own truck/van only)
- Vendor catalog sync conflict resolution as permission-gated action
- Photo evidence capture pattern for receive flows (extending commissioning pattern)
- PO approval threshold separate from quote/CO thresholds
- Project-reserved stock locking enforcement at quote acceptance

**Inputs from Session J** (additions from Module 8 walk):
- Banking encryption-at-rest with audit-on-read pattern extends from M1 clients to M8 vendors
- T5018 YTD as gated field requiring A/Acc only (tax-sensitive)
- Auto-degrade workflow pattern (performance triggers preferred-status removal)
- Vendor-side T&C composition extending clause-per-gate pattern from clients
- Cross-link flag pattern (is_also_contractor) for entities serving dual roles
- Insurance/WSIB expiry auto-block-PO pattern (regulatory compliance enforcement)
- Vendor consolidated billing pattern for AP

**Inputs from Session K** (additions from Module 9 walk):
- Separation of duties enforcement pattern (AP bill creator ≠ approver; payment run creator ≠ approver) — new cross-cutting commitment §0.4 #11
- Invoice state machine with field-level lock per state (Draft / Pending Approval / Approved / Sent / Paid)
- Customer payment portal signed URL pattern (scoped to single invoice, no login)
- Late fee waiver gated to A/Acc with reason capture
- AR aging role-scoped visibility (A/Acc all; PM project-scoped; SR client-scoped)
- 3-way match manual override with reason capture pattern
- Recurring invoice template linked to Service Contract pattern
- Multi-currency invoice with exchange rate snapshot pattern
- Customer credit balance accumulation pattern

**Inputs from Session L** (additions from Module 10 walk):
- Regulatory expiry auto-block enforcement pattern (insurance + WSIB) as new cross-cutting commitment §0.4 #12
- Manual override of regulatory block requires A approval + reason + audit
- Worker manifest project-scoped visibility (PM sees own project workers only)
- Labor rate snapshot at WO creation for legal durability (extends M5/M8 snapshot pattern)
- Skill + territory + availability matching algorithm pattern
- Cross-link banking sync pattern between dual-role entities (vendor + contractor)
- Worker cert verification with individual cert tracking per worker

**Inputs from Session M** (additions from Module 11 walk):
- GL period locking as new versioning/snapshot pattern (§0.4 #8 extended) — GL entries within locked period cannot be edited
- Source-back traceability permission-aware drill-back pattern (GL line shows source but drill-back respects target-module permissions)
- Hard close dual approval pattern (A + Acc co-sign per §0.4 #11 extended)
- Manual GL entry separation of duties pattern (creator ≠ poster)
- Bank balance field-level visibility pattern
- Tax filing PDF eight-layer protection
- Cross-currency revaluation handling pattern

**Inputs from Session N** (additions from Module 12 walk):
- Certification expiry auto-block extends §0.4 #12 from PO/WO creation to appointment scheduling
- SLA response time auto-enforcement pattern (75%/90%/100% threshold alerts)
- Per-site response time precedence consistent with M1 (site SLA > site response > client response > tier default)
- Cross-resource polymorphic scheduling pattern
- Geolocation privacy retention pattern (§0.4 #13 — 30-day default operator-configurable)
- Mobile clock-in linking pattern (geolocation + project + phase + cost-centre)
- Schedule change log append-only pattern (extends §0.4 #10)
- Emergency dispatch override audit pattern
- Schedule view scoping per role (Tech own; PM team+projects; Dispatcher all; SR client-scoped; A all)

**Inputs from Session O** (additions from Module 13 walk):
- Three layers of reporting (M4 Dashboard / M11 Financials / M13 Reports) with distinct permission models
- Permission-aware report queries pattern (each report respects executing user's data scopes + field visibility)
- Cross-user data in reports gated (explicit grant required)
- Scheduled report subscription audit pattern (every recipient + delivery captured)
- Saved report snapshots immutable per §0.4 #10
- Multi-language report rendering pattern
- Source-back traceability for financial reports

---

## 3. Permissions module — build

**What:** Implement the design from item 2. Migration `0005_perms_
schema.sql`, `lib/api/permissions.ts`, `lib/permissions.ts` rewrite
to read from DB (with an in-memory cache to avoid per-request DB hits),
server-action gates (`assertCan(user, "quotes:create")`), route-level
gates (middleware or layout), client hooks (`useCan`, `useFieldCan`),
and the Admin override UI in `/users/[id]/permissions`.

**v1 acceptance:** Every gate from the static matrix is replicated
on the DB-backed version with no behaviour regression. The
override UI lets an Admin hand a specific user a specific grant
inside a specific resource without role promotion. Three UI states
are exercised on the existing surfaces (`/users`, `/financials`,
`/settings`). Full audit coverage on every grant / revoke.

---

## 4. Quotes v1

**What:** First "real" business module beyond clients/users. The
revenue surface — quote drafting, multi-section line items,
margin/internal toggles, send via PDF, convert-to-project, full
audit trail.

**v1 must include:** Migration with `quotes`, `quote_sections`,
`quote_line_items` tables (schema sketched in
`NEXVELON_SESSION_A_HANDOFF.md` §12). Server actions for create /
update / send / approve / reject / convert / soft-delete. Custom
fields on quote AND line item per `NEXVELON_PRINCIPLES.md` §6.
Status as a lookup table (Draft / Sent / Approved / Rejected /
Expired / Converted seeded; operator can rename/retire). Permission
gates wired (`quotes:create`, `quotes:viewMargin`, `quotes:approve`,
`quotes:convert`, `quotes:viewInternal`). PDF export reads from
company-profile DB table (built incidentally — see deferred
decisions). Beats the Sedona Office / Wisetrack / simPRO reference
floor on margin clarity and convert-to-project friction.

Additional from Session C:
- **Onboarding gate auto-injection into T&C** — clause-per-gate composition assembling required-gate clauses into the quote T&C section. Versioned per dispatch.
- **Eight-layer print protection** for quote PDFs.
- **SLA reference in T&C** — quotes for clients with active site SLAs auto-reference the SLA name and effective dates in T&C.
- **Quote approval workflow** with status flow Draft → Pending Approval → Approved → Sent → Binding (via onboarding gate fulfillment).
- **Per-quote line-item permissions** — `quotes:viewMargin`, `quotes:viewCost` are field-level gates.

**Detailed scope from Session G** — see `NEXVELON_FEATURE_AUDIT.md` §5 for the complete spec:

- **Three quote types** (§5.1): Service Quote (one-off → job), Project Quote (multi-milestone → Project), Service Contract Quote (recurring → service_contracts row in M1).
- **~85 actions** across 11 categories (§5.5): lifecycle (25), margin/cost (5 field-gated), line items, pricebook, assemblies, cost centers, templates, tracking, output, communication, bulk.
- **12 new owned tables** (§5.4): `quotes`, `quote_line_items`, `quote_taxes`, `quote_discounts`, `quote_revisions`, `quote_approvals`, `quote_views`, `quote_acceptance_records` (append-only), `quote_terms_snapshots` (versioned), `quote_templates`, `pricebook_items` + `pricebook_categories`, `pre_built_assemblies`, `cost_centers`.
- **5 status lookup tables** (§5.4): `quote_statuses` (13 seeded values incl. Draft / Pending Approval / Approved / Sent / Viewed / Negotiating / Accepted/Signed / Binding / Rejected / Withdrawn / Expired / Converted to Project / Archived), `approval_statuses`, `quote_revision_reasons`, `quote_types`, `cost_center_defaults`.
- **Online portal at `/q/[token]`** (§5.6) — client-facing signed URL, 90-day expiry, no login required, revoked on acceptance, e-signature via touch (draw) or desktop (type + attest).
- **Immutable send snapshots** (§5.12 #33) — line items + pricing + T&C captured at send time in `quote_terms_snapshots`. Revisions create new snapshots. Legal durability per PRINCIPLES §0.4 #8.
- **Eight-layer print protection on revenue PDFs** (§5.6) — server-side gen only, force-reauth, watermark (operator + timestamp), audit row, 24h signed URL, print event capture, embedded metadata, no bulk export.
- **T&C auto-composition** (§5.6) — composed from client's onboarding gates (M1 commitment honored); each clause tagged with source attribution; editable with audit; re-composable if client gates change post-creation.
- **Value + discount threshold approval routing** (§5.13 #1-2; §5.12 #32) — combined AND logic; configurable per role in Settings. Defaults: <$5k self-approve, $5-25k→PM, $25-50k→PM+margin review (gates if margin <15%), >$50k→Admin. Discount: <10% self, 10-25%→PM, >25%→Admin.
- **Per-cost-centre tax codes** (§5.13 #9) — Canadian split-tax compliance (Equipment/Labor/Materials lines can carry different tax codes per BC GST+PST vs ON HST scenarios).
- **Holdback in quote totals** (§5.14 #8) — Ontario Construction Act default (10%/Excl/45 from client config); quote shows immediate due + holdback released later.
- **Field-level margin visibility** (§5.7, §5.12 #31) — A/PM default; SR per-user override only. `quotes:viewMargin` is visibility flag, not action.
- **Quote → Project conversion** (§5.12 #35) — locks source quote (read-only post-conversion); revisions blocked; new quote required for post-acceptance changes; sets `originating_quote_id` FK on project.
- **Pre-built assemblies + cost centres + pricebook** (§5.6) — simPRO pattern; bundled line items, grouped subtotals on PDF, master catalog with vendor sync.
- **Append-only acceptance records** (§5.12 #37) — signature image stored with one-way hash; no update, only read.
- **52 acceptance criteria** (§5.14) — covering creation, approval workflow, send & track, conversion, versioning, pricing/discount/tax/holdback, permissions, eight-layer print, performance.

---

## 5. Projects v1

**What:** The delivery surface — projects, tasks, schedule rollup,
materials, commissioning, zone lists, documents, financials tab,
time + labor. The detail UI is largely already designed; this
session wires it to real DB.

**v1 must include:** Migration with `projects`, `project_tasks`,
`project_materials`, `project_zones`, `project_documents`,
`project_time_entries`. Server actions, custom fields, status lookup,
permission gates, audit. Quotes → Projects conversion wired
end-to-end (single click; `quote_id` becomes `project.source_quote_id`
with materials and pricing carried over). Beats the ServiceTrade /
Salesforce Field Service / simPRO reference floor on cross-module
continuity.

---

## 6. Inventory v1

**What:** The stock surface — products, warehouse locations,
allocations (to projects), stock movements ledger, low-stock alerts,
per-vendor reorder rules. Vendors are referenced here but get their
own module next (item 7).

**v1 must include:** Migration with `products`, `product_locations`,
`stock_allocations`, `stock_movements`, `low_stock_rules`. Custom
fields on product (per `PRINCIPLES.md` §6 — manufacturers want SKU
variants, license keys, serial numbers). Movement ledger is the
real audit trail; every adjustment writes a row with reason +
operator + before/after qty. Allocation against project is a
typed link to the Projects module. Beats the Anixter / Best Buy
distributor portal / simPRO reference floor on the one-screen
low-stock + on-order view.

---

## 7. Vendors v1

**What:** A dedicated module for the suppliers Nexvelon buys from
(ADI, Anixter, Wesco, CDW, Provo, …). Currently a `Vendor` type
exists in code but no first-class module. Splits out from the
Inventory + Financials surfaces.

**v1 must include:** Migration with `vendors`, `vendor_contacts`,
`vendor_terms`. Lifecycle: Active / On Hold / Terminated (lookup
table). Cross-references: every product references a primary vendor;
every invoice/bill from a vendor references the vendor. PO module
sits here logically — purchase orders to a vendor draw from quote
line items + inventory reorder rules. Custom fields per §6.

---

## 8. Invoices v1

**What:** AR side of Financials — quotes that converted now produce
invoices, invoices get sent, paid, reconciled. Includes overdue
tracking and bookkeeping handoff to QuickBooks (the integration
target, not replacement, per §3).

**v1 must include:** Migration with `invoices`, `invoice_line_items`,
`payments`. Status lookup (Draft / Sent / Paid / Overdue / Void).
Convert-from-project workflow. PDF export with the same letterhead
component used by quotes (see deferred decision: company-profile
DB table). QuickBooks Online sync hook (write-only at v1; pull comes
in v2). Permission gates incl. `invoices:viewMargin`,
`invoices:approveWriteOff`.

---

## 9. Subcontractors v1

**What:** The subcontractor management surface — separate from
employees, separate from vendors. Tracks insurance + WSIB expiry,
trade qualifications, paid YTD. Subs get assigned to project tasks
the same way employees do.

**v1 must include:** Migration with `subcontractors`,
`subcontractor_qualifications`, `subcontractor_assignments`.
Hard-block on assignment when insurance/WSIB is expired
(per `NEXVELON_PRINCIPLES.md` §3 — the bar to beat the reference
floor). Status lookup. Custom fields. Audit on every assignment.

---

## 10. Financials v1

**What:** The bookkeeping + analytics surface. P&L, balance sheet,
cash flow, AR/AP aging — all derived from the operational tables
shipped by items 4 + 5 + 6 + 7 + 8 + 9. QuickBooks Online sync as
the integration backbone.

**v1 must include:** Real derivation engine pulling from the modules
above (no mock-data fallback). Period-by-period comparisons (MTD /
QTD / YTD vs. prior). HST/GST collected + paid reporting. Margin
breakdown per client tier. Pre-existing financials/Tabs.tsx ESLint
warnings (5 of them, Session A constraint) get fixed as part of
this module's wiring.

---

## 11. Scheduling v1

**What:** The dispatch surface — calendar view, technician swimlanes,
job assignment with capacity + certification matching. Replaces the
mock-data scheduling page.

**v1 must include:** Migration with `schedule_jobs`,
`schedule_assignments`, `tech_certifications`. Job creation from
project tasks OR ad-hoc. Drag-to-assign in the calendar view.
Hard-block on assignment when a tech doesn't carry the required
panel certification (Kantech, Genetec, C-CURE, etc.) — the §3 bar
above ServiceFusion / Jobber / simPRO. Custom fields on job. Audit
on every assignment change. Route + capacity optimisation deferred
to v2.

---

## 12. Reports v1

**What:** Cross-module analytics + custom dashboards + scheduled
email deliveries + PDF/CSV/Excel exports. The current
`/reports` page is a deliberate Coming Soon shell (commit
`91677d6`). Wires once enough modules have real data.

**v1 must include:** A report-definition data model (reports are
data, not code — operators add/edit them in Settings). Cross-
module joins (pipeline through invoiced revenue, margin by client
tier, tech utilization vs. budgeted hours). Scheduled email
deliveries via a cron + Resend pipeline. Export to PDF, CSV, and
live Excel workbooks. Permission gates per report (sensitive
reports — margin, payroll — hidden from non-managers).

---

## Open architectural decisions awaiting design

These decisions get resolved in the design passes for items 2 + 4
(permissions + quotes) — calling them out here so the design pass
has them as inputs.

### Custom-field implementation per entity

How `<entity>_custom_field_definitions` + `<entity>_custom_field_
values` are shaped exactly. Three options on the table:

1. **Two-table per entity** (`quote_custom_field_definitions` +
   `quote_custom_field_values`) — clean queries, but multiplies
   migrations by N entities.
2. **Generic two-table** (`custom_field_definitions` with `entity_
   type` column + `custom_field_values` with `entity_type` +
   `entity_id`) — single migration, but every query needs an
   `entity_type` filter and FK integrity is by-convention not
   enforced.
3. **JSONB column per entity** (a `custom_fields jsonb` column on
   each business table, definitions in a sibling table) — fastest
   reads, but harder to index and the definitions can drift from
   the actual stored shapes.

Decision goes in the permissions design pass (item 2) since
field-level permissions reference the chosen shape.

### Workflow rule format

Phase 2 commitment per `NEXVELON_PRINCIPLES.md` §6. v1 modules ship
with sensible defaults hard-coded; the data-driven workflow engine
gets designed once we have two modules' worth of rules to observe.
Likely shape: a `workflow_rules` table with `trigger_event` (typed
event from the bus) + `condition` (DSL or sandboxed JSON predicate)
+ `actions` (sequence of action specs). Decision deferred to after
Quotes v1 + Projects v1 are running with hard-coded rules.

### Field-level permission storage model

Three options:

1. **A `field_permissions` table** (resource + field_name + role +
   action). Simple, but every form has to query it per render.
2. **A `field_visibility` JSON blob on the permission row** —
   per-grant rather than per-field. Better for caching but harder
   to audit.
3. **Implicit denial via field_permission overrides only** — by
   default every field is visible per the resource-level grant;
   `field_overrides` table only stores the hidden ones. Saves rows
   in the common case but requires a careful "is this field in the
   override list" check.

Decision goes in the permissions design pass (item 2).

---

## Open product decisions deferred from earlier conversations

These were raised during Session B and parked because the
permissions module changes the answers. Revisit in the design
pass for item 4 (Quotes v1).

### `quote_shares` table necessity

Originally proposed for sharing a quote with a client via a
tokenised link. With the per-user permissions system, "share" might
decompose into either (a) a per-quote permission grant to a
`ClientPortal` user, or (b) a token-bound public-read view. The
right shape depends on whether ClientPortal users get accounts vs.
anonymous link clicks. Most likely outcome: the table is redundant
with the new permissions system and gets dropped. Defer the
decision until the permissions design pass.

### `unit_label` enum vs. freeform `text`

Quote line items have a unit ("ea", "ft", "hr", "license"). Enum
gives consistency for reporting; freeform gives integrator
flexibility for one-off units. Likely answer: short enum
(`ea` / `ft` / `m` / `hr` / `license` / `lot`) seeded into a
`unit_labels` lookup table per §6, plus a freeform
`unit_label_custom` text override gated by a permission. Lets the
default reporting roll up cleanly while the operator can express
"per cabinet" or "per cleanroom" when they need to.

### Currency at quote-level vs. client-level

A single client may have CA + US sites. Quote-level is more
flexible but creates aggregation friction in client-tier and
dashboard reporting. Likely answer: client default + per-quote
override, both surfaced in the UI. Decision goes in the Quotes
v1 design.

### Discount granularity

Line-item, section, total, or all three? Affects margin
calculation, audit log shape, and how the §3 reference floor
(Sedona Office, Wisetrack, simPRO all support all three) is met.
Likely answer: all three, with section-level being the default UI
surface and line/total being progressive disclosure.

### Company-profile data source (PDF letterhead)

`components/modules/quotes/builder/QuoteDocument.tsx` currently
renders a placeholder line "Configure address in Settings → Company
Profile" — the hardcoded fake contact info was removed in commit
`91677d6`. The proper wiring needs a `company_profile` table (single
row, Admin-managed) that the Settings → Company Profile pane
persists to and the PDF letterhead reads from. Likely shape: a
`settings_company_profile` table with one row + `singleton_id`
check constraint. Goes alongside Quotes v1 since the PDF needs it.

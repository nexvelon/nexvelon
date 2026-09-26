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

> **Resync marker (2026-09-24): REALITY-1 build-state audit.** The original
> sequence below (feature audit → permissions → Quotes → Projects → Inventory →
> Vendors → Invoices → Subcontractors → Financials → Scheduling → Reports) has
> **all shipped** and was removed per this file's own rule ("when an item ships,
> DELETE it here"). The authoritative built-vs-designed reconciliation is now
> **`docs/BUILD_STATE_AUDIT.md`** (HEAD `f69b815`, PR #388, migration 0124). Every
> capability that was *designed but not built* has been carried into the "Remaining
> work" list below — nothing was dropped. Read the audit for the evidence, the
> permissions gap, and the debt register behind these items.

> **Reinstatement marker (2026-09-25): REALITY-3 doc repair.** Evidence:
> **`docs/INTENT_RECOVERY.md`** (REALITY-2, PR #394). Two things happened here:
> (1) items that shipped since the resync were removed from "Remaining work" and
> marked closed with their PR — **SEC-1 #390, AUD-4 #391, SEC-2 #392 (vendor
> banking encryption + PO cost gates), FIN-TAX-1 #393**; (2) every DROPPED-SILENT /
> UNCERTAIN item recovered by REALITY-2 was folded in below at its tier, merged
> into an existing entry, or explicitly **decided out**. Recurring revenue is now
> the top P1 item; the built-in General Ledger is **decided out** (see that
> section). New tagging: **[recovered]** = reinstated from INTENT_RECOVERY;
> **[catalogue]** = aspirational scope, not a commitment.

---

## Remaining work (ordered)

Tiers + reasoning + evidence are in `docs/BUILD_STATE_AUDIT.md` §6–§7. **(M)** = needs
a migration (additive-only per `NEXVELON_PRINCIPLES.md` §1, applied manually by Jay).
Each line is scoped to a single Claude Code paste.

### P0 — correctness / security (do first)

- **✅ CLEARED.** Both original P0 items shipped: **SEC-1 — server-strip
  field-gated data (PR #390)** and **AUD-4 — invoice audit trail (PR #391)**. No
  open P0 items. (SEC-2 #392 additionally shipped vendor-banking encryption + PO
  document-cost gates — the two field gates SEC-1 recorded for follow-up.)

### P1 — designed, materially absent, commercially matters

- ~~RECUR-1 — recurring revenue~~ **✅ SHIPPED (PR #396).** `service_contracts` +
  recurring invoice generation (migration 0128): per-contract cadence
  (monthly/quarterly/semiannual/annual/custom), per-contract generation mode
  (manual/automatic/draft-for-approval, default draft-for-approval), idempotent
  daily generation on the SNAP-1 cron pattern with missed-day catch-up, per-invoice
  price snapshots (§2.2), per-opco separation, MRR, and the Service Contracts UI.
  **Deferred to follow-ups (below):** the Service Contract *quote type → contract*
  conversion; late-fee auto-application; mid-cycle cancellation credits.
- **TAXFILE-1 — tax-filing records** **[recovered]**. Durable `tax_filings`
  records + PST returns + CRA-confirmation tracking beyond the computed HST CSV +
  T5018 that shipped (`docs/INTENT_RECOVERY.md` §11 P1). **(M)**
- ~~FIN-TAX-1 — holdback HST treatment.~~ **✅ SHIPPED (PR #393)** — explicit +
  org-configurable treatment, per-invoice snapshot (migration 0127).
- **REP-5 — Reports platform** *(carries forward the designed M13 scope)*. Today
  ~14 static reports render; build the report-definition data model, a copy-modify
  **custom builder**, **scheduled email/PDF delivery** (reuse the SNAP-1 cron
  pattern), subscriptions, and immutable saved snapshots — the ~7 designed report
  tables. **(M)**
- **FIFO-1 — inventory FIFO valuation** (§0.4 #8 locked commitment; zero code
  today). **(M)**
- **QBO-1 — accounting export** (QuickBooks/Xero/Sage 50; §3's integration
  backbone; label-only today). Write-only QuickBooks first. **(M)**
- ~~QUOTE-PORTAL-1 — client quote portal `/q/[token]`~~ **✅ SHIPPED (PR #397).**
  Unauthenticated signed-URL e-acceptance (no login), rendering an **immutable send
  snapshot** captured at send time (§2.2) that carries no internal figure
  (cost/margin/notes/tech); **append-only** acceptance records (signature + identity
  + IP + timestamp + SHA-256 seal, §5); one token per send with 90-day expiry, prior
  links revoked on resend; fail-closed on invalid/expired/revoked; accept → Approved,
  decline → Revision; portal events logged to `quote_audit_log`; operator Client
  portal panel on the quote builder (migration 0129). **Kept separate (not built
  here):** quote→project conversion stays a deliberate operator action;
  approval-threshold routing not in scope.
- **PAY-PORTAL-1 — invoice customer payment portal** *(designed §9, Stripe)*. **(M)**

### P2 — polish / designed-but-deferred

- **Permissions dimensions 2–10** *(the rest of `NEXVELON_PERMISSIONS_DESIGN.md`
  v0.11 — carried forward)*: data scopes, time-bounded grants (`expires_at`),
  request-admin-access workflow, approval delegation with value caps,
  audit-on-read, eight-layer print protection, encryption-at-rest (gate codes /
  bank numbers), and persistent effective-permissions caching. Sequence per the
  v0.11 six-phase plan when commercially triggered. **(M each)**
  - **[recovered]** Audit-capture commitments the shipped `permission_audit`
    (`0115`, 4 change-types) dropped from the 11 design passes: **denied/failed
    action-attempt logging**, **IP capture + 12-month IP-only nulling**, and
    **system-actor audit rows** (`docs/INTENT_RECOVERY.md` §7). Part of the
    audit-on-read / audit-visibility build-out above.
- **PERM-HYGIENE — drop dormant `0005`/`0006`** (~21 dead, unreferenced tables) and
  reconcile the `user_permission_overrides` schema collision (`0006` vs live
  `0115`). **(M)** — needs the §8 Q4 decision (drops tables).
- **GATES-1 — onboarding-gate framework + auto-composed T&C [recovered].** Per-party
  compliance gates (insurance/MSA/deposit/bond/NDA) that inject clause text, spanning
  **clients (M1), vendors (M8), and contractors (M10)** — flagged in the audit as a
  differentiator; only static boilerplate shipped (`docs/INTENT_RECOVERY.md` §11 P2).
  Merges the M1/M8/M10 onboarding-gate + T&C-versioning items. **(M)**
- **INV-WRITEOFF-1 — invoice write-off approval [recovered].** The
  `invoices:approveWriteOff` gate + an AR write-off workflow (reason + audit) — the
  clean roadmap-level silent casualty; a write-off is currently an untracked edit
  (`docs/INTENT_RECOVERY.md` §4). **(M)**
- **RECUR-2 — service-contract follow-ups** *(deferred from RECUR-1, PR #396)*: the
  **Service Contract quote type → contract conversion** (a Service Contract quote
  converts into a `service_contract` the way a project quote converts into a
  project; contracts are directly creatable today, so this is convenience);
  **late-fee auto-application + compounding** on overdue contract invoices (today
  `lib/late-payment-rates.ts` is informational T&C text only); and **mid-cycle
  cancellation credits** (the `prorate()` primitive ships tested in
  `lib/recurring/billing-schedule.ts`, but cancellation currently just stops future
  billing — a pro-rated credit/final invoice is not auto-issued). **(M?)**
- **MAIL-2 — email sending follow-ups** *(deferred from MAIL-1, PR #TBD)*: **true
  per-rep mailbox sending via Google Workspace OAuth** (send as the rep's own
  mailbox rather than one authenticated address with the rep as display-name +
  reply-to, which is what MAIL-1 ships — explicitly out of scope per Jay's
  decision); **bounce & spam-complaint handling** (consume Resend/SES webhooks to
  mark hard bounces and complaints); and a **suppression list** (never re-send to
  a hard-bounced/complained/unsubscribed address). `email_log` (migration 0130)
  is the foundation these build on. A `List-Unsubscribe` header is intentionally
  omitted for now because all current sends are transactional (a quote/PO/WO the
  recipient asked for); add it if any bulk/marketing mail is introduced. **(M)**
- **Clients — SLA engine + client-level holdback config**; the **Contracts tab**
  (placeholder at `ClientDetailView.tsx:406`); a dedicated `/contacts` detail
  route; **[recovered]** a native per-client **communication log** (email/call/SMS).
  **(M)**
- **Settings — Workflow Rules engine** (§6 Phase-2 commitment), **email/PDF
  template editors**, and real wiring for the Notifications / API-Webhooks stubs.
- **Users — employee HR surface** (certifications, territories) beyond techs.
- **Scheduling — SLA auto-enforcement, mobile geolocation clock-in**; **[recovered]**
  cross-resource scheduling (contractors/vehicles/equipment as resources), recurring
  appointment series, and an emergency-dispatch override workflow (reason + audit)
  (`docs/INTENT_RECOVERY.md` §11 P2). *(Cert-expiry auto-block on booking already
  shipped — DES-2.)*
- **Subcontractors — skill+territory matching; lien-deadline tracking**;
  **[recovered]** contractor-side parity with vendors: versioned labor-rate tables
  (effective-dated per-role base/OT/weekend/holiday/travel), a worker manifest with
  per-worker cert verification, and a contractor performance ledger + auto-degrade.
- **Vendors — performance auto-degrade + stored score**; **[recovered]** vendor
  insurance/WSIB expiry tracking + PO auto-block (exists for subs only today).
  *(Banking encryption-at-rest already shipped — SEC-2 #392; vendor onboarding gates
  merged into GATES-1.)*
- **AP-MATCH-1 — 3-way match / price-discrepancy auto-flag [recovered]** (PO ↔ receipt
  ↔ bill; only thin matching in `vendor-bills.ts` today).
- **INV-LOWSTOCK-CRON — scheduled low-stock cron email digest [recovered]** (cron
  infra exists — `api/cron/capture-balance-snapshots` — low-stock was never wired;
  also a handoff commitment). **(M-free)**
- **QUOTE-CATALOG-1 — pre-built assemblies library + master pricebook [recovered]**
  (quote-building productivity catalogs; simPRO parity). **(M)**
- **QUOTE-APPROVAL-1 — threshold-based multi-step quote approval routing [recovered]**
  (`quote_approvals`; today a single approve button, no thresholds —
  `docs/INTENT_RECOVERY.md` §5). Fits the Settings Workflow-Rules engine above. **(M)**
- **Projects — ULC verification in commissioning; handover-package flow.**
- **Dashboard — remaining role templates (4→6) + widget-catalogue breadth.**
- **Bug/polish batch** — QuoteHistoryPanel → shared `formatActivityValue`
  (`QuoteHistoryPanel.tsx:58`); activity UUID→human-label registry
  (`format-activity-value.ts:17`); BrandingThemes' 3 "preview only" controls;
  Clients Export (`ClientsView.tsx:353`); quote letterhead; ProjectEditForm PM
  picker (`ProjectEditForm.tsx:8`); hardcoded-hex cleanup (`po-status.tsx`,
  inline brand-gold); document the Turbopack-only build.
- **UI-arc deferred items** — tracked in the *UI/Dashboard/Gantt initiative*
  section below: base primitives (switch / slider / stepper / date-picker /
  calendar), exotic chart forms, presentation-timeline export, per-widget range
  override, per-opco balance trends, count trend lines, per-resource calendars,
  resource levelling / auto-assignment.

### P3 — catalogued only, no near-term intent

- **Deferred modules — Expenses / Receipt OCR / Payroll-HR** (see below).
- **Training package** (Jay-triggered; see below).
- **Permissions Phase-2 deferrals** — multi-tenant per-tenant rollout, SSO/SAML,
  API tokens, role hierarchy, crews.
- Dead entity-type cleanup (`inventory_product` never emitted).
- **[recovered] SCHED-AUTOSUGGEST — five-dimensional dispatch auto-suggest engine
  [catalogue].** Skill + cert + territory + availability + SLA ranked recommender.
  Aspirational parity scope, **not a commitment** (`docs/INTENT_RECOVERY.md` §11 P3);
  do not mistake for promised work.
- **[recovered]** Scheduling niceties: **travel-time estimates [catalogue]** (also
  collides with the no-paid-subscription constraint — needs a free distance source)
  and **external-calendar (iCS) one-way export**.
- **[recovered]** Permissions admin conveniences: **CSV grants round-trip**
  (export-edit-reimport of the role matrix) and a **self-service `/profile/permissions`
  page** (a user's own effective grants; admin-side computation already exists).
- **[recovered]** Users/HR niceties: **equipment assignments** (trucks/test-kits/
  devices), **sessions view + force sign-out**, **employee map + licence-matrix report**.
- **[recovered]** Settings niceties: **audit-retention / cold-storage config**,
  **operator-configurable sidebar badges**, **settings change-preview** ("affects N
  records; apply new/all" — only the theme `ApplyDefaultDialog` exists today).
- **[recovered]** Dashboard niceties: **per-widget CSV export**, **per-user custom
  landing page**.
- **[recovered]** Clients niceties: **misc-contacts directory** (inspectors/brokers/
  lawyers/ULC) + global search (the `/contacts` route is already tracked under P2),
  **client merge with dual-side audit**, **client-level encrypted banking**.
- **[recovered]** Invoices nicety: **multi-currency invoices + FX-rate snapshot**
  (CAD-only today).
- **[recovered]** Inventory nicety: **un-convert auto-return of committed stock**
  (commit is forward-only today; returns are manual).

### Decided out (recorded — NOT pending work)

- **Built-in General Ledger — DECIDED OUT (Jay, 2026-09-25).** No chart-of-accounts,
  no journal entries, no period close, no bank reconciliation, no FX revaluation, no
  recurring journals. **Reasoning:** Nexvelon uses **QuickBooks/Xero/Sage export
  (roadmap QBO-1) as the accounting system of record** — the ERP computes roll-ups
  (P&L, AR/AP, tax) and hands the GL to the accounting package rather than
  reimplementing one. This resolves `docs/INTENT_RECOVERY.md` §11 (M11 GL, UNCERTAIN)
  and `docs/BUILD_STATE_AUDIT.md` open decision **Q5** in the negative. If a customer
  ever requires a native GL, reopen this as a P1 initiative.

### Confirm-or-drop (UNCERTAIN — verify against the live system, then re-file)

These `docs/INTENT_RECOVERY.md` items could not be resolved from git history; each
needs a quick live-system check to either mark shipped, place at a tier, or drop:
- **`invoices:viewMargin`** — likely folded into `projects.viewFinancialsTab`; confirm invoice-surface margin is actually gated.
- **Admin-exception override audit** (SLA / insurance / WSIB / period-reopen, each with reason) — depends on override actions that don't exist yet; rides on the modules that would introduce them.
- **Commissioning GPS/photo evidence + RLS immutability**; **phase-completion progress-invoice auto-generation** (M6).
- **MFA enrollment** (M2); **Backups pane** (M3 — S3 inputs, no backing table); **photo-on-receive** (M7); **true turnover ratio** (M7 — table exists, ReportsTab still labels it a proxy).
- Handoff decision-forks: **project-vs-site allocation reconciliation**, **free-text `inventory_products.vendor` → vendors FK wiring**, **INV-1c per-vendor-tab metrics**, **Guardian letterhead / `default_opco` auto-select**, **permissions runtime cutover completeness** (static matrix not yet retired).

---

## Post-Build Deliverable — Training Materials (Jay-triggered)

**After the core ERP is functionally complete, Jay will request a
full training package.** It must cover **every user-facing task** in
the ERP — not just the headline features — at a step-by-step,
click-by-click level, written for a non-technical operator and future
employees who have never seen the system.

**Scope:**

- **A written step-by-step guide (per module, per task).** How to
  create a client, a site, a quote; convert a quote to a project; add
  a change order; record a payment, a deposit, a vendor bill; read the
  P&L; run the HST net position; manage attachments and folder trees;
  every permission and admin action; and so on — down to the smallest
  routine task. Nothing is "too obvious to document"; the audience is
  someone on their first day.
- **Learning videos / screen-capture walkthroughs** (or fully scripted
  storyboards + narration that Jay can record himself) mirroring the
  written guide task-for-task, so a user can watch or read.
- **Organized by role** (Admin, ProjectManager, SalesRep, Technician,
  Accountant, ViewOnly) so each user sees only the tasks their role
  actually performs.
- **Delivered as maintainable source** — a Markdown guide in the repo
  under `/docs/user-guide/`, plus a video-script index — so it updates
  alongside the product instead of rotting as a separate artifact.

**Trigger + discipline.** This is triggered **on Jay's signal**, not
automatically. **Do NOT start it early.** Keep it registered here, and
keep its source of truth — `docs/USER_FACING_CHANGELOG.md` — current
on every chunk that touches user-facing behavior (see
`NEXVELON_PRINCIPLES.md` §8, *Documentation currency*). When the
trigger comes, the package is generated from that changelog reconciled
against the live UI, then organized by role. Because this is a
post-build deliverable and not a module in the sequence above, it does
**not** move into a session handoff when "shipped" — it stays here
until Jay triggers it and the guide lands under `/docs/user-guide/`.

---

## Deferred modules (planning captured)

Full future vision documented so nothing is lost; **not built**, build
deferred to after current work.

- **Expenses · Receipt OCR · Payroll/HR** —
  [`docs/FUTURE_MODULES_EXPENSES_PAYROLL.md`](docs/FUTURE_MODULES_EXPENSES_PAYROLL.md).
  Employee/reimbursable expenses (manual-first, feeds job cost + HST +
  reimbursement), an optional pluggable receipt-OCR add-on (no zero-cost OCR
  exists — manual is the always-on baseline), and full Canadian payroll/paystubs
  /HR (serious CRA-compliance arc; tax-engine decision required first). See the
  doc for the consolidated open-decisions list.

---

## UI/Dashboard/Gantt initiative

Full vision + project handover captured in
[`docs/UI_DASHBOARD_GANTT_VISION.md`](docs/UI_DASHBOARD_GANTT_VISION.md);
**not built** — proceeds as its own multi-sprint arc **after** a read-only
audit of the theming / dashboard / chart infrastructure that already exists.

A market-leading **UI / theming / dashboard / Gantt** layer positioned as a
primary commercial differentiator (match *and* exceed Simpro / Q360 / every
admin template): a "Themes" settings category with many categorized presets +
full user color customization; a fully customizable drag-and-drop dashboard
(templates, every market widget/chart/pattern, per-widget controls); a
full-featured Gantt (dependencies, critical path, baselines, resource
assignment, style templates); and a broad chart + component library drawn from
51 reference screenshots. Honors the no-paid-subscription and honest-data
(§2.8) constraints. First chunk when triggered: **the read-only audit spec.**

**Progress (arc underway).** The theming pass, the dashboard arc (UIDG-5/6/6B →
8/9/10: chart + KPI layers, drag-and-drop layout, per-widget chrome + honest
range wiring, and the widget catalog + templates + quick actions) have shipped.
The **Gantt** now has its foundation: **UIDG-11 (migration 0123)** lands the
schema a real Gantt needs — task-level `start_date`/`end_date`/`percent_complete`/
`parent_id`, typed (`FS`/`SS`/`FF`/`SF`) + lagged dependencies at BOTH the job and
task level (new `task_dependencies` table), job `actual_*` dates, and immutable
baseline snapshots (`schedule_baselines` + `schedule_baseline_tasks`), plus the
typed read/write data layer (`lib/api/gantt.ts`) with cycle/lag/percent
validation. This UNBLOCKS **UIDG-12** (the Gantt UI — collapsible task bars under
jobs, dependency arrows, milestones, baseline overlay), **UIDG-13** (critical path
+ slack, which the typed deps + durations now make computable) and **UIDG-14**
(the resource lane). The existing read-first ProjectScheduleCard is untouched.

**UIDG-12 (delivered).** The interactive Gantt ships at `/projects/[id]/schedule`
— a hand-built themed SVG (no Gantt library): collapsible job rows with task
children, day/week/month/quarter zoom with an adapting two-tier axis, drag-to-move
and drag-to-resize (persisted through the gated task actions; view-only can't
drag) plus keyboard reschedule, typed dependency arrows with lag (violations
flagged), a toggleable baseline overlay (planned vs actual), progress fills,
milestones, a today line, and an honest empty state. All geometry is a pure,
unit-tested lib (`lib/gantt/geometry.ts`); all date/cycle validation stays in the
UIDG-11 data layer. Row virtualization keeps it smooth to a stated ~500-task
ceiling.

**UIDG-13 (delivered).** Critical path + float. A pure, exhaustively-tested
forward/backward pass (`lib/gantt/critical-path.ts`) computes earliest/latest
dates, total + free float, the critical set and the projected finish over the
dependency network — all four link types with lead/lag, job-level dependencies
lifted in via a hammock decomposition, calendar-day arithmetic (stated cost:
weekends aren't skipped), Kahn topo so a malformed cycle reports instead of
hanging, and an honest sparse-network path (no dependencies → nothing marked
critical). The Gantt surfaces it: critical tasks marked (◆ + bold outline, not
colour alone; coexisting with overdue-fill and violated-arrow), a float column +
hover, a critical-path dim toggle, at-risk flagging, and a projected-finish +
variance-against-target banner. Read-only (no rescheduling).

**UIDG-14 (delivered) — the resource lane closes the Gantt arc.** A collapsible
pane below the Gantt (sharing its time axis, scroll and zoom) shows per-person,
per-day allocation against capacity, with over-allocation flagged. Pure,
unit-tested computation (`lib/gantt/resource-load.ts`): PLANNED load from task
assignees (a concurrency count — tasks carry no hours, so none is fabricated) and
BOOKED load from dispatch assignments (real hours); capacity from
`tech_working_hours` minus approved `tech_absences` (a tech with no pattern reads
"no capacity set", never 0); subcontractors appear with capacity "not tracked".
Project-scoped and labelled as such; gated `scheduling:view`. Over-allocation is
conveyed by an icon + count + hatch (not colour alone) in themed status tokens.

**The Gantt arc (UIDG-11 → UIDG-14) is complete.** Deliberately still out of
scope: **resource levelling / auto-assignment** (audit §12 q6, decided out) and
**presentation-export templates** (a later item).

**GANTT-CAL (delivered) — working-day scheduling closes the calendar-days
follow-up.** The critical path, task durations, drag-to-reschedule and the
resource lane now respect an ORG working calendar (working weekdays + holidays,
stored in company_settings; seeded Mon–Fri + Ontario statutory holidays; Admin-
editable under Settings → Working Calendar). One implementation
(`lib/gantt/working-calendar.ts`, a working-day ordinal remap) is shared by all of
them. Existing task dates are never rewritten — only the derived schedule becomes
more accurate — and non-working days are shaded on the axis. The
**calendar-days-vs-working-days follow-up recorded in UIDG-13/14 is now CLOSED.**
(Lag is interpreted as working days; the per-resource calendar variant of 2a — the
assignee's own calendar driving a task — remains a possible future refinement, but
the org-calendar model is the intended long-term design.)

**SNAP-1 (delivered) — balance snapshots.** UIDG-6B could only apply deltas to
Revenue and Cash because AR/AP/WIP/deposits are live point-in-time balances with
no history to compare against. SNAP-1 captures each balance daily
(`balance_snapshots`, migration 0124 — immutable per §2.2, row-per-metric-per-opco-
per-day, America/Toronto boundary), so those four KPIs now carry period-over-period
deltas (with per-metric polarity) and, once ~a week of history exists, trend
sparklines. History begins at deploy (no back-fill); a sparse window reads "building
history" and a missed capture day is detected, not smoothed. Capture runs via a
secured cron endpoint (`/api/cron/capture-balance-snapshots`, Vercel Cron in
`vercel.json`) with a lazy first-dashboard-load fallback. **This is the canonical
home for point-in-time history** — future point-in-time metrics (per-opco balances,
counts, etc.) add a row to this table, never a new one. **Unblocks:** per-opco
balance trends (the `opco` dimension is already provisioned) and count trend lines,
both pure INSERTs with no migration.

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

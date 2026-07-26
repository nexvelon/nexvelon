# USER_FACING_CHANGELOG.md

> **The running record of what a user can do in Nexvelon.** One line per
> user-visible task, written from the operator's point of view — what they
> can now do, can no longer do, or do differently — **not** how it was built.
>
> **This is a launch-gate rule, not a nicety** — see `NEXVELON_PRINCIPLES.md`
> §8 (*Documentation currency*). Every chunk that adds, removes, or alters a
> user-facing task appends a line here. Refactors, test-only PRs, and internal
> migrations add nothing — this log tracks the *product surface*, not commit
> volume.
>
> **Why it exists:** the end-of-build training package
> (`NEXVELON_ROADMAP.md` → *Post-Build Deliverable — Training Materials*) is
> generated from — and reconciled against — this changelog plus the live UI.
> A task that isn't recorded here is a task a new employee never gets trained
> on. Keep it current; never let it fall behind the product.
>
> **Format:** newest at the top of each module. Group by the module/surface a
> user would look under, not by PR. When a later chunk changes the same task,
> correct the line in place — but don't rewrite history to tidy it.

---

## ⚠️ Backfilled section (not logged live)

> The entries below were **reconstructed after the fact** from the merged PR
> history (roughly PRs #290–#323), because this log did not exist while that
> work shipped. They are high-level — one line per major capability, not the
> granular per-click record the rule asks for going forward. Treat them as a
> starting index for the training package, to be fleshed out against the live
> UI when training is triggered. **From the next user-facing chunk onward,
> entries are logged live and belong under the "Live entries" section below.**

### Quotes

- Users can create a multi-section quote with live per-line margin, pick the
  client and site, and see quote totals and margin math update as they edit.
- Each quote gets a sequential, per-entity quote number; users can edit the
  quote's date and number, and duplicate an existing quote as the basis for a
  new one.
- Users can export a professional multi-page quote PDF (cover, scope of work,
  4-page terms & conditions) with configurable text weights and font sizes.
- Users choose a quote's intended conversion target (job vs. project) and set
  billing to "Same as Site" via a radio option.

### Projects & Jobs

- Users can open a converted quote as a real project with a live status
  (lifecycle: active / on hold / substantially complete / closed / cancelled)
  and edit the project header.
- Every project has a Main Job plus any number of Change Order jobs; users can
  view a project's Jobs table, open a Job detail page, and create/edit/delete
  Jobs.
- Users can edit a Job's line items (parts and labour) and see a
  Quoted-vs-Estimated-vs-Actual variance panel with per-leg cost and margin,
  where "actual" cost derives from real inventory, labour, and invoices.
- Users can move a Change Order between projects, promote a Change Order into
  its own project, and move a project to a different site (reparenting).
- Users can organize project files in a folder tree with three lens views
  (project / site / job).

### Financials — Invoices & AR

- Users create invoices from a project's Financials tab, add manual lines,
  pull cost-center draws at a full or partial percentage, and bill project
  materials; then issue the invoice (which stamps a number) or void it.
- Users can record full or partial payments against an issued invoice (with
  method, date, and reference), see the running balance and paid-to-date, and
  the invoice status moves itself between sent / partially paid / paid.
- Users set an invoice due date, and overdue invoices are flagged wherever
  they appear.
- Users see a real Financials dashboard: invoiced vs. collected, outstanding
  and overdue AR, holdback retained, deposits held, open-project contract
  totals, and blended margin.
- Users see AR aging by client (current / 1–30 / 31–60 / 61–90 / 90+), open a
  printable client statement of account, and export AR aging to CSV for the
  bookkeeper.

### Financials — Deposits

- Users record a deposit/retainer collected on a project, hold it as available
  credit, and apply it against that project's invoices; applied deposits show
  as a distinct non-cash credit and can be un-applied.

### Financials — Vendor bills & AP

- Users record vendor bills (optionally against a purchase order, which
  inherits its project/job), pay them full or partial, and void unpaid bills;
  a bill's status moves itself between received / partially paid / paid.
- Users see AP aging by vendor, open a printable vendor statement, export AP
  aging to CSV, and see "ordered vs. billed vs. left to bill" on a purchase
  order.

### Financials — Tax (HST)

- Users see the net HST position per operating company (Integrated Solutions
  and Guardian filed separately): HST collected less input tax credits from
  vendor bills, shown as net owing or refund due, with an "export HST return
  (CSV)" for the bookkeeper.
- When recording a vendor bill, users can set the claimable HST (ITC) — it
  defaults to the full tax and can be reduced for partial-ITC items — and set
  the entity on a standalone (no-PO) bill.

### Attachments & files

- Users can upload and download attachments (quotes, products/parts, project
  folders) reliably in Safari.

---

## Live entries

> Append here from the next user-facing chunk onward, newest first, grouped by
> module. Keep each line user-POV and terse. Example:
> *"Users can now set a payment reminder cadence per client from the client
> detail page."*

### Permissions — Editable role baselines + Warehouse role (DES-1)

- Admins can now edit what each role can do — changes apply to every user with
  that role — in addition to per-user overrides. The permissions that let admins
  manage permissions are protected from accidental removal.
- Added a Warehouse role (view everything, manage inventory) with consistent
  access across the app; admins can extend or restrict any individual on top of
  it.

### Permissions — Admin UI (PERM-4)

- Admins can now view each role's permissions, grant or deny specific
  permissions for individual users with a required reason, see each user's
  effective permissions, and review a full history of permission changes.

### Permissions — Per-user overrides + audit (PERM-3)

- Admins can now grant or revoke individual permissions for a specific user on
  top of their role, with a deny always winning over a grant, and every change
  recorded in an append-only audit log.

### Permissions — DB-resolved with fail-safe (PERM-2)

- Permissions are now resolved from the database (identical to the previous
  rules), with an automatic fall back to the built-in rules if the database is
  unavailable — no change to what any role can do.

### Permissions — DB mirror groundwork (PERM-1)

- Groundwork: role permissions are now mirrored into the database (identical to
  the existing rules) ahead of configurable permissions — no change to what any
  role can do.

### Reports — Operational reports + business snapshot (REP-3 / REP-4)

- Added operational reports — sales pipeline, technician utilization, vendor
  spend and inventory valuation — plus a business snapshot of real operating
  metrics, each downloadable as CSV, Excel or PDF and gated by role.
- Fixed: the quotes list action now requires quotes permission.

### Reports — Financial reports (REP-2)

- Added financial reports — per-company P&L, margin analysis, project
  profitability, AR and AP aging, HST position and T5018 — each downloadable as
  CSV, Excel or PDF, gated by role.

### Reports — Export foundation + hub (REP-1)

- Added a Reports hub with a shared export engine — reports can be downloaded as
  CSV, Excel, or PDF. The work-in-progress report is the first available; more
  arrive next.

### Dashboard — Final panels, fully real (DASH-3)

- The dashboard's revenue trend, top clients and inventory health panels now show
  real data; the entire dashboard is now driven by live data with no fabricated
  figures.

### Dashboard — Alerts, worklists & real panels (DASH-2)

- The dashboard now surfaces real alerts and worklists — subcontractor compliance
  at risk, expiring bonds and warranties, overdue tasks, open deficiencies,
  upcoming milestones, and today's dispatch — each gated by role.
- Technician utilization and the activity feed are now real, and fabricated
  pipeline figures were removed (replaced with a real quotes-by-status breakdown).
- Fixed: inventory report actions now require inventory permission.

### Dashboard — Real KPI row (DASH-1)

- The dashboard's key metrics now show real data — revenue, cash collected,
  outstanding receivables and payables, deposits held, work-in-progress, HST
  position, blended margin, active projects and open quotes — gated by role, with
  fabricated figures removed.

### Inventory — Pickup slips on product pages (INV-9-3)

- Product pages now list the pickup slips involving that item, showing who
  received it, whether the slip is signed, and a link to the signed PDF.

### Inventory — Cycle counts (INV-9-2)

- Users can run cycle counts — snapshot expected stock at a location (and/or
  category), enter blind counts, review variances, and apply the adjustments to
  inventory in one step. Uncounted lines are left untouched (never treated as
  zero), and every applied correction is recorded on the stock movement ledger.

### Projects & Jobs — Material reconciliation (INV-9-2)

- Users can reconcile planned vs actual material cost on a job to spot over- or
  under-consumption, on the job's Financials tab (dollar-level).

### Scheduling — Field view, audit & the cost seam (SCHED-4)

- Technician schedules can be viewed read-only, and every booking change is
  recorded in an append-only schedule history.
- A completed booking can be explicitly converted into a labour cost entry on its
  job — once only, with full traceability; bookings never become cost
  automatically.

### Scheduling — Working hours & availability (SCHED-3)

- Users can set technician working hours and record time off with an approval
  workflow; the dispatch board shades non-working hours and blocks booking a
  technician who is on approved leave (off-hours booking still works, with a
  warning).
- The board's utilization and technicians-out stats are back, computed from real
  working hours and absences (shown as "—" when a tech's hours aren't set).

### Scheduling — Live dispatch board (SCHED-2)

- The dispatch board now shows real technician schedules — drag an unscheduled
  job onto a technician's time slot to book it, or drag a booking to reschedule,
  with double-booking and missing-certification assignments blocked live. A
  view-only role sees the board without drag or actions.

### Scheduling — Dispatch model + certifications (SCHED-1)

- Users can create dispatchable jobs (project work or standalone service calls)
  with required technician certifications, and book a technician to a time window.
- The system prevents double-booking a technician and blocks assigning a
  technician who lacks a required, valid certification.
- Users can record technician certifications with expiry dates (on each tech in
  Settings → Techs).

### Vendors — Performance metrics (INV-9-1)

- Vendor pages now show a performance summary — year-to-date spend, on-time
  delivery, average lead time, fill rate, price variance and top parts — with
  delivery metrics based on purchase orders received going forward. Spend figures
  are shown only to users with financials access; when there aren't enough dated
  receipts yet, a metric reads "Not enough data yet" rather than a misleading 0%.

### Inventory — Job cost accuracy (INV-9-0)

- Fixed: inventory consumed on a job now stays counted in that job's actual
  material cost and margin (previously, marking a part consumed removed its cost,
  overstating margin). Consumption is now recorded in the part's movement history
  against the job it was used on. Note: affected jobs will show higher cost and
  lower — corrected — margin after this change.

### Projects & Jobs — Schedule & timeline (PROJ2-20)

- Users can set planned start and end dates on jobs, add schedule milestones and
  simple job dependencies, and view a project timeline (Gantt) with milestone
  markers, a today line and overdue highlighting.

### Projects & Jobs — WIP accounting (PROJ2-18)

- Users can see work-in-progress accounting per job and project — percent
  complete, earned revenue, and whether each job is over- or under-billed — with
  a portfolio view of total over/under-billing across active projects.

### Projects & Jobs — Cost codes & margin snapshots (PROJ2-17/21)

- Users can categorise job line items with cost codes and see an
  estimate-vs-actual cost breakdown by code on each job.
- Users can take point-in-time margin snapshots of a job or project (at
  approval, 50%, completion or manually) and view how the forecast margin has
  moved over the job's life.

### Projects & Jobs — Site log (PROJ2-16)

- Users can keep a daily site log per job — weather, crew and hours, work
  performed, delays, deliveries, visitors and photos — and submit it as the
  day's field report.
- Each project shows recent field activity across its jobs.

### Projects & Jobs — Team assignment (PROJ2-15)

- Users can assign in-house technicians to a job alongside subcontractors,
  designate a lead, and see the full project team with each person's role and
  jobs.

### Projects & Jobs — Warranty & Bonds (PROJ2-14/19)

- Users can record warranty periods on a project or job with scope, provider and
  duration (or an explicit end date), log the client handover, and see which
  warranties are approaching expiry — including a cross-project list of
  warranties nearing expiry as renewal opportunities.
- Users can track performance bonds and project insurance with coverage amounts,
  policy numbers, certificates and expiry dates, and are alerted when a bond
  that's still marked active has expired.

### Projects & Jobs — Deficiencies & Commissioning (PROJ2-12/13)

- Users can log deficiencies (punch-list items) against a job with severity,
  location, assignee, due date and photos, and track them through to closure
  (list or kanban). Each project shows an open/safety deficiency summary, and a
  warning appears when a project is marked substantially complete with open
  safety deficiencies.
- Users can run commissioning checklists on a job, record pass/fail results per
  item, raise a deficiency from a failed item, and capture a witnessed signature
  that produces a commissioning certificate PDF.

### Projects & Jobs — Tasks (PROJ2-11)

- Users can create tasks on a job or project with a title, description,
  priority, due date and an assignee (technician or subcontractor), and track
  them in a list or drag-and-drop kanban board.
- Overdue tasks are highlighted, and each project shows a summary of task counts
  by status.

### Subcontractors — T5018 reporting (SUB-7)

- Users can produce a T5018 contract-payment report for any calendar year,
  listing total payments per subcontractor with business numbers and addresses,
  and export it to CSV for filing. Rows under CRA's $500 threshold and rows
  missing a business number are flagged (never silently dropped), and each
  subcontractor's page shows its this-year / last-year payment totals with an
  amber hint when a paid subcontractor has no business number on file.

### Subcontractors — Job assignment (SUB-6)

- Users can assign subcontractors to a job or project with a role and dates, and
  see who is assigned from the job, project and subcontractor pages.
- Subcontractors with missing or expired WSIB clearance or liability insurance
  cannot be assigned to work; if compliance lapses during a job, the assignment
  is flagged rather than silently removed.

### Subcontractors — Work orders (SUB-5)

- Users can create and issue work orders to subcontractors for a specific
  project or job, with scope, agreed value and dates, delivered as a PDF and
  optionally emailed to the subcontractor.
- Work orders cannot be issued to a subcontractor whose WSIB clearance or
  liability insurance is missing or expired — the Issue action is blocked and
  the reasons are shown. (A draft can still be prepared while documents are
  obtained.)

### Subcontractors — Bills & job cost (SUB-4)

- Users can record a bill against a subcontractor; subcontractor costs now count
  toward a job's actual cost and reduce its margin, shown as their own line
  alongside materials and labour (in the project P&L, per-opco P&L, and the job
  financial summary / performance panel). Ordinary supplier-material bills are
  unchanged — they stay a supplementary "supplier bills" line, out of margin.
- Subcontractor detail pages list that subcontractor's bills with total billed,
  paid and outstanding.

### Subcontractors — Compliance alerting (SUB-3)

- Users see a compliance-at-risk panel on the subcontractors page listing every
  active subcontractor with expired, expiring, or missing required documents —
  each with the specific problem in plain language ("WSIB clearance expired 12
  days ago", "Missing: WSIB clearance") — so problems surface without opening
  each subcontractor. A count badge on the Subcontractors sidebar item (red for
  expired/missing, amber for expiring) makes the risk visible from anywhere.

### Subcontractors — Compliance (SUB-2)

- Users can attach compliance documents (WSIB clearance, insurance
  certificates, licences, qualifications) to a subcontractor with issue and
  expiry dates, coverage amounts, and an uploaded file, and see at a glance
  which subcontractors have expired, expiring-soon, or missing required
  documents — on the subcontractor's detail page and as a compliance column on
  the roster. A red banner warns when a subcontractor has expired or missing
  required documents (WSIB clearance and liability insurance).

### Subcontractors (SUB-1)

- Users can create, view, edit and search subcontractors (trade, contact
  details, business number, default labour rate) and optionally link a
  subcontractor to a vendor record so their bills flow into project costs.

### Financials — Holdback (FIN-9)

- Users can track statutory holdback retained on a project, see when it becomes
  eligible for release (60 days after substantial completion) with a live
  countdown, and generate a tax-exempt holdback-release invoice once eligible —
  from the project page or a "holdback release worklist" on the Receivables tab.

### Financials — P&L (FIN-8)

- Users can view a per-project profit & loss statement (revenue, costs, gross
  profit and margin, with contract variance, deposits, holdback, and AR/AP
  context) on the project page.
- Users can view a per-company (opco) P&L and a project portfolio ranked by
  margin under Financials → P&L, and export P&L to CSV.
- Each Job's Financial summary now shows a "Job gross profit" line on the same
  cost basis as the project P&L.

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

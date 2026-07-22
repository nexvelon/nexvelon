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

### Financials — P&L (FIN-8)

- Users can view a per-project profit & loss statement (revenue, costs, gross
  profit and margin, with contract variance, deposits, holdback, and AR/AP
  context) on the project page.
- Users can view a per-company (opco) P&L and a project portfolio ranked by
  margin under Financials → P&L, and export P&L to CSV.
- Each Job's Financial summary now shows a "Job gross profit" line on the same
  cost basis as the project P&L.

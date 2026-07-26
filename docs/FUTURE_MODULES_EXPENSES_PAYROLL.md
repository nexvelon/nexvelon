# Future Modules — Expenses · Receipt OCR · Payroll/HR

> A **captured vision**, not a spec to execute. This document exists so the full
> requirement for three deferred modules is never lost. It records *what* they
> should become, *how* they connect to what already exists, and the *open
> decisions* that must be resolved before building — so that when the time comes,
> nothing has to be reconstructed from memory.

## Status

**DEFERRED — planning only.** Build order: **after current work** (loose ends +
the training-materials deliverable). **Nothing here is built.** No app code, no
migration, no schema exists for any of this yet. This is the single source of
truth for the requirement until a build chunk is scheduled.

References to existing systems below use the names in the live codebase as of
this writing (PR #361 / migrations through 0116) so the plan attaches cleanly to
reality.

---

## Module 1 — Employee / Reimbursable Expenses

### What it is
Person-incurred expenses: fuel, meals, parking, work clothing, mobile phone,
laptop/tools, and ad-hoc job purchases (e.g. a box of screws grabbed from Home
Depot on the way to a site). Spent by **sales reps, technicians, managers, and
PMs** in the course of work.

**Distinct from vendor bills (FIN-5, `lib/api/vendor-bills.ts`).** A vendor bill
is a *formal invoice from a vendor* the company owes and pays through AP. An
expense is a *person's out-of-pocket or company-card spend* that may or may not
be owed back to that person. They are different records with different
lifecycles; the expense module is a **new surface**, not an extension of vendor
bills.

### Two kinds (both first-class)
- **Reimbursable** — paid personally, owed back to the person. Creates an
  amount-owed that is later cleared (see connection 2 → 3).
- **Company-paid** — put on a company card / account. A cost to the company,
  **nobody is owed**. Still a real cost that must reach the P&L and (if job-
  assigned) the job cost-center.

The module must handle both from day one; the `reimbursable` flag drives whether
a reimbursement obligation is created.

### The complete expense record (all fields)
The accounting-standard expense record. Every field:

| Field | Notes |
|---|---|
| `date` | Date the expense was incurred. |
| `employee_id` / payer | The person who spent it (FK to `profiles` / `techs`). |
| `vendor` / `merchant` | Free-text merchant name (Home Depot, Esso, …). NOT the vendor-bills `vendors` table (a merchant here is often a one-off). |
| `description` | What it was for. |
| `category_id` | FK to the editable category taxonomy (see below). |
| `subcategory_id` | FK to the editable sub-category taxonomy. |
| `amount` (subtotal) | Pre-tax amount. |
| `tax_amount` | Tax paid. |
| `tax_type` | **HST by default (Ontario)**; GST/PST extensible. See the OCR honesty note in Module 2 — tax *type* is a business classification, not something a receipt scan can determine. |
| `total` | subtotal + tax. |
| `payment_method` | `personal` \| `company_card` \| `cash` (extensible). |
| `reimbursable` | Boolean. Personal payment + reimbursable ⇒ an amount owed. |
| `project_id` / `job_id` | **Optional** job assignment (see connection 1). |
| `cost_center_id` | The specific job cost-center the cost posts to when job-assigned. |
| `gl_code` / cost-code mapping | GL / cost-code the expense maps to (parallels `lib/api/cost-codes.ts`). |
| `branch` / `city_code` | Branch + city tag (reportable). |
| `opco` | `integrated_solutions` \| `guardian` — feeds per-opco P&L + HST (FIN-7). |
| `service_or_install` | Tag: service vs install (reportable). |
| `receipt_attachment_id` | Receipt image via the existing attachments / signed-URL flow (no browser supabase-js). |
| `status` | `draft` → `submitted` → `approved` / `rejected` → `reimbursed`. |
| `notes` | Free text. |
| `created_by` / `updated_by` / timestamps | Standard audit columns. |

### Editable taxonomy (categories + sub-categories)
Categories and sub-categories are **admin-managed reference data Jay can add /
update / delete from the ERP** — exactly like cost codes are managed today.
Design: a `expense_categories` table and a `expense_subcategories` table (child
FK to category), each with an `is_active` flag and admin-gated CRUD. Never a
hard-coded enum — the taxonomy evolves with the business.

### Connections (each one precisely)

1. **→ Project cost.** An expense assigned to a job **posts to that job's
   cost-center** so job margin stays accurate — surfaced through the existing
   `getProjectCostRollup` (`lib/api/project-cost-rollup.ts`). **Cost boundary
   (be explicit):** only a *deliberate, posted* expense reaches job cost —
   exactly like the site-log / scheduling → cost seam, where a booking or a log
   is a plan/record and only a deliberate conversion feeds cost. An expense that
   is drafted, rejected, or left unassigned must **never** silently inflate job
   cost, and a job-assigned expense must land in **one** leg only (no
   double-count against materials/labour/bills). The rollup already keeps
   `materials` (inventory) and `billed_cost` (bills) as separate legs precisely
   to avoid double-counting; expenses get their **own leg** so the same rule
   holds.

2. **→ Reimbursement.** A reimbursable expense creates an **amount owed to a
   person**. Lifecycle: `submitted` → `approved` → `reimbursed`. A
   **"reimbursable owed per person"** report shows outstanding balances by
   employee (parallel to AR/AP aging in structure).

3. **→ Payroll (Module 3).** A reimbursement can be **paid via a payroll run** —
   the paystub shows the reimbursed expense as its own line, and **the pay-slip
   number is written back onto the expense record**. Once paid, **both Jay and
   the person can see exactly which paystub / pay-slip number cleared it** (a
   two-way trace: expense → pay-slip, pay-slip → expenses). This is the concrete
   integration point between Module 1 and Module 3.

4. **→ Finance.** Expense **cost + tax feeds the P&L and the HST net position**
   (FIN-7, `getHstNetPosition`), **per opco**. A company-paid expense is a cost
   line; its tax is an input tax credit exactly like a vendor bill's claimable
   tax. Reimbursable expenses hit cost when incurred/approved (accrual) — the
   exact recognition point is an accounting decision to confirm (see open
   decisions).

5. **→ Email (Resend).** The person is notified (via the existing **Resend**
   email path used for OTP / password reset / PO sending) when their expense is
   **approved** and when it is **reimbursed** (the reimbursement email carries
   the **pay-slip reference** from connection 3). Notification records are
   retained.

### Tagging & reporting
Every expense is filterable/reportable by: **service vs install**, **branch**,
**city code**, **opco**, category/sub-category, employee, project/job, and
status. These feed the Reports hub (REP-* pattern — a new `ReportDataset`).

### Approvals
`submitted` → a **manager/admin approves** → becomes reimbursable/payable.
Rejections carry a reason. The approver and timestamp are recorded (audit).

---

## Module 2 — Receipt OCR (auto-extraction) — the optional add-on

### What it is
Read a receipt photo and **auto-fill** vendor/merchant, date, subtotal, tax,
total, and **suggest** a category — so the person snaps a photo and the expense
form pre-fills instead of typing every field.

### The hard constraint (documented honestly)
**There is no accurate, always-on, zero-cost receipt OCR.** Every production-
grade option charges **per scan**:
- **AWS Textract `AnalyzeExpense`**, **Google Document AI**, **Veryfi**,
  **Mindee** — all per-scan pricing (some with a limited free allowance).

Jay's constraint is explicit: **no paid subscription; it must work without
paying; and it must stay switched on even when unused.** A per-scan paid service
that is "on but unused" costs nothing at zero volume but *cannot be relied on*
as a core dependency, and any real usage incurs cost.

### The decision (record this)
- **Module 1 is built MANUAL-FIRST and works 100% with zero OCR, zero cost,
  forever.** OCR is a **pluggable, optional enhancement — never a dependency.**
  The expense module must be fully functional with OCR **disabled**. This is the
  non-negotiable design rule: the module's correctness and completeness do not
  depend on any OCR provider existing.

- **OCR options documented for a later decision (Jay picks when/if):**
  - **(a) A provider with a FREE TIER** — some (e.g. certain Document AI / Veryfi
    / Mindee tiers) allow roughly **~1,000 scans/month free**. Effectively free
    at Nexvelon's low volume; cost begins only past the tier. Satisfies "works
    without paying" *up to the allowance* — but requires a provider account and
    accepting cost past the free ceiling.
  - **(b) Self-hosted open-source Tesseract** — no per-scan fee, runs on own
    infrastructure. Trade-off: **materially lower accuracy on phone photos**
    (angled, creased, thermal receipts) and ongoing maintenance/tuning burden.
    No typed expense fields — you get raw text and must parse it yourself.
  - **(c) Stay manual** — the default and the always-available baseline.

- **Benchmark note (for the eventual decision):** in 2026 receipt-extraction
  benchmarks, **AWS Textract `AnalyzeExpense` scored highest** (~**93% field**
  accuracy / ~**89% line-item**), including fuel / restaurant / hardware
  receipts, and returns **typed** fields (`VENDOR_NAME`, `TOTAL`, `TAX`,
  `SUBTOTAL`). **But** it requires an AWS account and **per-scan cost past any
  free allowance** — flagged directly against Jay's no-paid constraint.

- **Tax-type honesty (§2.8):** OCR returns a **total tax amount, not a tax
  TYPE.** It cannot know GST vs HST vs PST from a receipt. **Ontario = HST
  always**, so: store the extracted tax amount and **classify it as HST by
  default**; never pretend the scan "detected" the tax type. Same rule as manual
  entry — the tax *type* is a business classification, the scan only reads a
  number.

### Architecture note
Define an **extraction interface** — `photo → structured fields
{ vendor?, date?, subtotal?, tax?, total?, categoryHint? }` — with:
- a **NO-OP / manual default implementation** (returns nothing; the form is
  filled by hand), wired on by default, zero cost; and
- a **provider-adapter slot** so a chosen provider (Textract/DocAI/Veryfi/Mindee
  /Tesseract) drops in later behind the same interface **without a rewrite** of
  the expense module.

The expense record and its manual form are the contract; OCR only ever *pre-
fills* fields the user then confirms/edits. Nothing downstream knows or cares
whether a field was typed or scanned.

---

## Module 3 — Payroll + Paystubs + HR — the big one

### What it is
Full in-ERP payroll, paystub generation, and HR records — the "all-in-one,
one-stop" goal: run payroll, cut paystubs, and keep employee records inside
Nexvelon.

### ⚠️ SERIOUS-COMPLIANCE FLAG (read before building)
**Canadian payroll is legally serious and must be built with extreme care.**
It requires:
- **CRA source deductions** — CPP, EI, and federal + provincial (Ontario) income
  tax — calculated correctly per current-year formulas;
- **Correct remittance schedules** to the CRA (frequency depends on remitter
  size);
- **T4 / T4A** year-end slips;
- **ROE** (Record of Employment) on termination;
- **Ontario Employment Standards Act** rules — vacation pay, statutory holiday
  pay, overtime.

**Errors have real tax and legal consequences for both the company and its
employees.** Therefore:
- **Do NOT hand-roll tax withholding from memory.** Any withholding must be
  validated against **CRA payroll deduction formulas** (the CRA publishes
  the formulas / PDOC calculator / T4127 payroll-deductions formulas) or a
  **certified calculation source**.
- **Jay must confirm the strategy first:** build the tax engine **in-house
  against CRA formulas** vs **integrate a certified payroll engine/API**. This
  is a go/no-go architectural decision that precedes any code.
- Source deductions **change annually** (CPP/EI rates, tax brackets, basic
  personal amounts). The chosen approach must have a **maintenance plan** to stay
  current every tax year, or it will silently go wrong.

### HR scope to capture
- **Employee records:** personal details; **SIN (highly sensitive — encrypted /
  strictest-tier restricted, see cross-cutting)**; **TD1** forms (federal +
  Ontario); pay rate; employment type (hourly/salary/contract); start/end dates.
- **Time / hours source:** links to `labour_entries` (which already carry
  `hours`, `cost_rate`, `amount`), scheduling, and site-logs. **Resolve the
  double-count boundary explicitly** — the same care as the cost seam: payroll
  hours must have **one** authoritative source, and feeding payroll must not also
  double-post to job cost (or if it does, that overlap is defined, not
  accidental).
- **Vacation / PTO accrual;** benefits / deductions.

### Payroll runs
- Pay period definition; **gross → deductions → net**; paystub generation as a
  **branded PDF** (same document pipeline as quotes/invoices); **pay-slip
  numbering**; per-run **remittance summary**; **T4** generation at year-end.

### Paystub ↔ Expenses connection
A reimbursement paid in a run appears on the paystub as **its own line**, and the
**pay-slip number is written back to the expense** (Module 1, connection 3) so
both the company and the employee can trace which pay cleared which expense —
in both directions.

### Email (Resend)
Paystubs are **emailed to employees** via Resend; delivery records are retained
(same pattern as other outbound documents).

### Open decisions for Jay (payroll — list, do not decide here)
- **In-house CRA tax calc vs a payroll API/engine** (the go/no-go above).
- **How source deductions stay current** with CRA's annual rate/bracket changes.
- **SIN / PII storage + encryption approach** (at-rest encryption, access
  logging, strictest permission tier).
- **Is HR (benefits, performance reviews, documents) in scope for v1**, or a
  **later HR sub-module** after payroll proper?
- **Employee vs `techs`/`profiles` model** — do payroll "employees" reuse the
  existing `profiles`/`techs` rows or get a dedicated `employees` table linked to
  them?

---

## Cross-cutting

### Permissions (PERM-1..4)
New resources added to the permission matrix (`role_permission_matrix`,
`lib/permissions.ts`) with appropriate role gates and per-user overrides:
- **`expenses`** — techs/reps can create their own; managers/admin approve;
  finance sees all.
- **`payroll`** and **`hr`** — **highly sensitive: Admin / Accountant only.**
  **SIN and pay-rate fields behind the strictest tier** (a field-visibility
  restriction, echoing the v0.11 permissions design's field-visibility concept).
These slot into the existing editable-baseline + override + audit machinery
(DES-1 / PERM-3/4) — a new resource is a matrix column set, not a new mechanism.

### Email
Reuse **Resend** (the existing provider) for all notifications: expense approved,
expense reimbursed (with pay-slip ref), and paystub delivery. Records retained.

### Honest-data (§2.8)
- **No fabricated tax splits** — Ontario HST by default; never invent GST/PST
  breakdowns the source doesn't provide.
- **No guessed withholding** — payroll deductions come from CRA formulas / a
  certified source, never from memory.
- **No "OCR knows the tax type" pretense** — a scan reads a tax *amount*, not a
  tax *type*.

### Build-order recommendation
1. **Module 1 — Manual expenses first.** Self-contained, high value, **zero
   external dependency**, and it unlocks accurate job cost + per-person
   reimbursement immediately.
2. **Module 2 — OCR add-on**, if/when a provider is chosen — a pluggable
   enhancement behind the extraction interface, never blocking Module 1.
3. **Module 3 — Payroll/HR** as its own careful arc, **only after the compliance
   decisions (tax-engine strategy, PII, annual-maintenance) are resolved.**

---

## Open decisions requiring Jay (consolidated)

**Expenses (Module 1)**
1. Cost-recognition point for reimbursable expenses — at incurred, at approved,
   or at reimbursed (accrual vs cash treatment)?
2. Does a "merchant" ever need to link to the `vendors` table, or always
   free-text?
3. Exact GL / cost-code mapping scheme for expenses.

**Receipt OCR (Module 2)**
4. Which OCR path, if any — (a) free-tier provider, (b) self-hosted Tesseract,
   (c) stay manual? (Default until decided: **manual**.)
5. If a provider: accept per-scan cost past the free allowance, yes/no?

**Payroll / HR (Module 3)**
6. **In-house CRA tax calculation vs integrate a certified payroll engine/API.**
   (Go/no-go before any build.)
7. How source deductions stay current with CRA's annual changes (maintenance
   plan).
8. SIN / PII storage + encryption + access-logging approach; strictest
   permission tier.
9. Is HR (benefits, reviews, documents) in scope for payroll v1 or a later
   sub-module?
10. Payroll "employee" data model — reuse `profiles`/`techs` or a dedicated
    `employees` table?

**Cross-cutting**
11. Recognition timing for company-paid expense tax as an input tax credit
    (align with the FIN-7 ITC treatment of vendor-bill claimable tax).

---

*Planning only. Build deferred to after current work. Update this document — do
not let it fall behind — when any decision above is resolved.*

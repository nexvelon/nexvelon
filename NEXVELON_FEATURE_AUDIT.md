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
> **Status:** v0.10 — Modules 1-9 fully scoped through Sessions C-K.
> Modules 10-13 pending. M1-M8 condensed to headline stats per
> file-size management pattern; current module gets full content.

---

## 0. How to use this document

### 0.1-0.7

Per v0.9 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; ten dimensions of permission control; baseline gaps from Session C.

### 0.4 Permissions model — locked commitments

Through Sessions B + C + D + E + F + G + H + I + J + K:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widgets + quote terms snapshots + change order amendments + commissioning records + FIFO inventory layers + vendor-side T&C clauses + invoice send snapshots.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages, PO PDFs, remittance advice, T5018 forms, invoices, credit notes, statements).
10. **Comprehensive logging visibility** per PRINCIPLES §4. **Append-only ledgers** for inventory movements, commissioning records, acceptance records, vendor performance scoring, GL postings.
11. **Separation of duties** enforcement (AP bill creator ≠ approver; payment run creator ≠ approver).

### 0.6 Walk order

1. Clients + Sites + Contacts *(complete §1)*
2. Employees + Permissions *(complete §2)*
3. Settings *(complete §3)*
4. Dashboard *(complete §4)*
5. Quotes *(complete §5)*
6. Projects *(complete §6)*
7. Inventory *(complete §7)*
8. Vendors *(complete §8)*
9. **Invoices** *(complete §9)*
10. Subcontractors (also "Contractors")
11. Financials
12. Scheduling
13. Reports

### 0.7 Sidebar architecture *(refined Session K)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People (parent — Clients, Sites, Employees, Vendors, Contractors, Misc Contacts)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials (parent — refined Session K)
   ├── Invoices              ← M9
   ├── Payments              ← M9
   ├── Credit Notes          ← M9
   ├── AP Bills              ← M9
   ├── Payment Runs          ← M9
   ├── Statements            ← M9
   ├── Recurring Invoices    ← M9
   ├── AR Aging              ← M9
   ├── Chart of Accounts     ← M11
   ├── Bank Reconciliation   ← M11
   ├── GL Journal Entries    ← M11
   └── Tax Filing            ← M11
📈 Reports
⚙️ Settings
```

---

═══════════════════════════════════════════════════════════════════
# 1-8. Modules 1-8 — condensed headline stats
═══════════════════════════════════════════════════════════════════

## §1. Clients + Sites + Contacts

23 routes, ~110 actions, 15 lookup tables, 14 field visibilities. Per-site SLAs with precedence. Contractual integrity exception. 16 customer types. Holdback (10%/Excl/45 Ontario Construction Act). Communication log first-class. 54 acceptance criteria. Permissions design implications: items 1-14. (Full content preserved at commit `073b393`.)

## §2. Employees + Permissions

25 routes, ~80 actions, 11 lookup tables, 14 field visibilities. Six-tab permissions editor. 25+ seeded certification types. Multi-territory model. Resource Absences. Request-admin-access workflow. Effective-permissions caching. Field-level encryption on banking/SIN/access codes. 55 acceptance criteria. Permissions design implications: items 15-22. (Full content preserved at commit `4dc0cc2`.)

## §3. Settings

~70 sub-pages, ~270 actions, 16 Settings-specific tables, 4 status surfaces. 29 operator-editable lookups with uniform guided-creation wizard. 12 custom-field-definition entity managers. Workflow Rules condition-action table at v1. Email/PDF templates with Handlebars + live preview + per-language versioning. Settings change preview. 42 acceptance criteria. Permissions design implications: items 23-27. (Full content preserved at commit `87a9fc8`.)

## §4. Dashboard

3 routes, ~35 actions, 5 owned tables, 3 status surfaces. ~20 seeded widgets across 6 role default layouts. Three-way widget visibility gate. UI presentation locked as 10th dimension of permission control. 25 acceptance criteria. Permissions design implications: items 28-30. (Full content preserved at commit `6283d0f`.)

## §5. Quotes

18 routes + 1 signed-URL portal, ~85 actions, 12 owned tables, 5 status surfaces. Three quote types (Service / Project / Service Contract). Online portal acceptance (signed URL, no login, e-signature). Immutable send snapshots. Eight-layer print protection on revenue PDFs. T&C auto-composition from M1 onboarding gates. Value + discount threshold approval routing. Per-cost-centre tax codes. Holdback in totals. Field-level margin visibility. 52 acceptance criteria. Permissions design implications: items 31-37. (Full content preserved at commit `5633e25`.)

## §6. Projects

24 routes, ~110 actions, 12 owned tables, 8 status surfaces. Three-state costing (Estimated/Committed/Actual). Change order workflow with customer signature. Commissioning workflow with per-equipment test results + ULC fire-alarm verification auto-attachment. Handover package auto-assembly triggering warranty clock. Progress invoicing (Canadian Construction Act compliance). Trade Contractor lien deadline tracking (Ontario 60-day). Eight-layer print on commissioning certs + handover packages. Append-only commissioning + acceptance records. 58 acceptance criteria. Permissions design implications: items 38-44. (Full content preserved at commit `bafb708`.)

## §7. Inventory

26 routes, ~95 actions, 15 owned tables, 6 status surfaces. Multi-location stock (Warehouse, Branch, Vehicle, Project Site, Consignment, Transit Buffer, Quarantine). FIFO valuation. Append-only inventory_movements ledger. Serial number lifecycle tracking. Photo capture on receive. Project-reserved stock locking. Eight-layer print on PO PDFs. Mobile barcode scan-and-go. Vendor catalog sync from major security distributors. Vendor performance scoring. 48 acceptance criteria. Permissions design implications: items 45-49. (Full content preserved at commit `f7cee0d`.)

## §8. Vendors

18 routes, ~65 actions, 8 owned tables, 4 status surfaces. T5018 YTD tracking + annual report generation (Canada compliance). W9/W8-BEN for US. Vendor onboarding gate framework mirroring client onboarding. Insurance + WSIB expiry tracking with auto-PO-block. Vendor performance scoring with auto-degrade-of-preferred-status. Eight-layer print on remittance advice + T5018 PDFs. Banking encrypted at rest with audit-on-read. Multi-warehouse vendors. Vendor consolidated billing. 35 acceptance criteria. Permissions design implications: items 50-53. (Full content preserved at commit `f3a763a`.)

---

═══════════════════════════════════════════════════════════════════
# 9. Module: Invoices
═══════════════════════════════════════════════════════════════════

## 9.1 Purpose

Cash collection spine. Two parallel flows:

1. **Accounts Receivable (AR)** — customer invoices we send: generated from quote acceptance (deposit), project progress claims, change order amendments, final claims, retention release (Canadian Construction Act 45-day timing), service contract recurring billing. Plus credit notes for adjustments and customer payment recording.

2. **Accounts Payable (AP)** — vendor bills we receive: matched against M7 POs via 3-way match (PO + Receipt + Bill). Approval workflow with separation of duties. Payment runs (batch payments to vendors).

For security integrators specifically:
- **Progress invoicing per Canadian Construction Act** — timing rules with Ontario default 45-day holdback release
- **T5018 YTD auto-update on AP bill payment** to T5018-required vendors (Canada compliance — feeds M8 vendor tax records)
- **Multi-jurisdiction Canadian tax handling** (HST/GST/PST splits per line per cost-centre, consistent with M5 quote pattern)
- **Customer payment portal** with multiple payment methods (Stripe integration: CC, EFT, ACH, wire instructions)
- **3-way match (PO + Receipt + Bill)** automated with discrepancy flagging

## 9.2 Sidebar surface

Under 💵 **Financials** parent menu (refined Session K — Financials becomes parent like People). Sub-items: Invoices / Payments / Credit Notes / AP Bills / Payment Runs / Statements / Recurring / AR Aging. Module 11 adds GL/CoA/Bank Reconciliation sub-items to same parent.

Badge logic on Financials parent: aggregated count of overdue invoices + invoices pending send + AP bills pending approval + payment runs pending approval. Operator-configurable in Settings.

## 9.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/financials/invoices` | AR invoice list with aging | `invoices:viewList` |
| `/financials/invoices/new` | Manual create wizard | `invoices:create` |
| `/financials/invoices/[id]` | Detail (Overview tab) | `invoices:viewDetail` |
| `/financials/invoices/[id]/edit` | Edit (Draft state only) | `invoices:editDraft` |
| `/financials/invoices/[id]/send` | Send modal | `invoices:send` |
| `/financials/invoices/[id]/payments` | Payments applied | `invoices:viewPayments` |
| `/financials/invoices/[id]/credit-notes` | Credit notes against this invoice | `credit_notes:viewByInvoice` |
| `/financials/payments` | All payments | `payments:viewList` |
| `/financials/payments/new` | Record payment | `payments:create` |
| `/financials/payments/[id]` | Payment detail with applications | `payments:viewDetail` |
| `/financials/credit-notes` | Credit note list | `credit_notes:viewList` |
| `/financials/credit-notes/new` | Create credit note | `credit_notes:create` |
| `/financials/credit-notes/[id]` | Detail | `credit_notes:viewDetail` |
| `/financials/ap-bills` | Vendor bill list | `ap_bills:viewList` |
| `/financials/ap-bills/new` | Manual create or from PO | `ap_bills:create` |
| `/financials/ap-bills/[id]` | Detail with 3-way match | `ap_bills:viewDetail` |
| `/financials/payment-runs` | AP payment batch list | `payment_runs:viewList` |
| `/financials/payment-runs/new` | Create batch | `payment_runs:create` |
| `/financials/payment-runs/[id]` | Execute batch | `payment_runs:viewDetail` |
| `/financials/statements` | Customer statement generation | `statements:view` |
| `/financials/recurring` | Recurring invoice templates | `recurring_invoices:viewList` |
| `/financials/ar-aging` | AR aging report with drill-through | `invoices:viewAging` |

Public-facing:
| `/pay/[token]` | Customer payment portal (signed URL) | signed URL validation |

## 9.4 Resources

### Owned tables (14)

**AR side:**
- `invoices` — AR header: invoice_number (auto), client_id, billing_addr_snapshot jsonb (immutable at send), originating_quote_id (nullable), source_project_id (nullable), source_change_order_id (nullable), recurring_template_id (nullable), invoice_type_id, status_id, currency_id, language_id, invoice_date, due_date, total_subtotal, total_tax, total_holdback, total_amount, paid_to_date, balance, late_fee_applied, late_fee_pct, snapshot_terms jsonb (legal durability per §0.4 #8), created_by, sent_at, sent_to_addresses
- `invoice_lines` — line items: invoice_id, pricebook_item_id (nullable), description, qty, unit_price, tax_code_id, cost_center_id, line_subtotal, source_project_phase_id (nullable for progress claims), source_quote_line_id (nullable)
- `invoice_taxes` — tax application per line per code (Canadian split-tax handling)
- `invoice_payments` — junction table: invoice_id, payment_id, amount_applied, applied_at
- `payments` — payment record (may apply to multiple invoices): payment_number (auto), client_id, method_id, amount, currency_id, received_at, reference (cheque #, transaction ID), status_id, fee_amount (gateway fee), notes, recorded_by
- `credit_notes` — header: credit_note_number, client_id, related_invoice_id (nullable), reason_id, amount, status_id, issued_at, applied_at
- `credit_note_lines` — line items
- `customer_statements` — generated statement records: client_id, period_start, period_end, opening_balance, charges, payments, closing_balance, statement_pdf_url, generated_at, sent_at

**AP side:**
- `ap_bills` — vendor invoice header: bill_number (vendor's), our_bill_id (auto), vendor_id, source_po_id (nullable), bill_date, due_date, total_amount, status_id, three_way_match_status (Pending/Matched/Discrepancy/Manual Override), discrepancy_notes, approved_by, approved_at, paid_via_payment_run_id (nullable)
- `ap_bill_lines` — bill line items with PO line matching
- `ap_bill_payments` — payments to vendors
- `ap_payment_runs` — batch payment runs: run_number, scheduled_date, total_amount, status_id, executed_at, executed_by, payment_method_id
- `ap_payment_run_lines` — bills in run

**Recurring:**
- `recurring_invoice_templates` — recurring config: client_id, source_service_contract_id (nullable from M1), template_lines jsonb, billing_cycle (Monthly/Quarterly/Annual), next_generation_date, last_generated_at, status_id, auto_send flag

### Status lookup tables (5)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `invoice_statuses` | Draft, Pending Approval, Approved, Sent, Viewed (auto), Partially Paid, Paid, Overdue, Void, Cancelled, Refunded | allows-edit, allows-send, allows-payment, triggers-late-fee, terminal flag |
| `invoice_types` | Standard, Deposit, Progress Claim, Phase Completion, Final Claim, Retention/Holdback Release, Recurring (Service Contract), Credit Memo, Manual | template variant, holdback handling, late fee applicability |
| `payment_statuses` | Pending, Cleared, Bounced, Refunded, Disputed | accounting flag, AR impact |
| `ap_bill_statuses` | Received, Pending Approval, Approved for Payment, Scheduled, Paid, Disputed, Void | allows-edit, triggers-payment-run-eligibility |
| `credit_note_statuses` | Draft, Approved, Issued, Applied to Invoice, Applied as Refund, Void | accounting flag |

## 9.5 Actions (~115 actions across 12 categories)

**AR Invoice lifecycle (25):** viewList, viewMy, viewDetail, create (manual; rare), createFromQuote (auto on acceptance), createFromProject (progress claim), createFromChangeOrder, createFromServiceContract (recurring), createDepositInvoice, createFinalClaim, createRetentionRelease, editDraft, addLine, removeLine, applyDiscount, applyTax, submit (for approval if exceeds threshold), approve, reject, send, resend, sendReminder, void, reopen (Void → Draft, A only), hardDelete (Void only, A only), markPaid, recordPartialPayment, exportPdf, printProtected.

**Late fees (4):** applyLateFee (auto-trigger; manual override), waiveLateFee (A/Acc only), viewLateFeeHistory, configureLateFeePolicy (Settings link).

**Payments (12):** viewList, viewDetail, recordPayment, applyToInvoice, splitAcrossInvoices, recordOverpayment, recordRefund, recordBounce, reverseBounce, viewPaymentReceipt, sendReceipt, exportToAccounting.

**Credit notes (8):** viewList, viewDetail, create, applyToInvoice, applyAsCustomerCredit, applyAsRefund, void, exportPdf.

**Customer payment portal (3, public via signed URL):** viewInvoiceOnline, payOnline (Stripe), downloadInvoicePdf.

**Recurring invoices (8):** viewList, viewDetail, create, edit, pauseRecurring, resumeRecurring, cancelRecurring, generateNext (manual trigger).

**AP bills (15):** viewList, viewDetail, create (manual), createFromPO (with 3-way match), edit, performThreeWayMatch, recordDiscrepancy, approve, reject, dispute, addToPaymentRun, payManually, viewPaymentHistory, void, exportToAccounting.

**AP payment runs (8):** viewList, viewDetail, create, addBills, removeBill, approve, executePaymentRun, cancelRun.

**Statements (5):** generatePerCustomer, bulkGenerateForPeriod, sendStatement, sendStatementBatch, viewStatementHistory.

**AR aging (4):** viewAging, viewByBucket, viewByClient, exportAgingReport.

**Communication (4):** viewLog, sendInternalNote, sendCustomerCommunication, mentionTeam.

**Reports (5):** viewARTrend, viewCashFlow, viewLateFeeRevenue, viewPaymentMethodMix, viewTaxLiability.

**Default grants:**
- **A:** full access including hardDelete, override approvals
- **Acc:** full invoice creation, send, payment recording, credit note creation, AP bill approval, payment run execution, late fee waiver
- **PM:** viewList (team-scoped), createFromProject (project they manage), viewPayments, cannot send (Acc gate)
- **SR:** viewMy (own clients' invoices only), no edit
- **Tech:** view-none default
- **VO:** viewList without amounts

## 9.6 Views

### Invoice list (`/financials/invoices`)

Filter chips: status, type, client, project, date range, value range, overdue-only, expiring-soon. View toggle: List / Kanban (by status). Bulk actions: send, send-reminder, mark-paid, export-aging. Inline aging bucket per row.

### Invoice detail page — 8 tabs

1. **Overview** — header card (status, total, balance, client, type, dates), quick actions
2. **Line Items** — editable in Draft; read-only after send (snapshot retained)
3. **Pricing & Tax** — full breakdown matching quote pattern
4. **Payments Applied** — list of payments with amounts, dates, methods
5. **Credit Notes** — credit notes affecting this invoice
6. **Communication** — log of sends, reminders, customer responses
7. **Activity** — chronological state changes
8. **Audit Log** — full audit drilldown

### Customer payment portal (`/pay/[token]`)

- Public, no login required
- Signed URL scoped to single invoice, expires on payment or 90 days
- Branded invoice display
- Multiple payment methods (Stripe integration):
  - Credit Card (Visa/MC/Amex)
  - EFT (Canadian bank transfer)
  - ACH (US)
  - Wire instructions display
- Operator-configurable CC surcharge per client (offsetting Stripe fees, disclosed)
- Payment confirmation + receipt emailed
- Records to `invoice_payments` + `payments` tables

### Recording payment manually

Modal-based flow:
1. Select client
2. Select payment method (Cheque, EFT, Wire, Cash, etc.)
3. Amount + currency
4. Reference (cheque #, transaction ID)
5. Apply-to-invoices selector (split one payment across multiple invoices, oldest-first auto-suggest)
6. Overpayment goes to customer credit balance
7. Records to `payments` + creates `invoice_payments` links

### AR Aging report

Buckets: Current / 0-30 / 31-60 / 61-90 / 91+. Drill-through to individual invoices. Filter by client, project, customer tier. Export PDF + CSV.

### AP bill detail with 3-way match

Side-by-side view:
- PO (from M7): expected quantities + prices
- Receipt (from M7 po_receipts): received quantities + dates
- Bill (this entity): vendor's claimed quantities + prices

Auto-match status:
- ✅ Matched: all three align
- ⚠️ Discrepancy: variances flagged
- ❌ No PO: manual override required with reason captured

### AP payment run interface

Batch workflow:
1. Select bills to pay (Approved-for-Payment status)
2. Choose payment method per vendor
3. Review totals + EFT export file
4. Approve (separation-of-duties: creator ≠ approver)
5. Execute → generates payment file + updates bill statuses + writes payment records
6. Audit trail

### Statement generator

- Per-customer or bulk
- Period selection
- Show: opening balance, charges, payments, closing balance
- Generate PDF (eight-layer protected)
- Email batch send

## 9.7 Field-level visibility

8 flags:

- `visibility.invoices.profit` — A, PM, Acc (gross profit on invoice vs project cost — gated)
- `visibility.invoices.discountReason` — A, PM
- `visibility.invoices.internalNotes` — A, PM, Acc, creator
- `visibility.invoices.lineCost` — A, Acc
- `visibility.payments.fullCardNumber` — never (PCI compliance; only last 4)
- `visibility.payments.bankAccountInfo` — A, Acc only
- `visibility.ap_bills.unitCost` — A, Acc, PM
- `visibility.statements.fullHistory` — A, Acc, AM-assigned

## 9.8 Custom-field surfaces

Per-invoice custom fields managed in Settings → Custom Fields → Invoices. Common examples: PO Reference (customer's PO number for this invoice), Job Number (customer's job number), Project Code, Cost Center Reference, Tax Exempt Status, Discount Authorization, Special Handling Notes.

## 9.9 Status surfaces

5 lookup tables (see §9.4). Plus reuse of payment_methods from M1.

## 9.10 Cross-module relationships

### Reads

- **Quotes (M5):** quote acceptance triggers initial invoice creation
- **Projects (M6):** progress claims, change order amendments, final claim, retention release timing
- **Inventory (M7):** POs feed AP bill 3-way match; vendor catalog for AP bill line items
- **Vendors (M8):** vendor master for AP, T5018 YTD updates on AP bill payment
- **Clients (M1):** billing config, holdback, payment terms, on_stop blocks send, late fee policy
- **Settings (M3):** invoice templates per type per language, tax codes, currencies, approval workflows, late fee policy
- **Employees (M2):** assigned PM and AM for routing

### Writes

- **Financials (M11):** GL postings on every state change
- **Communication log (M1):** all customer communications about invoices
- **Service contracts (M1):** recurring billing schedule updates
- **Vendors (M8):** T5018 YTD update on AP bill payment to T5018-required vendor
- **Audit on every state change**

### Events emitted

`invoice.created`, `invoice.updated`, `invoice.sent`, `invoice.viewed_by_client`, `invoice.payment_recorded`, `invoice.paid_in_full`, `invoice.overdue`, `invoice.late_fee_applied`, `invoice.void`, `payment.received`, `payment.applied`, `payment.bounced`, `payment.refunded`, `credit_note.issued`, `credit_note.applied`, `ap_bill.received`, `ap_bill.approved`, `ap_bill.three_way_match_failed`, `ap_bill.paid`, `payment_run.executed`, `recurring_invoice.generated`, `statement.generated`, `statement.sent`.

## 9.11 Competitive floor delta

Combines best of:
- **simPRO:** Progress claims with retention, recurring invoices, accounting integration (MYOB/Xero/QBO), supplier invoice import, customer payment recording, AP payment runs
- **ServiceTitan:** Online payment portal with multiple methods, payment plans, financing integration, automated reminders
- **QuickBooks Online:** AR aging, statements, automated late fees, multi-currency
- **Wave Accounting:** Free customer payment portal

**Nexvelon-unique:**
- **Eight-layer print protection** on invoice PDFs, credit notes, statements (sensitive financial documents)
- **Signed URL customer payment portal** (no login required, scoped to single invoice — faster than competitors requiring customer registration)
- **Canadian Construction Act compliance** — holdback release auto-generated at 45-day mark (Ontario default); manual approval before send
- **T5018 YTD auto-update on AP bill payment** to T5018-required vendors (Canada compliance)
- **3-way match (PO + Receipt + Bill) automated** with discrepancy flagging
- **Separation of duties on AP payment runs** (creator ≠ approver enforced)
- **Per-cost-centre tax codes on invoices** (Canadian split-tax compliance — inherited from M5 quote pattern)
- **Immutable invoice snapshot at send** (line items, pricing, T&C, billing address captured for legal durability per §0.4 #8)
- **Late fee auto-application** per client config with compounding flag (per M1)
- **Customer credit balance tracking** (overpayments + credit notes accumulate)
- **Recurring invoice templates linked to Service Contracts** from M1
- **AR aging with project-scoped view** for PMs
- **Multi-currency invoices** with exchange rate snapshot

## 9.12 Permissions design implications (items 54-58)

54. **Invoice state machine with field-level lock per state.** Draft → editable; Pending Approval → restricted edits with audit; Approved → locked for line items; Sent → fully locked (snapshot retained); Paid → terminal.

55. **Customer payment portal signed URL scoped to single invoice.** Not general access tokens. Revoked on payment. Maximum 90-day life.

56. **Late fee auto-application gated to A/Acc.** SR/PM cannot waive late fees. Late fee waiver requires reason captured in audit.

57. **AR aging visibility per role.** A/Acc see all; PM sees own projects' invoices only; SR sees own clients' aging only.

58. **AP bill approval workflow with separation of duties.** Bill creator (who entered the bill) cannot also approve it for payment. Enforced at action level. Audit captures both creator and approver.

## 9.13 Open questions — RESOLVED IN SESSION K

1. ✅ **Payment gateway:** Stripe at v1 (Canadian-supportive, CC + EFT + ACH + wire reconciliation).
2. ✅ **Email payment reminders:** auto schedule at 7/14/30 days overdue; operator-configurable per client.
3. ✅ **Customer portal:** signed URL only (consistent with quote portal pattern).
4. ✅ **Recurring invoice generation timing:** configurable per template; default start-of-period.
5. ✅ **Multi-currency invoices:** YES — invoice in client's currency from client config.
6. ✅ **Holdback release invoice:** auto-generated at 45-day mark; manual approval before send (Canadian Construction Act compliance).
7. ✅ **Credit note application:** both — apply to specific invoice OR record as customer credit balance.
8. ✅ **Tax-by-line vs tax-by-invoice:** both supported (per-line preferred; per-invoice for simple).
9. ✅ **AP bill matching to PO:** 3-way match (PO + Receipt + Bill) at v1.
10. ✅ **AR aging buckets:** standard 0-30 / 31-60 / 61-90 / 91+.
11. ✅ **Late fees:** compound or simple per Module 1 client config (compounding flag exists).
12. ✅ **CC surcharge to customer:** YES operator-configurable per client; disclosed on portal.
13. ✅ **Partial refunds:** YES via Stripe API at v1; manual cheque refunds for non-card.
14. ✅ **Invoice approval workflow:** simpler than quotes — A/Acc always required to send; no per-tier approval thresholds at v1.

Remaining:

15. **Customer payment plans** (installment agreements): *Recommendation: Phase 2; manual scheduling at v1.*
16. **Multi-entity invoicing** (single client billed across multiple of our entities): *Recommendation: Phase 2.*

## 9.14 Acceptance criteria (~55 scenarios)

### Functional — AR invoice lifecycle (1-12)

1. Create deposit invoice from accepted quote → Draft → Acc reviews → Acc sends → status Sent.
2. Progress claim auto-generated from project phase completion.
3. Change order amendment generates amended invoice.
4. Final claim invoice generated on project completion sign-off.
5. Retention release invoice auto-generated at 45-day mark; manual approval before send.
6. Service contract recurring invoice generated per cycle.
7. Immutable snapshot at send (line items, T&C, billing address captured).
8. Late fee auto-applied at 30 days overdue per client config.
9. Void invoice → status Void → reverses GL postings → audit trail.
10. Invoice with client On Stop → send blocked.
11. Invoice partial payment → status Partially Paid; balance shown.
12. Invoice full payment → status Paid; closes GL receivable.

### Functional — Payment recording (13-18)

13. Record cheque payment → applies to oldest invoice automatically (operator override).
14. Split one payment across 3 invoices.
15. Record overpayment → goes to customer credit balance.
16. Record bounce → reverses application; alert generated.
17. Refund via Stripe → reverses payment.
18. Payment receipt emailed automatically on record.

### Functional — Customer payment portal (19-23)

19. Client clicks tracking link → portal loads → invoice displayed.
20. Client pays via CC (Stripe) → payment recorded → status updated → receipt emailed.
21. Client pays via EFT → ACH instructions displayed; manual reconciliation later.
22. Signed URL expires after payment.
23. Signed URL revoked manually by Acc → access blocked.

### Functional — Credit notes (24-27)

24. Create credit note applied to specific invoice → reduces invoice balance.
25. Create credit note as customer credit balance → available for future invoices.
26. Apply credit balance to new invoice on send.
27. Credit note PDF eight-layer protected.

### Functional — Recurring invoices (28-31)

28. Create recurring template from accepted Service Contract Quote → linked to service_contract.
29. Monthly recurring auto-generates next invoice on schedule.
30. Pause recurring → skips generation until resumed.
31. Cancel recurring → marks template Cancelled.

### Functional — AP bills (32-39)

32. Create AP bill from PO → 3-way match performed automatically.
33. 3-way match all align → status Approved-for-Payment.
34. 3-way match price discrepancy → flag → manual review → override with reason.
35. 3-way match qty discrepancy → flag → return to vendor process.
36. AP bill without matching PO → manual override required (A/Acc) + reason.
37. AP bill approval: bill creator cannot approve (separation of duties).
38. AP bill payment via payment run.
39. T5018 YTD updated on AP bill payment to T5018-required vendor.

### Functional — AP payment runs (40-43)

40. Create payment run; add eligible bills.
41. Approve payment run (separation of duties: run creator ≠ approver).
42. Execute payment run → EFT file generated → bills marked Paid.
43. Cancel payment run before execution → bills returned to eligible state.

### Functional — Statements (44-46)

44. Generate statement for one customer.
45. Bulk generate statements for all customers with activity.
46. Statement PDF eight-layer protected.

### Functional — AR aging & late fees (47-50)

47. AR aging buckets calculated correctly (0-30 / 31-60 / 61-90 / 91+).
48. Late fee applied at 30 days per client config (compounding tested).
49. Late fee waived by Acc with reason captured.
50. SR cannot waive late fee.

### Functional — Permissions (51-53)

51. PM sees only own-project invoices in aging.
52. SR sees only own-client invoices.
53. AP bill creator blocked from approving same bill.

### Functional — Performance & security (54-55)

54. AR aging across 5000 invoices loads <3s.
55. RLS blocks unauthorized invoice view.

---

═══════════════════════════════════════════════════════════════════
# Modules 10-13: pending walk
═══════════════════════════════════════════════════════════════════

- §10 — Subcontractors (also "Contractors")
- §11 — Financials
- §12 — Scheduling
- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary

*Running count: ~965 actions across 9 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7 + ~65 M8 + ~115 M9).*

## 100. Final sidebar tree

*Refined Session K — see §0.7. Financials parent with 12 sub-items spanning M9 + M11.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*58 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5, 38-44 M6, 45-49 M7, 50-53 M8, 54-58 M9).*

## 103. Cumulative acceptance criteria

*~426 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5 + ~58 M6 + ~48 M7 + ~35 M8 + ~55 M9).*

---

**End of v0.10.** Modules 1-9 complete. Invoices module scoped with two parallel flows (AR + AP), customer payment portal with Stripe integration (CC + EFT + ACH + wire), 3-way match (PO + Receipt + Bill) with separation of duties, T5018 YTD auto-update on AP payments (Canada compliance), Canadian Construction Act holdback release timing, eight-layer print on invoice/credit note/statement PDFs, immutable send snapshots for legal durability, recurring invoice templates linked to Service Contracts, multi-currency with exchange rate snapshots. Sidebar architecture refined: Financials becomes parent menu with 12 sub-items spanning M9 + M11. Cross-cutting commitments from Sessions C-K propagate forward.

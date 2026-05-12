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
> **Status:** v0.12 — Modules 1-11 fully scoped through Sessions C-M.
> Modules 12-13 pending. M1-M10 condensed to headline stats per
> file-size management pattern; current module gets full content.

---

## 0. How to use this document

### 0.1-0.7

Per v0.11 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; ten dimensions of permission control; baseline gaps from Session C.

### 0.4 Permissions model — locked commitments

Through Sessions B-M:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widgets + quote terms snapshots + change order amendments + commissioning records + FIFO inventory layers + vendor-side T&C clauses + invoice send snapshots + contractor WO terms snapshots + labor rate snapshots + GL period locking.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages, PO PDFs, remittance advice, T5018 forms, invoices, credit notes, statements, contractor WOs, MSA forms, tax filings, financial reports).
10. **Comprehensive logging visibility** per PRINCIPLES §4. **Append-only ledgers** for inventory movements, commissioning records, acceptance records, vendor/contractor performance scoring, GL postings.
11. **Separation of duties** enforcement (AP bill creator ≠ approver; payment run creator ≠ approver; GL manual entry creator ≠ poster; hard close requires A + Acc co-sign).
12. **Regulatory expiry auto-block enforcement** (insurance + WSIB expired → PO/WO creation blocked; manual override requires A approval + reason).

### 0.6 Walk order

1. Clients + Sites + Contacts *(complete §1)*
2. Employees + Permissions *(complete §2)*
3. Settings *(complete §3)*
4. Dashboard *(complete §4)*
5. Quotes *(complete §5)*
6. Projects *(complete §6)*
7. Inventory *(complete §7)*
8. Vendors *(complete §8)*
9. Invoices *(complete §9)*
10. Subcontractors *(complete §10)*
11. **Financials** *(complete §11)*
12. Scheduling
13. Reports

### 0.7 Sidebar architecture *(unchanged from Session K)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People (parent — Clients, Sites, Employees, Vendors, Contractors, Misc Contacts)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling
💵 Financials (parent — Invoices, Payments, Credit Notes, AP Bills, Payment Runs, Statements, Recurring, AR Aging from M9; Chart of Accounts, GL Journal Entries, Bank Reconciliation, Tax Filing, Period Close, Cash Flow, Financial Reports, Integrations from M11)
📈 Reports
⚙️ Settings
```

---

═══════════════════════════════════════════════════════════════════
# 1-10. Modules 1-10 — condensed headline stats
═══════════════════════════════════════════════════════════════════

## §1. Clients + Sites + Contacts
23 routes, ~110 actions, 15 lookup tables, 14 field visibilities. Per-site SLAs with precedence. Contractual integrity exception. Holdback (10%/Excl/45 Ontario). 54 acceptance criteria. Permissions: items 1-14. (Full content at `073b393`.)

## §2. Employees + Permissions
25 routes, ~80 actions, 11 lookup tables, 14 field visibilities. Six-tab permissions editor. 25+ seeded certifications. Multi-territory. Resource Absences. 55 acceptance criteria. Permissions: items 15-22. (Full content at `4dc0cc2`.)

## §3. Settings
~70 sub-pages, ~270 actions, 16 tables, 4 status surfaces. 29 operator-editable lookups. 12 custom-field definition managers. Workflow Rules. Email/PDF templates. 42 acceptance criteria. Permissions: items 23-27. (Full content at `87a9fc8`.)

## §4. Dashboard
3 routes, ~35 actions, 5 owned tables, 3 status surfaces. ~20 seeded widgets, 6 role layouts. Three-way visibility gate. UI presentation as 10th dimension. 25 acceptance criteria. Permissions: items 28-30. (Full content at `6283d0f`.)

## §5. Quotes
18 routes + 1 portal, ~85 actions, 12 owned tables, 5 status surfaces. Three quote types. Online portal acceptance. Immutable send snapshots. Eight-layer print. T&C auto-composition. 52 acceptance criteria. Permissions: items 31-37. (Full content at `5633e25`.)

## §6. Projects
24 routes, ~110 actions, 12 owned tables, 8 status surfaces. Three-state costing. Change order workflow. Commissioning + ULC verification. Handover with warranty clock. Progress invoicing. Lien deadline tracking (Ontario 60-day). 58 acceptance criteria. Permissions: items 38-44. (Full content at `bafb708`.)

## §7. Inventory
26 routes, ~95 actions, 15 owned tables, 6 status surfaces. Multi-location stock. FIFO valuation. Append-only movements ledger. Serial lifecycle. Photo on receive. Vendor catalog sync. 48 acceptance criteria. Permissions: items 45-49. (Full content at `f7cee0d`.)

## §8. Vendors
18 routes, ~65 actions, 8 owned tables, 4 status surfaces. T5018 YTD + annual report (Canada). Vendor onboarding gates. Insurance/WSIB expiry tracking with auto-PO-block. Performance scoring with auto-degrade. Banking encrypted at rest. 35 acceptance criteria. Permissions: items 50-53. (Full content at `f3a763a`.)

## §9. Invoices
22 routes + 1 portal, ~115 actions, 14 owned tables, 5 status surfaces. AR + AP parallel flows. Customer payment portal with Stripe. 3-way match. Separation of duties on AP. T5018 auto-update. Canadian Construction Act holdback. Multi-currency. 55 acceptance criteria. Permissions: items 54-58. (Full content at `681b2ad`.)

## §10. Subcontractors
23 routes, ~75 actions, 13 owned tables, 5 status surfaces. WSIB auto-block (Ontario regulatory; §0.4 #12). T5018 mandatory. Lien deadline tracking. Worker manifest with cert verification. Skill + territory matching. Versioned labor rates. Cross-link with M8. 38 acceptance criteria. Permissions: items 59-62. (Full content at `4c0b33b`.)

---

═══════════════════════════════════════════════════════════════════
# 11. Module: Financials
═══════════════════════════════════════════════════════════════════

## 11.1 Purpose

General Ledger backbone. Every state change in every operational module posts to GL here:
- M5 quote (no GL — quote is not yet revenue)
- M6 project costs (timesheet approval, materials consumed, sub costs)
- M7 inventory movements (receive, issue, write-off, FIFO consumption)
- M8 vendor (none direct; feeds M7 POs + M9 AP bills)
- M9 invoice (AR + AP cycles)
- M10 contractor (none direct; feeds M9 AP bills)
- M2 payroll (Payroll Expense DR, Cash CR, Tax Withholding CR)
- M1 holdback (Holdback Payable accrual)

Plus: Bank reconciliation. Canadian-first tax filing (HST/GST/PST + T4 + T5018). Period close (month-end + year-end). Cash flow management. Financial reports. QBO/Xero/Sage 50 integration (optional).

**Key design choice:** Nexvelon ships **with a built-in GL** so operators don't need separate accounting software at v1. But also exports to QBO/Xero/Sage 50 for operators who keep external accounting. v1: export + manual reconciliation. Bidirectional sync Phase 2.

## 11.2 Sidebar surface

Under 💵 Financials parent per §0.7. M11 contributes 8 sub-items: Chart of Accounts / GL Journal Entries / Bank Reconciliation / Tax Filing / Period Close / Cash Flow / Financial Reports / Integrations. (M9 contributes the other 8.)

## 11.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/financials/chart-of-accounts` | CoA hierarchy | `coa:viewList` |
| `/financials/chart-of-accounts/[id]` | Account detail with mappings | `coa:viewDetail` |
| `/financials/chart-of-accounts/new` | Create account wizard | `coa:create` |
| `/financials/gl-journal-entries` | GL entries list | `gl:viewList` |
| `/financials/gl-journal-entries/new` | Manual entry (A/Acc only) | `gl:createManual` |
| `/financials/gl-journal-entries/[id]` | Entry detail with source drill-back | `gl:viewDetail` |
| `/financials/gl-recurring` | Recurring journal templates | `gl_recurring:viewList` |
| `/financials/bank-accounts` | Bank accounts | `bank_accounts:viewList` |
| `/financials/bank-accounts/[id]` | Account detail | `bank_accounts:viewDetail` |
| `/financials/bank-reconciliation` | Reconciliation hub | `bank_recon:view` |
| `/financials/bank-reconciliation/[accountId]` | Active reconciliation session | `bank_recon:execute` |
| `/financials/tax-filing` | Tax filing dashboard | `tax_filing:view` |
| `/financials/tax-filing/hst-gst` | HST/GST returns | `tax_filing:viewHstGst` |
| `/financials/tax-filing/payroll` | T4 + payroll remittances | `tax_filing:viewPayroll` |
| `/financials/tax-filing/contractor` | T5018 from M8/M10 | `tax_filing:viewT5018` |
| `/financials/period-close` | Month-end + year-end | `period_close:view` |
| `/financials/cash-flow` | Forecast + actual cash flow | `cash_flow:view` |
| `/financials/reports/p-and-l` | P&L (Income Statement) | `reports:viewPnL` |
| `/financials/reports/balance-sheet` | Balance Sheet | `reports:viewBalanceSheet` |
| `/financials/reports/cash-flow-statement` | Cash Flow Statement | `reports:viewCashFlow` |
| `/financials/reports/trial-balance` | Trial Balance | `reports:viewTrialBalance` |
| `/financials/reports/budget-variance` | Budget vs Actual | `reports:viewBudgetVariance` |
| `/financials/integrations` | QBO/Xero/Sage 50 hub | `integrations:viewFinancial` |
| `/financials/integrations/qbo` | QuickBooks Online sync | `integrations:configureQbo` |
| `/financials/integrations/xero` | Xero sync | `integrations:configureXero` |
| `/financials/fx-revaluation` | Period-end FX adjustments | `fx:execute` |

## 11.4 Resources

### Owned tables (12)

- `chart_of_accounts` — accounts: account_number, name, type_id, sub_type_id, parent_account_id, currency_id, tax_treatment_id, is_active, description, allow_manual_posting
- `gl_journal_entries` — header: entry_number, posting_date, description, source_module (M5/M6/M7/M8/M9/M10/M2/Manual), source_id, source_event_type, posted_by, posted_at, status_id, reversal_of_entry_id (nullable), locked_period_id (nullable)
- `gl_journal_lines` — debit/credit lines: entry_id, account_id, debit, credit, currency_id, exchange_rate, foreign_currency_amount, line_description
- `bank_accounts` — bank account master: name, bank_name, account_number_masked, routing_number_masked, currency_id, gl_account_id, opening_balance, current_balance, current_balance_as_of, plaid_connection_id (Phase 2)
- `bank_transactions` — bank feed/imported: account_id, transaction_date, description, amount, running_balance, reference, matched_to_gl_line_id (nullable), match_confidence, import_source
- `bank_reconciliation_sessions` — per-account periodic reconciliation: account_id, period_start, period_end, started_by, completed_by, ending_balance_per_bank, ending_balance_per_gl, variance, status_id, attached_statement_url
- `accounting_periods` — period definitions: period_start, period_end, period_type (Month/Quarter/Year), status_id, soft_closed_by, soft_closed_at, hard_closed_by, hard_closed_at, hard_close_co_signer
- `tax_filings` — tax return records: filing_type_id (HST/GST/PST/T4/T5018), period_start, period_end, total_collected, total_paid_out, total_remittance, filing_status_id, filed_at, cra_confirmation_number, attached_filing_pdf, attached_cra_response
- `recurring_journal_templates` — recurring entries: name, description, schedule, template_lines jsonb, next_generation_date, last_generated_at, status
- `fx_revaluation_runs` — period-end FX adjustment batches: period_id, executed_at, executed_by, total_unrealized_gain_loss, status, attached_revaluation_report_url
- `accounting_integrations` — QBO/Xero/Sage 50 connections: integration_type, connection_state (encrypted OAuth in Vault), last_sync_at, sync_direction, mapping_rules jsonb, is_active
- `accounting_integration_sync_log` — sync history: integration_id, sync_started_at, sync_completed_at, records_pushed, records_pulled, records_with_conflict, status, error_log_jsonb

### Status lookup tables (6)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `coa_account_types` | Asset, Liability, Equity, Revenue, COGS, Expense, Other Income, Other Expense | balance sheet vs income statement, sign convention |
| `coa_account_sub_types` | Current Asset, Non-Current Asset, AR, Inventory, Fixed Assets, Accumulated Depreciation, Current Liability, Non-Current Liability, AP, Accrued Liabilities, Taxes Payable, Owner's Equity, Retained Earnings, Sales Revenue, Service Revenue, Recurring Revenue, COGS, Direct Labor, Subcontractor Costs, Materials, Operating Expenses, Administrative, Tax Expense, Other | report grouping, default tax treatment |
| `gl_entry_statuses` | Draft, Posted, Reversed, Locked (in closed period) | allows-edit, allows-reversal |
| `period_statuses` | Open, Soft Close, Hard Close, Reopened | allows-posting, requires-approval-to-reopen |
| `tax_filing_statuses` | Draft, In Review, Filed, Acknowledged by CRA, Disputed, Closed | allows-edit, regulatory-deadline |
| `bank_recon_statuses` | Not Started, In Progress, Variance Identified, Reconciled, Locked | allows-modification |

## 11.5 Actions (~90 actions across 10 categories)

**Chart of Accounts (10):** viewList, viewDetail, create, edit, archive, viewMappings, importFromTemplate, exportCoa, viewHierarchy, recategorize.

**GL Journal Entries (12):** viewList, viewDetail, createManual (A/Acc separation of duties), editDraft, postEntry, reverseEntry, viewSourceTraceability (drill-back to source), bulkReverse, viewRecurring, generateRecurringNext, viewVariance, lockEntry.

**Bank Reconciliation (10):** viewList, startReconciliation, importBankStatement (CSV/OFX), connectBankFeed (Plaid Phase 2), matchTransaction (auto + manual), splitTransaction, addUnmatched, completeReconciliation, viewVariance, exportReconReport.

**Bank Accounts (5):** viewList, viewDetail, create, edit, archive.

**Period Close (8):** viewPeriods, softClose, hardClose (requires A + Acc co-sign), reopenPeriod (A only with reason), runPeriodEndChecks, runFxRevaluation, exportPeriodReport, viewLockStatus.

**Tax Filing (12):** viewDashboard, generateHstGstReturn, generateT4Slips, generateT5018Slips (consuming M8 + M10), recordRemittance, viewFilingHistory, exportFilingPdf, exportFilingCsv, recordCraResponse, viewTaxLiabilityBalance, configureFilingSchedule, generatePayrollRemittance.

**Cash Flow (5):** viewForecast, viewActual, viewByPeriod, drillDownByCategory, exportForecast.

**Reports (15):** viewProfitLoss, viewBalanceSheet, viewCashFlowStatement, viewTrialBalance, exportToExcel, exportToPdf, viewByDepartment, viewByProject, compareToBudget, viewBudgetVariance, viewExpensesByCategory, viewRevenueBySource, viewMarginByProject (field-level gated), exportForAccountant, customizeReportLayout.

**Integrations (8):** connectQbo, connectXero, connectSage50, disconnectIntegration, configureMapping, triggerSync, viewSyncHistory, resolveConflict.

**Default grants:**
- **A:** full access including hard close + reopen periods + manual GL entries
- **Acc:** full access except hard close (requires A co-sign)
- **PM:** view P&L for own projects only; view AR aging from M9; no GL detail access
- **SR:** view none
- **Tech:** view none
- **VO:** view P&L only (no margin); view Balance Sheet (no detail accounts)
- **Bookkeeper** (special role; granted via M2): view + post manual entries; cannot close periods

## 11.6 Views

### Chart of Accounts (`/financials/chart-of-accounts`)

Hierarchical tree view. Filter by account type. Show: account number, name, type, sub-type, current balance, currency, last-activity-date. Drill into account → see all GL entries posted + module sources + filter by period.

### GL Journal Entry detail

Header + debit/credit lines + source traceability. **Source drill-back:** every GL entry shows its origin module + entity + event. Permission-aware (PM sees only own-project drill-backs).

### Bank Reconciliation interface

Side-by-side: bank statement transactions vs GL postings. Auto-match by date + amount. Manual match drag-drop. Unmatched list. Running variance. Complete locks session.

### Period Close workflow

Step-by-step checklist:
1. Review AR aging (drill into M9)
2. Review AP aging (drill into M9)
3. Verify inventory valuation matches FIFO
4. Run FX revaluation for foreign currency balances
5. Review accruals (revenue earned but not invoiced; expenses incurred but not billed)
6. Run period-end checks
7. Acc: Soft Close (period locks for new postings; reversal allowed)
8. A + Acc co-sign: Hard Close (fully locked; reopen requires reason + audit)

### Tax Filing dashboard

Per filing type (HST/GST/PST/T4/T5018):
- Current period accumulator
- Next filing deadline
- Filing history with CRA confirmation
- Generate return PDF (eight-layer protected)
- Record remittance to CRA

### Cash Flow forecast

Time-series chart: actual past 90 days + forecast next 90 days. Inputs: AR aging, AP aging, scheduled invoices, recurring auto-generation, scheduled payroll, scheduled tax remittances. Drill down by category (Operating / Investing / Financing).

### P&L Report

By period (Month / Quarter / YTD / Custom). Comparative columns (this period / last period / YoY / Budget / Variance). Drill into account → see GL entries. Filter by department (cost centre) or project. Export to Excel + PDF.

### Balance Sheet

Point-in-time view. As-of date selector. Comparative columns. Drill into account → see composition.

### Cash Flow Statement

Operating / Investing / Financing breakdown. Indirect method default.

### QBO/Xero Integration

Connection state. Last sync. CoA mapping interface. Sync direction (Export-only / Bidirectional Phase 2). Manual sync. Conflict resolution.

## 11.7 Field-level visibility (8 flags)

- `visibility.financials.bankBalances` — A, Acc only
- `visibility.financials.taxLiability` — A, Acc, Bookkeeper-role
- `visibility.financials.payrollGl` — A, Acc, HR-role
- `visibility.financials.executiveCompensation` — A only (board-level)
- `visibility.financials.proprietaryFinancials` — A, Acc, executives
- `visibility.financials.intercompanyTransfers` — A only (Phase 2 multi-entity)
- `visibility.financials.foreignExchangeRates` — A, Acc
- `visibility.financials.unrealizedGainLoss` — A, Acc

## 11.8 Custom-field surfaces

Limited custom fields here — financial data is structured. Custom dimensions for reporting: per-account custom tags. Per-GL-entry memo field is custom-friendly.

## 11.9 Status surfaces

6 lookup tables (see §11.4).

## 11.10 Cross-module relationships

### Reads from EVERY module

Every state change posts a GL entry:
- M5 quote: no GL (not yet revenue)
- M6 project costs (labor, materials, sub)
- M7 inventory (receive, issue, write-off, FIFO consumption)
- M8 vendors: indirect via M7 + M9
- M9 invoice AR + AP cycles
- M10 contractors: indirect via M9
- M2 payroll
- M1 holdback

### Writes nothing back

GL is the destination. Read by:
- M4 Dashboard (KPI widgets)
- M13 Reports (broader reporting)

### Events emitted

`gl_entry.posted`, `gl_entry.reversed`, `period.soft_closed`, `period.hard_closed`, `period.reopened`, `bank_recon.completed`, `bank_recon.variance_identified`, `tax_filing.generated`, `tax_filing.filed`, `tax_filing.cra_acknowledged`, `fx_revaluation.run`, `integration_sync.completed`, `integration_sync.conflict_detected`.

## 11.11 Competitive floor delta

Combines best of:
- **simPRO:** basic GL export to MYOB/Xero/QBO
- **ServiceTitan:** financial reporting, project P&L
- **QuickBooks Online:** full GL, multi-currency, bank feed, tax filing
- **Xero:** full GL, multi-currency, bank rec
- **Sage Intacct:** enterprise GL with dimensions

**Nexvelon-unique:**
- **GL directly integrated with operational modules** — no separate accounting product needed
- **Source-back traceability from any GL line to originating module event**
- **Canadian-first tax compliance built-in** (HST/GST/PST + T4 + T5018)
- **Period-end FX revaluation** for foreign currency balances
- **Period locking with separation of duties** (soft close Acc → hard close A + Acc co-sign per §0.4 #11)
- **Field-level visibility** on financial data
- **Bank feed integration via Plaid** (Canadian banks; Phase 2)
- **QBO/Xero export at v1; bidirectional sync Phase 2**
- **Project P&L drilling into M6 costing**
- **Cost-centre allocation** consistent with M5
- **Recurring journal entries** for depreciation + accruals
- **Holdback payable as separate liability** (Canadian Construction Act)
- **Eight-layer print protection** on tax filings + financial reports

## 11.12 Permissions design implications (items 63-67)

63. **GL period locking** prevents post-close edits. Reopen requires A + reason + audit.
64. **Manual journal entries gated** with separation of duties (creator ≠ poster).
65. **Bank balances gated** to A/Acc field-level.
66. **Hard close requires dual approval** (A + Acc co-sign per §0.4 #11). Both signatures captured.
67. **Source-back traceability permission-aware.** GL line shows source but drill-back respects target-module permissions.

## 11.13 Open questions — RESOLVED IN SESSION M

1. ✅ **Built-in GL vs external accounting:** both supported.
2. ✅ **Multi-currency:** single CAD functional; foreign revalued.
3. ✅ **Departmental P&L:** YES via cost-centre allocation.
4. ✅ **Project P&L:** YES consuming M6.
5. ✅ **Budget tracking:** YES at v1.
6. ✅ **Recurring journal entries:** YES at v1.
7. ✅ **Multi-entity / multi-company:** Phase 2.
8. ✅ **Period close approval workflow:** soft close Acc → hard close A + Acc co-sign.
9. ✅ **Bank feed provider:** Plaid Phase 2; CSV/OFX at v1.

Remaining:
10. **Calendar year vs Fiscal year** — operator-configurable in Settings.
11. **Drill-down report customization** — limited at v1; full report builder Phase 2.
12. **Multi-language financial reports** — en + fr at v1.

## 11.14 Acceptance criteria (~45 scenarios)

### Functional — Chart of Accounts (1-5)
1. Import standard Canadian CoA template; ~100 accounts.
2. Create custom account with hierarchy parent.
3. Archive unused account; blocked if balance.
4. View account mappings — shows which modules use it.
5. Recategorize account (cross-type blocked).

### Functional — GL Journal Entries (6-12)
6. Invoice send (M9) → GL auto-posted: AR DR, Revenue CR, Tax CR.
7. Payment received (M9) → Cash DR, AR CR.
8. PO receive (M7) → Inventory DR, AP CR.
9. Project labor cost (M6 timesheet) → COGS-Labor DR, Wages Payable CR.
10. Manual entry: A creates, Acc posts (separation of duties).
11. Reverse entry creates offsetting; original retained.
12. Source drill-back opens source entity.

### Functional — Bank Reconciliation (13-17)
13. Import bank statement CSV; transactions populate.
14. Auto-match by date + amount.
15. Manual match remaining.
16. Variance identified; reconcile when zero.
17. Complete locks session.

### Functional — Period Close (18-23)
18. Run period-end checks.
19. Soft close period (Acc); locked for new postings.
20. Hard close requires A + Acc co-sign; both signatures captured.
21. Hard close blocks all postings; manual entries blocked.
22. Reopen period (A only with reason); audit row.
23. FX revaluation runs at period end.

### Functional — Tax Filing (24-29)
24. Generate HST/GST return for quarter.
25. Generate T4 slips year-end (M2 payroll).
26. Generate T5018 slips year-end for contractors (M10).
27. Generate T5018 slips year-end for vendors (M8).
28. Record CRA remittance with confirmation.
29. Tax filing PDF eight-layer protected.

### Functional — Reports (30-37)
30. P&L for last quarter.
31. Balance Sheet as-of date.
32. Cash Flow Statement.
33. Trial Balance.
34. P&L by Department.
35. P&L by Project (M6 drilling).
36. Budget Variance.
37. Export to Excel + PDF.

### Functional — Cash Flow (38-40)
38. Forecast next 60 days.
39. Drill into forecast category.
40. Compare forecast vs actual.

### Functional — Integrations (41-43)
41. Connect QBO; OAuth; CoA mapping.
42. Export GL entries to QBO.
43. Conflict resolution.

### Functional — Permissions & security (44-45)
44. PM sees P&L for own projects only; SR sees none.
45. RLS blocks unauthorized GL read; manual entry blocked for non-A/Acc.

---

═══════════════════════════════════════════════════════════════════
# Modules 12-13: pending walk
═══════════════════════════════════════════════════════════════════

- §12 — Scheduling (major reader of M1+M2+M3+M6+M10 surfaces)
- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary

*Running count: ~1130 actions across 11 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7 + ~65 M8 + ~115 M9 + ~75 M10 + ~90 M11).*

## 100. Final sidebar tree

*Refined Session K — see §0.7.*

## 101. Module dependency graph

*Populated after all 13 modules walked.*

## 102. Cumulative permissions design implications

*67 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5, 38-44 M6, 45-49 M7, 50-53 M8, 54-58 M9, 59-62 M10, 63-67 M11).*

## 103. Cumulative acceptance criteria

*~509 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5 + ~58 M6 + ~48 M7 + ~35 M8 + ~55 M9 + ~38 M10 + ~45 M11).*

---

**End of v0.12.** Modules 1-11 complete. Financials module scoped with built-in GL (no separate accounting product needed at v1), source-back traceability from any GL line to originating module event, Canadian-first tax compliance (HST/GST/PST + T4 + T5018 consuming M2/M8/M10), period close with separation of duties (soft close Acc → hard close A + Acc co-sign), period-end FX revaluation, bank reconciliation, QBO/Xero/Sage 50 export at v1 (bidirectional sync Phase 2), project P&L drilling into M6, cost-centre allocation, recurring journal entries, holdback payable separate liability (Canadian Construction Act). Cross-cutting commitments from Sessions C-M propagate forward.

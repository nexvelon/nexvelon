# NEXVELON_SESSION_K_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-K codification.
> Session K was a pure design pass — operator review of Module 9
> (Invoices) of the feature audit. Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session K state + decisions made
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.10 — Modules 1-9 scoped (M1-M8 condensed; full in git history)
>   5. `NEXVELON_ROADMAP.md`
>   6. `NEXVELON_SESSION_J_HANDOFF.md` — prior session
>   7. Earlier handoffs (I, H, G, F, E, D, C, B, A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session K focus

Operator design pass on Module 9 (Invoices) — cash collection spine. Two parallel flows established (AR + AP). Customer payment portal with Stripe integration. 3-way match automated with separation of duties. T5018 YTD auto-update flow established connecting M9 (AP payments) to M8 (vendor tax records). Canadian Construction Act holdback release timing locked. Sidebar architecture refined to make Financials a parent menu. Fourteen in-session open questions resolved.

Competitor research integrated from simPRO progress claims + recurring invoices + supplier invoicing + AP payment runs, ServiceTitan online payment portal + automated reminders, QuickBooks Online AR aging + statements + multi-currency, Wave free customer portal. Nexvelon adds Canadian-specific compliance (T5018 YTD, Construction Act holdback timing), separation of duties enforcement, and eight-layer print on financial PDFs that no competitor provides.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.9 with v0.10 — Module 9 fully scoped; M1-M8 condensed to headline stats; sidebar architecture refined |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session K state |
| `NEXVELON_ROADMAP.md` | Updated items 1 and 2 with Module 9 completion + inputs |
| `NEXVELON_SESSION_K_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged. Zero new warnings.

### Deploy status

No code changes → no new deploy.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 9 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

### Stats

- **~115 actions** across 12 categories
- **14 new owned tables** (invoices, invoice_lines, invoice_taxes, invoice_payments, payments, credit_notes, credit_note_lines, customer_statements, ap_bills, ap_bill_lines, ap_bill_payments, ap_payment_runs, ap_payment_run_lines, recurring_invoice_templates)
- **5 new status surfaces** (invoice_statuses with 11 seeded values, invoice_types, payment_statuses, ap_bill_statuses, credit_note_statuses)
- **55 acceptance criteria** for the build phase QA bar
- **22 routes** under /financials/ + 1 public-facing customer payment portal

### Major architectural decisions from Session K

1. **Two parallel invoice flows** treated as one module since they share state machine + approval + communication patterns. AR (customer invoices) + AP (vendor bills).

2. **Customer payment portal** with Stripe integration. Signed URL pattern (no login, scoped to single invoice, 90-day expiry). CC + EFT + ACH + wire instructions. Operator-configurable CC surcharge per client (disclosed on portal).

3. **3-way match (PO + Receipt + Bill)** automated with discrepancy flagging. Manual override for no-PO bills requires A/Acc reason.

4. **Separation of duties** locked as new cross-cutting commitment (§0.4 #11). AP bill creator ≠ approver. Payment run creator ≠ approver. Enforced at action level. Audit captures both.

5. **T5018 YTD auto-update on AP bill payment** to T5018-required vendors. Feeds M8 vendor_t5018_records. Annual T5018 report generation in M8.

6. **Canadian Construction Act holdback release** auto-generated invoice at 45-day mark after substantial completion; manual approval before send (Ontario default per M1 client config).

7. **Eight-layer print protection** extended to invoice PDFs, credit notes, statements.

8. **Immutable send snapshots** — line items, pricing, T&C, billing address captured at send for legal durability per §0.4 #8.

9. **Multi-currency invoices** — in client's currency from M1 client config; exchange rate snapshot retained.

10. **Late fee auto-application** per client config with compounding flag (M1 client banking config). Waiver gated to A/Acc with reason capture.

11. **Customer credit balance tracking** — overpayments + credit notes accumulate as available credit; auto-applied to new invoices on send.

12. **Recurring invoice templates** linked to Service Contracts from M1. Generates per cycle automatically.

13. **AR aging role-scoped visibility** — A/Acc all; PM project-scoped; SR client-scoped.

14. **Sidebar architecture refined** — Financials becomes parent menu with 12 sub-items spanning M9 + M11.

15. **Phase 2 deferrals locked:** customer payment plans, multi-entity invoicing, customer self-service credit applications.

### Fourteen in-session resolutions

1. Payment gateway: Stripe at v1
2. Email payment reminders: auto 7/14/30 days; configurable per client
3. Customer portal: signed URL only
4. Recurring invoice timing: configurable; default start-of-period
5. Multi-currency: YES
6. Holdback release: auto-generated at 45-day mark; manual approval before send
7. Credit note application: both (to invoice OR customer credit balance)
8. Tax-by-line vs tax-by-invoice: both
9. AP bill matching: 3-way match at v1
10. AR aging buckets: 0-30 / 31-60 / 61-90 / 91+
11. Late fees: compound or simple per M1 client config
12. CC surcharge to customer: YES operator-configurable per client
13. Partial refunds: YES via Stripe; manual cheque for non-card
14. Invoice approval workflow: simpler than quotes — A/Acc always required to send

### Permissions design implications added (54-58)

54. Invoice state machine with field-level lock per state (Draft → editable; Sent → fully locked)
55. Customer payment portal signed URL scoped to single invoice
56. Late fee auto-application gated to A/Acc; waiver requires reason
57. AR aging role-scoped visibility (A/Acc all; PM project; SR client)
58. AP bill approval workflow with separation of duties (creator ≠ approver)

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

- **Modules complete:** 9 of 13
- **Cumulative actions:** ~965 (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7 + ~65 M8 + ~115 M9)
- **Cumulative permissions design implications:** 58 items
- **Cumulative acceptance criteria:** ~426 scenarios
- **Lookup tables defined:** 55+ operator-editable + entity-specific status lookups

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Module 10 (Subcontractors)** — sub-contractor master entity (separate from vendors), work orders dispatched to subs, subcontractor portal (Phase 2), retention/lien deadline tracking (already partially covered by M6/M8/M9), sub-contractor performance scoring, sub-contractor onboarding with WSIB + insurance + T5018 + Anti-Corruption gates, cross-link with Vendors via `is_also_vendor` flag (reverse of M8 flag). Moderate weight; much already established. Probably 60-90 min session.

2. **Modules 11-13** — Financials (GL, chart of accounts, bank rec, tax filing), Scheduling (major reader of M1+M2+M3 surfaces), Reports.

3. **Permissions module — design pass** (ROADMAP item 2).

4. **Permissions module — build** (ROADMAP item 3).

5. **Quotes v1 build** (ROADMAP item 4).

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you.

**End of Session K handoff.**

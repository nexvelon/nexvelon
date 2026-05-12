# NEXVELON_SESSION_H_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-H codification.
> Session H was a pure design pass — operator review of Module 6
> (Projects) of the feature audit. Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session H state + decisions made
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.7 — Modules 1-6 scoped (M1-M5 condensed; full in git history)
>   5. `NEXVELON_ROADMAP.md`
>   6. `NEXVELON_SESSION_G_HANDOFF.md` — prior session
>   7. Earlier handoffs (F, E, D, C, B, A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session H focus

Operator design pass on Module 6 (Projects) — first operations module. Three-state costing established; change order workflow with customer signature designed; commissioning workflow with per-equipment sign-off + ULC verification auto-attachment scoped; handover package + warranty clock pattern; progress invoicing with Canadian Construction Act compliance. Seven in-session open questions resolved.

Competitor research integrated from simPRO project management (sections + cost centres, three-state costing, variations/COs, progress claims, retention, subcontractor work orders, Gantt) + ServiceTitan (project dashboard, real-time costing) + Procore (change order with customer signature, document version control) + Buildertrend (customer portal, progress photos).

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.6 with v0.7 — Module 6 fully scoped; M1-M5 condensed to headline stats |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session H state |
| `NEXVELON_ROADMAP.md` | Updated items 1 and 2 with Module 6 completion + inputs |
| `NEXVELON_SESSION_H_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged. Zero new warnings.

### Deploy status

No code changes → no new deploy.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 6 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

### Stats

- **~110 actions** across 13 categories
- **12 new owned tables** (projects, project_phases, project_cost_centers, project_tasks, project_change_orders, project_documents, project_timesheets, project_costing_snapshots, project_commissioning_records, project_handover_records, project_acceptance_records, project_progress_invoices)
- **8 new status surfaces** (project_statuses, project_types, phase_statuses, task_statuses, change_order_statuses, change_order_reasons, commissioning_statuses, progress_billing_types)
- **58 acceptance criteria** for the build phase QA bar
- **24 routes** under /projects/

### Major architectural decisions from Session H

1. **Three-state costing** — Estimated (from quote) / Committed (POs + WOs raised) / Actual (delivered + executed) with real-time forecast-at-completion. PM sees margin erosion in real time.

2. **Change order workflow** — drafted → internal approval → sent to customer via signed URL portal → customer signature → implementation. Legally durable amendment tied to original quote_terms_snapshot.

3. **Commissioning workflow** with per-equipment test results, photo + GPS evidence, customer per-item sign-off. Conditional pass with deficiency list. Final commissioning certificate as eight-layer-protected PDF. ULC fire-alarm verification documents auto-attach for fire alarm projects (Ontario ULC-S536 compliance).

4. **Append-only commissioning + acceptance records** with one-way hash on signatures.

5. **Handover workflow** — final customer sign-off triggers warranty clock. Auto-assembled handover package PDF. Service Contract Quote auto-generates if applicable for recurring revenue.

6. **Progress invoicing** — Deposit / Progress Claims / Final Claim / Retention Release respecting holdback config from Module 1 (Canadian Construction Act 10%/Excl/45-day default).

7. **Trade Contractor lien deadline tracking** (Ontario Construction Act 60-day rule).

8. **Field-level margin visibility per project** — A/PM default; SR per-user override only.

9. **Change order thresholds** separate from quote thresholds. Defaults: <$2k self-approve, $2-10k → PM, >$10k → Admin. Scope: <5% self-approve, 5-15% → PM, >15% → Admin.

10. **Project templates** with vertical-specific seeded templates (Camera install, Access control install, Fire alarm install, Intrusion alarm install, Integration project, Maintenance contract setup).

11. **Read-only Gantt chart at v1**; edit-via-Gantt Phase 2.

12. **Phase 2 deferrals locked:** customer status portal full version, multiple PMs per project, daily log mandatory enforcement, meeting notes with scheduler, phase/task-level custom fields, full subcontractor portal access.

### Seven in-session resolutions

1. Project templates per industry → YES, operator-defined with seeded vertical templates
2. CO vs new quote threshold → COs for in-progress; new quote for >50% scope change
3. Timesheet workflow → self-submit → PM approve → Acc lock before payroll
4. Progress billing → auto per phase; manual for %; operator approval before send
5. Commissioning customer attendance → recommended not required; conditional sign-off available
6. Subcontractor portal during project → Phase 2 (email links at v1)
7. Project Gantt at v1 → YES read-only; edit Phase 2

### Permissions design implications added (38-44)

38. Project margin visibility field-level gated; A/PM default; SR per-user override
39. Change orders use separate approval thresholds from quotes (configurable in Settings)
40. Commissioning records append-only with one-way hash on photo evidence
41. Handover sign-off triggers warranty clock; warranty terms versioned at sign
42. Progress invoicing respects holdback config from Module 1 (Canadian compliance)
43. Project documents gated to project members; customer-facing flag for portal
44. Subcontractor work orders generate audit trail with internal approval + dispatch + retention + lien deadline tracking

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

- **Modules complete:** 6 of 13
- **Cumulative actions:** ~690 (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6)
- **Cumulative permissions design implications:** 44 items
- **Cumulative acceptance criteria:** ~288 scenarios
- **Lookup tables defined:** 40+ operator-editable + entity-specific status lookups

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Module 7 (Inventory)** — materials, stock locations, vendor purchasing, PO generation from project requirements, stock movements, item categories. Moderate weight; consumes Module 5 (pricebook) and feeds Module 6 (project material consumption). Probably 1.5-2 hour session.

2. **Modules 8-13** — Vendors, Invoices, Subcontractors, Financials, Scheduling, Reports.

3. **Permissions module — design pass** (ROADMAP item 2).

4. **Permissions module — build** (ROADMAP item 3).

5. **Quotes v1 build** (ROADMAP item 4).

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you.

**End of Session H handoff.**

# NEXVELON_SESSION_L_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-L codification.
> Session L was a pure design pass — operator review of Module 10
> (Subcontractors) of the feature audit. Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session L state + decisions made
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.11 — Modules 1-10 scoped (M1-M9 condensed; full in git history)
>   5. `NEXVELON_ROADMAP.md`
>   6. `NEXVELON_SESSION_K_HANDOFF.md` — prior session
>   7. Earlier handoffs (J, I, H, G, F, E, D, C, B, A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session L focus

Operator design pass on Module 10 (Subcontractors) — labor provider master entity distinct from vendors. WSIB auto-block on expiry locked as new cross-cutting commitment (§0.4 #12 — regulatory expiry auto-block applies to insurance + WSIB across both M8 and M10). T5018 mandatory tracking for labor providers (vs optional for vendors). Trade Contractor lien deadline tracking with cross-WO dashboard. Worker manifest with individual cert verification. Skill + territory + availability matching algorithm. Versioned labor rates with effective-dating. Cross-link with Vendors via is_also_vendor flag. Eight in-session open questions resolved.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.10 with v0.11 — Module 10 fully scoped; M1-M9 condensed to headline stats |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session L state |
| `NEXVELON_ROADMAP.md` | Updated items 1 and 2 with Module 10 completion + inputs |
| `NEXVELON_SESSION_L_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged. Zero new warnings.

### Deploy status

No code changes → no new deploy.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 10 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

### Stats

- **~75 actions** across 13 categories
- **13 new owned tables** (contractors, contractor_contacts, contractor_labor_rates, contractor_skills, contractor_territories, contractor_worker_manifest, contractor_performance_scores, contractor_onboarding_requirements, contractor_onboarding_gate_fulfillments, contractor_insurance_certs, contractor_wsib_records, contractor_t5018_records, contractor_work_orders + contractor_wo_line_items)
- **5 new status surfaces** (contractor_categories, contractor_statuses, contractor_onboarding_gate_types, contractor_wo_statuses, contractor_labor_rate_types)
- **38 acceptance criteria** for the build phase QA bar
- **23 routes** under /people/contractors/

### Major architectural decisions from Session L

1. **Subcontractors vs Vendors separation** with cross-link flag (is_also_vendor). Labor vs material distinction drives separate workflows.

2. **WSIB clearance auto-block on expiry** — WO creation blocked when WSIB expired. Manual override requires A approval + reason. Locked as cross-cutting commitment §0.4 #12.

3. **T5018 mandatory for labor sub-contractors** (vs optional for vendors). Default TRUE for Canadian labor sub.

4. **Trade Contractor lien deadline tracking** (Ontario Construction Act 60-day) per WO. Visible countdown + cross-WO lien dashboard.

5. **Worker manifest with individual cert verification** — each worker on contractor's crew has individual certs verified.

6. **Skill-based + territory-based contractor matching** for project assignment. Ranks by grade, distance, cost, availability.

7. **Versioned labor rate tables** with effective-dating. Future rates scheduled. Rate snapshot at WO creation.

8. **Cross-link with Vendors** via is_also_vendor flag. Banking sync between records.

9. **Append-only contractor performance ledger** with auto-degrade-of-preferred-status.

10. **Eight-layer print protection** on contractor MSAs + T5018 forms + WO PDFs.

11. **Banking encrypted at rest with audit-on-read** (extends M1/M8 pattern).

12. **Worker cert expiry alerts** at 30/60/90 days.

13. **WSIB form auto-generation** (Form 5 + Form 7) at v1.

14. **Phase 2 deferrals locked:** contractor portal full version, sub-contractor self-onboarding signup, mobile check-in for worker verification, advanced pay-when-paid workflow, contractor scorecard visible to contractor.

### Eight in-session resolutions

1. Lien deadline UI surfaces: per-WO countdown + cross-WO dashboard at v1
2. Worker manifest verification: cert verification at WO creation; mobile check-in Phase 2
3. Skill matcher: YES at v1 (simple cert + territory + availability matching)
4. Pay-when-paid: basic flag at v1; advanced Phase 2
5. Contractor portal: Phase 2
6. Crew tracking: YES at v1
7. WSIB form auto-generation: YES at v1
8. Sub-contractor self-onboarding: Phase 2

### Permissions design implications added (59-62)

59. Subcontractor WSIB auto-block on expiry — WO creation blocked at action level
60. Worker manifest with project-scoped visibility (PM sees own project workers only)
61. Contractor labor rates as gated field; versioned with rate snapshot at WO creation
62. Cross-link sync workflow between vendor and contractor records (banking sync, gate sharing)

### New cross-cutting commitment §0.4 #12

**Regulatory expiry auto-block enforcement.** Insurance + WSIB expired → PO/WO creation auto-blocked. Manual override requires A approval + reason captured + audit row. Applies to:
- M7 PO creation (vendor insurance expired → block)
- M8 vendor onboarding gates
- M10 contractor onboarding gates + WO creation
- Worker assignment to WO (worker cert expired → block)

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

- **Modules complete:** 10 of 13
- **Cumulative actions:** ~1040 (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7 + ~65 M8 + ~115 M9 + ~75 M10)
- **Cumulative permissions design implications:** 62 items
- **Cumulative acceptance criteria:** ~464 scenarios
- **Lookup tables defined:** 60+ operator-editable + entity-specific status lookups

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Module 11 (Financials)** — General Ledger (chart of accounts), Bank Reconciliation, GL Journal Entries, Tax Filing, Cash Flow management. Reads from all prior modules (every state change posts to GL). Substantial — proper accounting integration with QBO/Xero export. Probably 1.5-2 hour session.

2. **Modules 12-13** — Scheduling (major reader of M1+M2+M3 surfaces), Reports.

3. **Permissions module — design pass** (ROADMAP item 2).

4. **Permissions module — build** (ROADMAP item 3).

5. **Quotes v1 build** (ROADMAP item 4).

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you.

**End of Session L handoff.**

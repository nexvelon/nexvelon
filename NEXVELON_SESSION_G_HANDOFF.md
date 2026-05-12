# NEXVELON_SESSION_G_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-G codification.
> Session G was a pure design pass — operator review of Module 5
> (Quotes) of the feature audit. Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session G state + decisions made
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.6 — Modules 1+2+3+4+5 fully scoped
>   5. `NEXVELON_ROADMAP.md`
>   6. `NEXVELON_SESSION_F_HANDOFF.md` — prior session
>   7. Earlier handoffs (E, D, C, B, A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session G focus

Operator design pass on Module 5 (Quotes) — first revenue module. Three quote types enumerated; online portal acceptance flow with signed URL + e-signature designed; immutable send snapshots for legal durability; T&C auto-composition honoring Module 1 commitment; value + discount threshold approval routing; per-cost-centre tax codes for Canadian compliance; field-level margin visibility separating who-sees from who-can-do. Ten in-session open questions resolved.

Competitor research integrated from ServiceTitan estimates (online estimates with e-signature, Sold By credit, view/sign notifications, item groups, financing) + simPRO quoting (pre-built assemblies, cost centres, breakdown table, vendor catalog sync, service vs project distinction) + Salesforce CPQ (approval workflows, document generation).

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.5 with v0.6 — Module 5 fully scoped |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session G state |
| `NEXVELON_ROADMAP.md` | Updated items 1, 2, 4 with Module 5 completion + inputs |
| `NEXVELON_SESSION_G_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged. Zero new warnings.

### Deploy status

No code changes → no new deploy. Vercel reflects last Session B commit.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 5 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

### Stats

- **~85 actions** across 11 categories (lifecycle, margin/cost, line items, pricebook, assemblies, cost centers, templates, tracking, output, communication, bulk)
- **12 new owned tables** (quotes, quote_line_items, quote_taxes, quote_discounts, quote_revisions, quote_approvals, quote_views, quote_acceptance_records, quote_terms_snapshots, quote_templates, pricebook_items, pricebook_categories, pre_built_assemblies, cost_centers)
- **5 new status surfaces** (quote_statuses with 13 seeded values, approval_statuses, quote_revision_reasons, quote_types, cost_center_defaults)
- **52 acceptance criteria** for the build phase QA bar

### Major architectural decisions from Session G

1. **Three quote types** — Service Quote (one-off jobs), Project Quote (multi-milestone), Service Contract Quote (recurring revenue). Each drives workflow variant + conversion target.

2. **Online portal acceptance flow** — client-facing signed URL with 90-day expiry, no login required, revoked on acceptance, e-signature via touch (draw) or desktop (type + attest). Faster than competitors requiring client portal accounts.

3. **Immutable send snapshots** — at send time, line items + pricing + T&C + template version captured in `quote_terms_snapshots`. Legal durability per §0.4 #8. Revisions create new snapshots.

4. **Eight-layer print protection on revenue PDFs** — force-reauth, watermark (operator + timestamp), audit row, 24h signed URL expiry, server-side generation only, print event capture, embedded metadata, no bulk export.

5. **T&C auto-composition** — each clause pulled from Module 1 onboarding gates, tagged with source attribution ("Source: Insurance Cert gate"), editable, re-composable if client gates change.

6. **Value + discount threshold approval routing** — combined AND logic. Exceeding either triggers approval. Configurable per role in Settings. Defaults: $5k/25k/50k value bands; 10%/25% discount bands; <15% margin gates PM review.

7. **Per-cost-centre tax codes** — different cost centres carry different tax codes (Canadian split-tax-treatment compliance for split-tax items between provinces).

8. **Holdback in quote totals** — Ontario Construction Act 10%/Excl/45 default from client config. Quote shows immediate due + holdback released later.

9. **Field-level margin visibility** — A/PM default; SR per-user override. `quotes:viewMargin` is visibility flag, not action — distinguishes who-can-do from what-they-see.

10. **Quote → Project conversion** — locks source quote (read-only post-conversion); revisions blocked; new quote required for post-acceptance changes.

11. **Pre-built assemblies + cost centres + pricebook** — simPRO pattern. Bundled line items + grouped subtotals + master catalog with vendor sync.

12. **Phase 2 deferrals locked:** Multi-currency in single quote, financing integrations (GreenSky etc.), volume discount rules engine, real-time co-authoring, quote import from competitors, dynamic pricing engine, line-item-level custom fields.

### Ten in-session resolutions

1. Approval value thresholds → configurable, defaults <$5k/$5-25k/$25-50k/>$50k with margin review at 25-50k band
2. Discount thresholds → <10%/10-25%/>25%
3. Quote expiry → 30d service / 90d project
4. Multi-currency single quote → NO at v1
5. Quote vs assembly templates → both
6. Recurring contracts → separate Service Contract Quote type
7. Volume discounts → manual at v1
8. Third-party financing → Phase 2
9. Per-cost-centre tax codes → YES
10. Portal auth → signed URL no login

### Permissions design implications added (31-37)

31. Margin visibility field-level gated; A/PM default; SR per-user override
32. Approval workflow value AND discount thresholds with AND logic
33. Quote send triggers immutable snapshot for legal/audit
34. Quote PDF download triggers force-reauth + eight-layer + audit
35. Quote conversion locks source quote (read-only)
36. Online portal signed URLs scoped to single quote (not general tokens)
37. Acceptance records append-only with one-way signature hash

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

- **Modules complete:** 5 of 13
- **Cumulative actions:** ~580 (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5)
- **Cumulative permissions design implications:** 37 items
- **Cumulative acceptance criteria:** ~230 scenarios
- **Lookup tables defined across modules:** 35+ operator-editable + entity-specific status lookups
- **Custom field surfaces:** 12 entities

The three foundational modules (Clients, Employees, Settings) + Dashboard (presentation) + Quotes (first revenue) are complete. Remaining 8 modules build on these foundations.

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Module 6 (Projects)** — consumes Quote conversion. Project lifecycle (Planning → Active → On Hold → At Risk → Completed → Closed), phases/milestones, scope of work, task management, change orders, timesheets, project costing (estimated vs actual), commissioning workflow, document storage, customer communication. Substantial — probably 2-3 hours.

2. **Modules 7-13** — Inventory, Vendors, Invoices, Subcontractors, Financials, Scheduling, Reports.

3. **Permissions module — design pass** (ROADMAP item 2).

4. **Permissions module — build** (ROADMAP item 3).

5. **Quotes v1 build** (ROADMAP item 4).

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you.

**End of Session G handoff.**

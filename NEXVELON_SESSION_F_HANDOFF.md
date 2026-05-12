# NEXVELON_SESSION_F_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-F codification.
> Session F was a pure design pass — operator review of Module 4
> (Dashboard) of the feature audit. No code changes shipped; output
> is documentation codifying decisions for downstream module builds.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session F state + decisions made
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.5 — Modules 1+2+3+4 fully scoped
>   5. `NEXVELON_ROADMAP.md`
>   6. `NEXVELON_SESSION_E_HANDOFF.md` — prior session
>   7. `NEXVELON_SESSION_D_HANDOFF.md` — Module 2 reference
>   8. `NEXVELON_SESSION_C_HANDOFF.md` — Module 1 reference
>   9. `NEXVELON_SESSION_B_HANDOFF.md` — historical
>  10. `NEXVELON_SESSION_A_HANDOFF.md` — auth reference

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session F focus

Operator design pass on Module 4 of the feature audit (Dashboard) — the per-role presentation layer that composes widgets from every other module. ~20 seeded widgets enumerated; six default role layouts (A/PM/SR/Tech/Acc/VO); per-user customization with role-default override pattern established. Five in-session open questions resolved.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.4 with v0.5 — Module 4 fully scoped |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session F state |
| `NEXVELON_ROADMAP.md` | Updated items 1 and 2 with Module 4 completion + inputs |
| `NEXVELON_SESSION_F_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged (all in `components/modules/financials/Tabs.tsx`). Zero new warnings.

### Deploy status

No code changes → no new deploy. Vercel reflects last Session B commit.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 4 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

### Stats

- **~20 seeded widgets** code-defined at v1 (Phase 2 introduces saved-report-as-widget for operator-defined widgets)
- **~35 actions** = 13 module-specific + ~20 per-widget gates
- **5 new owned tables** (dashboard_widget_definitions, dashboard_role_layouts, user_dashboard_layouts, widget_data_cache, widget_company_settings)
- **3 new status surfaces** (widget_statuses, dashboard_layout_types, widget_refresh_strategies)
- **25 acceptance criteria** for the build phase QA bar

### Major architectural decisions from Session F

1. **Dashboard as per-role presentation layer** — not a feature module; composes widgets reading from every other module.
2. **UI presentation as 10th dimension of permission control** — sidebar + dashboard widget layout + landing page choice all gated by permission framework.
3. **Three-way widget visibility gate** — widget rendered only if source-module list permission granted AND widget enabled company-wide AND user has not hidden it.
4. **Six seeded role layouts:**
    - Admin: 8 widgets (revenue, AR, quotes pending approval, top clients, SLA breach, access requests, audit highlights, cert expirations)
    - PM: 6 widgets (my projects, pending approvals, today's jobs, SLA escalations, team pipeline, resource availability)
    - SR: 6 widgets (quote pipeline Kanban, pending actions, activity feed, top clients, lead source performance, bookings)
    - Tech: 5 widgets (today's schedule, week preview, open jobs, time entries, cert expirations)
    - Acc: 7 widgets (AR aging, overdue invoices, cash collection, on-stop alerts, holdback releases, tax reminders, payments)
    - VO: 3 widgets (revenue summary no margin, project overview, schedule)
5. **Per-user customization** — drag-drop rearrange, resize, hide/show individual widgets. Per-user override takes precedence over role default. Admin edits role defaults; users override their own.
6. **Per-user landing page choice** — any module's list view can replace /dashboard as user's default landing.
7. **Widget refresh strategy:**
    - 5-min cached default
    - Critical widgets (SLA breach, today's schedule) refresh on focus
    - Manual refresh button always available
8. **CSV export per tabular widget** — respects data scope; drill-through respects source-module list permission.
9. **Mobile responsive at v1** — single-column stack ordered by `priority_for_mobile` field; native mobile app Phase 2.
10. **Phase 2 deferrals locked:** Operator-defined custom widgets (saved-report-as-widget pattern), real-time WebSocket push for critical widgets, native mobile app.

### Five in-session resolutions

1. Widget refresh interval → 5-min cached + critical on-focus + manual always
2. Mobile → responsive single-column at v1; native app Phase 2
3. Operator-defined custom widgets → NO at v1; Phase 2
4. Per-user landing page alternative → YES (any module list view)
5. Widget CSV export → YES (data-scoped)

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

- **Modules complete:** 4 of 13 (Clients + Sites + Contacts, Employees + Permissions, Settings, Dashboard)
- **Cumulative actions defined:** ~495 (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4)
- **Cumulative permissions design implications:** 30 items
- **Cumulative acceptance criteria:** ~175 test scenarios
- **Lookup tables defined:** 29 operator-editable + entity-specific status lookups within modules
- **Custom field surfaces:** 12 entities

The three foundational modules (Clients, Employees, Settings) plus Dashboard (presentation layer) are complete. Remaining 9 modules are operational/feature surfaces consuming the foundations.

═══════════════════════════════════════════════════════════════════════════════
## 4. REMAINING OPEN QUESTIONS
═══════════════════════════════════════════════════════════════════════════════

Module 4 remaining (1 item): real-time WebSocket push for critical widgets — Phase 2 recommended; poll-on-focus at v1 sufficient.

Module 3 remaining (3 items): API key per-key rate limiting (Phase 2), multi-language template stale-flagging (yes recommended), workflow rule library v1 seed count (~15 essential rules).

Module 2 remaining (4 items): see Session D handoff.
Module 1 remaining (14 items): see Session C handoff.

═══════════════════════════════════════════════════════════════════════════════
## 5. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Module 5 (Quotes)** — first revenue module; substantial. Quote lifecycle (Draft → Pending Approval → Approved → Sent → Binding/Rejected), line items, taxes, discounts, terms, T&C composition consuming Module 1 onboarding gates, approval workflow, PDF generation with eight-layer protection, send-track-followup, conversion to project. Probably 2-3 hour session.

2. **Modules 6-13** — Projects, Inventory, Vendors, Invoices, Subcontractors, Financials, Scheduling, Reports.

3. **Permissions module — design pass** (ROADMAP item 2) — consumes consolidated action vocabulary + ten-dimensional model + Session C + D + E + F additions.

4. **Permissions module — build** (ROADMAP item 3).

5. **Quotes v1 build** (ROADMAP item 4).

═══════════════════════════════════════════════════════════════════════════════
## 6. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

To start the next claude.ai session about Nexvelon, paste this:

> Continuing Nexvelon build. Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you.

**End of Session F handoff.**

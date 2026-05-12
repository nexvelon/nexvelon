# NEXVELON_SESSION_E_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-E codification.
> Session E was a pure design pass — operator review of Module 3
> of the feature audit (Settings). No code changes shipped; output
> is documentation codifying decisions for permissions build +
> downstream module builds.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session E state + decisions made
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.4 — Modules 1 + 2 + 3 fully scoped
>   5. `NEXVELON_ROADMAP.md`
>   6. `NEXVELON_SESSION_D_HANDOFF.md` — prior session
>   7. `NEXVELON_SESSION_C_HANDOFF.md` — Module 1 reference
>   8. `NEXVELON_SESSION_B_HANDOFF.md` — historical
>   9. `NEXVELON_SESSION_A_HANDOFF.md` — auth reference

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session E focus

Operator design pass on Module 3 of the feature audit (Settings) — the configuration surface that controls how every other module behaves. ~70 sub-pages enumerated and organized into 10 categories. Six in-session open questions resolved with operator confirmation. No new entity tables introduced; 16 Settings-specific configuration tables defined.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.3 with v0.4 — Module 3 fully scoped |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session E state |
| `NEXVELON_ROADMAP.md` | Updated items 1 and 2 with Module 3 completion + inputs |
| `NEXVELON_SESSION_E_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged (all in `components/modules/financials/Tabs.tsx`). Zero new warnings.

### Deploy status

No code changes → no new deploy. Vercel reflects last Session B commit.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 3 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

### Stats

- **~70 sub-pages** organized in 10 categories (A: company identity & branding, B: lookup management, C: custom fields, D: workflow & automation, E: templates, F: security, G: audit, H: integrations, I: system, J: subscription)
- **~270 actions** (heavily templated — most are CRUD-on-lookup variants applied across 29 lookups + custom-field-definition pattern applied across 12 entities + 30 module-specific unique actions)
- **16 new Settings-specific configuration tables** (company_profile, branding_settings, display_format_settings, email_templates, pdf_templates, notification_rules, sidebar_badge_config, api_keys, integration_connections, password_policy, audit_retention_settings, backup_settings, holdback_defaults, workflow_rules, workflow_rule_executions, approval_workflow_templates)
- **4 new status surfaces** (api_key_statuses, integration_connection_statuses, notification_rule_statuses, workflow_rule_statuses)
- **42 acceptance criteria** for the build phase QA bar

### Major architectural decisions from Session E

1. **Settings is heavily Admin-gated by default.** PM can be granted granular views via per-user override pattern; Acc can view financial-relevant settings.
2. **Uniform lookup management pattern** — 29 lookups all follow the same guided-creation wizard + table edit + archive-vs-hard-delete pattern. Reduces UI surface area significantly.
3. **Custom field definitions managed centrally** — 12 entities each get their own management page following uniform CRUD pattern; field types include text/number/dropdown/date/boolean/multi-select/file with sensitivity flag.
4. **Workflow Rules editor: condition-action table at v1** (visual flowchart Phase 2). Operator views, clones, edits, disables seeded rules. ~15 seeded rules ship at v1 covering cert-expiry, SLA breach, On Stop holds, approval routing, onboarding gate enforcement.
5. **Workflow rule sandboxing limits:** 30-second execution timeout, max 100 actions per firing, audit + alert on rule failures, auto-disable after 3 consecutive failures.
6. **Email/PDF templates** with Handlebars safe-subset merge tags (simple conditionals + basic arithmetic; no loops at v1), split-pane live preview, per-language versioning, stale-translation flagging when source language template edited.
7. **Settings change preview** — for behavior-binding changes (e.g., editing tier SLA hours), modal shows "This affects N records" + apply-scope choice (new only / all existing). Audit captures choice + count snapshot.
8. **Display formats:** company-wide default + per-user override allowed on employee record.
9. **API keys are scoped permissions, not full access** — each key carries an allowlist of actions from the standard catalog. One-time display modal at creation.
10. **OAuth tokens encrypted at rest** in Supabase Vault. Never displayed in UI.
11. **Workflow rule versioning** — already-running executions carry the rule version they started with; new triggers use latest.
12. **Phase 2 deferrals locked in:**
    - SMS templates (Twilio integration deferred per §2.13)
    - SSO/SAML configuration
    - Multi-company / departments
    - Subscription billing (until productized externally)
    - Settings JSON export/restore
    - API key per-key rate limiting
    - Visual flowchart workflow editor
    - BIM/CAD integration

### Six in-session resolutions

1. Workflow Rules editor UX → condition-action table at v1
2. Email template merge-tag library scope → Handlebars safe subset
3. Per-user vs per-company display formats → both (company default + user override)
4. Workflow rule sandboxing → 30s/100actions/auto-disable
5. Settings backup/restore → Phase 2
6. Settings change preview → yes for behavior-binding changes

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

- **Modules complete:** 3 of 13 (Clients + Sites + Contacts, Employees + Permissions, Settings)
- **Cumulative actions defined:** ~460 (~110 + ~80 + ~270)
- **Cumulative permissions design implications:** 27 items
- **Cumulative acceptance criteria:** ~150 test scenarios
- **Lookup tables defined:** 29 operator-editable + entity-specific status lookups within modules
- **Custom field surfaces:** 12 entities

The three foundational modules (Clients, Employees, Settings) are complete. Remaining 10 modules are operational/feature surfaces that consume the foundations.

═══════════════════════════════════════════════════════════════════════════════
## 4. REMAINING OPEN QUESTIONS
═══════════════════════════════════════════════════════════════════════════════

Module 3 remaining open questions (3 items):
- API key rate limiting per-key (Phase 2 recommended)
- Multi-language template translation stale-flagging (yes recommended)
- Workflow rule library v1 seed count (~15 essential rules)

Module 1 open questions remain (14 items in §1.13 — see Session C handoff).
Module 2 open questions remain (4 items in §2.13 — see Session D handoff).

═══════════════════════════════════════════════════════════════════════════════
## 5. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Feature audit Module 4 (Dashboard)** — relatively light module. Widgets, layout per role, default landing pages. Should be quick (~1 hour).

2. **Module 5 (Quotes)** — first revenue module; substantial. Quote lifecycle, approval workflow, line items, taxes, discounts, terms, PDF generation, send-track-followup, conversion to project.

3. **Modules 6-13** — Projects, Inventory, Vendors, Invoices, Subcontractors, Financials, Scheduling, Reports.

4. **Permissions module — design pass** (ROADMAP item 2) — consumes consolidated action vocabulary + ten-dimensional model + Session C + D + E additions.

5. **Permissions module — build** (ROADMAP item 3).

6. **Quotes v1 build** (ROADMAP item 4).

═══════════════════════════════════════════════════════════════════════════════
## 6. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

To start the next claude.ai session about Nexvelon, paste this:

> Continuing Nexvelon build. Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you.

**End of Session E handoff.**

# NEXVELON_SESSION_D_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-D codification.
> Session D was a pure design pass — operator review of Module 2
> of the feature audit (Employees + Permissions) with comprehensive
> competitor research. No code changes shipped; output is
> documentation codifying decisions for permissions build + downstream
> module builds.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session D state + decisions made
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.3 — Modules 1 + 2 fully scoped
>   5. `NEXVELON_ROADMAP.md`
>   6. `NEXVELON_SESSION_C_HANDOFF.md` — prior session
>   7. `NEXVELON_SESSION_B_HANDOFF.md` — historical reference
>   8. `NEXVELON_SESSION_A_HANDOFF.md` — auth reference

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session D focus

Operator design pass on Module 2 of the feature audit (Employees + Permissions) with comprehensive competitor research across simPRO, ServiceTitan, FieldWire, ServiceTrade, and Salesforce Field Service. Resulted in:

- Full Module 2 spec in `NEXVELON_FEATURE_AUDIT.md` v0.3
- People parent menu sidebar architecture decision (§0.7)
- "Employees" terminology lock-in throughout system
- Misc Contacts as extension of existing Contacts entity

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.2 with v0.3 — Module 2 fully scoped (~1700 lines total) |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session D state |
| `NEXVELON_ROADMAP.md` | Updated items 1 and 2 with Module 2 completion + Session D inputs |
| `NEXVELON_SESSION_D_HANDOFF.md` | New file (this document) |
| `package.json` | Added `typecheck` script (Session C flagged item) |

### Build status

**Clean.** `npm run build` → `✓ Compiled successfully`. **0 TypeScript errors.** **5 ESLint warnings** unchanged (all pre-existing in `components/modules/financials/Tabs.tsx`). Zero new warnings.

### Deploy status

No code changes → no new deploy → Vercel reflects last Session B commit.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 2 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

### Stats

- **~80 actions** across 14 categories (Employee CRUD, Roles, Permission Overrides, Data Scope, Field Visibility, Certifications, Territories, Availability/Absences, Equipment, Payroll/Rates, Approval Workflows, Security Policy, Audit, Sessions, Access Requests, Bulk Operations)
- **14 new field-level visibility flags** for the permissions build
- **11 lookup tables** with behavior bindings per §6
- **55 acceptance criteria test scenarios** for the build phase QA bar

### Major architectural decisions from Session D

1. **People parent menu sidebar architecture** — top-level menu hover-expands to Clients, Sites, Employees, Vendors, Contractors, Misc Contacts. Three-state per sub-item.
2. **"Employees" replaces "Users"** as terminology — `employees:*` action prefixes; UI labels say "Employees"; database column names stay as `user_id` for technical clarity.
3. **Misc Contacts as extension of Contacts entity** — nullable `client_id` + `misc_category` FK to lookup with 8 seeded categories (Inspector, Insurance Broker, Lawyer, Banker, ULC Certifier, City Official, Real Estate Agent, Other).
4. **Six-tab permissions editor** at `/employees/[id]/permissions`: Role & Overrides / Data & Field Access / Workflows & Delegations / Security & Sessions / UI & Audit / API & SSO.
5. **Certification tracking with scheduling auto-match** — 25+ seeded certification types (Kantech KT-300/400, Genetec Synergis/Mission Control, C-CURE 9000, DSC PowerSeries, Honeywell ProWatch/Galaxy, Bosch B/G-series, Avigilon ACC/ACM, Lenel OnGuard, Paxton Net2, ESA, ULC fire alarm, CFAA, CSA, CCTV tech, Forklift, Working at Heights, Confined Space, OSHA-30, WHMIS 2015, First Aid+CPR, ASP/CSP, LEED AP). Critical flag hard-blocks scheduling on expiry. 30/60/90 day renewal alerts.
6. **Multi-territory model** (per Salesforce pattern) — Primary, Secondary, Relocation (with date bounds).
7. **Resource Absences** with approval workflow + scheduling block + balance tracking per absence type (Vacation, Sick, Personal, Training, Bereavement, Parental, Jury Duty, WSIB Claim, Unpaid Leave).
8. **Request-admin-access workflow** (per FieldWire pattern, extended) — when any gated action denied, "Request access" submits reasoned request to Admin queue with one-click Approve/Deny + optional time-bound auto-expiry of granted access.
9. **Effective-permissions caching** — sub-10ms permission checks via `effective_permissions_cache` jsonb column, invalidated on grant/revoke events.
10. **Color-coded employee profiles + map view + Licence Matrix Report** — combining ServiceTrade's color-coded approach, simPRO's geographic map, and simPRO's matrix report.
11. **Phase 2 deferrals locked in:**
    - SSO/SAML
    - Personal API tokens
    - Role hierarchy / inheritance
    - Multi-company / departments
    - Crew assignments
    - Two-tier permission model (account + project per FieldWire)
    - Employee Portal pattern (per simPRO licensing model)

### Competitive synthesis

Module 2 incorporates best-of-breed patterns from:

- **simPRO** — People menu structure, Security Groups with hierarchy and copy-template, employee portal, license expiry tracking with critical flag, Licence Matrix Report, geographic zones, cost centres, available-hours per day, map view of employees, multi-company/departments concept
- **ServiceTitan** — separate Office Employees vs Technicians permission models, hover-to-describe permissions, reset-to-defaults per role, create-new-role-from-current-permissions, User Role & Permissions Audit Log
- **FieldWire** — two-tier permission model (Account + Project), per-folder access control, customizable permissions per role, request-admin-access workflow, "Companies on projects" grouping, batch user operations
- **Salesforce Field Service** — Service Resource as distinct entity, Skills with 0-99.99 level + start/end dates + photo upload, Multi-territory (Primary/Secondary/Relocation), Resource Absences, Operating Hours, Crew concept, 12+ Work Rule types
- **ServiceTrade** — Office vs Field role separation, color-coded technician profiles, hover-over notes, skill-based scheduling

═══════════════════════════════════════════════════════════════════════════════
## 3. OPEN QUESTIONS PARKED FOR LATER
═══════════════════════════════════════════════════════════════════════════════

Module 2 open questions (4 items in §2.13, all with recommendations):
- Multi-company/departments concept — single-tenant at v1 with placeholder column
- Crew assignments — Phase 2 with Scheduling module
- Service Resource vs Employee distinction — Contractors module owns subs separately
- Employee Portal pattern — full app for everyone at v1

Module 1 open questions remain (14 items in §1.13 — see Session C handoff).

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Feature audit Module 3 (Settings)** — substantial. Captures every Settings sub-page: custom field definitions per entity, lookup table management, workflow rules, security policy, integrations, billing/subscription, company profile, branding, notifications, backups, audit retention rotation.

2. **Modules 4-13** — Dashboard, Quotes, Projects, Inventory, Vendors, Invoices, Subcontractors, Financials, Scheduling, Reports.

3. **Permissions module — design pass** (ROADMAP item 2) — consumes consolidated action vocabulary + ten-dimensional model + Session C + D additions.

4. **Permissions module — build** (ROADMAP item 3).

5. **Quotes v1** (ROADMAP item 4) — first revenue module.

6. **Projects → Inventory → Vendors → Invoices → Subcontractors → Financials → Scheduling → Reports.**

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

To start the next claude.ai session about Nexvelon, paste this:

> Continuing Nexvelon build. Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you.

**End of Session D handoff.**

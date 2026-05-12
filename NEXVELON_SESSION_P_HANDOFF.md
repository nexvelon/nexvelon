# NEXVELON_SESSION_P_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-P codification.
> Session P opened the Permissions Design phase — Pass 1 (Action
> Vocabulary Catalog) complete. Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session P state + Pass 1 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.1 (NEW — Pass 1 of 11)
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_O_HANDOFF.md` — prior session (audit phase close)
>   8. Earlier handoffs (N through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session P focus

Opened the Permissions Design phase with Pass 1 (Action Vocabulary Catalog). Normalized all ~1260 actions from the 13-module audit into a consistent naming convention. Established the verb, qualifier, and resource taxonomies. Specified the permissions editor UI structure (4-tier hierarchy + 6 cross-cut tabs). Documented cross-references between actions. Catalogued special-case action treatment. Resolved six structural design questions.

This is the foundation pass. Without consistent action naming, the database schema (Pass 2), resolution algorithm (Pass 3), and downstream passes cannot be designed cleanly.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | NEW FILE — v0.1 with Pass 1 (Action Vocabulary Catalog) |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session P state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated to "🚧 IN PROGRESS" with Pass 1 detail |
| `NEXVELON_SESSION_P_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 1 SUMMARY (Action Vocabulary Catalog)
═══════════════════════════════════════════════════════════════════════════════

### Format

`resource:verb[:qualifier]` — all action names normalized to this convention.

### Taxonomies locked

- **Verb taxonomy (8 categories):** view / create / edit / state-transition / configuration / communication / admin / workflow verbs. Fixed verb set within each category. New verbs require taxonomy addition.
- **Qualifier taxonomy (4 categories):** scope (my/team/assigned/project/tier/category/all), state (draft/pending/approved/sent/paid/void), modal (read/write/execute/manual/auto), field-section (banking/labor_rates/profit/...).
- **Resource taxonomy:** 140+ resources across 13 modules, mapped 1:1 to database tables (with alias allowed for very long names like `coa` for `chart_of_accounts`).

### Permissions editor UI structure

- 4-tier action hierarchy: Module → Resource → Category → Individual action
- 6 cross-cut tabs (the M2 commitment now fully specified): Actions / Field Visibility / Data Scopes / Overrides / Custom Roles / Audit Log
- Three UI states per gated control per §0.4 #2: hidden / disabled / interactive

### Cross-references documented

- **Action dependencies:** prerequisite actions (e.g., `invoices:send` requires `invoices:viewDetail` + `clients:viewDetail` + `email_templates:read`)
- **Mutually exclusive actions** (separation of duties §0.4 #11): AP bill creator ≠ approver; payment run creator ≠ approver; GL manual entry creator ≠ poster
- **Action chains** (multi-step workflows): Quote → Project, Project → Invoice (progress claim), AP bill → Payment, Period close, Contractor WO completion

### Special-case treatment

- **Public actions** (signed URL, no role): customer quote portal acceptance, customer invoice payment portal — gated outside role hierarchy
- **Admin exceptions** (with reason capture + audit): 13 specific A-only override actions catalogued
- **System-generated actions** (auto, never user-initiated): 10+ auto-actions catalogued
- **Append-only actions** (write-once, no edit/delete): 9 specific resources per §0.4 #10

### Six open questions resolved

1. Compound verbs vs qualifier form — keep both forms; compound for state-distinct workflows, qualifier for scope-distinct
2. Per-record vs per-class actions — capability granted at class; enforcement at runtime per-record
3. Role inheritance — NO at v1 (flat with clone-modify); hierarchy Phase 2
4. Per-tenant custom actions — NO at v1 (fixed catalog); custom Phase 2
5. Action versioning — new actions default denied; migration scripts add to baseline roles
6. Action deprecation — mark deprecated; functional for 1 release; clean up second release; audit reads preserved

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.
- ~1260 cumulative actions
- 76 permissions design implications
- ~594 acceptance criteria
- 13 cross-cutting commitments locked
- 140+ owned tables, 80 status surfaces

**Permissions design:** Pass 1 of 11 complete.
- Action vocabulary normalized
- Verb/qualifier/resource taxonomies locked
- Permissions editor UI structure specified
- Cross-references documented

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 2 (Database Schema)
═══════════════════════════════════════════════════════════════════════════════

Pass 2 designs the tables that store and resolve permissions at runtime:

**Core permission tables:**
- `permissions` — master action catalog (≈1260 rows; one per action; populated from this Pass 1 doc)
- `roles` — role definitions (Admin, PM, SR, Tech, Sub, Acc, VO + custom)
- `role_permissions` — junction (which roles get which actions by default)
- `user_permission_overrides` — per-user overrides (grant/revoke specific actions)
- `effective_permissions_cache` — denormalized cache for fast runtime lookups

**Field visibility tables:**
- `field_visibility_definitions` — the 50+ `visibility.*` flags
- `role_field_visibility` — role defaults
- `user_field_visibility_overrides` — per-user overrides

**Data scope tables:**
- `data_scope_definitions` — the scope qualifiers
- `role_data_scopes` — role defaults
- `user_data_scope_overrides` — per-user overrides

**Audit table:**
- `permission_audit_log` — append-only (all grants/revokes/overrides; who, when, why)

**Cross-cutting constraint tables:**
- `separation_of_duties_constraints` — defines mutually-exclusive action pairs
- `regulatory_expiry_block_overrides` — overrides for §0.4 #12 auto-block (with reason capture)
- `geolocation_retention_policy` — per-tenant retention config per §0.4 #13

Pass 2 will produce v0.2 of the design doc extending v0.1.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 1 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.1, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 2 (Database Schema).

**End of Session P handoff.**

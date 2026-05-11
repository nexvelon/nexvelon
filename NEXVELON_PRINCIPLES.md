# NEXVELON_PRINCIPLES.md

> **Five non-negotiables for Nexvelon.** Every commit, every migration,
> every UI decision is measured against these. A new Claude Code session
> reads this file FIRST, then `CLAUDE_CONTEXT.md`, then any handoff doc.
>
> These principles are downstream of one fact: the app is in production
> use by a real security-systems integrator. There is no "we'll fix the
> data model later" mode anymore. From the `chore(cleanup)` wipe commit
> (`8d44ef7`, 2026-05-11) forward, every change ships under the rules
> below.

---

## 1. Data preservation

**Every migration is additive by default.** Adding columns, indexes,
constraints, RLS policies, tables — fine, ship it. Dropping columns,
narrowing types in place (e.g. `text` → `varchar(20)`), renaming a column
without keeping the old name as an alias — these require an explicit
**data-preservation plan documented inside the migration SQL itself**:

1. **Rollback path** — the exact reverse migration written as a
   commented block at the bottom of the file, so the next operator can
   undo without archaeology.
2. **Copy-deploy-drop sequence** — never `ALTER TABLE ... DROP COLUMN` in
   one shot on production. Add the new column → backfill via
   `UPDATE ... SET new_col = derive(old_col)` → deploy code reading
   `new_col` → wait at least one deploy cycle to confirm no consumers
   left on `old_col` → only then drop. Each step is a separate migration
   file.
3. **Operator sign-off comment** — a header block in the migration SQL
   stating which step of the sequence this file represents, what the
   reversal looks like, and (for the actual drop) acknowledging the
   loss is intentional.

**Soft-delete over hard-delete for every business record.** Every table
that holds business data (clients, sites, contacts, quotes, projects,
invoices, products, vendors, subcontractors) has a `deleted_at
timestamptz` column. The default `DELETE` path of every UI button is
`UPDATE … SET deleted_at = now()`. Hard `DELETE` is admin-only and
audit-logged. The `lib/api/*` reads filter `WHERE deleted_at IS NULL`
by default and expose an explicit `includeDeleted: true` opt-in.

**Audit retention.** `public.auth_audit_log` rows are NEVER deleted by
code. A scheduled rotation job (Session B+) will move rows older than
7 years into cold storage, but the active table is append-only. Same
rule applies to every module's audit trail when it ships.

---

## 2. Granular permissions

**Per-user, per-feature ACL.** Permissions live at the intersection of
*role × resource × action × per-user override*. Today (Session B
opening) the matrix in `lib/permissions.ts` is 7 roles × ~12 resources
× 5 actions (`view`, `list`, `create`, `read`, `update`, `delete`) plus
module-specific actions (e.g. `quotes:convert`, `projects:close`,
`financials:viewMargin`). Session B's permissions module will:

- Promote the in-memory matrix to a DB-backed grant ledger
  (`public.permissions` + `public.user_permission_overrides`).
- Add an Admin UI for per-user overrides — an Admin can hand a
  SalesRep `quotes:viewMargin` for one specific salesrep without
  promoting them to Accountant.
- Provide three UI states for every gated control:
  - **Hidden** — user has neither view nor any action grant on the
    resource; the menu item / button does not render.
  - **Disabled** — user can view but cannot act; the button renders
    with a tooltip explaining why.
  - **Interactive** — full action grant; default rendering.

**No module ships without permission gates on every server action AND
every route.** The gate is checked twice on purpose:
- **Server action** — `assertCan(user, "quotes:create")` at the top of
  the action. RLS handles row-scope; permissions handle action-scope.
- **Route** — middleware or layout-level check that rejects the
  request before the page even renders, so the URL itself can't leak
  data.

**Admin overrides any role at the individual user level.** "Admin" is
not a sticky-bit on a row — it's a real ACL grant. An Admin can be
demoted by another Admin.

**Permissions is the substrate every other module sits on.** It ships
*before* Quotes. Without it, Quotes ships with placeholder gates that
have to be retrofitted — exactly the migration cost Principle 1 is
designed to avoid.

---

## 3. Competitive bar

**Competitors are reference floors, not ceilings — the bar is what a
world-class SaaS would look like rebuilt from scratch in 2026 for
security integrators with no legacy debt.** Each named competitor below
is a product the operator has used or evaluated in the wild; matching
it isn't the goal, it's the absolute minimum. The real test is: *if
nothing in this category existed and we got to design it today,
knowing what we know about the integrator's workflow, would we land
where we did?*

Named reference floors per module (the security-systems integrator
vertical is small; these are the products Nexvelon's operator has
hands-on familiarity with). Refine as Nexvelon goes head-to-head in
real sales cycles — and remember the table is a floor, not a target:

| Module | Reference floor | Direction we exceed |
|---|---|---|
| **Quotes** | Sedona Office, Wisetrack, simPRO | Web-native multi-section quotes with live margin per line, single-click convert-to-project, custom fields on every line item, PDF export that doesn't require a designer to look professional. |
| **Projects** | ServiceTrade, Salesforce Field Service, simPRO | Tighter integration with quotes + inventory + scheduling; fewer manual handoffs; the operator never re-types a line item between modules. |
| **Inventory** | Anixter web portal, Best Buy distributor portal, simPRO | Per-vendor reorder rules tied to manufacturer lead times; vendor-aware bills of material derived from quotes; one-screen low-stock + on-order view rather than the 4-click flow distributor portals impose. |
| **Scheduling** | ServiceFusion, Jobber, simPRO | Tech-by-tech route + capacity optimisation that respects panel-cert qualifications (Kantech, Genetec, C-CURE, etc.), not just radius or availability. |
| **Financials** | QuickBooks (integration target, not replacement) | First-class margin reporting per quote / project / client tier, owned inside Nexvelon; QBO syncs the GL side but Nexvelon owns the operational analytics. |

**Auth, users, and permissions are foundational — not competitive.**
They are a launch gate every module sits on top of. They don't appear
in this table because they aren't a feature we differentiate on; they
are correctness, not advantage.

**When two designs satisfy the principle, choose the one that costs the
customer less hand-entry.** Every form, every default, every list
filter is measured in keystrokes saved versus the reference floor.
Modules ship deeply or don't ship — see §6 on the depth-over-breadth
constraint.

---

## 4. Audit everything

**Every business-record mutation writes a row** capturing:

- `who` — `user_id` (or `null` + `metadata.actor = 'system' | 'job:<name>'` for non-user writes)
- `what` — `event` (table + action, e.g. `quote_updated`, `client_terminated`)
- `when` — `created_at timestamptz default now()`
- `before` — `metadata.before` snapshot of the changed columns
- `after` — `metadata.after` snapshot of the new values
- `ip` — `inet`, captured via `lib/auth/request-info.ts`
- `user_agent` — `text`

Reads are NOT audited (volume too high, no useful signal). Writes
across `INSERT`, `UPDATE`, `DELETE` (hard or soft) all produce a row.
The audit-log table is **append-only** at the policy level:

- `INSERT` allowed via service-role only (server actions go through
  `lib/auth/audit.ts → writeAuditLog`).
- `SELECT` allowed via `is_admin()` RLS.
- `UPDATE` and `DELETE` policies do not exist — only DB-superuser
  rotation can touch existing rows.

**Audit data is immutable, only rotated.** Default retention is 7 years
matching SOC 2 / industry security-systems contract requirements. The
rotation job (Session B+) copies rows older than the retention window
into cold archive storage, then deletes from the live table — but only
under an Admin-initiated rotation command with a comment field. There
is no "clear log" button.

**Auditing is a launch gate, not a feature.** A module without audit
coverage is incomplete. PR description must list every new audit event
type added.

---

## 5. Continuity

**Any new Claude Code session reads, in order:**

1. **`NEXVELON_PRINCIPLES.md`** (this file) — the five non-negotiables.
2. **`CLAUDE_CONTEXT.md`** — the `## Current Session State` block at
   the top, then any new task-relevant section.
3. **`NEXVELON_SESSION_A_HANDOFF.md`** — file-by-file state from
   Session A close, for historical context.
4. Any other doc explicitly referenced in `CLAUDE_CONTEXT.md`'s
   `## Current Session State` block.

**Until claude.ai memory is enabled across sessions, the repo IS the
persistent context.** Every meaningful decision lives in:

- A migration file under `supabase/migrations/`
- A commit message that explains the *why* (not just the *what*) —
  multi-line commit messages with prose explanations are the standard;
  one-liners are reserved for trivial fixes.
- A heading-level comment in the touched file linking back to the
  decision (timestamp + commit hash) when the design isn't obvious
  from the code itself.
- An update to `CLAUDE_CONTEXT.md`'s session-state block at the END of
  every session, summarising what shipped + what's next.

**Session handoff doc convention.** At the end of every major
session (Session B, C, …), a new `NEXVELON_SESSION_<X>_HANDOFF.md`
file is created mirroring the structure of `NEXVELON_SESSION_A_HANDOFF.md`:
file-by-file state, open bugs, what's broken or unverified, what's
next. The previous session's handoff is preserved (don't delete) —
the chain is the audit trail of the project itself.

**Never assume the next session remembers anything.** Write every
comment, every commit body, every doc update as if the person reading
it just walked into the room.

---

## 6. Extensibility & Customization

**Every operator gets a different version of Nexvelon without forking
the codebase.** The platform's surface area must bend to the
integrator's workflow, not the other way around. Five concrete rules
follow from that:

**Custom fields on every entity.** Clients, sites, contacts, quotes,
quote line items, projects, inventory items, schedule entries, and
invoices each get a per-entity custom-field surface. The pattern is
two tables: `<entity>_custom_field_definitions` (Admin-managed schema
— name, type, options, required, sort order, visibility) and
`<entity>_custom_field_values` (the per-row values). Forms, search,
list-view columns, reports, and PDF exports all honour the
definitions automatically — there is no module where the operator
hits a wall and has to ask for code.

**Status enums become lookup tables, not hard-coded DB enums.** The
default seed (Draft, Sent, Approved, Rejected, Expired, Converted on
quotes; In Progress, On Hold, At Risk, Completed, Closed on projects;
etc.) ships pre-populated, but the operator can rename, reorder, add,
retire — without code changes. A `*_statuses` table per relevant
entity, with `is_archived` to retire without breaking historical
rows, plus a `default_for_new` flag.

**Workflow rules in data, not code (Phase 2 commitment).** When
"Quote approved" should auto-trigger "Create project" + "Notify PM" +
"Allocate inventory", those rules live in a `workflow_rules` table
the operator edits in Settings — not in a server action's else-if.
Phase 1 of each module ships with sensible defaults hard-coded; Phase
2 hoists those rules into the data layer.

**Field-level permissions, not just feature-level.** §2 covers role ×
resource × action. §6 extends that to per-field: an Admin can hide an
individual field on the quote form from SalesReps without removing
their `quotes:edit` grant. Permissions storage model is one of the
open architectural decisions in `NEXVELON_ROADMAP.md`.

**Module-level extension points: server-side events + UI slots.**
Every server action that mutates a business record emits a typed
event (`quote.created`, `project.status_changed`, etc.) on a
project-internal event bus. UI slots — declared positions in each
module's primary surface — accept optional renderers from a registry,
so an operator who needs a custom widget on the quote builder can ship
one without touching the module's source.

**API-first design.** Every server action also exposes a clean,
authenticated API surface (REST or RPC; under one `/api/v1/*` tree).
The action is the implementation; the API is the contract. Same
permission gates, same audit-log writes, same RLS-scoped reads.
External integrations — accounting sync, BIM imports, custom
dashboards — never need a parallel data path.

**Depth over breadth: ship deeply or don't ship.** No "module lite."
Demo-quality is forbidden. If a module can't ship with full audit
coverage, full permissions integration, full custom-field support, and
its named reference floor (§3) beaten on the operator's measured
workflow — it doesn't ship yet. Deferred features go into
`NEXVELON_ROADMAP.md` with a clear description of what's missing and
why. A half-done module on the sidebar tells the operator the rest
of the suite is also half-done; we don't ship that signal.

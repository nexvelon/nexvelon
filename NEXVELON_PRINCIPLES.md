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

**Each module's v1 beats a named competitor.** When a feature decision
is ambiguous, the test is: *what does the named competitor do, and how
do we exceed it?* Not "match" — exceed. If we can't articulate the
delta, the feature isn't done.

Named competitors per module (the security-systems integrator vertical
is small; these are the products Nexvelon must outperform on v1 of each
surface). Refine as Nexvelon goes head-to-head in real sales cycles:

| Module | Named competitor | Where we exceed |
|---|---|---|
| **Quotes** | D-Tools System Integrator, QuoteWerks | Multi-section quotes with live margin per line, web-native (D-Tools is desktop), single-click convert-to-project. |
| **Projects** | Procore (for the GC-adjacent work), D-Tools Cloud | Tighter integration with quotes + inventory; fewer manual handoffs. |
| **Inventory** | Sortly, Fishbowl | Per-vendor reorder rules tied to manufacturer lead times; vendor-aware bills of material from quotes. |
| **Scheduling** | ServiceTitan, BuildOps | Tech-by-tech route optimisation that respects panel-cert qualifications, not just radius. |
| **Financials** | QuickBooks (integration target, not replacement) | First-class margin reporting per quote / project / client tier. |
| **Subcontractors** | ServiceTrade Subcontractor, Procore Subs | WSIB / insurance expiry rollup with hard-block on assignment when expired. |
| **Auth + Users** | Auth0, Okta (high bar — beat for invite-only, per-user permissions UX) | Custom-designed for the SME integrator workflow; no 50-user minimum, no per-MAU pricing. |

**When two designs satisfy the principle, choose the one that costs the
customer less hand-entry.** Every form, every default, every list
filter is measured in keystrokes saved versus the competitor.

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

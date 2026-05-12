# NEXVELON_PERMISSIONS_DESIGN.md

> **The permissions architecture for Nexvelon — design phase.**
>
> A new Claude Code session reads, in order:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final)
>   4. `NEXVELON_ROADMAP.md`
>   5. `NEXVELON_SESSION_<latest>_HANDOFF.md`
>   6. **This file** — Permissions design specification
>
> **Status:** v0.8 — Passes 1-8 complete. Pending: Pass 9 (Effective-
> permissions caching strategy), Pass 10 (Cross-cutting enforcement
> patterns), Pass 11 (Migration plan).
>
> Pass 1 condensed §1-§8; full at `9008fad`.
> Pass 2 condensed §9; full at `1bafbd4`.
> Pass 3 condensed §10; full at `ff08703`.
> Pass 4 condensed §11; full at `de1905f`.
> Pass 5 condensed §12; full at `904bfe5`.
> Pass 6 condensed §13; full at `3c21e58`.
> Pass 7 condensed §14; full at `41734b6`.
> Pass 8 (Permissions Editor UI) full content begins at §15.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog | ✅ COMPLETE (full at `9008fad`) |
| 2 | Database schema | ✅ COMPLETE (full at `1bafbd4`) |
| 3 | Permission resolution algorithm | ✅ COMPLETE (full at `ff08703`) |
| 4 | Field-level visibility engine | ✅ COMPLETE (full at `de1905f`) |
| 5 | Status surface binding layer | ✅ COMPLETE (full at `904bfe5`) |
| 6 | Append-only audit pattern | ✅ COMPLETE (full at `3c21e58`) |
| 7 | Request-admin-access workflow | ✅ COMPLETE (full at `41734b6`) |
| 8 | Permissions editor UI | ✅ COMPLETE (this version) |
| 9 | Effective-permissions caching strategy | PENDING |
| 10 | Cross-cutting enforcement patterns | PENDING |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13).

---

═══════════════════════════════════════════════════════════════════
# Part I — Pass 1 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 1 content at commit `9008fad`.*

## 1. Format
`resource:verb[:qualifier]` — plural noun + camelCase verb + optional qualifier. Verb taxonomy (8 categories). Qualifier taxonomy (4 categories). 140+ resources. 4-tier UI hierarchy + 6 cross-cut tabs.

---

═══════════════════════════════════════════════════════════════════
# Part II — Pass 2 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 2 content at commit `1bafbd4`.*

## 9. Schema

14 tables across 5 groups + 1 materialized view. Core permissions (5), field visibility (3), data scopes (3, orthogonal), audit (1 append-only), cross-cutting constraints (3). Three decisions: one row per action; trigger-invalidated cache; orthogonal scopes.

---

═══════════════════════════════════════════════════════════════════
# Part III — Pass 3 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 3 content at commit `ff08703`.*

## 10. Three algorithms

A1 action grant (7-phase with Phase 3 constraints: separation of duties + regulatory expiry + status binding). A2 data scope. A3 field visibility. <5ms p99 compound.

---

═══════════════════════════════════════════════════════════════════
# Part IV — Pass 4 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 4 content at commit `de1905f`.*

## 11. Field visibility engine

Backend serialization pipeline + frontend `<FieldGated>` wrapper + view layer for 5 highest-sensitivity resources. 12 mask types. Async batched audit-on-read. 47-flag catalog.

---

═══════════════════════════════════════════════════════════════════
# Part V — Pass 5 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 5 content at commit `904bfe5`.*

## 12. Status surface binding layer

Polymorphic `status_behavior_bindings` across 80 status surfaces. 14 standard binding names (8 action-gating + 6 effect-triggering + 5 UI-driving). `status_transition_definitions` with triggers_effects JSONB. Phase 3.3 integration. ~2000 bindings + ~600 transitions seed.

---

═══════════════════════════════════════════════════════════════════
# Part VI — Pass 6 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 6 content at commit `3c21e58`.*

## 13. Append-only audit pattern

8 ledgers sharing uniform pattern. Monthly time-based partitioning. UPDATE/DELETE triggers. 21 event types with JSON payload schemas. 3-layer query API (endpoints + M13 reports + `audit_log_combined` SQL view). ~38M rows/year combined.

---

═══════════════════════════════════════════════════════════════════
# Part VII — Pass 7 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 7 content at commit `41734b6`.*

## 14. Request-admin-access workflow

State machine: Pending → Approved → Granted → Expired/Revoked + Rejected/Cancelled. Four request types: permission_grant / field_visibility_grant / data_scope_grant / role_temporary_assignment. New `user_role_assignments` table for multi-role support. 30+ column schema with polymorphic target + dual reasoning capture. All-admins notification v1; routing rules Phase 2. Auto-expiry 3 paths. 8 edge cases. 9 new audit event types (30 total now).

---

═══════════════════════════════════════════════════════════════════
# Part VIII — Pass 8 (Permissions Editor UI) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 15. Overview

The first design pass where the system meets the human. Passes 1-7 specified what runs under the hood; Pass 8 specifies every admin interaction.

### 15.1 Two competing goals

The editor serves two contexts:

**Daily admin operations** — handle today's request, revoke yesterday's grant, check who has banking access. Fast lookup, clear status, minimum clicks.

**System configuration** — set up custom role, redesign data scopes after org restructure, bulk-update grants for new permissions. Power, batch operations, conflict warnings.

Optimizing only for one breaks the other. Pass 8 does both without overloading.

### 15.2 Scale considerations

Information surface:
- ~1260 actions × 11 base roles = ~14,000 grant cells in the action matrix
- 47 field visibility flags × 11 roles = ~520 visibility cells
- 140+ resources × 7 scopes × 11 roles = potential ~10,000 scope cells (sparse in practice)
- Typical ongoing user overrides: 50-200 active
- Typical pending requests: 5-20 at any time
- Audit log: ~10M rows/year searchable

Bad UI here makes everything else worthless. Performance + clarity equally critical.

### 15.3 Permission to access the editor

The editor itself is gated:
- `permissions:viewEditor` — A only by default
- `permissions:editRoleGrants` — A only
- `permissions:setUserOverride` — A only
- `permissions:viewAuditLog` — A by default; granted role can access

If non-admin somehow lands at the editor URL, they see 403 with the standard message.

## 16. Workspace architecture

Per Decision 1 (chat walk): single workspace with six sections, not six separate pages.

### 16.1 Top-level layout

```
┌────────────────────────────────────────────────────────────────┐
│  HEADER                                                         │
│  [Logo] Permissions Editor [Search: 🔍] [User Menu] [Save All]  │
├──────────────┬─────────────────────────────────────────────────┤
│              │                                                  │
│  SIDEBAR     │   MAIN PANE                                      │
│  (240px)     │                                                  │
│              │   Section content rendered here                  │
│  • Actions   │                                                  │
│  • Field Vis │                                                  │
│  • Scopes    │                                                  │
│  • Overrides │                                                  │
│  • Roles     │                                                  │
│  • Audit Log │                                                  │
│              │                                                  │
│  ─────────   │                                                  │
│              │                                                  │
│  RECENT      │                                                  │
│  • [user X]  │                                                  │
│  • [role Y]  │                                                  │
│              │                                                  │
└──────────────┴─────────────────────────────────────────────────┘
```

### 16.2 Persistent header elements

**Global search bar** (top, 480px wide): searches across all sections.

Query types supported:
- `user:james` → jumps to user X's override list
- `role:pm` → jumps to PM role detail
- `perm:invoices:approve` → jumps to action in matrix
- `entity:client_xyz` → jumps to entity's relevant audit + active grants
- Free text → fuzzy search across user names, role names, permission action names

Result type-ahead with categorized buckets (Users / Roles / Permissions / Entities / Audit Events).

**Save state indicator** (top-right):
- "All changes saved" (green check) — default
- "3 unsaved changes" (orange dot) — dirty state; clicking surfaces unsaved list
- "Save All" button — explicit commit; some changes require confirmation

**User menu** (top-right corner): standard.

### 16.3 Sidebar — section navigation

Six section links plus Recent items:

```
[Section icons + labels]
✓ Actions           ← currently active (highlighted)
  Field Visibility
  Data Scopes
  Overrides         (3 pending)   ← badge with pending request count
  Custom Roles
  Audit Log

────────────────────

Recently viewed:
👤 James Smith
🎭 Project Manager
🔑 invoices:approve
🏢 Client: Acme Corp
```

Recent items: top 5 cross-section references, updated on every drill-in.

### 16.4 Main pane

Renders the active section. Each section described in §17-§22.

### 16.5 Cross-section linking

Throughout the workspace, entities (users, roles, permissions, etc.) are clickable links that jump to their canonical view:

- Click "James Smith" in any context → jumps to Overrides section filtered to user james
- Click "Project Manager" in any context → jumps to Custom Roles section showing PM details
- Click `invoices:approve` in any context → jumps to Actions section with that row highlighted

Breadcrumbs in main pane show drill path; back button preserves filter state.

### 16.6 Save flow

Per Decision 2 (chat walk): transactional, not optimistic.

Changes accumulate in a draft buffer. User explicitly clicks "Save All" or "Apply" buttons. On save:

1. Loading state shown ("Saving 3 changes...")
2. Server validates entire batch atomically
3. If validation passes: all changes applied in one transaction; cache invalidates; success toast
4. If validation fails: changes preserved in draft buffer; specific failures highlighted in UI; user fixes and retries

Conflict detection runs as part of save (see §22.3).

## 17. Section 1: Actions

The action grant matrix is the editor's largest surface. ~1260 actions × ~11 roles. Navigation hierarchy from Pass 1 §5: Module → Resource → Category → Action.

### 17.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ACTIONS                                              [+ Bulk Edit]│
├──────────────────────────────────────────────────────────────────┤
│  [Filter: Module ▼] [Filter: Resource ▼] [Filter: Verb ▼]         │
│  [Show: Only Granted | Only Denied | All | Differs from Default]  │
│  [Search actions: 🔍                                            ]  │
├──────────────────────────────────────────────────────────────────┤
│  📦 M9 — Invoices ▼                                                │
│    💼 invoices ▼                                                   │
│      ▼ View                                                        │
│      ▼ Create                                                      │
│      ▼ Edit                                                        │
│      ▼ State Transitions                                           │
│      └ invoices:submit         [A:✓][PM:✓][SR:✓][Tech:⊘][Acc:✓]   │
│      └ invoices:approve       *[A:✓][PM:✓][SR:⊘][Tech:⊘][Acc:✓]   │
│      └ invoices:send          *[A:✓][PM:✓][SR:✓][Tech:⊘][Acc:✓]   │
│      └ invoices:reject         [A:✓][PM:✓][SR:⊘][Tech:⊘][Acc:✓]   │
│      └ invoices:markPaid       [A:✓][PM:✓][SR:⊘][Tech:⊘][Acc:✓]   │
│      └ invoices:void           [A:✓][PM:⊘][SR:⊘][Tech:⊘][Acc:⊘]   │
│      └ invoices:reopen         [A:✓][PM:⊘][SR:⊘][Tech:⊘][Acc:⊘]🔒│
│      ▼ Communication                                               │
│      ▼ Reporting                                                   │
│      ▼ Admin Override                                              │
└──────────────────────────────────────────────────────────────────┘
```

Cell legend:
- `✓` granted, interactive
- `⊘` denied
- `✓ⓘ` granted, with disabled or hidden UI state override
- `*` row has at least one user override (asterisk before action name)
- `🔒` system-locked row (per §0.4 commitments) — cells not editable; tooltip explains why

### 17.2 Cell interaction

Click a cell:
1. Cell expands inline showing detail panel:
   ```
   ┌─────────────────────────────────────────────┐
   │ Permission: invoices:approve                 │
   │ Role: Project Manager                        │
   │                                              │
   │ Current state: [Granted ▼]                   │
   │ UI state:      [Default (Interactive) ▼]     │
   │                                              │
   │ Description: Approve invoice for sending      │
   │ Module: M9 | Verb category: state_transition │
   │ Sensitivity: 🔒 sensitive                     │
   │                                              │
   │ Dependencies: invoices:viewDetail (required) │
   │ Constraints: separation_of_duties            │
   │ (cannot approve own AP bills)                │
   │                                              │
   │ Recent activity:                             │
   │ • 3 PMs currently have this granted          │
   │ • 12 approvals in last 30 days              │
   │ • 0 user overrides active                   │
   │                                              │
   │ [Cancel]                       [Save Change] │
   └─────────────────────────────────────────────┘
   ```
2. User changes state from default; clicks Save Change
3. Change added to draft buffer (top-right indicator updates)
4. Cell shows orange dot indicating unsaved change
5. On Save All from header: validation + commit

### 17.3 Bulk edit mode

Click "+ Bulk Edit" enters multi-select mode:

```
☐ Select all in view
─────────────────────────
☑ invoices:submit
☑ invoices:approve
☐ invoices:reject
☑ invoices:send

[2 selected] [Action ▼: Grant / Deny / Reset to Default]
            [Role: PM ▼]
```

Bulk operations validate the full set; partial success not allowed (all or nothing per save).

### 17.4 Filtering

Multi-axis filters:
- **Module**: M1 through M13 multi-select
- **Resource**: searchable dropdown of resources within selected modules
- **Verb category**: 8 categories (view/create/edit/state/config/comm/admin/workflow)
- **Show**: Only Granted / Only Denied / All / Differs from Default (the last filters to non-default grants only — usually most useful)
- **Search**: fuzzy on action_name

Filters compose. URL updates with filter state for bookmark/share.

### 17.5 System-locked rows

Per Pass 5 §18.1, certain rows are system-locked (enforce §0.4 commitments). UI rendering:

- 🔒 icon at end of row
- Cells render as locked (no hover, no click-to-edit)
- Tooltip on hover: "This permission enforces §0.4 #8 immutable snapshot policy. Cannot be modified via permissions editor. See documentation."
- Cells DO show current state (admin can see; just can't change)

Examples of system-locked rows:
- `payments:view:full_card_number` — PCI compliance, never granted
- All `*:edit*` actions on Sent invoices (via status binding)
- `inventory_movements:edit` / `:hardDelete` — append-only ledger

### 17.6 Comparison view

Sometimes admin needs to see "what's different between PM and SR?" Comparison mode renders two roles side-by-side with differences highlighted:

```
[Compare: PM vs SR]
─────────────────────────────────────
invoices:approve     [PM: ✓] [SR: ⊘]   ← diff highlighted
invoices:send        [PM: ✓] [SR: ✓]
invoices:exportPdf   [PM: ✓] [SR: ✓]
clients:viewBanking  [PM: ✓] [SR: ⊘]   ← diff highlighted
```

Filter "show only differences" toggle.

### 17.7 Performance

- Initial render: lazy load by module (only expand current; collapse on scroll out)
- Cell state pre-fetched in single GraphQL/REST query: SELECT role_id, permission_id, grant_state FROM role_permissions WHERE role_id IN ($roles)
- Action matrix data: ~14k rows max; <200ms initial fetch with index hits
- Filter operations: client-side (data already loaded); <50ms reactivity

## 18. Section 2: Field Visibility

The 47-flag catalog from Pass 4 §17. Smaller than Actions but with more nuance (3-state visibility, mask preview).

### 18.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  FIELD VISIBILITY                                                 │
├──────────────────────────────────────────────────────────────────┤
│  [Filter: Module ▼] [Filter: Sensitivity ▼] [Search: 🔍       ]   │
├──────────────────────────────────────────────────────────────────┤
│  📦 M1 — Clients                                                   │
│  └─ visibility.clients.banking                                     │
│     Cols: banking_account_name, routing, account_number            │
│     Audit-on-read: ✓                                               │
│     Mask preview: ••••••••5678                                     │
│     ┌──────┬──────┬──────┬──────┬──────┐                          │
│     │  A   │  PM  │  SR  │ Tech │ Acc  │                          │
│     │visible│masked│hidden│hidden│visible│ ← visibility states     │
│     │  ✓   │  ✓ⓘ │  ✗   │  ✗   │  ✓👁│ ← 👁 = audit on read       │
│     └──────┴──────┴──────┴──────┴──────┘                          │
│  └─ visibility.clients.internalNotes                               │
│     ...                                                            │
└──────────────────────────────────────────────────────────────────┘
```

State indicators:
- `visible` → field rendered normally
- `masked` → field rendered with masked value (preview shown above the matrix)
- `hidden` → field absent from UI entirely

### 18.2 Cell interaction

Click cell to change visibility state:
```
┌──────────────────────────────────────────────┐
│ Flag: visibility.clients.banking              │
│ Role: Sales Rep                               │
│                                               │
│ Current: hidden                               │
│ Change to: [Hidden ▼]                         │
│  → Visible                                    │
│  → Masked  (shown as: ••••5678)              │
│  → Hidden                                     │
│                                               │
│ Audit-on-read: This field triggers audit log  │
│ entry on every visible read.                  │
│                                               │
│ Sensitivity: SENSITIVE                        │
│ Affected columns: banking_account_name,       │
│ banking_routing_number, banking_account_number│
│                                               │
│ Phase 2 deferrals affect this flag:           │
│ • Per-tenant column mapping customization     │
│                                               │
│ [Cancel]                       [Save Change]  │
└──────────────────────────────────────────────┘
```

### 18.3 Never-granted flags

`visibility.payments.fullCardNumber` (PCI compliance, `is_never_granted=TRUE`) renders with all cells locked at `hidden`. Admin tooltip: "PCI compliance — cannot be granted to any user. Last-4 only via separate masked path."

### 18.4 Bulk operations

Same as Actions section. Multi-select flags → set state for selected role(s).

## 19. Section 3: Data Scopes

The role × resource × scope matrix.

### 19.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  DATA SCOPES                                                      │
├──────────────────────────────────────────────────────────────────┤
│  Scope per resource per role                                       │
│  [Filter: Module ▼] [Search resource: 🔍              ]            │
├──────────────────────────────────────────────────────────────────┤
│                  │  A   │  PM  │  SR  │ Tech │ Acc  │ VO  │       │
│  Resource        │      │      │      │      │      │     │       │
│  ────────────────┼──────┼──────┼──────┼──────┼──────┼─────┤       │
│  clients         │ all  │ team │ my   │assign│ all  │ all │       │
│  projects        │ all  │ team │ my   │assign│ all  │ all │       │
│  invoices        │ all  │ proj │ my   │  -   │ all  │ all │       │
│  appointments    │ all  │ team │ my   │ my   │  -   │ all │       │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

Cells show scope code: `all`, `team`, `project`, `my`, `assigned`, `tier`, `category`, or `-` (resource not applicable for that role).

### 19.2 Cell interaction

Click cell:
```
┌──────────────────────────────────────────────┐
│ Resource: clients                             │
│ Role: Sales Rep                               │
│                                               │
│ Current scope: my                             │
│ Change to: [my ▼]                             │
│  → all       — Unrestricted (Admin level)    │
│  → team      — User's team's records         │
│  → assigned  — Records assigned to user      │
│  → project   — Records in user's projects    │
│  → my        — Records owned/created by user │
│  → tier      — Filtered by specific tier      │
│  → category  — Filtered by category           │
│  → (none)    — Resource not applicable       │
│                                               │
│ SQL filter for this scope:                    │
│   (created_by = :current_user OR              │
│    owner_id = :current_user)                  │
│                                               │
│ Impact: ~120 active SRs would be affected     │
│                                               │
│ [Cancel]                       [Save Change]  │
└──────────────────────────────────────────────┘
```

### 19.3 Scope impact preview

Critical UX: changing scope can dramatically affect what users see. Detail panel shows estimated impact:

- "Changing SR scope on `clients` from `my` to `all` affects 120 active SR users. Estimated additional records visible to each: ~2400."
- Warning if change would expose sensitive data: "⚠ This change grants visibility into ~3200 banking records that were previously hidden. Are you sure?"

## 20. Section 4: Overrides

Active user overrides + Request management sub-section.

### 20.1 Top-level layout

```
┌──────────────────────────────────────────────────────────────────┐
│  OVERRIDES                                                        │
├──────────────────────────────────────────────────────────────────┤
│  [Active Overrides] [Pending Requests (3)] [Request History]      │
├──────────────────────────────────────────────────────────────────┤
│  ... sub-section content ...                                       │
└──────────────────────────────────────────────────────────────────┘
```

Three sub-tabs:
- Active Overrides
- Pending Requests (count badge)
- Request History

### 20.2 Active Overrides sub-tab

```
┌──────────────────────────────────────────────────────────────────┐
│  ACTIVE OVERRIDES                                  [+ Grant Override]│
├──────────────────────────────────────────────────────────────────┤
│  [Filter: Role ▼] [Type ▼: Permission/Visibility/Scope/Role]      │
│  [Show: Active | Expiring soon (≤7 days) | All]                   │
│  [Search user/permission: 🔍                                   ]   │
├──────────────────────────────────────────────────────────────────┤
│  User              │ Type        │ Target              │ Expires  │
│  ──────────────────┼─────────────┼─────────────────────┼──────────┤
│  Maria Santos (PM) │ Permission  │ invoices:approve    │ Permanent│
│                    │             │   (granted by req#42)│         │
│  James Lee (Tech)  │ Visibility  │ visibility.employees│ 2d remain│
│                    │             │   .banking          │ ⚠       │
│  Sarah Khan (SR)   │ Scope       │ clients: my → team  │ 8d remain│
│                    │             │   (vacation coverage)│         │
│  David Park (PM)   │ Role        │ + Bookkeeper        │ 12d      │
│                    │             │                     │          │
└──────────────────────────────────────────────────────────────────┘
```

Click row → detail panel shows:
- User profile
- Override type + target (clickable to relevant section)
- Reason (from `reason` column)
- Granted by + granted at
- Expires at (countdown for temporary)
- Activity (use_count, first_used_at, last_used_at if from request)
- Actions: [Revoke] [Extend duration]

### 20.3 Pending Requests sub-tab

```
┌──────────────────────────────────────────────────────────────────┐
│  PENDING REQUESTS (3)                                             │
├──────────────────────────────────────────────────────────────────┤
│  [Sort: Newest First ▼] [Filter: Type ▼]                          │
├──────────────────────────────────────────────────────────────────┤
│  Request from Lin Wei (SR)             Submitted 2h ago           │
│  ──────────────────────────────────────────────────────────────── │
│  Type: Field Visibility Grant                                     │
│  Target: visibility.invoices.profit                               │
│  Duration: Temporary (7 days)                                     │
│  Related: Invoice INV-2024-555 (client Acme Corp)                │
│                                                                   │
│  Justification:                                                   │
│  "Need to verify margin against contract pricing for the          │
│   client review meeting Friday. Will reference specific           │
│   invoice INV-2024-555 only."                                     │
│                                                                   │
│  Lin's recent activity (last 30 days):                            │
│  • 47 invoice views (all in own scope)                            │
│  • 0 previous similar requests                                    │
│  • 1 request 6 months ago (approved; vendor banking)             │
│                                                                   │
│  Suggested decision: Approve (similar pattern to past approval)   │
│                                                                   │
│  [Reject ✗]  [Approve with modifications]  [Approve ✓]            │
│                                                                   │
│  Approval form (expands on click):                                │
│  Duration: [7 days ▼]                                             │
│  Rationale: [____________________________]                        │
│  ▢ Notify Lin via Slack on approval                               │
└──────────────────────────────────────────────────────────────────┘
```

Approval flow:
1. Click [Approve ✓] → form expands inline
2. Admin sets rationale; optionally adjusts duration
3. Submit → server transaction (approve + fireGrant if start_at <= NOW)
4. Card updates to "Approved" state with green check
5. Card auto-dismisses after 3 seconds; moves to History

Rejection flow:
1. Click [Reject ✗] → form expands with rationale field
2. Submit → server updates to Rejected; notifies Lin
3. Card auto-dismisses

### 20.4 Request History sub-tab

Read-only chronological list of all past requests:

```
[Filter: All / Approved / Rejected / Expired / Revoked / Cancelled]
[Search: 🔍] [Date range: Last 90 days ▼]

Date       | Requester | Type       | Target              | Status   | Decided By
2026-05-08 | Lin Wei   | Field Vis  | invoices.profit     | Approved | A. Mehta
2026-05-07 | James Lee | Permission | clients:overrideSla | Rejected | A. Mehta
...
```

Click row → expanded view with full request details (matching pending view structure).

### 20.5 Grant Override (direct, no request workflow)

Admin can grant overrides directly without going through request workflow:

```
[+ Grant Override]
  ↓
┌──────────────────────────────────────────────┐
│  Grant Override (Direct)                      │
│                                               │
│  Target user: [Search user ▼]                 │
│  Override type: [Permission ▼]                │
│  Target permission: [Search ▼]                │
│                                               │
│  Override state: [Granted ▼]                  │
│  Reason: [____________________________]       │
│                                               │
│  Duration: ▢ Permanent                        │
│           ▢ Temporary [until: 📅 picker]      │
│                                               │
│  ⚠ Direct overrides do NOT go through the     │
│  request workflow. Audit captures your        │
│  action.                                      │
│                                               │
│  [Cancel]                          [Grant]    │
└──────────────────────────────────────────────┘
```

Used for: emergencies, admin-initiated grants (employee promotion), bulk grant operations.

## 21. Section 5: Custom Roles

Role builder with clone-from-existing pattern (per Pass 1 §8: flat model with clone-and-modify; no role inheritance at v1).

### 21.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  CUSTOM ROLES                                       [+ New Role]  │
├──────────────────────────────────────────────────────────────────┤
│  System Roles (read-only summary)                                 │
│  • Admin (8 users)                                                │
│  • Project Manager (12 users)                                     │
│  • Sales Rep (24 users)                                           │
│  • Technician (35 users)                                          │
│  • Subcontractor (45 users - portal only)                         │
│  • Accounting (5 users)                                           │
│  • View Only (8 users)                                            │
│  • Dispatcher (3 users)                                           │
│  • Bookkeeper (2 users)                                           │
│  • HR-role (2 users)                                              │
│  • Executive (4 users)                                            │
│                                                                   │
│  ─────────────────────────────────────                            │
│  Custom Roles                                                     │
│  • Senior Field Tech (cloned from Technician) - 5 users          │
│  • Junior PM (cloned from PM) - 3 users                          │
│  • External Consultant (cloned from Subcontractor) - 2 users     │
└──────────────────────────────────────────────────────────────────┘
```

### 21.2 New role wizard

```
[+ New Role]
  ↓
┌─────────────────────────────────────────────────────┐
│  New Role — Step 1 of 3                              │
│                                                       │
│  Role Name: [_______________________]                 │
│  Description: [_______________________]               │
│  Display badge color: [Color picker]                  │
│                                                       │
│  Clone from existing role:                           │
│  [Search system roles ▼]   or  [Start blank]         │
│                                                       │
│                          [Cancel] [Next →]            │
└─────────────────────────────────────────────────────┘

Step 2: Action permissions
  Inherited from cloned role pre-filled
  Admin modifies grants matrix similar to Section 1
  
Step 3: Field visibility + Data scopes
  Inherited from cloned role pre-filled
  Admin modifies similar to Section 2 + 3

[Save Role]
```

### 21.3 Role detail view

Click an existing role:

```
┌──────────────────────────────────────────────────────────────────┐
│  Project Manager (PM)                                             │
├──────────────────────────────────────────────────────────────────┤
│  Description: Project lifecycle management                        │
│  Display color: 🟣 Purple                                          │
│  System role: ✓ (cannot delete)                                   │
│                                                                   │
│  [Actions ▼]                                                      │
│  → 1247 of 1260 actions granted (default + grants - denials)     │
│  [View grant matrix for PM →]                                     │
│                                                                   │
│  [Field Visibility ▼]                                             │
│  → 24 of 47 flags visible                                         │
│  [View visibility matrix for PM →]                                │
│                                                                   │
│  [Data Scopes ▼]                                                  │
│  → Mostly 'team' or 'project' scope                              │
│  [View scope matrix for PM →]                                     │
│                                                                   │
│  Users with this role (12):                                       │
│  [List of users with quick action buttons]                       │
│                                                                   │
│  Activity (last 30 days):                                         │
│  • 1,250 actions executed                                         │
│  • 5 admin exceptions invoked                                     │
│  • 12 separation-of-duties blocks                                 │
│  [View detailed activity →]                                       │
└──────────────────────────────────────────────────────────────────┘
```

### 21.4 Role archival

Custom roles can be archived (not deleted) when no longer needed:

```
[Archive Role]
  ↓
"Archive 'External Consultant'? 
 Users currently assigned: 2
 They will retain access until reassigned to another role.
 
 Confirm reassignment:
 • Maria Santos → [Sales Rep ▼]
 • David Park → [Sales Rep ▼]
 
 [Cancel]  [Archive Role]"
```

System roles cannot be archived (UI disables).

## 22. Section 6: Audit Log

Embedded interface for `permission_audit_log` queries.

### 22.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  AUDIT LOG                                       [Export ▼]       │
├──────────────────────────────────────────────────────────────────┤
│  Quick filters:                                                   │
│  [Last 24h] [Last 7d] [Last 30d] [Custom range]                   │
│  [Event type ▼] [Actor user ▼] [Target user ▼] [Target perm ▼]    │
│  [🔍 Search]                                                       │
├──────────────────────────────────────────────────────────────────┤
│  When                Event                          Actor          │
│  ────────────────────────────────────────────────────────────────│
│  5/12 14:23  request_admin_access_granted          A. Mehta       │
│              Target: Lin Wei | invoices.profit                    │
│              [View details →]                                     │
│                                                                   │
│  5/12 11:45  admin_exception_invoked               A. Mehta       │
│              Target: client Acme Corp | overrideSla              │
│              Reason: "30-day IT migration relief"                 │
│              [View details →]                                     │
│                                                                   │
│  5/12 09:30  role_permission_granted                A. Mehta       │
│              Target: PM role | invoices:approve                   │
│              [View details →]                                     │
│                                                                   │
│  5/12 09:15  field_read_with_audit                  Sarah Khan     │
│              Target: vendor banking detail (vendor abc)           │
│                                                                   │
│  [Load more ↓]                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 22.2 Row detail expansion

Click a row → modal/drawer with full event details:

```
┌─────────────────────────────────────────────────┐
│  Event: request_admin_access_granted             │
│  Occurred: 2026-05-12 14:23:45 UTC               │
│  Event ID: e7a3...                               │
├─────────────────────────────────────────────────┤
│  Actor:                                          │
│  • A. Mehta (Admin)                              │
│  • IP: 192.168.1.5                               │
│  • User-Agent: Mozilla/5.0...                    │
│  • Request ID: req_abc123                        │
│                                                  │
│  Target:                                         │
│  • Type: request                                 │
│  • ID: req_admin_access_42                       │
│                                                  │
│  Before/After:                                   │
│  {                                               │
│    "request_id": "...",                          │
│    "override_id": "ovr_xyz",                     │
│    "status": "granted"                           │
│  }                                               │
│                                                  │
│  Related events (same request_id):               │
│  • [submitted at 12:15] →                        │
│  • [approved at 14:00] →                         │
│  • [granted at 14:23] (THIS) →                   │
│  • [first read at 14:30] →                       │
│  • [second read at 15:42] →                      │
│                                                  │
│  [Close]                  [View entity history]  │
└─────────────────────────────────────────────────┘
```

### 22.3 Filters and queries

Quick filters at top + advanced filter panel for power users.

Filter combinations are URL-encoded for bookmark/share. Audit queries use the 3-layer API from Pass 6 §16 (entity-history / user-actions / event-stream endpoints).

### 22.4 Export

Click Export → format selection (PDF / CSV / JSON). Triggers `POST /api/admin/audit/export` per Pass 6 §20.3. PDF uses §0.4 #9 eight-layer print protection.

Permission: `audit:export` — A and compliance role only.

### 22.5 Pre-built compliance reports

Sidebar shortcut to M13 compliance reports (per Pass 6 §16.5):
- Audit Trail by User
- Admin Exceptions Last 90 Days
- Sensitive Field Reads
- Regulatory Override History
- Co-Sign Activity
- Permission Grant Changes Last Quarter

Each is one-click access; renders in M13 reports module with audit_log_combined data source.

## 23. Cross-section concerns

### 23.1 Global search

Persistent in header. Searches:
- Users (name, email)
- Roles (name, description)
- Permissions (action_name, description)
- Audit events (event_type, target_entity_id)
- Active overrides (by reason text)

Type-ahead with categorized buckets. Click result → jumps to canonical view.

Implementation:
- Client-side fuzzy matching against pre-loaded indexes (users, roles, permissions are small enough to cache)
- Server-side search for audit events (query string passed to API)

### 23.2 Save flow

Per §16.6 — transactional save with validation.

Draft buffer:
- Stored in browser localStorage (survives page refresh)
- Capped at 100 unsaved changes (further changes prompt admin to save first)
- Cleared on successful save OR explicit "Discard All"

Save sequence:
1. Click "Save All"
2. Loading state ("Saving N changes...")
3. POST to `/api/admin/permissions/batch-save` with all draft changes
4. Server validates entire batch:
   - Each individual change valid
   - No new separation_of_duties violations introduced
   - No new conflicts with status bindings
   - No removal of permissions critical for currently-active sessions
5. If valid: atomic transaction; all changes committed; cache invalidates; success toast
6. If invalid: response highlights specific failed changes; draft preserved; admin fixes and retries

### 23.3 Conflict detection

Pre-save warnings on potentially problematic changes:

**Cascading effects:**
- "Removing `invoices:approve` from PM role affects 5 active overrides that grant PMs override access. Proceed?"

**Separation of duties:**
- "Granting `ap_bills:approve` to a user who already has `ap_bills:create` for the same scope is a separation of duties conflict (§0.4 #11). Either restrict scope OR remove `ap_bills:create` grant first."

**Regulatory expiry:**
- "This permission is blocked by regulatory expiry constraints for 3 contractors. Grant will take effect for those contractors only after their WSIB is renewed."

**Active session impact:**
- "12 users currently logged in have this permission. Changes will take effect on their next request. Refresh recommended for sensitive changes."

Warnings non-blocking; admin can proceed with explicit acknowledgment.

### 23.4 Undo/redo

Within a save session (before save):
- Each change is reversible via Ctrl+Z (or Cmd+Z)
- Redo via Ctrl+Y (or Cmd+Y)
- Stack capped at 50 actions

After save: no undo. Audit log shows full history.

### 23.5 Mobile responsive

Editor designed desktop-first but mobile-functional for emergency operations:

| Surface | Mobile rendering |
|---|---|
| Sidebar | Hidden behind hamburger; navigation drawer |
| Actions matrix | Single-role view at a time; role picker at top |
| Field Visibility matrix | Same — single role view |
| Data Scopes matrix | List view by resource, not matrix |
| Overrides | List view with smaller cards |
| Pending Requests | Card list optimized for approval — large tap targets |
| Custom Roles | List + drill-in |
| Audit Log | List view; row detail full-screen modal |

Mobile primary use case: admin gets notification on phone, opens Pending Requests, approves a request, done.

### 23.6 Accessibility

WCAG 2.1 AA target:
- All interactive elements keyboard-navigable (Tab, Enter, Escape)
- Focus indicators visible
- ARIA labels on all matrix cells, action buttons
- Color not used as sole indicator (✓/⊘ symbols + colors)
- Screen reader announces state changes ("Permission invoices:approve for Project Manager set to granted")
- High-contrast mode supported via CSS variables
- Reduced motion preference respected (no auto-dismissing cards if user prefers)

### 23.7 Performance budget

- Initial load: <1.5s (matrix data + user list + role list pre-fetched)
- Section switch: <100ms (no re-fetch; client-side render)
- Cell click → detail panel open: <50ms
- Save 1-10 changes: <500ms
- Save 11-100 changes: <2s
- Audit log query: <500ms (per Pass 6 performance budget)
- Search type-ahead: <30ms (client-side fuzzy)

## 24. Open questions (Pass 8)

1. **Should the editor have a "dry run" mode?** (preview effects of changes without saving). Decision: NO at v1 — conflict detection (§23.3) plus the explicit save step is sufficient. Phase 2 consideration.

2. **Should there be admin-to-admin handoff workflows?** (e.g., A1 starts a change set; A2 reviews and saves). Decision: NO at v1 — single-admin save with audit trail is sufficient. Phase 2 with multi-step approval.

3. **Should non-admins see a read-only version of their permissions?** (e.g., user views their own grants). Decision: YES via separate UI at `/profile/permissions` — read-only view of user's effective permissions + active overrides. Not part of the admin editor but reusing components.

4. **Permission editor activity audit.** Should admin's actions in the editor itself be audited beyond per-change events? Decision: each save operation generates its own audit row (event_type='editor_batch_save') containing the diff; finer than per-change events; Phase 2 consideration if needed.

5. **Bulk import/export of grants?** (CSV roundtrip). Decision: YES — admin can export current role grants matrix to CSV, edit offline, import back. Validation catches malformed imports. Useful for org-wide audits.

6. **Side-by-side comparison of roles?** Already addressed (§17.6). Confirmed for v1.

7. **Time-travel view of permissions?** (e.g., "what did PM have access to on 2025-12-01?"). Decision: NO at v1 — audit log reconstructs historical states but no dedicated UI. Phase 2 with materialized historical snapshots.

8. **Permission templates?** (operator can create reusable bundles like "AP coverage bundle" = invoices:approve + payments:create + etc., apply to user with one click). Decision: NO at v1; manual override granting + custom roles cover real needs. Phase 2 if operator demand emerges.

## 25. New audit event types for Pass 8

Adding to Pass 7's total of 30 event types:

| Event type | Triggered by | Required JSONB fields |
|---|---|---|
| `editor_batch_save` | Admin clicks Save All in editor | `changes_summary` (array of all changes), `change_count`, `validation_passed` |
| `bulk_export_audit_log` | Admin exports audit log | `filter_criteria`, `format`, `row_count`, `download_url` (signed) |

Total event types in permission_audit_log: 30 (Pass 7) + 2 (Pass 8) = **32 event types**.

## 26. Migration order extension

Adding to Pass 7's 39-step migration order:

- Step 40: Build editor frontend bundle (component library, routing, state management)
- Step 41: Build editor backend endpoints (`/api/admin/permissions/*`)
- Step 42: Build batch-save endpoint with validation pipeline
- Step 43: Build conflict detection service
- Step 44: Build editor permissions gating (only admins access)
- Step 45: Build user profile permissions view (read-only at `/profile/permissions`)

Now 45 total migration steps.

## 27. Implementation dependencies

Pass 8 depends on:
- All passes 1-7 design complete (✓)
- Build phase infrastructure: React + Tailwind UI framework, GraphQL or REST API, WebSocket for live updates
- Authentication context (currentUser, isAdmin)
- Notification delivery (in-app at minimum; email + Slack handled separately)

Pass 8 is the FIRST pass whose output significantly impacts build phase — the editor is the largest single piece of UI in the permissions module build.

---

═══════════════════════════════════════════════════════════════════
# 28. What's next (Pass 9 preview)
═══════════════════════════════════════════════════════════════════

**Pass 9: Effective-permissions caching strategy.**

Pass 2 introduced `effective_permissions_cache`. Pass 3 specified the algorithm's cache lookup. Pass 5 introduced `effective_status_bindings_cache`. But cache strategy details — invalidation triggers' detailed implementation, warm-up patterns, stale-while-revalidate thresholds, multi-tenant cache key design Phase 2 prep — these need specification before build.

Pass 9 covers:
- Trigger implementation details (the SQL functions and triggers that invalidate caches on grant/revoke/override events)
- Cache warm-up patterns (on user login, prefetch what they'll need for dashboard)
- Stale-while-revalidate thresholds (<5 minute dashboard cache OK; everything else fresh)
- Cache eviction strategy (expired temporary overrides; deprecated permissions; deactivated users)
- Cache size budgeting (memory + disk; what fits in PostgreSQL buffer pool)
- Read-replica strategy for hot reads
- Multi-tenant cache key design Phase 2 preparation
- Cache observability (hit rate metrics; staleness detection)
- Failure mode handling (cache table unavailable → fall back to base tables; alert ops)

Pass 9 will produce v0.9 of the design doc.

---

**End of v0.8.** Pass 8 (Permissions Editor UI) complete. Workspace architecture (single page with six sections; persistent header + sidebar + main pane; cross-section linking). Six sections fully specified: Actions (matrix with 4-tier hierarchy, cell interactions, bulk edit, system-locked rows, comparison view), Field Visibility (matrix with mask previews, audit-on-read indicators, never-granted handling), Data Scopes (resource × role matrix with impact preview), Overrides (active + pending requests + history with full request approval flow), Custom Roles (clone-from-existing wizard with archival), Audit Log (embedded query interface with event details, filters, export, compliance reports shortcut). Cross-section concerns: global search, transactional save with conflict detection, undo/redo, mobile responsive, WCAG 2.1 AA accessibility, performance budgets. Two architectural decisions locked: workspace pattern (not separate tabs); transactional save (not optimistic). Eight Pass 8 open questions resolved. Two new audit event types added (32 total in permission_audit_log catalog now). Migration order extended +6 steps (now 45 total).

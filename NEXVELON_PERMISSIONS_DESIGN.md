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
> **Status:** v0.7 — Passes 1-7 complete. Pending: Pass 8 (Permissions
> editor UI), Pass 9 (Effective-permissions caching strategy), Pass 10
> (Cross-cutting enforcement patterns), Pass 11 (Migration plan).
>
> Pass 1 (Action Vocabulary Catalog) condensed §1-§8; full at `9008fad`.
> Pass 2 (Database Schema) condensed §9; full at `1bafbd4`.
> Pass 3 (Resolution Algorithm) condensed §10; full at `ff08703`.
> Pass 4 (Field Visibility Engine) condensed §11; full at `de1905f`.
> Pass 5 (Status Surface Binding Layer) condensed §12; full at `904bfe5`.
> Pass 6 (Append-Only Audit Pattern) condensed §13; full at `3c21e58`.
> Pass 7 (Request-Admin-Access Workflow) full content begins at §14.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog | ✅ COMPLETE (full at `9008fad`; condensed §1-§8) |
| 2 | Database schema | ✅ COMPLETE (full at `1bafbd4`; condensed §9) |
| 3 | Permission resolution algorithm | ✅ COMPLETE (full at `ff08703`; condensed §10) |
| 4 | Field-level visibility engine | ✅ COMPLETE (full at `de1905f`; condensed §11) |
| 5 | Status surface binding layer | ✅ COMPLETE (full at `904bfe5`; condensed §12) |
| 6 | Append-only audit pattern | ✅ COMPLETE (full at `3c21e58`; condensed §13) |
| 7 | Request-admin-access workflow | ✅ COMPLETE (this version) |
| 8 | Permissions editor UI | PENDING |
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
`resource:verb[:qualifier]` — plural noun + camelCase verb + optional qualifier.

## 2-8. Taxonomies and treatment
Verb taxonomy (8 categories). Qualifier taxonomy (4 categories). 140+ resources. 4-tier UI hierarchy + 6 cross-cut tabs. Three UI states (hidden/disabled/interactive). Action dependencies, mutual exclusions, chains. Public actions, Admin exceptions, system-generated, append-only special cases.

---

═══════════════════════════════════════════════════════════════════
# Part II — Pass 2 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 2 content at commit `1bafbd4`.*

## 9. 14 tables across 5 groups + 1 materialized view

Core permissions (5): `permission_definitions`, `roles`, `role_permissions`, `user_permission_overrides`, `effective_permissions_cache`. Field visibility (3). Data scopes (3, orthogonal to grants). Audit (1, append-only). Cross-cutting constraints (3).

Three architectural decisions: one row per action; trigger-invalidated cache; orthogonal data scopes.

---

═══════════════════════════════════════════════════════════════════
# Part III — Pass 3 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 3 content at commit `ff08703`.*

## 10. Three runtime algorithms

**A1 — Action grant resolution** (7-phase): cache lookup → base table resolution → Phase 3 cross-cutting constraints (3.1 separation of duties, 3.2 regulatory expiry, 3.3 status binding) → audit logging → return. <5ms p99 compound.

**A2 — Data scope resolution:** SQL filter clause.

**A3 — Field visibility resolution:** visible/masked/hidden.

Failure modes: fail-closed for grants/expiry/SoD; fail-open for audit logging.

---

═══════════════════════════════════════════════════════════════════
# Part IV — Pass 4 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 4 content at commit `de1905f`.*

## 11. Field visibility engine

Backend serialization pipeline (8 stages). Frontend `<FieldGated>` + VisibilityContext. View layer for 5 highest-sensitivity resources. 12 standard mask types. Async batched audit-on-read. Complete 47-flag catalog.

---

═══════════════════════════════════════════════════════════════════
# Part V — Pass 5 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 5 content at commit `904bfe5`.*

## 12. Status surface binding layer

Polymorphic `status_behavior_bindings` table across 80 status surfaces. 14 standard binding names. `status_transition_definitions` with triggers_effects JSONB. Phase 3.3 integration in Pass 3 A1. State transition matrices (invoice_statuses; contractor_wo_statuses with Ontario 60-day lien clock). System-locked vs operator-configurable. ~2000 binding + ~600 transition rows seed.

---

═══════════════════════════════════════════════════════════════════
# Part VI — Pass 6 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 6 content at commit `3c21e58`.*

## 13. Append-only audit pattern

8 append-only ledgers sharing uniform pattern (permission_audit_log + 7 module ledgers from §0.4 #10). Monthly time-based partitioning. PostgreSQL UPDATE/DELETE triggers. 21 enumerated event types with JSON payload schemas. Reversal pattern (insert offsets). 3-layer audit query API (endpoints + M13 reports + audit_log_combined SQL view). Cold archival + hash-chain tamper-evidence deferred Phase 2. ~38M rows/year combined volume. Performance <2ms insert / <200ms entity history / <2s UNION view.

Three decisions: many tables one pattern; monthly partitioning; 3-layer query.

---

═══════════════════════════════════════════════════════════════════
# Part VII — Pass 7 (Request-Admin-Access Workflow) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 14. Overview

Users who need a permission they don't have can REQUEST it. Admins review and approve/reject. The system automatically enforces approval decisions, time limits, and audit. Pass 7 specifies this workflow end-to-end.

### 14.1 Why this matters

Role defaults cover ~95% of real-world needs. The remaining 5% are situational and ad-hoc:
- "I need to verify a vendor's banking details for a one-time wire transfer setup"
- "I'm covering Sarah's accounting work next week while she's on vacation"
- "I need to view a project's actual costs to explain a margin variance to a customer"
- "Admin approval is needed to back-date this invoice; I'm requesting authority to do that for this specific case"

Without a request workflow, all of these become ad-hoc Slack messages or emails to admins, who then make direct user_permission_override grants. The decision context (who asked, why, what they actually need, what the admin said) gets scattered across communication channels.

With a request workflow, every grant is initiated by user need, captured with full context, time-bounded by default, and audited in the same `permission_audit_log` as direct admin grants.

### 14.2 What's distinct from direct admin overrides

Two reasons to have a request workflow on top of `user_permission_overrides`:

**Initiation flips.** Direct overrides: admin pushes. Requests: user pulls. Most ad-hoc grants are user-initiated — users have context admins don't.

**Reasoning capture.** Direct overrides capture admin's reason. Requests capture *both* user's justification AND admin's decision rationale. Compliance needs the full conversation.

## 15. The state machine

### 15.1 States

```
                           ┌───────────┐
              ┌───────────►│  Approved  │──── grant fires ───┐
              │            └────────────┘                    │
              │                                              ▼
       ┌───────────┐                                  ┌───────────┐
       │  Pending  │                                  │  Granted  │
       └─────┬─────┘                                  └─────┬─────┘
             │                                              │
             ├───── rejected ──────┐                        │
             │                     ▼                        │
             │              ┌───────────┐                   │
             │              │ Rejected  │                   │
             │              └───────────┘                   │
             │                                              │
             ├───── cancelled by requester ──┐              │
             │                               ▼              │
             │                        ┌───────────┐         │
             │                        │ Cancelled │         │
             │                        └───────────┘         │
             │                                              │
             │                              ┌───────────────┤
             │                              │               │
             │                              ▼               ▼
             │                       ┌───────────┐   ┌───────────┐
             └──── expired ────────► │  Expired  │   │  Revoked  │
                                     └───────────┘   └───────────┘
```

| State | Meaning | Who transitions |
|---|---|---|
| **Pending** | Submitted by requester; awaiting admin decision | (initial state) |
| **Approved** | Admin has approved; grant will fire (immediately or at start_at) | Admin |
| **Granted** | `user_permission_override` row inserted and effective | System (automatic after Approved) |
| **Rejected** | Admin denied | Admin |
| **Cancelled** | Requester withdrew before admin decision | Requester |
| **Expired** | Pending too long without decision OR Granted-but-temporary expired | System (cron) |
| **Revoked** | Granted-but-still-active permission was revoked early by admin | Admin |

### 15.2 Why Approved and Granted are separate

Per Decision 1 (chat walk):
- **Future-dated grants** — admin approves James's banking access starting next Monday; state is Approved with `start_at` in the future; cron fires the grant at start_at; state becomes Granted.
- **Atomicity** — if `user_permission_override` insert fails (e.g., permission was deprecated between request and approval), state stays Approved (recoverable) rather than Granted-but-broken.

In the typical case (immediate grant), the transition Approved → Granted happens within the same database transaction. The user perceives "Approved" and "Granted" as one event. But the state machine separates them for the edge cases.

### 15.3 Schema for `request_admin_access`

The Pass 2 §9 schema is expanded:

```sql
CREATE TABLE request_admin_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  requester_user_id UUID NOT NULL REFERENCES users(id),
  
  -- Request type
  request_type TEXT NOT NULL CHECK (request_type IN (
    'permission_grant',          -- request for one specific action permission
    'field_visibility_grant',    -- request for one field visibility flag
    'data_scope_grant',          -- request to widen scope for a resource
    'role_temporary_assignment'  -- request to take on a different role temporarily
  )),
  
  -- Target (polymorphic per request_type)
  target_permission_id UUID REFERENCES permission_definitions(id),
  target_flag_id UUID REFERENCES field_visibility_definitions(id),
  target_resource TEXT,                                          -- for data_scope_grant
  target_scope_id UUID REFERENCES data_scope_definitions(id),    -- for data_scope_grant
  target_role_id UUID REFERENCES roles(id),                      -- for role_temporary_assignment
  
  -- Context
  related_entity_type TEXT,                                      -- e.g., 'client', 'vendor', 'invoice'
  related_entity_id UUID,                                        -- the specific entity the user needs to operate on
  
  -- Duration
  duration_type TEXT NOT NULL CHECK (duration_type IN (
    'one_time',          -- single use; expires after first use OR end_at
    'temporary',         -- effective between start_at and end_at
    'permanent'          -- never expires (requires explicit revocation)
  )),
  start_at TIMESTAMPTZ,                                          -- nullable; when grant takes effect
  end_at TIMESTAMPTZ,                                            -- nullable; when grant expires (temporary)
  
  -- State
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'granted', 'rejected', 'cancelled', 'expired', 'revoked'
  )),
  
  -- Lifecycle timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,                                        -- when user_permission_override actually inserted
  decided_at TIMESTAMPTZ,                                        -- approved_at OR rejected_at (whichever)
  expired_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  -- People
  decided_by_user_id UUID REFERENCES users(id),                  -- admin who approved/rejected
  revoked_by_user_id UUID REFERENCES users(id),                  -- admin who revoked early
  
  -- Reasoning (both sides)
  requester_justification TEXT NOT NULL,                         -- mandatory; user's "why"
  admin_decision_rationale TEXT,                                 -- admin's "why" for approve/reject
  revocation_reason TEXT,                                        -- admin's reason for early revocation
  
  -- The granted override (back-reference; populated on grant)
  granted_override_id UUID REFERENCES user_permission_overrides(id),
  
  -- Forensic metadata
  request_ip_address INET,
  request_user_agent TEXT,
  
  -- Routing (Phase 2 placeholder)
  routing_rule_id UUID,                                          -- nullable; v1 always NULL
  
  -- Pending expiry (auto-expire if not decided)
  pending_expires_at TIMESTAMPTZ,                                -- if pending > 7 days, auto-expire
  
  -- Activity tracking (for audit + usage analytics)
  use_count INTEGER NOT NULL DEFAULT 0,                          -- how many times the granted permission was actually used
  first_used_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_request_admin_access_requester ON request_admin_access(requester_user_id, requested_at DESC);
CREATE INDEX idx_request_admin_access_status_pending ON request_admin_access(status) WHERE status = 'pending';
CREATE INDEX idx_request_admin_access_status_granted ON request_admin_access(status, end_at) WHERE status = 'granted';
CREATE INDEX idx_request_admin_access_decided_by ON request_admin_access(decided_by_user_id, decided_at DESC);
CREATE INDEX idx_request_admin_access_target_permission ON request_admin_access(target_permission_id);
CREATE INDEX idx_request_admin_access_pending_expires ON request_admin_access(pending_expires_at) WHERE status = 'pending';
```

## 16. Request types

Four request types covering different needs.

### 16.1 `permission_grant` (most common)

Request to be granted a specific permission action.

Example: SR requests `invoices:viewProfit` for a specific client's project so they can explain a quote margin to the customer.

```json
{
  "request_type": "permission_grant",
  "target_permission_id": "<id of invoices:viewProfit>",
  "related_entity_type": "client",
  "related_entity_id": "<client_xyz>",
  "duration_type": "temporary",
  "start_at": null,                              // immediate on approval
  "end_at": "2026-05-19T23:59:59Z",              // 7 days
  "requester_justification": "Need to explain margin variance to customer XYZ during their account review meeting on Friday. Will reference specific project P-2024-042."
}
```

On approval + grant: inserts `user_permission_override` with `user_id = requester`, `permission_id = target_permission_id`, `override_state = 'granted'`, `is_temporary = TRUE`, `expires_at = end_at`.

### 16.2 `field_visibility_grant`

Request to see a specific field visibility flag (banking details, payroll, SIN, etc.).

Example: Acc requests `visibility.vendors.banking` for a one-time wire transfer setup.

```json
{
  "request_type": "field_visibility_grant",
  "target_flag_id": "<id of visibility.vendors.banking>",
  "related_entity_type": "vendor",
  "related_entity_id": "<vendor_abc>",
  "duration_type": "one_time",
  "end_at": "2026-05-13T23:59:59Z",              // 24 hours
  "requester_justification": "Setting up new wire transfer details for vendor ABC; need to verify banking info matches their void cheque submission."
}
```

On approval + grant: inserts `user_field_visibility_overrides`. Special: `field_visibility_grant` requests for `requires_audit_on_read=TRUE` flags trigger audit on the request itself (event_type `field_visibility_user_override_granted` in permission_audit_log).

### 16.3 `data_scope_grant`

Request to widen scope for a resource.

Example: PM requests their scope for `projects` to be expanded from `team` to `all` while filling in for a regional manager.

```json
{
  "request_type": "data_scope_grant",
  "target_resource": "projects",
  "target_scope_id": "<id of 'all' scope>",
  "duration_type": "temporary",
  "start_at": "2026-05-14T00:00:00Z",
  "end_at": "2026-05-28T23:59:59Z",              // 2 weeks
  "requester_justification": "Filling in for Regional Manager Mike while he's on parental leave. Need cross-team visibility on Eastern Ontario projects."
}
```

On approval + grant: inserts `user_data_scope_overrides`.

### 16.4 `role_temporary_assignment`

Request to take on a different role temporarily (e.g., adding Bookkeeper role to PM during covering period). Useful when one-off permission grants aren't enough.

Example: Senior PM requests temporary Bookkeeper role to cover an accounting team member's leave.

```json
{
  "request_type": "role_temporary_assignment",
  "target_role_id": "<id of bookkeeper role>",
  "duration_type": "temporary",
  "start_at": "2026-05-13T00:00:00Z",
  "end_at": "2026-05-27T23:59:59Z",
  "requester_justification": "Covering Sarah's bookkeeper work while she's on bereavement leave. Need to handle weekly bank reconciliations + GL entry review."
}
```

On approval + grant: creates a special `user_role_assignments` row (NOT a user_permission_override) that the resolution algorithm honors as an additive role. User effectively has TWO roles during the grant window; A1 resolution unions permissions from both.

> **Note:** `user_role_assignments` is a new table introduced by Pass 7. It's a small addition to Pass 2's schema:
> ```sql
> CREATE TABLE user_role_assignments (
>   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   user_id UUID NOT NULL REFERENCES users(id),
>   role_id UUID NOT NULL REFERENCES roles(id),
>   is_primary BOOLEAN NOT NULL DEFAULT FALSE,
>   granted_by_request_id UUID REFERENCES request_admin_access(id),
>   start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
>   end_at TIMESTAMPTZ,
>   revoked_at TIMESTAMPTZ,
>   revoked_by UUID REFERENCES users(id),
>   CONSTRAINT user_role_assignments_unique_primary UNIQUE (user_id, is_primary) DEFERRABLE INITIALLY DEFERRED
> );
> ```
> Primary role (the user's "default") has `is_primary=TRUE`. Additional roles from requests are `is_primary=FALSE`. A1 resolution unions all active role grants for the user.

## 17. Approval workflow end-to-end

Full lifecycle from user click to grant taking effect.

### 17.1 Step 1: Request submission

User clicks a "Request Access" button somewhere in the UI (e.g., on a disabled banking section that they don't have permission to see):

```typescript
// Pseudocode for build phase
async function submitRequest(req: SubmitRequestInput): Promise<RequestAccess> {
  // Validate inputs
  validateRequest(req);
  
  // Check for duplicate active request
  const existing = await db.query(
    `SELECT id, status FROM request_admin_access 
     WHERE requester_user_id = $1 
       AND target_permission_id = $2 
       AND status IN ('pending', 'approved', 'granted')`,
    [currentUser.id, req.target_permission_id]
  );
  if (existing.rowCount > 0) {
    throw new DuplicateRequestError(...);  // handler returns existing request id
  }
  
  // Set pending_expires_at to 7 days from now
  const pendingExpiresAt = addDays(new Date(), 7);
  
  // Insert request row
  const requestRow = await db.insert('request_admin_access', {
    requester_user_id: currentUser.id,
    request_type: req.request_type,
    target_permission_id: req.target_permission_id,
    target_flag_id: req.target_flag_id,
    target_resource: req.target_resource,
    target_scope_id: req.target_scope_id,
    target_role_id: req.target_role_id,
    related_entity_type: req.related_entity_type,
    related_entity_id: req.related_entity_id,
    duration_type: req.duration_type,
    start_at: req.start_at,
    end_at: req.end_at,
    status: 'pending',
    requester_justification: req.justification,
    request_ip_address: currentRequest.ip,
    request_user_agent: currentRequest.userAgent,
    pending_expires_at: pendingExpiresAt
  });
  
  // Audit log
  await auditLog({
    event_type: 'request_admin_access_submitted',
    actor_user_id: currentUser.id,
    target_user_id: currentUser.id,
    target_permission_id: req.target_permission_id,
    after_state: { request_id: requestRow.id, status: 'pending' },
    reason: req.justification
  });
  
  // Notify admins
  await notifyAdmins(requestRow);
  
  return requestRow;
}
```

### 17.2 Step 2: Admin notification

Three channels (per Decision 2 — all admins notified at v1):

**In-app notification:**
- Bell icon badge increments
- Notification panel shows: "James Smith requested temporary access to invoices:viewProfit for client XYZ until 2026-05-19. [Review →]"

**Email:**
- Subject: "Access request pending: invoices:viewProfit"
- Body: requester info, justification, target, duration, link to review

**Slack (if configured):**
- DM to admin or channel post (per operator Settings)
- Message: same content as email; quick-action buttons (Review / Approve / Reject)

Notification routing rules (Phase 2 placeholder):
- `routing_rule_id` column on `request_admin_access` is NULL at v1
- Phase 2 introduces `notification_routing_rules` table; assigns specific request types to specific admin subsets

### 17.3 Step 3: Admin review

Admin opens the request in the permissions editor (Pass 8 covers UI). Review context shows:
- Requester identity, role, team
- Recent activity (last 30 days summary)
- Justification (free text)
- Target permission with description from `permission_definitions`
- Related entity (if any) with context (e.g., for client_xyz: SLA tier, recent invoices, current status)
- Duration request
- Previous similar requests by this user (granted/rejected history)
- Suggested decision (heuristic-based; v1 simple; Phase 2 ML-based)

Admin actions:
1. **Approve** with optional duration adjustment + rationale
2. **Approve with modifications** — change duration or scope; admin's adjustment captured
3. **Reject** with rationale
4. **Request more info** — adds comment thread (Phase 2; v1 admin just rejects with reason "need more info")

### 17.4 Step 4: Approval handling

```typescript
async function approveRequest(requestId: string, approval: ApprovalInput) {
  const request = await db.fetchOne('request_admin_access', requestId);
  
  // Sanity checks
  if (request.status !== 'pending') {
    throw new InvalidStateError(`Request ${requestId} is not pending`);
  }
  if (!currentUser.isAdmin) {
    throw new ForbiddenError(...);
  }
  
  // Self-approval check (per edge case §18.3)
  if (request.requester_user_id === currentUser.id) {
    throw new SelfApprovalNotAllowedError(...);
  }
  
  await db.transaction(async (tx) => {
    // Update request status
    await tx.update('request_admin_access', requestId, {
      status: 'approved',
      approved_at: NOW(),
      decided_at: NOW(),
      decided_by_user_id: currentUser.id,
      admin_decision_rationale: approval.rationale,
      // Allow admin to adjust duration on approval
      start_at: approval.start_at ?? request.start_at,
      end_at: approval.end_at ?? request.end_at
    });
    
    // Audit
    await auditLog({
      event_type: 'request_admin_access_approved',
      actor_user_id: currentUser.id,
      target_user_id: request.requester_user_id,
      target_permission_id: request.target_permission_id,
      after_state: { request_id: requestId, status: 'approved' },
      reason: approval.rationale
    }, tx);
    
    // Determine: grant now or schedule for start_at?
    const effectiveStartAt = approval.start_at ?? request.start_at ?? NOW();
    const grantImmediately = effectiveStartAt <= NOW();
    
    if (grantImmediately) {
      await fireGrant(requestId, tx);  // see §17.5
    }
    // Else: cron will fire grant at start_at (see §17.7)
  });
  
  // Notify requester
  await notifyRequester(requestId, 'approved');
}
```

### 17.5 Step 5: Grant firing

```typescript
async function fireGrant(requestId: string, tx: Transaction) {
  const request = await tx.fetchOne('request_admin_access', requestId);
  
  let overrideId: string;
  
  if (request.request_type === 'permission_grant') {
    overrideId = await tx.insert('user_permission_overrides', {
      user_id: request.requester_user_id,
      permission_id: request.target_permission_id,
      override_state: 'granted',
      reason: `Per request ${requestId}: ${request.requester_justification}`,
      is_temporary: request.duration_type !== 'permanent',
      expires_at: request.end_at,
      granted_by: request.decided_by_user_id
    });
  } else if (request.request_type === 'field_visibility_grant') {
    overrideId = await tx.insert('user_field_visibility_overrides', {
      user_id: request.requester_user_id,
      flag_id: request.target_flag_id,
      override_visibility_state: 'visible',  // or 'masked' per request
      reason: `Per request ${requestId}: ${request.requester_justification}`,
      is_temporary: request.duration_type !== 'permanent',
      expires_at: request.end_at,
      granted_by: request.decided_by_user_id
    });
  } else if (request.request_type === 'data_scope_grant') {
    overrideId = await tx.insert('user_data_scope_overrides', {
      user_id: request.requester_user_id,
      resource: request.target_resource,
      override_scope_id: request.target_scope_id,
      reason: `Per request ${requestId}: ${request.requester_justification}`,
      is_temporary: request.duration_type !== 'permanent',
      expires_at: request.end_at,
      granted_by: request.decided_by_user_id
    });
  } else if (request.request_type === 'role_temporary_assignment') {
    overrideId = await tx.insert('user_role_assignments', {
      user_id: request.requester_user_id,
      role_id: request.target_role_id,
      is_primary: false,
      granted_by_request_id: requestId,
      start_at: request.start_at ?? NOW(),
      end_at: request.end_at
    });
  }
  
  // Update request to Granted
  await tx.update('request_admin_access', requestId, {
    status: 'granted',
    granted_at: NOW(),
    granted_override_id: overrideId
  });
  
  // Audit
  await auditLog({
    event_type: 'request_admin_access_granted',
    actor_user_id: request.decided_by_user_id,
    target_user_id: request.requester_user_id,
    target_permission_id: request.target_permission_id,
    after_state: { request_id: requestId, override_id: overrideId, status: 'granted' }
  }, tx);
  
  // Invalidate effective_permissions_cache for this user (Pass 3 §11.4 trigger handles this)
  // Audit-on-read trigger (Pass 4) handles sensitive field visibility grants
}
```

### 17.6 Step 6: Rejection

```typescript
async function rejectRequest(requestId: string, rejection: RejectionInput) {
  // Similar pattern: validate, update status to 'rejected', audit, notify
  await db.update('request_admin_access', requestId, {
    status: 'rejected',
    decided_at: NOW(),
    decided_by_user_id: currentUser.id,
    admin_decision_rationale: rejection.rationale
  });
  
  await auditLog({ event_type: 'request_admin_access_rejected', ... });
  await notifyRequester(requestId, 'rejected', rejection.rationale);
}
```

### 17.7 Step 7: Auto-grant firing for future-dated approvals

Daily cron job:

```typescript
async function fireScheduledGrants() {
  // Find approved-but-not-granted requests where start_at has passed
  const ready = await db.query(`
    SELECT id FROM request_admin_access 
    WHERE status = 'approved' 
      AND granted_at IS NULL 
      AND COALESCE(start_at, NOW()) <= NOW()
  `);
  
  for (const row of ready.rows) {
    try {
      await db.transaction(async (tx) => {
        await fireGrant(row.id, tx);
      });
    } catch (err) {
      // Log error; alert admin; do not fail the whole cron
      logger.error('Failed to fire scheduled grant', { requestId: row.id, error: err });
      await alertAdmins(`Failed to fire scheduled grant for request ${row.id}: ${err.message}`);
    }
  }
}
```

### 17.8 Step 8: Auto-expiry

The same daily cron from Pass 3 §11.4 (step 5) that handles expired user_permission_overrides ALSO handles request expiry:

```typescript
async function autoExpireRequestsAndGrants() {
  // Expire pending requests older than pending_expires_at
  await db.query(`
    UPDATE request_admin_access 
    SET status = 'expired', expired_at = NOW() 
    WHERE status = 'pending' 
      AND pending_expires_at < NOW()
    RETURNING id, requester_user_id
  `);
  // Notify requesters of expired requests
  
  // Expire granted requests where end_at < NOW()
  // (The corresponding user_permission_overrides etc. are expired by Pass 3 §11.4 trigger)
  await db.query(`
    UPDATE request_admin_access 
    SET status = 'expired', expired_at = NOW() 
    WHERE status = 'granted' 
      AND end_at < NOW()
  `);
}
```

### 17.9 Step 9: Early revocation by admin

Admin can revoke an active granted request before its `end_at`:

```typescript
async function revokeGrant(requestId: string, revocation: RevocationInput) {
  // Update request
  await db.update('request_admin_access', requestId, {
    status: 'revoked',
    revoked_at: NOW(),
    revoked_by_user_id: currentUser.id,
    revocation_reason: revocation.reason
  });
  
  // Revoke the underlying override
  const request = await db.fetchOne('request_admin_access', requestId);
  await db.update('user_permission_overrides', request.granted_override_id, {
    revoked_at: NOW(),
    revoked_by: currentUser.id,
    revocation_reason: revocation.reason
  });
  
  // Audit
  await auditLog({ event_type: 'request_admin_access_revoked', ... });
  
  // Cache invalidates via Pass 3 §11.4 trigger
}
```

## 18. Notification routing

### 18.1 v1: notify all admins

When a request is submitted:
1. Query `users WHERE role_id = admin_role_id AND is_active = TRUE`
2. For each admin, emit notification to all enabled channels (in-app + email + Slack if configured)

Operator can configure notification channel preferences in Settings:
- Default channels per admin (per Settings → User Profile)
- Default channels per request type (Phase 2 — for now uniform)

### 18.2 Outcome notifications to requester

On approve / reject / expire / revoke:
- In-app notification (always)
- Email if requester has email notifications enabled
- Slack if configured

### 18.3 v1: notification deduplication

If admin A approves a request, admins B and C still see the pending notification briefly until polling refresh. Solved by:
- Pending notification batched/polled every 30 seconds (in-app)
- On approval, server emits "notification removed" event via WebSocket if connected

### 18.4 Phase 2 routing rules placeholder

`request_admin_access.routing_rule_id` is NULL at v1. Phase 2 introduces:

```sql
-- Phase 2 placeholder; not implemented at v1
CREATE TABLE notification_routing_rules (
  id UUID PRIMARY KEY,
  rule_name TEXT,
  request_type TEXT,                            -- e.g., 'field_visibility_grant'
  target_filter JSONB,                          -- e.g., { "flag_category": "banking" }
  notify_role_codes TEXT[],                     -- e.g., ['accounting'] for banking requests
  notify_specific_user_ids UUID[],
  fallback_to_all_admins BOOLEAN DEFAULT TRUE,
  priority INTEGER
);
```

Then when emitting notifications, query routing rules first; fall back to "all admins" if no rule matches.

## 19. Auto-expiry handling

### 19.1 Three expiry paths

1. **Pending too long** — request submitted but no admin decision within `pending_expires_at` (7 days default; operator configurable in Settings)
2. **Granted-temporary expired** — `end_at` reached
3. **Granted-one-time used and expired** — `duration_type='one_time'` and `last_used_at` is set (with grace period)

### 19.2 Pending expiry

Daily cron job (per §17.8) checks `pending_expires_at`. Auto-transitions to Expired. Notifies requester. Optionally notifies admins ("3 pending requests expired without decision").

Operator can configure:
- `pending_expiry_days` in Settings (default 7)
- Auto-escalation (after 3 days, escalate to additional admins) — Phase 2

### 19.3 Granted-temporary expiry

When `end_at < NOW()`:
- The underlying `user_permission_overrides` row is marked expired by Pass 3 §11.4 trigger (cache invalidates)
- The corresponding `request_admin_access` row updates status to 'expired'
- Requester notified (in-app + email)

### 19.4 One-time grants

For `duration_type='one_time'`:
- On first use of the granted permission, set `request_admin_access.first_used_at`
- Increment `use_count`
- For `one_time`: also revoke the override after first use + 24-hour grace period (in case user needs to retry)

Use-tracking implementation: A1 resolution algorithm (Pass 3) emits an event after a granted action executes. The event listener updates `request_admin_access.last_used_at` + `use_count`.

For one-time grants:
```typescript
// After successful action execution for a user with a one-time request grant active
if (request.duration_type === 'one_time' && request.use_count === 0) {
  // Schedule revocation in 24 hours
  await scheduler.schedule({
    delay_hours: 24,
    task: 'revoke_one_time_grant',
    payload: { request_id: request.id }
  });
}
```

### 19.5 Permanent grants

`duration_type='permanent'` requests have `end_at = NULL` and never auto-expire. Admin can revoke manually anytime.

## 20. Edge cases

### 20.1 Multiple pending requests for same user+permission

User submits a request for `clients:viewBanking` for client X. Then submits another for `clients:viewBanking` for client Y. Both legitimate; different contexts.

**Decision:** allow multiple pending requests as long as `related_entity_id` differs. The duplicate check in §17.1 includes `related_entity_id` in the WHERE clause.

If user tries to submit a SECOND pending request with the SAME `target_permission_id` AND `related_entity_id` while one is still pending — the duplicate check rejects with "you already have a pending request; cancel it to submit a new one, or wait for admin decision."

### 20.2 User re-requesting after rejection

If admin rejects a request, user can immediately submit a new one (different justification) for the same permission. The system allows this. Reasons:
- Maybe the user clarifies their justification
- Maybe the context changed (new event in the org)

Audit captures both requests independently. Admin sees the rejection history when reviewing the new request (UI shows "Previous similar requests by this user").

Phase 2 consideration: rate-limiting (e.g., 3 rejected requests for same permission within 7 days triggers admin alert).

### 20.3 Admin self-requesting

Admin tries to submit a request for themselves.

**Decision (v1):** Block in the request submission UI. Admins should grant themselves directly via the user_permission_overrides editor in Pass 8. Self-request through the workflow creates audit trail issues (who approves it?).

Schema-level prevention:
```sql
ALTER TABLE request_admin_access
ADD CONSTRAINT no_admin_self_request 
CHECK (requester_user_id != decided_by_user_id);
```

If admin needs a permission they don't have, they bypass the request workflow and use direct override editing (audit captures their action). Approval workflow is for non-admins.

Edge case: admin role is one of MULTIPLE roles a user has (e.g., user has Tech + Admin via `role_temporary_assignment`). Can they self-request? Decision: NO — if they have Admin via any active assignment, they can self-grant directly.

### 20.4 Request for permission already granted

User has `invoices:viewProfit` granted via role default but tries to "request" it anyway (perhaps because UI showed it as disabled due to a different reason — like a status binding).

**Decision:** Validation rejects with message "You already have this permission. If you're seeing it as unavailable, it may be due to entity status (e.g., the invoice is in a state that doesn't allow editing) rather than your permission level."

Validation logic in `submitRequest`:
```typescript
// Check if user already has this permission
const grant = await resolveActionGrant(currentUser.id, targetPermission.action_name);
if (grant.is_granted) {
  throw new AlreadyGrantedError({
    message: 'You already have this permission...',
    reason_if_denied_when_attempted: grant.reason_if_denied  // helps user understand why UI shows disabled
  });
}
```

### 20.5 Expired-but-recently-used grants

Grant expires at `end_at`. But the user was actively using the permission right up until expiry. Should they be cut off mid-action?

**Decision:** Yes. Active actions complete (server handles them mid-request), but new actions fail. UI shows "Your access has expired" toast.

If the user needs continued access, they submit a new request. Audit captures the expiry; if they re-request, admin can see the prior grant + usage pattern.

### 20.6 Request for `requires_audit_on_read=TRUE` field visibility

When the request is for a flag with `requires_audit_on_read=TRUE` (banking, payroll, SIN — the 9 sensitive flags from Pass 4 §17), the grant itself triggers additional audit:

- Standard `request_admin_access_granted` audit row
- PLUS event_type `field_visibility_user_override_granted` with the flag identity (per Pass 6 §15.1)
- PLUS pre-emptive alert: "Sensitive field visibility granted to user X — first read will trigger audit-on-read"

When the user actually USES the granted permission (reads the field), Pass 4's audit-on-read async batched system captures every read. Compliance officers see the granted permission + every read as separate audit events.

### 20.7 Revocation during pending state

What if admin "revokes" a request before approving it? Decision: that's a rejection. UI doesn't show a "Revoke" button when request is in Pending state.

### 20.8 Requester deactivated mid-request

User submits request. User account deactivated by HR. Request still pending.

**Decision:** Auto-cancel pending requests when requester's `is_active` flips to FALSE. Audit row captures the auto-cancel.

For granted requests when user deactivated: the underlying `user_permission_overrides` row is also revoked (cascade via Pass 3 §11.4 trigger on `users.is_active` change).

## 21. Integration with Pass 4 audit-on-read

For requests targeting `requires_audit_on_read=TRUE` flags (the 9 sensitive flags from Pass 4 §17):

### 21.1 Special audit handling

Three audit events fire (vs one for standard requests):
1. `request_admin_access_submitted` — when request created (standard)
2. `field_visibility_user_override_granted` — when grant fires
3. `field_read_with_audit` — each time the user reads the granted field (Pass 4's async batched)

### 21.2 Compliance report integration

M13's "Sensitive Field Reads" compliance report (per Pass 6 §16.5) joins:
- `permission_audit_log` for grant events (`field_visibility_user_override_granted`)
- `permission_audit_log` for read events (`field_read_with_audit`)
- `request_admin_access` for request context

Output shows full chain: who requested, who approved, when granted, when each read occurred, what entity each read related to.

### 21.3 Admin alerting

Operator can configure in Settings: "Alert admin on any granted-and-read sensitive field access" — Slack/email push when a `field_read_with_audit` fires for a permission granted via the request workflow.

Helps catch usage that doesn't match the original justification (e.g., grant was for "vendor wire setup" but reads cluster on customer banking sections).

## 22. New audit event types for Pass 7

Adding to Pass 6 §15.1 event type catalog:

| Event type | Triggered by | Required JSONB fields | Optional |
|---|---|---|---|
| `request_admin_access_submitted` | User submits a new request | `request_id`, `request_type`, `target_*` fields, `requester_justification`, `duration_type`, `start_at`, `end_at` | `related_entity_*` |
| `request_admin_access_approved` | Admin approves a request | `request_id`, `admin_decision_rationale`, `effective_start_at`, `effective_end_at` | duration adjustments by admin |
| `request_admin_access_rejected` | Admin rejects a request | `request_id`, `admin_decision_rationale` | |
| `request_admin_access_granted` | Grant fires (immediate or scheduled) | `request_id`, `override_id`, `override_table` | |
| `request_admin_access_cancelled` | Requester cancels pending request | `request_id`, `cancellation_reason` | |
| `request_admin_access_expired` | Auto-expiry (pending too long OR granted past end_at) | `request_id`, `expiry_type` ('pending_timeout' / 'duration_end' / 'one_time_used') | |
| `request_admin_access_revoked` | Admin revokes active grant early | `request_id`, `override_id`, `revocation_reason` | |
| `request_admin_access_auto_cancelled` | User deactivated; pending request auto-cancelled | `request_id`, `cancellation_trigger` ('user_deactivated') | |
| `request_one_time_used` | One-time grant used; revocation scheduled | `request_id`, `used_at`, `revocation_scheduled_for` | |

Total event types in `permission_audit_log` is now 21 (Pass 6) + 9 (Pass 7) = **30 event types**.

## 23. Performance characteristics

Request workflow is admin-tool-class (not hot-path runtime). Performance targets:

| Operation | Target |
|---|---|
| Submit request | <100ms (validation + insert + notify trigger) |
| Approve request (immediate grant) | <200ms (validation + transaction with multiple inserts + cache invalidation + audit) |
| Approve request (future-dated) | <100ms |
| Reject request | <100ms |
| Cancel by requester | <50ms |
| List pending requests (admin dashboard) | <300ms p99 |
| List user's requests history | <300ms p99 |
| Daily auto-expiry cron | <30s for full sweep (batch operations) |
| Daily auto-grant cron | <30s for full sweep |

Caching strategy: requests don't get their own cache (volume is low — hundreds per day at scale, not thousands). Queries hit `request_admin_access` directly. Indexes from §15.3 cover the common patterns.

## 24. Notification infrastructure dependencies

Pass 7 depends on notification infrastructure built in build phase:
- In-app notification service (WebSocket + polling fallback)
- Email service (transactional emails via SendGrid/Postmark/SES; build phase chooses)
- Slack integration (per-tenant Slack workspace OAuth; configurable per admin in Settings)

These are NOT specified in Pass 7 — they're build-phase infrastructure decisions. Pass 7 specifies WHAT messages get sent; build phase specifies HOW they're delivered.

## 25. Open questions (Pass 7)

1. **Should rejection rate-limiting trigger admin alerts?** (e.g., user rejected 5 times for same permission in 7 days = potential issue). Decision: NO at v1; Phase 2 consideration. Admins see rejection history when reviewing each request.

2. **Should there be a "request approval" hierarchy?** (e.g., requests for sensitive permissions need TWO admin approvals). Decision: NO at v1; current co-sign pattern (Pass 3 §15.2) handles high-stakes actions. Multi-step approval Phase 2.

3. **Comment threads on requests?** (admin asks "why specifically this client?" before approving). Decision: NO at v1 — admin can reject with "need more info" reason; user resubmits with clarification. Phase 2 adds threaded comments.

4. **Mobile push notifications for pending requests?** Decision: deferred to build phase mobile spec. v1 web app uses in-app + email + Slack.

5. **Templated request justifications?** (e.g., common templates like "Covering for vacationing colleague"). Decision: NO at v1; free text justification enforces thoughtfulness. Phase 2 could add suggested templates.

6. **Request analytics dashboard?** (e.g., "common request patterns this month"). Decision: deferred to M13 reports (similar to compliance reports from Pass 6). v1 has basic admin dashboard showing pending count + recent activity.

7. **Auto-approval rules?** (e.g., "auto-approve requests for view-only permissions during business hours"). Decision: NO at v1. Auto-approval defeats the audit-trail purpose. Phase 2 may add bounded auto-approval rules with conservative defaults.

## 26. Migration order extension

Adding to Pass 6's 32-step migration order:

- Step 33: Add Pass 7-specific columns to `request_admin_access` (per §15.3 schema; the table itself was specified in Pass 2 §9 as a stub)
- Step 34: Create `user_role_assignments` table
- Step 35: Migrate existing `users.role_id` to `user_role_assignments` (mark `is_primary=TRUE`)
- Step 36: Add Pass 7 event types to permission_audit_log validation
- Step 37: Install pending-expiry cron job (daily)
- Step 38: Install scheduled-grant cron job (every 5 minutes for finer granularity)
- Step 39: Install one-time-grant revocation scheduler integration

Now 39 total steps. Pass 11 covers production rollout.

---

═══════════════════════════════════════════════════════════════════
# 27. What's next (Pass 8 preview)
═══════════════════════════════════════════════════════════════════

**Pass 8: Permissions editor UI.**

Six-tab editor specified across Passes 1-7 — now fully detailed. Pass 8 covers:

- Tab 1 (Actions) — the 4-tier action hierarchy from Pass 1 §5; per-row grant/deny/default + ui_state_override toggles; bulk operations
- Tab 2 (Field Visibility) — the 47-flag catalog from Pass 4 §17 with role-default + per-user override columns
- Tab 3 (Data Scopes) — per-role per-resource scope matrix
- Tab 4 (Overrides) — list view of all active user overrides with expiry tracking
- Tab 5 (Custom Roles) — role creation wizard with clone-from-existing pattern
- Tab 6 (Audit Log) — embedded view of `permission_audit_log` with filters
- Plus the request management UI for Pass 7 workflow (sub-tab under Overrides)
- Layout, search/filter, save-and-validate flow, conflict detection (e.g., warn admin about cascading effects)
- Mobile responsive considerations (admin can approve requests from phone)
- Accessibility (keyboard navigation; screen reader support)

Pass 8 will produce v0.8 of the design doc.

---

**End of v0.7.** Pass 7 (Request-Admin-Access Workflow) complete. State machine (Pending → Approved → Granted → Expired/Revoked + Rejected/Cancelled paths) specified. Four request types: permission_grant, field_visibility_grant, data_scope_grant, role_temporary_assignment. New `user_role_assignments` table for the fourth type (supports multi-role users). Full schema for `request_admin_access` table with 30+ columns covering identity, target (polymorphic), context, duration, lifecycle, reasoning (both sides), forensic metadata, activity tracking. Approval workflow end-to-end (submit → notify → review → approve/reject → grant fires → notify requester). Notification routing v1 (all admins) with Phase 2 placeholder. Auto-expiry handling for three paths (pending timeout / duration end / one-time used). Eight edge cases handled. Integration with Pass 4 audit-on-read for sensitive permissions. Nine new event types added to permission_audit_log catalog (30 total now). Performance budget specified. Seven Pass 7 open questions resolved. Two architectural decisions locked. Migration order extended +7 steps (now 39 total).

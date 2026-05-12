# NEXVELON_SESSION_V_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-V codification.
> Session V completed Pass 7 of the Permissions Design (Request-Admin-Access Workflow).
> Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session V state + Pass 7 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.7 — Passes 1-7 of 11 complete
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_U_HANDOFF.md` — prior session (Pass 6)
>   8. Earlier handoffs (T through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session V focus

Completed Pass 7 (Request-Admin-Access Workflow). Specified end-to-end the workflow committed in M2 audit. State machine with 7 states. Four request types covering permission/visibility/scope/role grants. New user_role_assignments table for multi-role support. Full approval workflow from submit through grant. Notification routing. Auto-expiry. Edge cases. Integration with Pass 4 audit-on-read. Resolved 7 open questions.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.6 with v0.7 — Pass 6 condensed to §13 summary (full at 3c21e58); Pass 7 full content §14-§26 |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session V state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated: Pass 7 of 11 complete |
| `NEXVELON_SESSION_V_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 7 SUMMARY (Request-Admin-Access Workflow)
═══════════════════════════════════════════════════════════════════════════════

### State machine

```
Pending → Approved → Granted → (Expired | Revoked)
       → Rejected
       → Cancelled (by requester)
       → Expired (no decision in 7 days)
```

Approved and Granted are separate states. Reasons:
- Supports future-dated grants (start_at in future)
- Atomicity on grant failure (override insert can fail; request stays Approved)

Typical case: Approved → Granted within same transaction.

### Four request types

| Type | Inserts into | Purpose |
|---|---|---|
| `permission_grant` | user_permission_overrides | Most common; specific action permission |
| `field_visibility_grant` | user_field_visibility_overrides | Sensitive field access (banking, SIN, payroll) |
| `data_scope_grant` | user_data_scope_overrides | Widen scope on a resource (team → all) |
| `role_temporary_assignment` | user_role_assignments (NEW table) | Take on second role temporarily |

### New table: user_role_assignments

Supports multi-role users. Primary role has is_primary=TRUE; additional roles from requests have is_primary=FALSE. A1 resolution unions all active role grants. UNIQUE constraint DEFERRABLE INITIALLY DEFERRED handles primary re-assignment.

### request_admin_access schema (expanded)

30+ columns covering: identity (requester_user_id), polymorphic target (target_permission_id OR target_flag_id OR target_resource+target_scope_id OR target_role_id), related entity context (related_entity_type + related_entity_id for context), duration (duration_type one_time/temporary/permanent + start_at + end_at), state (7 enum values), lifecycle timestamps, people (requester/decider/revoker), dual reasoning capture (requester_justification + admin_decision_rationale + revocation_reason), back-reference to granted override, forensic metadata (IP, user agent), routing_rule_id (Phase 2 placeholder), pending_expires_at, activity tracking (use_count + first_used_at + last_used_at).

### Approval workflow end-to-end

```
1. User clicks "Request Access" (e.g., on disabled banking section)
2. submitRequest() — validation + duplicate check + insert + notify admins
3. Admin notification (in-app + email + Slack)
4. Admin opens request in permissions editor (Pass 8 covers UI)
   Context shown: requester info + recent activity + justification + target + related entity + duration + previous similar requests
5. Admin approves (optional duration adjustment) with rationale, OR rejects
6. If approved with start_at <= NOW: fireGrant() in same transaction
   If approved with future start_at: cron fires grant at start_at
7. Grant fires: insert appropriate override; update request to Granted; cache invalidates via Pass 3 §11.4 trigger; audit logged
8. Requester notified of decision + outcome
```

### Notification routing v1

All admins notified via:
- In-app (always; bell badge + notification panel)
- Email (per admin preference)
- Slack DM/channel (if configured per operator Settings)

Outcome notifications to requester on approve/reject/expire/revoke.

routing_rule_id column NULL at v1; Phase 2 introduces notification_routing_rules table.

### Auto-expiry handling 3 paths

1. **Pending timeout**: pending_expires_at default 7 days; operator-configurable in Settings; daily cron sets status=expired
2. **Duration end**: end_at < NOW(); Pass 3 cron handles override revocation; Pass 7 cron updates request status
3. **One-time used**: one_time grant schedules revocation 24h after first use as grace period

### Eight edge cases handled

1. Multiple pending for same user+permission allowed if related_entity_id differs
2. Re-request after rejection allowed; admin sees rejection history
3. Admin self-request blocked (CHECK constraint + UI)
4. Request for already-granted permission validation rejects with helpful explanation
5. Expired-but-recently-used: active completes, new fails, UI toast
6. Sensitive flag requests: triple audit (grant + audit + every read)
7. Revocation during pending = rejection (no Revoke button)
8. User deactivated mid-request: pending auto-cancelled; granted overrides revoked via Pass 3 trigger cascade

### Integration with Pass 4 audit-on-read

For requires_audit_on_read=TRUE flags (the 9 sensitive flags from Pass 4 §17):
- 3 audit events fire (vs 1 standard): request submitted + grant fired + every read tracked
- M13 "Sensitive Field Reads" report joins permission_audit_log + request_admin_access for full chain
- Operator-configurable Slack alert when granted sensitive permission is read (catches usage patterns not matching justification)

### Nine new event types added to permission_audit_log

request_admin_access_submitted/approved/rejected/granted/cancelled/expired/revoked/auto_cancelled, request_one_time_used. Total event types now 30 (Pass 6's 21 + Pass 7's 9).

### Performance budget

- Submit request: <100ms
- Approve immediate: <200ms (transaction with multiple inserts)
- Approve future-dated: <100ms
- Reject: <100ms
- Cancel: <50ms
- Admin dashboard list: <300ms p99
- Daily auto-expiry cron: <30s
- Scheduled-grant cron: <30s (every 5 minutes for finer granularity)

No request-specific cache; volume hundreds/day at scale.

### Two architectural decisions locked

1. **Separate Approved and Granted states** — supports future-dated grants + atomicity on grant failure
2. **Notification fanout v1 = all admins** — single-tenant has 1-3 admins; routing rules ready in schema for Phase 2

### Seven Pass 7 open questions resolved

1. Rejection rate-limiting alerts: NO at v1
2. Multi-step approval hierarchy: NO at v1; co-sign pattern handles
3. Comment threads: NO at v1; use "need more info" rejection
4. Mobile push: deferred to build phase
5. Templated justifications: NO at v1
6. Request analytics dashboard: deferred to M13 reports
7. Auto-approval rules: NO at v1

### Phase 2 deferrals

- Notification routing rules
- Auto-escalation after 3-day pending
- Multi-admin approval for highest-stakes
- Threaded comments
- Templated justifications
- Auto-approval rules with conservative defaults

### Migration order extended (+7 steps; now 39 total)

Steps 33-39: expand request_admin_access columns, create user_role_assignments, migrate users.role_id to assignments, add Pass 7 event types to validation, install pending-expiry cron, install scheduled-grant cron, integrate one-time-grant revocation scheduler.

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.

**Permissions design:** 7 of 11 passes complete.
- Pass 1: Action Vocabulary Catalog
- Pass 2: Database Schema (14 tables + 1 materialized view)
- Pass 3: Resolution Algorithm (3 algorithms; 7-phase A1)
- Pass 4: Field-Level Visibility Engine
- Pass 5: Status Surface Binding Layer (Phase 3.3 integration)
- Pass 6: Append-Only Audit Pattern (8 ledgers + 3-layer query)
- Pass 7: Request-Admin-Access Workflow (state machine + 4 request types + user_role_assignments + 30 total audit event types)

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 8 (Permissions Editor UI)
═══════════════════════════════════════════════════════════════════════════════

Pass 8 takes the six-tab editor specified across Passes 1-7 and fully details the UI.

**Covers:**
- Tab 1 (Actions): 4-tier hierarchy from Pass 1 §5; per-row grant/deny/default + ui_state_override; bulk operations
- Tab 2 (Field Visibility): 47-flag catalog from Pass 4 §17 with role-default + user-override columns
- Tab 3 (Data Scopes): per-role per-resource scope matrix
- Tab 4 (Overrides): all active user overrides with expiry tracking; sub-tab for request management (Pass 7 workflow)
- Tab 5 (Custom Roles): role creation wizard with clone-from-existing
- Tab 6 (Audit Log): embedded view of permission_audit_log with filters
- Plus: search/filter, save-and-validate flow, conflict detection (warn admin about cascading effects)
- Mobile responsive (admin can approve requests from phone)
- Accessibility (keyboard nav, screen reader)

Pass 8 will produce v0.8 of the design doc.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 7 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.7, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 8 (Permissions Editor UI).

**End of Session V handoff.**

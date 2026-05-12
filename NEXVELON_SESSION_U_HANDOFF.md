# NEXVELON_SESSION_U_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-U codification.
> Session U completed Pass 6 of the Permissions Design (Append-Only Audit Pattern).
> Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session U state + Pass 6 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.6 — Passes 1-6 of 11 complete
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_T_HANDOFF.md` — prior session (Pass 5)
>   8. Earlier handoffs (S through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session U focus

Completed Pass 6 of the Permissions Design (Append-Only Audit Pattern). Specified the uniform pattern that all 8 append-only ledgers apply (permission_audit_log + 7 module ledgers from §0.4 #10). Locked time-based monthly partitioning. Enumerated 21 event types for permission_audit_log with JSON payload schemas. Catalogued reversal pattern. Specified 3-layer audit query surface (API endpoints + reports module + SQL view). Locked v1 deferrals for cold archival and hash-chain tamper-evidence. Resolved 7 open questions.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.5 with v0.6 — Pass 5 condensed to §12 summary (full at 904bfe5); Pass 6 full content §13-§23 |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session U state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated: Pass 6 of 11 complete |
| `NEXVELON_SESSION_U_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 6 SUMMARY (Append-Only Audit Pattern)
═══════════════════════════════════════════════════════════════════════════════

### The 8 append-only ledgers

| Ledger | Module | Volume/year |
|---|---|---|
| `permission_audit_log` | cross-cutting | ~10M |
| `inventory_movements` | M7 | ~2M |
| `commissioning_records` | M6 | ~500k |
| `project_acceptance_records` | M6 | ~50k |
| `vendor_performance_scores` | M8 | ~10k |
| `contractor_performance_scores` | M10 | ~10k |
| `gl_journal_lines` | M11 | ~20M |
| `appointment_change_log` | M12 | ~5M |
| `report_snapshots` | M13 | ~100k |

Total ~38M rows/year combined.

### Uniform pattern (applied to all 8)

Every append-only ledger has:
- WHO: actor_user_id + actor_type (user/system/public_signed_url/integration/cron)
- WHEN: occurred_at TIMESTAMPTZ
- WHAT: event_type + before_state JSONB + after_state JSONB
- WHERE: entity context (ledger-specific columns)
- WHY: reason + notes
- FORENSIC METADATA: ip_address, user_agent, request_id, source_event_id
- PARTITION KEY: occurred_month (computed)
- PostgreSQL UPDATE/DELETE triggers blocking modifications

### Monthly partitioning

PostgreSQL native PARTITION BY RANGE (occurred_month). Monthly cron creates next month's partition 7 days before needed. Partition pruning handles date-filtered queries. Indexes per partition stay small (~1M rows per permission_audit_log partition at peak).

### 21 event types for permission_audit_log

role_permission_granted/revoked/ui_state_changed, user_override_granted/revoked/expired, field_visibility_role_changed, field_visibility_user_override_granted/revoked, data_scope_role_changed, data_scope_user_override_granted/revoked, role_created/archived, admin_exception_invoked, regulatory_block_overridden, permission_definition_deprecated, field_read_with_audit, status_binding_changed, status_transition_executed, co_sign_executed.

Each has defined JSON payload schema documented in §15.

### Event correlation

- **request_id**: HTTP middleware sets `app.request_id` Postgres setting; audit rows include it; reconstructs events from one HTTP request
- **source_event_id**: chained effects (status transition → GL entry + email + scheduled followup) all carry source_event_id pointing to root; reconstructs effect chains

### Reversal pattern

Never UPDATE or DELETE. To "void" or "correct", INSERT new row with event_type='reversal_posted' (or appropriate) and source_event_id linking back.

GL reversal example: 3 rows for original (wrong) + reversal (cancellation) + correction. Net effect mathematically correct; full audit trail intact.

### Audit query API (3 layers)

**Layer 1 — First-class API endpoints:**
- `GET /api/admin/audit/entity-history` — "What happened to invoice X?"
- `GET /api/admin/audit/user-actions` — "What did user Y do yesterday?"
- `GET /api/admin/audit/event-stream` — "Show all admin exceptions Q4"

Permissions: audit:view:entity (A + PM own scope), audit:view:user (A only), audit:view:stream (A + compliance role).

**Layer 2 — M13 reports integration:**
6 standard compliance reports in M13 Compliance category:
- Audit Trail by User
- Admin Exceptions Last 90 Days
- Sensitive Field Reads
- Regulatory Override History
- Co-Sign Activity
- Permission Grant Changes Last Quarter

Default role access: A and Acc.

**Layer 3 — Power-user SQL view:**
`audit_log_combined` UNION ALL view across all 8 ledgers. Read-only. Available for export via M13.

### Compliance export

`POST /api/admin/audit/export` — date range + event type filters → PDF (with §0.4 #9 eight-layer print protection) / CSV / JSON. Returns signed URL. Permission: audit:export — A and compliance role only.

### Per-ledger schemas (sample columns)

- **inventory_movements**: item_id, from_location_id, to_location_id, quantity_change, unit_cost_fifo, fifo_layer_id, serial_numbers[]
- **gl_journal_lines**: journal_entry_id, account_id, debit, credit (with constraint: one positive, other 0), currency_id, exchange_rate, foreign_currency_amount, cost_center_id
- **commissioning_records**: project_id, equipment_id, test_name, test_result (pass/fail/pending_recheck), attached_ulc_cert_url, technician_user_id
- **appointment_change_log**: appointment_id, change_type, before/after_resource_assignments, geolocation_data (subject to §0.4 #13)
- **report_snapshots**: report_id, parameters, output_pdf/csv/excel_url, retention_until

Full per-ledger schema specifications in v0.6 §18.

### Performance

| Operation | Target |
|---|---|
| Single insert | <2ms p99 |
| Batched insert (50 rows) | <5ms p99 |
| Entity history (last 90 days) | <200ms p99 |
| User actions (last 7 days) | <100ms p99 |
| Event stream (Q4 admin exceptions) | <500ms p99 |
| Compliance export (1 month, all events) | <5s |
| Cross-ledger UNION view query | <2s |

### Phase 2 deferrals locked

- **Cold archival**: DETACH partitions >12 months → Parquet → S3 Glacier Deep Archive → async restore SLA 24-48h
- **Hash-chain tamper-evidence**: row_hash column = SHA256(prev_row_hash || row_content); SOC 2 audit support
- **Per-event-type retention**: configurable retention per event type (v1 uniform "keep forever")
- **GDPR-configurable IP retention**: v1 is 12 months for IP; Phase 2 configurable

### Three architectural decisions locked

1. **Many tables, one pattern** — 8 ledgers each apply the same append-only pattern. Not consolidated to single polymorphic table because ledger-specific columns matter for type safety + indexability.
2. **Monthly time-based partitioning at v1** — PostgreSQL native; cold archival deferred Phase 2.
3. **3-layer audit query surface** — API endpoints (common patterns) + M13 reports (compliance) + audit_log_combined SQL view (power users escape hatch).

### Seven Pass 6 open questions resolved

1. Every state transition emits audit event: YES uniformly
2. Non-sensitive field reads audited: NO at v1 (only 9 sensitive flags)
3. Failed action attempts audited: YES for sensitive + admin-exception denials only
4. IP addresses in audit: YES at v1 with 12-month retention
5. Cross-row hash chain at v1: NO; Phase 2
6. Per-event-type retention: NO at v1
7. System actor events location: same table; actor_user_id=NULL + actor_type='system'

### Migration order extended (+9 steps; now 32 total)

Steps 24-32: convert ledgers to partitioned tables, create initial partitions, install partition-creation cron, apply triggers, create UNION view, install indexes, register audit API endpoints, seed M13 compliance reports.

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.

**Permissions design:** 6 of 11 passes complete.
- Pass 1: Action Vocabulary Catalog
- Pass 2: Database Schema (14 tables + 1 materialized view)
- Pass 3: Resolution Algorithm (3 algorithms; 7-phase A1)
- Pass 4: Field-Level Visibility Engine
- Pass 5: Status Surface Binding Layer (Phase 3.3 integration)
- Pass 6: Append-Only Audit Pattern (8 ledgers + uniform pattern + 3-layer query)

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 7 (Request-Admin-Access Workflow)
═══════════════════════════════════════════════════════════════════════════════

Pass 7 specifies end-to-end the workflow committed in M2 audit: users who need a permission they don't have can REQUEST it; admins approve/reject; full audit trail.

**Covers:**
- request_admin_access table (specified Pass 2 §9; expanded with full state machine)
- Request lifecycle states: Pending → Approved → Granted → Expired → Revoked; plus Rejected paths
- Request types: one-time vs ongoing; temporary vs permanent; specific action vs broader role grant
- Approval workflow: admin notification → review with context → approve with optional duration → auto-grants user_permission_override
- Notification routing: Slack/email/in-app to admins on request creation; outcome notification to requester
- Auto-expiry: temporary grants expire via Pass 3 daily cron
- Edge cases: multiple pending requests for same user-permission; user re-requesting after rejection; admin self-requesting; expired-but-recently-used grants
- Integration with Pass 4 audit-on-read for sensitive permissions (e.g., requesting banking access)
- UI surfaces (Pass 8 elaborates UI; Pass 7 specifies data flow)

Pass 7 will produce v0.7 of the design doc.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 6 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.6, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 7 (Request-Admin-Access Workflow).

**End of Session U handoff.**

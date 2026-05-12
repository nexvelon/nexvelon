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
> **Status:** v0.4 — Passes 1-4 complete. Pending: Pass 5 (Status
> surface bindings), Pass 6 (Append-only audit), Pass 7 (Request-
> admin-access workflow), Pass 8 (Permissions editor UI), Pass 9
> (Effective-permissions caching strategy), Pass 10 (Cross-cutting
> enforcement patterns), Pass 11 (Migration plan).
>
> Pass 1 (Action Vocabulary Catalog) condensed §1-§8; full at `9008fad`.
> Pass 2 (Database Schema) condensed §9; full at `1bafbd4`.
> Pass 3 (Resolution Algorithm) condensed §10-§10.5; full at `ff08703`.
> Pass 4 (Field Visibility Engine) full content begins at §11.

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
| 4 | Field-level visibility engine | ✅ COMPLETE (this version) |
| 5 | Status surface binding layer | PENDING |
| 6 | Append-only audit pattern | PENDING |
| 7 | Request-admin-access workflow | PENDING |
| 8 | Permissions editor UI | PENDING |
| 9 | Effective-permissions caching strategy | PENDING |
| 10 | Cross-cutting enforcement patterns | PENDING |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13). Operators can create unlimited custom roles via the M2 framework.

---

═══════════════════════════════════════════════════════════════════
# Part I — Pass 1 (Action Vocabulary Catalog) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 1 content at commit `9008fad`.*

## 1. Format
`resource:verb[:qualifier]` — plural noun + camelCase verb + optional qualifier.

## 2-3. Verb + Qualifier taxonomies
Verb (8 categories): view / create / edit / state-transition / configuration / communication / admin / workflow. Qualifier (4 categories): scope / state / modal / field-section.

## 4. Resource taxonomy
140+ resources across 13 modules, mapped 1:1 to database tables.

## 5. Action grouping for permissions editor UI
4-tier hierarchy (Module → Resource → Category → Individual action) + 6 cross-cut tabs. Three UI states per §0.4 #2: hidden/disabled/interactive.

## 6-7. Cross-references + special-case treatment
Action dependencies, mutually exclusive (§0.4 #11), action chains. Public actions (signed URL), Admin exceptions (13), system-generated (10+), append-only (9 resources per §0.4 #10).

## 8. Six Pass 1 open questions resolved
Compound verbs vs qualifier form (both); per-record vs per-class (capability at class); role inheritance (NO at v1); per-tenant custom actions (NO at v1); action versioning (new actions default denied); action deprecation (mark; 1 release; clean).

---

═══════════════════════════════════════════════════════════════════
# Part II — Pass 2 (Database Schema) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 2 content at commit `1bafbd4`.*

## 9. 14 tables across 5 groups + 1 materialized view

**Group 1 — Core permissions (5):** `permission_definitions`, `roles`, `role_permissions`, `user_permission_overrides`, `effective_permissions_cache`.

**Group 2 — Field visibility (3):** `field_visibility_definitions`, `role_field_visibility`, `user_field_visibility_overrides`.

**Group 3 — Data scopes (3, orthogonal to grants):** `data_scope_definitions`, `role_data_scopes`, `user_data_scope_overrides`.

**Group 4 — Audit (1, append-only):** `permission_audit_log` with UPDATE/DELETE blocked at PostgreSQL trigger level.

**Group 5 — Cross-cutting constraints (3):** `separation_of_duties_constraints` (§0.4 #11; supports co-sign), `regulatory_expiry_overrides` (§0.4 #12), `geolocation_retention_policies` (§0.4 #13).

**Plus materialized view:** `permission_resolution_view` (admin UI; runtime hot path uses `effective_permissions_cache`).

Three architectural decisions locked: one row per action; trigger-invalidated cache (no TTL); orthogonal data scopes.

---

═══════════════════════════════════════════════════════════════════
# Part III — Pass 3 (Resolution Algorithm) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 3 content at commit `ff08703`.*

## 10. Three runtime algorithms

**A1 — Action grant resolution** (7-phase): cache lookup (Phase 1, <1ms hit) → base table resolution on miss (Phase 2) → cross-cutting constraint checks (Phase 3: separation of duties + regulatory expiry) → audit logging (Phase 4: sensitive + admin exceptions) → return.

**A2 — Data scope resolution:** returns SQL filter clause + bind parameters. Uses `data_scope_definitions.filter_sql_template`. Substitutes `:current_user`.

**A3 — Field visibility resolution:** returns `visible` / `masked` / `hidden`. Honors `is_never_granted` for PCI compliance. Triggers audit-on-read for sensitive fields.

### 10.1 Performance budget
<5ms p99 compound; <1ms cache hit; <50ms p99 typical list endpoint; <15ms p99 detail; <30ms p99 action. Cache hit rate target >95%.

### 10.2 Cache invalidation triggers
5 events. 4 PostgreSQL triggers (role_permissions, user_permission_overrides, users.role_id, permission_definitions.is_deprecated). 1 daily cron (expired temporary overrides).

### 10.3 Edge cases handled
- User override does NOT bypass regulatory expiry (§0.4 #12 supersedes; only `regulatory_expiry_overrides` entries bypass).
- Co-sign actions (allows_co_sign + co_sign_role_codes).
- Public actions (signed URL; A1 NOT called).
- System-generated actions ("system" identity; NULL actor_user_id).
- Expired temporary overrides (cache miss → fallback → audit).

### 10.4 Failure modes
Fail-closed for action grants, regulatory expiry, separation of duties. Fail-open for audit logging (retried) and cache warming.

### 10.5 Debug API
Admin-only `GET /api/admin/permission-debug` returns full resolution trace for support staff diagnosing "why was that user blocked?"

Two architectural decisions locked: invalidate-and-lazy-fill cache (not write-through); separation of duties enforced via runtime check (primary) + database trigger (defense-in-depth).

---

═══════════════════════════════════════════════════════════════════
# Part IV — Pass 4 (Field-Level Visibility Engine) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 11. Overview

Pass 4 implements Algorithm A3 from Pass 3 (`resolve_field_visibility`) across two layers:

**Backend layer:** Applies visibility to API responses before serialization. Hidden fields don't appear in JSON; masked fields appear with masked values; visible fields appear normally.

**Frontend layer:** Applies visibility to React component tree before render. Hidden fields aren't rendered; masked fields render inert placeholders; visible fields render normally.

**The two layers query the same A3 resolver and must agree.** Defense-in-depth: backend hiding while frontend renders a placeholder is fine. Backend exposing while frontend hides is also fine. **What's never fine: backend exposes, frontend renders.** That's a security regression detectable via integration tests.

Plus a third layer for the highest-sensitivity fields:

**Database view layer:** Postgres views (`v_clients_with_visibility`, `v_employees_with_visibility`, etc.) mask sensitive fields at the SQL query level by consulting `effective_field_visibility_cache` via SQL function. App code reading these views never sees raw banking/payroll/SIN values for users who shouldn't see them. Used for: banking, payroll, SIN, full card number, executive compensation. NOT used for all visibility flags — would be too many views — only the most sensitive.

## 12. Backend serialization pipeline

### 12.1 Pipeline architecture

```
┌─────────────────────────────────────────────────────────┐
│  Request enters route handler                           │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  1. Auth middleware → user_id, role_id in context       │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  2. Action grant check (A1)                             │
│     - if denied → 403 + return                          │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  3. Data scope resolution (A2)                          │
│     - inject WHERE clause                               │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  4. Database query (using view if available)           │
│     - rows fetched from `v_<table>_with_visibility`     │
│       for highest-sensitivity tables                    │
│     - rows fetched from base table for the rest         │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  5. Bulk field visibility resolution (A3)               │
│     - resolve ONCE per (user, resource, field_section)  │
│     - returns visibility plan for all rows              │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  6. Serialization transformer                           │
│     - apply visibility plan to each row                 │
│     - mask masked sections                              │
│     - delete hidden sections                            │
│     - leave visible sections untouched                  │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  7. Async audit-on-read enqueue                         │
│     - for sensitive fields where state=visible          │
│     - batched in memory                                 │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  8. JSON response → client                              │
└─────────────────────────────────────────────────────────┘
```

### 12.2 Visibility plan resolution (bulk)

The naive approach — call `resolve_field_visibility` per record per section — produces 50 records × 5 sections = 250 resolver calls. Each call is a cache lookup, so still fast, but unnecessary.

The bulk approach: resolve ONCE per `(user_id, resource, field_section)` for the request. Build a visibility plan:

```typescript
// Pseudocode for build phase reference
async function buildVisibilityPlan(userId: string, resource: string): Promise<VisibilityPlan> {
  // Resolve all sections for this user + resource in parallel
  const sections = await getApplicableSections(resource);  // from field_visibility_definitions
  
  const planEntries = await Promise.all(
    sections.map(async section => {
      const state = await resolveFieldVisibility(userId, resource, section);
      return [section, state] as const;
    })
  );
  
  return new Map(planEntries);  // Map<sectionName, {state, requires_audit_on_read}>
}
```

Then apply the plan to every row:

```typescript
function applyVisibilityPlan(rows: any[], plan: VisibilityPlan): any[] {
  return rows.map(row => transformRow(row, plan));
}

function transformRow(row: any, plan: VisibilityPlan): any {
  const result = { ...row };
  for (const [section, visibility] of plan) {
    if (visibility.state === 'hidden') {
      deleteSectionFields(result, section);
    } else if (visibility.state === 'masked') {
      maskSectionFields(result, section);
    }
    // visible: do nothing
  }
  return result;
}
```

Result: 250 resolver calls → 5 resolver calls + 50 row transformations. Same data, much less work.

### 12.3 Field-to-section mapping

Every database column maps to a section. Sections are defined in `field_visibility_definitions` (`field_section` column). The mapping lives in code (not database) because it's static configuration:

```typescript
// Pseudocode mapping
const FIELD_SECTION_MAP: Record<string, Record<string, string>> = {
  clients: {
    banking_account_name: 'banking',
    banking_routing_number: 'banking',
    banking_account_number: 'banking',
    internal_notes: 'internal_notes',
    onboarding_notes: 'internal_notes',
    discount_reason: 'discount_reason',
    // ...other columns map to no section (always visible)
  },
  employees: {
    sin: 'sin',
    bank_account_name: 'banking',
    bank_account_number: 'banking',
    hourly_cost_rate: 'cost_rate',
    payroll_annual_salary: 'payroll',
    payroll_tax_status: 'payroll',
    // ...
  },
  // ...full catalog at §17 below
};
```

For each row, the transformer iterates the relevant section columns and applies the visibility state.

### 12.4 Serialization transformer pseudocode

```typescript
// Backend transformer (pseudocode for build phase reference)

interface VisibilityPlan {
  sections: Map<string, { state: 'visible' | 'masked' | 'hidden'; requires_audit_on_read: boolean }>;
}

interface MaskRule {
  mask_type: 'card_last_4' | 'email_partial' | 'phone_last_4' | 'address_city_only' 
            | 'sin_last_3' | 'bank_account_last_4' | 'redacted' | 'generic';
}

const MASK_RULES: Record<string, Record<string, MaskRule>> = {
  // resource → column → mask_type
  payments: {
    full_card_number: { mask_type: 'card_last_4' },
    bank_account_info: { mask_type: 'bank_account_last_4' }
  },
  clients: {
    banking_account_number: { mask_type: 'bank_account_last_4' },
    banking_routing_number: { mask_type: 'redacted' }
  },
  employees: {
    sin: { mask_type: 'sin_last_3' },
    bank_account_number: { mask_type: 'bank_account_last_4' }
  },
  // ...full catalog at §17 below
};

function transformRow(row: Record<string, any>, plan: VisibilityPlan, resource: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [columnName, value] of Object.entries(row)) {
    const section = FIELD_SECTION_MAP[resource]?.[columnName];
    
    if (!section) {
      // Field has no visibility gate — always visible
      result[columnName] = value;
      continue;
    }
    
    const visibility = plan.sections.get(section);
    
    if (!visibility || visibility.state === 'hidden') {
      // Skip the field entirely (don't add to result)
      continue;
    }
    
    if (visibility.state === 'masked') {
      const maskRule = MASK_RULES[resource]?.[columnName];
      result[columnName] = applyMask(value, maskRule?.mask_type || 'generic');
      continue;
    }
    
    if (visibility.state === 'visible') {
      result[columnName] = value;
      
      if (visibility.requires_audit_on_read) {
        enqueueAuditOnRead(currentUserId, resource, section, row.id);
      }
    }
  }
  
  return result;
}
```

### 12.5 List endpoint pattern

```typescript
// Pseudocode for build phase

async function listClients(userId: string, queryParams: any) {
  // 1. Action grant
  const grant = await resolveActionGrant(userId, 'clients:viewList');
  if (!grant.is_granted) throw new ForbiddenError(grant.reason_if_denied);
  
  // 2. Scope filter
  const scope = await resolveDataScope(userId, 'clients');
  
  // 3. Build visibility plan ONCE
  const plan = await buildVisibilityPlan(userId, 'clients');
  
  // 4. Query (use view if highest-sensitivity table)
  const useView = SHOULD_USE_VIEW.has('clients');
  const fromClause = useView ? 'v_clients_with_visibility' : 'clients';
  const rows = await db.query(
    `SELECT * FROM ${fromClause} WHERE ${scope.sql_filter_clause} AND archived_at IS NULL`,
    { current_user: userId, ...scope.bind_parameters }
  );
  
  // 5. Apply visibility plan to every row
  const transformed = rows.map(row => transformRow(row, plan, 'clients'));
  
  // 6. Audit batched (async; already enqueued by transformRow)
  
  return transformed;
}
```

## 13. Mask formatting library

Standard mask types. Implemented as pure functions; deterministic; no I/O.

### 13.1 The 12 standard mask types

| Mask type | Input | Output | Notes |
|---|---|---|---|
| `card_last_4` | `'4532123456789012'` | `'•••• •••• •••• 9012'` | PCI compliance; last 4 only |
| `card_brand_last_4` | `{brand: 'Visa', last4: '9012'}` | `'Visa ending in 9012'` | Display variant |
| `bank_account_last_4` | `'00012345678'` | `'•••••••5678'` | Last 4 only |
| `routing_number_redacted` | `'01200012'` | `'••••••••'` | Full redaction (routing is sensitive in CA but not displayed even in last-4 form) |
| `sin_last_3` | `'123 456 789'` | `'••• ••• 789'` | Canadian SIN; last 3 |
| `ssn_last_4` | `'123-45-6789'` | `'•••-••-6789'` | US SSN; last 4 |
| `email_partial` | `'john.smith@example.com'` | `'j••••@example.com'` | First char + domain |
| `email_full_redact` | `'john.smith@example.com'` | `'•••••@•••••'` | Full redaction (for VO seeing customer emails) |
| `phone_last_4` | `'+1 416-555-1234'` | `'+1 ••••••1234'` | Country code + last 4 |
| `address_city_only` | `{street: '123 Main', city: 'Toronto', province: 'ON'}` | `{city: 'Toronto', province: 'ON'}` | Drop street; keep city/province |
| `redacted` | (any) | `'•••••••'` | Full redaction; fixed length 7 chars |
| `generic` | (any) | `'•••'` | Fallback; 3 chars |

### 13.2 Mask implementation

```typescript
// Mask functions are pure
function maskCardLast4(value: string): string {
  if (!value || value.length < 4) return '••••';
  const last4 = value.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

function maskBankAccountLast4(value: string): string {
  if (!value || value.length < 4) return '••••';
  const last4 = value.slice(-4);
  const masked = '•'.repeat(Math.min(value.length - 4, 8));
  return `${masked}${last4}`;
}

function maskSinLast3(value: string): string {
  if (!value || value.length < 3) return '••• ••• •••';
  const cleaned = value.replace(/[\s-]/g, '');
  const last3 = cleaned.slice(-3);
  return `••• ••• ${last3}`;
}

function maskEmailPartial(value: string): string {
  if (!value) return '•••••@•••••';
  const [local, domain] = value.split('@');
  if (!local || !domain) return '•••••@•••••';
  const firstChar = local[0];
  return `${firstChar}••••@${domain}`;
}

// ...and so on for all 12 mask types
```

### 13.3 Localization

Mask characters (•) are Unicode bullet character (U+2022). Renders consistently across en + fr. No localization variants needed at v1.

## 14. Async batched audit-on-read

Per Pass 3, sensitive field reads trigger audit log entries. At list-endpoint scale (50 records × 2 sensitive sections), per-read synchronous inserts are catastrophic. Pass 4 specifies the async batched implementation.

### 14.1 Buffer architecture

Per-process in-memory buffer with periodic flush:

```
┌────────────────────────────────────────┐
│  Buffer (in-memory):                   │
│  [                                     │
│    { user_id, resource, section,       │
│      entity_id, occurred_at },         │
│    ...                                 │
│  ]                                     │
└────────────────────────────────────────┘
         │                  │
         ▼                  ▼
   Flush triggers:    Backpressure:
   - every 100ms      - if buffer > 1000
   - every 50 reads     entries: force
   - on shutdown        synchronous flush
```

### 14.2 Flush implementation

```typescript
// Pseudocode
interface AuditOnReadEntry {
  user_id: string;
  resource: string;
  section: string;
  entity_id: string;
  occurred_at: Date;
}

class AuditOnReadBuffer {
  private buffer: AuditOnReadEntry[] = [];
  private flushTimer: NodeJS.Timer | null = null;
  
  enqueue(entry: AuditOnReadEntry): void {
    this.buffer.push(entry);
    
    // Backpressure: force flush if buffer too large
    if (this.buffer.length >= 1000) {
      this.flushSync();
      return;
    }
    
    // Periodic flush
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 100);
    }
    
    // Size-based flush
    if (this.buffer.length >= 50) {
      this.flush();
    }
  }
  
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.buffer.length === 0) return;
    
    const batch = this.buffer;
    this.buffer = [];
    
    try {
      await db.query(
        `INSERT INTO permission_audit_log 
          (event_type, actor_user_id, target_resource, target_field_section, target_entity_id, occurred_at)
        VALUES ${batch.map(() => '($1, $2, $3, $4, $5, $6)').join(', ')}`,
        batch.flatMap(e => ['field_read_with_audit', e.user_id, e.resource, e.section, e.entity_id, e.occurred_at])
      );
    } catch (err) {
      // Log error; do NOT block response; reconciliation cron will retry
      logger.error('audit-on-read flush failed', { batch_size: batch.length, error: err });
      // Put back in buffer if reasonable; circuit breaker if repeated failures
    }
  }
  
  private flushSync(): void {
    // Called on backpressure or shutdown — block until flushed
    return this.flush();
  }
}
```

### 14.3 Audit ordering

Within a single user's reads, audit entries are inserted in occurrence order (the buffer is FIFO). Across users, ordering is best-effort. For compliance auditing this is acceptable — the per-user ordering is what matters for forensic analysis ("at 14:23, user X read banking for client A; at 14:24, they read banking for client B").

### 14.4 Backpressure handling

If buffer fills (>1000 entries):
1. Force synchronous flush
2. Log warning to monitoring
3. If repeated (3+ within 1 minute): circuit-breaker → disable async audit; fall back to synchronous per-read inserts; alert ops

Worst case: ops sees latency spike but audit completeness preserved.

### 14.5 Reconciliation cron

Daily cron job:
1. Verify audit log row counts match expected reads per user (heuristic check)
2. Look for gaps (consecutive entity_id reads without audit row when there should be)
3. Alert if anomalies detected

Compliance requirement satisfied by completeness, not real-time precision.

## 15. Frontend component wrapper architecture

### 15.1 `<FieldGated>` component

React wrapper that consults the visibility plan (passed via context or props) and renders accordingly.

```typescript
// Pseudocode for build phase reference
interface FieldGatedProps {
  flagName: string;        // e.g., 'visibility.clients.banking'
  children: React.ReactNode;
  fallback?: React.ReactNode;  // rendered when masked
  maskedValue?: string;        // displayed value when masked
}

function FieldGated({ flagName, children, fallback, maskedValue }: FieldGatedProps) {
  const visibility = useVisibility(flagName);  // hook reads from context
  
  if (visibility.state === 'hidden') {
    return null;  // don't render
  }
  
  if (visibility.state === 'masked') {
    return fallback ?? <MaskedValue value={maskedValue ?? '•••'} />;
  }
  
  return <>{children}</>;
}

// Usage
<FieldGated flagName="visibility.clients.banking">
  <BankingPanel client={client} />
</FieldGated>

<FieldGated flagName="visibility.payments.fullCardNumber" maskedValue={`•••• •••• •••• ${last4}`}>
  <FullCardNumber value={fullNumber} />
</FieldGated>
```

### 15.2 Visibility context provider

At the page level, fetch the visibility plan once and provide to all `<FieldGated>` descendants:

```typescript
// Pseudocode
function ClientDetailPage({ clientId }: { clientId: string }) {
  const { data: visibilityPlan } = useQuery(['visibility', 'clients'], () =>
    fetchVisibilityPlan('clients')
  );
  
  return (
    <VisibilityProvider plan={visibilityPlan}>
      <ClientDetail clientId={clientId} />
    </VisibilityProvider>
  );
}
```

### 15.3 Section-level wrappers

For clearly-bounded sections where every field shares one flag:

```typescript
// Banking panel — all fields gated by visibility.clients.banking
<FieldGated flagName="visibility.clients.banking">
  <BankingPanel>
    <Field label="Account Holder" value={client.bankingAccountName} />
    <Field label="Routing Number" value={client.bankingRoutingNumber} />
    <Field label="Account Number" value={client.bankingAccountNumber} />
  </BankingPanel>
</FieldGated>
```

For mixed-sensitivity sections, per-field wrappers:

```typescript
// Client detail with mixed sensitivity
<ClientCard>
  <Field label="Name" value={client.commonName} />  {/* No gate; always visible */}
  <Field label="Tier" value={client.tier} />         {/* No gate */}
  <FieldGated flagName="visibility.clients.internalNotes">
    <Field label="Internal Notes" value={client.internalNotes} />
  </FieldGated>
  <FieldGated flagName="visibility.clients.discountReason">
    <Field label="Last Discount Reason" value={client.discountReason} />
  </FieldGated>
</ClientCard>
```

### 15.4 Hooks

```typescript
// useVisibility — read state for a flag
function useVisibility(flagName: string): VisibilityState {
  const plan = useContext(VisibilityContext);
  return plan?.sections.get(flagName) ?? { state: 'hidden' };
}

// useCanDoAction — wrapper for action grant check (Pass 3 A1)
function useCanDoAction(actionName: string): boolean {
  const { data: grant } = useQuery(['action-grant', actionName], () =>
    resolveActionGrant(currentUser.id, actionName)
  );
  return grant?.is_granted ?? false;
}

// Usage in render
function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const canApprove = useCanDoAction('invoices:approve');
  const canSend = useCanDoAction('invoices:send');
  
  return (
    <>
      {canApprove && <Button onClick={approveInvoice}>Approve</Button>}
      {canSend && <Button onClick={sendInvoice}>Send</Button>}
    </>
  );
}
```

### 15.5 Edit gating

Hidden fields don't render. Masked fields render but read-only. Editing a masked field is impossible (the input is replaced with the masked display):

```typescript
function FieldGatedInput({ flagName, value, onChange, ...inputProps }: FieldGatedInputProps) {
  const visibility = useVisibility(flagName);
  
  if (visibility.state === 'hidden') return null;
  if (visibility.state === 'masked') {
    return <MaskedDisplay value={maskValue(value, getMaskType(flagName))} />;
  }
  
  return <input value={value} onChange={onChange} {...inputProps} />;
}
```

User with `view:masked` on banking can SEE last-4 but cannot EDIT. To edit, they need `visible` visibility AND `clients:editBanking` action grant.

## 16. Database view layer (defense-in-depth for highest sensitivity)

Per Decision 1 in chat walk: highest-sensitivity fields get Postgres view layer in addition to application transformer.

### 16.1 Which fields get views

Five view tables built at v1:
- `v_clients_with_visibility` — masks banking
- `v_employees_with_visibility` — masks SIN, banking, payroll, cost_rate
- `v_vendors_with_visibility` — masks banking, T5018 YTD amount
- `v_contractors_with_visibility` — masks banking, labor rates (for SR), worker manifest (for non-PM)
- `v_payments_with_visibility` — masks full card number (always; never granted), bank account info

Not all 50+ flags get views — would explode view count. Only fields where DB-level masking adds material defense beyond application-layer.

### 16.2 View example: `v_employees_with_visibility`

```sql
CREATE OR REPLACE VIEW v_employees_with_visibility AS
SELECT
  id,
  legal_name,
  common_name,
  role_id,
  hire_date,
  email,
  phone,
  
  -- SIN: masked or hidden based on current user's visibility
  CASE
    WHEN user_field_visibility('visibility.employees.sin') = 'visible' THEN sin
    WHEN user_field_visibility('visibility.employees.sin') = 'masked' THEN 
      CONCAT('••• ••• ', RIGHT(REGEXP_REPLACE(sin, '[\s-]', '', 'g'), 3))
    ELSE NULL
  END AS sin,
  
  -- Banking
  CASE 
    WHEN user_field_visibility('visibility.employees.banking') = 'visible' THEN bank_account_number
    WHEN user_field_visibility('visibility.employees.banking') = 'masked' THEN
      CONCAT('•'.''.REPEAT(GREATEST(LENGTH(bank_account_number) - 4, 0), '•'), RIGHT(bank_account_number, 4))
    ELSE NULL
  END AS bank_account_number,
  
  -- Cost rate
  CASE
    WHEN user_field_visibility('visibility.employees.cost_rate') = 'visible' THEN hourly_cost_rate
    ELSE NULL
  END AS hourly_cost_rate,
  
  -- Payroll
  CASE 
    WHEN user_field_visibility('visibility.employees.payroll') = 'visible' THEN payroll_annual_salary
    ELSE NULL
  END AS payroll_annual_salary,
  
  -- All other columns always visible
  created_at,
  archived_at
  
FROM employees;
```

`user_field_visibility(flag_name)` is a SQL function that:
1. Reads `current_setting('app.current_user_id')` (set by application per connection)
2. Queries `effective_field_visibility_cache` for that user + flag
3. Returns the state

### 16.3 SQL function

```sql
CREATE OR REPLACE FUNCTION user_field_visibility(flag_name TEXT)
RETURNS TEXT 
LANGUAGE plpgsql
STABLE  -- result depends only on inputs + DB state; safe to cache within a query
AS $$
DECLARE
  current_user_id UUID;
  result_state TEXT;
BEGIN
  current_user_id := current_setting('app.current_user_id')::UUID;
  
  -- Cache lookup
  SELECT visibility_state INTO result_state
  FROM effective_field_visibility_cache
  WHERE user_id = current_user_id
    AND flag_name = flag_name
  LIMIT 1;
  
  IF result_state IS NULL THEN
    -- Cache miss — resolve from base tables
    -- (resolution logic equivalent to Pass 3 A3)
    -- ... resolution code ...
  END IF;
  
  RETURN COALESCE(result_state, 'hidden');  -- fail-closed
END;
$$;
```

### 16.4 Application using views

App reads from view, not base table, for the 5 highest-sensitivity resources:

```typescript
// For these 5 resources, use view
const VIEW_BACKED_RESOURCES = new Set(['clients', 'employees', 'vendors', 'contractors', 'payments']);

async function fetchResource(resource: string, where: string, bind: any) {
  const tableName = VIEW_BACKED_RESOURCES.has(resource) 
    ? `v_${resource}_with_visibility` 
    : resource;
  return await db.query(`SELECT * FROM ${tableName} WHERE ${where}`, bind);
}
```

App still runs `transformRow` from §12.4 as defense-in-depth (view masks → transformer no-ops on already-NULL field; no harm).

### 16.5 RLS + view interaction

Both RLS policies (Pass 3 §12.5) and views apply simultaneously. Order of operations:

1. RLS filters rows the user can see at all (data scope)
2. View masks/hides specific columns within those rows (field visibility)

Both must be set up correctly. If RLS forgets to filter, scope leak. If view forgets to mask, field leak. Defense-in-depth means both layers exist.

## 17. Complete field visibility flag catalog

Maps every `visibility.*` flag to its database columns + mask type + role defaults.

### 17.1 M1 — Clients

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.clients.banking` | clients | `banking_account_name`, `banking_routing_number`, `banking_account_number` | bank_account_last_4 (account_number); redacted (others) | A: visible; Acc: visible (audit-on-read); PM: masked; SR/Tech/VO: hidden |
| `visibility.clients.internalNotes` | clients | `internal_notes`, `onboarding_notes` | redacted | A: visible; PM: visible; Acc: visible; SR/Tech/VO: hidden |
| `visibility.clients.discountReason` | clients | `discount_reason`, `last_discount_at` | redacted | A: visible; PM: visible; SR: visible; Acc: visible; Tech/VO: hidden |
| `visibility.clients.tierDetails` | clients | `tier_thresholds`, `tier_benefits` | generic | A: visible; PM: visible (for own team); SR: hidden; Tech: hidden; Acc: hidden; VO: hidden |

### 17.2 M2 — Employees

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.employees.sin` | employees | `sin` | sin_last_3 | A: visible (audit); HR: visible (audit); Acc: visible (audit); others: hidden |
| `visibility.employees.banking` | employees | `bank_account_name`, `bank_routing`, `bank_account_number` | bank_account_last_4 | A: visible (audit); Acc: visible (audit); HR: visible (audit); others: hidden |
| `visibility.employees.payroll` | employees | `payroll_annual_salary`, `payroll_pay_frequency`, `payroll_deductions`, `payroll_tax_status` | redacted | A: visible; HR: visible; Acc: visible; employee_self: visible (own only); others: hidden |
| `visibility.employees.cost_rate` | employees | `hourly_cost_rate`, `loaded_cost_rate` | redacted | A: visible; Acc: visible; PM: visible (for team); SR: hidden; Tech: hidden; VO: hidden |
| `visibility.employees.privatePhone` | employees | `personal_phone`, `personal_email`, `emergency_contact` | phone_last_4 / email_partial | A: visible; HR: visible; PM: masked (team); others: hidden |
| `visibility.employees.documents` | employees | `(employee_documents.*)` | generic | A: visible; HR: visible; employee_self: visible (own); others: hidden |

### 17.3 M5 — Quotes

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.quotes.margin` | quotes | `gross_margin_pct`, `gross_margin_amount`, `internal_cost_total` | redacted | A: visible; PM: visible; Acc: visible; SR: hidden (sees price only); Tech/VO: hidden |
| `visibility.quotes.internalNotes` | quotes | `internal_notes` | redacted | A: visible; PM: visible; SR: visible (own quotes only); others: hidden |
| `visibility.quotes.approvalHistory` | quotes | `(quote_approvals.*)` | generic | A: visible; PM: visible; SR: visible (own); Acc: visible; others: hidden |

### 17.4 M6 — Projects

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.projects.actualCosts` | projects | `actual_cost_labor`, `actual_cost_materials`, `actual_cost_subs`, `actual_total` | redacted | A: visible; PM: visible (own); Acc: visible; SR: hidden; Tech: hidden (own labor only via timesheets); VO: hidden |
| `visibility.projects.estimatedMargin` | projects | `estimated_gross_margin`, `committed_gross_margin` | redacted | A: visible; PM: visible (own); Acc: visible; others: hidden |
| `visibility.projects.changeOrderImpact` | projects | `change_order_total_margin_impact` | redacted | A: visible; PM: visible (own); Acc: visible; others: hidden |
| `visibility.projects.commissioningInternal` | projects | `commissioning_internal_notes`, `commissioning_findings` | redacted | A: visible; PM: visible (own); Tech: visible (assigned); others: hidden |

### 17.5 M7 — Inventory

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.inventory.unitCost` | inventory_items | `unit_cost_fifo`, `vendor_unit_cost` | redacted | A: visible; PM: visible; Acc: visible; SR: hidden (sees sell price only); Tech: hidden; VO: hidden |
| `visibility.inventory.vendorMargin` | vendor_catalog | `vendor_margin_pct` | redacted | A: visible; Acc: visible; PM: visible (limited); others: hidden |

### 17.6 M8 — Vendors

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.vendors.banking` | vendors | `banking_account_name`, `banking_routing`, `banking_account_number` | bank_account_last_4 | A: visible (audit); Acc: visible (audit); others: hidden |
| `visibility.vendors.t5018YtdAmount` | vendors | `t5018_ytd_amount` | redacted | A: visible; Acc: visible; HR-role: visible; others: hidden |
| `visibility.vendors.performanceInternal` | vendors | `performance_internal_notes`, `auto_degrade_history` | redacted | A: visible; PM: visible; Acc: visible; others: hidden |

### 17.7 M9 — Invoices, Payments, Credit Notes

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.invoices.profit` | invoices | `gross_profit`, `cost_total`, `margin_pct` | redacted | A: visible; PM: visible (own); Acc: visible; SR: hidden; Tech: hidden; VO: hidden |
| `visibility.invoices.discountReason` | invoices | `discount_reason`, `discount_authorized_by` | redacted | A: visible; PM: visible; SR: visible (own); Acc: visible; others: hidden |
| `visibility.invoices.lineCost` | invoice_lines | `line_unit_cost`, `line_total_cost` | redacted | A: visible; Acc: visible; PM: visible; others: hidden |
| `visibility.payments.fullCardNumber` | payments | `card_number_full` (encrypted at rest; never decrypted for display) | NEVER VISIBLE (is_never_granted=TRUE) | All: hidden (PCI compliance) |
| `visibility.payments.bankAccountInfo` | payments | `bank_account_full`, `bank_routing_full` | bank_account_last_4 | A: visible (audit); Acc: visible (audit); others: hidden |

### 17.8 M10 — Subcontractors

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.contractors.banking` | contractors | `banking_account_name`, `banking_routing`, `banking_account_number` | bank_account_last_4 | A: visible (audit); Acc: visible (audit); others: hidden |
| `visibility.contractors.laborRates` | contractor_labor_rates | `base_rate`, `overtime_rate`, `weekend_rate`, `holiday_rate`, `travel_rate` | redacted | A: visible; PM: visible; Acc: visible; SR: hidden (sees availability only); Tech: hidden; VO: hidden |
| `visibility.contractors.unitCost` | contractor_work_orders | `our_unit_cost` (markup applied for project costing) | redacted | A: visible; Acc: visible; PM: visible (own); others: hidden |
| `visibility.contractors.performanceScores` | contractors | `performance_scores`, `auto_degrade_history` | redacted | A: visible; PM: visible (own); Acc: visible; others: hidden |
| `visibility.contractors.workerManifest` | contractor_worker_manifest | full table | generic | A: visible; PM: visible (project-scoped); AM: visible (assigned); others: hidden |
| `visibility.contractors.t5018YtdAmount` | contractors | `t5018_ytd_amount` | redacted | A: visible; Acc: visible; others: hidden |
| `visibility.contractors.internalNotes` | contractors | `internal_notes` | redacted | A: visible; others: hidden |

### 17.9 M11 — Financials

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.financials.bankBalances` | bank_accounts | `current_balance`, `opening_balance` | redacted | A: visible; Acc: visible; Bookkeeper: visible; others: hidden |
| `visibility.financials.taxLiability` | tax_filings | `total_collected`, `total_remittance` | redacted | A: visible; Acc: visible; Bookkeeper: visible; others: hidden |
| `visibility.financials.payrollGl` | gl_journal_entries (payroll subset) | full | redacted | A: visible; Acc: visible; HR-role: visible; others: hidden |
| `visibility.financials.executiveCompensation` | gl_journal_entries (exec comp subset) | full | redacted | A: visible; Executive: visible; others: hidden |
| `visibility.financials.proprietaryFinancials` | financial_reports | full | redacted | A: visible; Acc: visible; Executive: visible; others: hidden |
| `visibility.financials.intercompanyTransfers` | gl_journal_entries (intercompany subset) | full | redacted | A: visible only (Phase 2 multi-entity) |
| `visibility.financials.foreignExchangeRates` | fx_revaluation_runs | full | redacted | A: visible; Acc: visible; others: hidden |
| `visibility.financials.unrealizedGainLoss` | fx_revaluation_runs | `total_unrealized_gain_loss` | redacted | A: visible; Acc: visible; others: hidden |

### 17.10 M12 — Scheduling

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.scheduling.fullCalendarAcrossTeams` | appointments | (scoping flag — affects which rows returned, not which fields masked) | n/a — see Pass 3 §12 (data scopes) | A: visible; Dispatcher: visible; others: scoped |
| `visibility.scheduling.employeeCostRate` | appointment_resources | `employee_cost_rate` | redacted | A: visible; Acc: visible; others: hidden |
| `visibility.scheduling.privateAppointments` | appointments | (where appointment_type='Internal Meeting' AND created_by=own_user) | n/a — affects row visibility | owner: visible; others: hidden |
| `visibility.scheduling.customerPii` | appointments | `customer_phone`, `customer_email`, `site_access_codes` | phone_last_4 / email_partial / redacted | A: visible; PM: visible (own projects); assigned_tech: visible; others: hidden |
| `visibility.scheduling.geolocationHistory` | appointments | `clock_in_geo`, `clock_out_geo`, `on_site_geo` | redacted | A: visible; owner: visible (own); others: hidden. 30-day retention per §0.4 #13 |

### 17.11 M13 — Reports

| Flag | Resource | Columns affected | Mask type | Default state per role |
|---|---|---|---|---|
| `visibility.reports.executiveReports` | report_definitions | full row for executive category | n/a — affects row visibility | A: visible; Executive: visible; VO: visible (limited rows); others: hidden |
| `visibility.reports.payrollReports` | report_definitions | full row for payroll-related | n/a | A: visible; HR-role: visible; Acc: visible; others: hidden |
| `visibility.reports.crossUserData` | reports | (predicate flag controlling cross-user query) | n/a — affects query generation | A: visible; granted role: visible; others: predicate "current_user only" applied |

### 17.12 Catalog stats

- **47 distinct flags** across 13 modules
- **5 mask types most used:** redacted, bank_account_last_4, sin_last_3, phone_last_4, email_partial
- **1 never-granted flag:** `visibility.payments.fullCardNumber` (PCI compliance)
- **9 flags with `requires_audit_on_read=TRUE`:** all banking + SIN + payroll variants
- **3 flags affecting row-level not field-level:** privateAppointments, fullCalendarAcrossTeams, crossUserData (handled by scope/predicate, not transformer)

## 18. Performance characteristics

### 18.1 Backend serialization overhead

| Scenario | Overhead |
|---|---|
| Plan build (parallel section resolution) | <5ms once per request |
| Per-row transform | <0.1ms per row (no I/O; pure CPU) |
| 50-row list | <10ms total transformation overhead |
| Audit-on-read async enqueue | <0.01ms per read; 0ms blocking |
| Audit-on-read async flush | ~5ms per batch of 50 entries (batched insert) |

### 18.2 Frontend render overhead

| Scenario | Overhead |
|---|---|
| Visibility plan fetch | 1 network call (~50ms one-time per page) |
| `<FieldGated>` overhead per field | ~0.1ms (Map lookup + conditional render) |
| Page with 100 gated fields | ~10ms additional render time |

### 18.3 View layer overhead (highest-sensitivity tables)

| Scenario | Overhead |
|---|---|
| SELECT from view vs base table | <5% additional query time (function call per column) |
| `user_field_visibility` function call | <0.5ms per call (cache hit) |

## 19. Failure modes

| Failure | Behavior |
|---|---|
| Visibility plan fetch fails | Fail-closed: treat all gated fields as hidden; show error banner; user can retry |
| Audit-on-read flush fails | Action proceeds; failed batch logged; reconciliation cron retries |
| View layer SQL function fails | Fall back to base table; warning to monitoring; defense-in-depth degraded but app continues |
| Mask function throws on invalid input | Return generic mask (`'•••'`); log warning; never expose raw value |
| Frontend wrapper renders without visibility context | Render nothing (fail-closed); console warning in dev |

## 20. Per-tenant customization (Phase 2 placeholder)

At v1, the flag catalog (§17) is global — every tenant has the same 47 flags with the same column mappings.

Phase 2: operators can customize which fields belong to which flag. For example, an operator might want their custom `external_consultant_rate` column on contractors to be gated by `visibility.contractors.laborRates`. Mechanism: per-tenant override of `FIELD_SECTION_MAP` (currently code; would move to a `field_section_mappings` table at Phase 2).

Also Phase 2: operator-defined custom flags. At v1 the 47 flags are fixed.

## 21. Open questions (Pass 4)

1. **Should the view layer cover all 47 flags or just the highest-sensitivity ones?** Decision: just the 5 highest-sensitivity resources (clients, employees, vendors, contractors, payments). Building 13 views is enough defense-in-depth without the maintenance burden of 47.

2. **Should `<FieldGated>` show a tooltip explaining why a field is hidden?** Decision: NO at v1. Hidden means hidden — no signal that data exists. Phase 2 could add an admin-toggleable "show locked sections" preview mode.

3. **Audit-on-read for masked reads?** When user sees masked card number, should that be audited? Decision: NO — masked reads are the safe path; audit creates noise. Only `visible` reads of sensitive fields audit.

4. **Cross-field masking dependencies.** If `discount_reason` requires `discount_authorized_by` for context, are they always gated together? Decision: gated together by being in the same field_section. Section is the atomic unit of visibility.

5. **Mask format internationalization.** Should mask characters change for non-Latin scripts? Decision: NO — `•` (U+2022) is universally rendered and recognized. Consistent across languages.

6. **Test strategy for visibility leaks.** How do we catch a regression where backend exposes but frontend hides? Decision: integration tests with snapshot comparison per role. Run nightly across all 47 flags × 11 base roles = ~520 test cases. Detailed test spec in build phase.

---

═══════════════════════════════════════════════════════════════════
# 22. What's next (Pass 5 preview)
═══════════════════════════════════════════════════════════════════

**Pass 5: Status surface binding layer.**

Per Pass 1 §0.4 #4 and the 80 status surfaces catalogued across the audit: lookup-table rows carry behavior bindings. e.g., `invoice_statuses.Sent` has `allows-edit=false`, `triggers-late-fee=true`, `terminal=false`. These bindings drive runtime behavior of actions.

Pass 5 covers:
- The schema for behavior bindings on status surfaces (extends Pass 2 schema with `status_behavior_bindings` table)
- The 80 status surfaces × their bindings inventory (full catalog)
- How action handlers consult bindings (e.g., `invoices:edit` checks `current_status.allows_edit` before proceeding)
- The state transition matrix per status surface (which transitions are valid)
- Integration with Pass 3 algorithms (binding checks happen in Phase 3 alongside cross-cutting constraints)
- Operator-configurable bindings (which can operators tune in Settings vs which are system-locked)

Pass 5 will produce v0.5 of the design doc.

---

**End of v0.4.** Pass 4 (Field-Level Visibility Engine) complete. Backend serialization pipeline + frontend component wrapper architecture + mask formatting library (12 standard mask types) + async batched audit-on-read + bulk visibility resolution + defense-in-depth Postgres views for 5 highest-sensitivity tables + complete 47-flag catalog mapped to database columns + performance characteristics + failure modes + Phase 2 customization placeholder. Six Pass 4 open questions resolved.

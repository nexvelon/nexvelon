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
> **Status:** v0.1 — Pass 1 complete (Action Vocabulary Catalog).
> Pending passes: Database schema (Pass 2), Resolution algorithm
> (Pass 3), Field visibility engine (Pass 4), Status surface
> bindings (Pass 5), Append-only audit pattern (Pass 6),
> Request-admin-access workflow (Pass 7), Permissions editor UI
> (Pass 8), Effective-permissions caching (Pass 9), Cross-cutting
> enforcement patterns (Pass 10), Migration plan (Pass 11).
>
> **Audit inputs consumed:** ~1260 actions, 76 permissions design
> implications, 13 cross-cutting commitments (§0.4 #1-13),
> ten-dimensional permission control model, 80 status surfaces
> with behavior bindings, 50+ field-level visibility flags.

---

## 0. How to use this document

### 0.1 Purpose

This is the design specification for the Nexvelon permissions runtime. It synthesizes everything from the 13-module feature audit into the actual architecture: action vocabulary, database schemas, resolution algorithm, field-level visibility engine, audit patterns, UI surfaces.

The design is built in passes. Each pass produces a self-contained section. Earlier passes are foundations for later passes.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog (normalize ~1260 actions to consistent naming) | ✅ COMPLETE (this version) |
| 2 | Database schema (roles, role_permissions, user_permission_overrides, permission_definitions, field_visibility_definitions, data_scope_definitions, audit tables) | PENDING |
| 3 | Permission resolution algorithm (how the runtime answers "can user X do action Y on entity Z?") | PENDING |
| 4 | Field-level visibility engine (how `visibility.*` flags evaluate at query + UI layer) | PENDING |
| 5 | Status surface binding layer (how 80 status surfaces with behavior bindings evaluate at action-call time) | PENDING |
| 6 | Append-only audit pattern (how every permission grant/revoke/override is logged) | PENDING |
| 7 | Request-admin-access workflow (from M2 — full spec) | PENDING |
| 8 | Permissions editor UI (six-tab editor from M2 — fully specified) | PENDING |
| 9 | Effective-permissions caching strategy | PENDING |
| 10 | Cross-cutting enforcement patterns (separation of duties, regulatory expiry auto-block, geolocation retention) | PENDING |
| 11 | Migration plan (adding this layer to the existing production system without breaking anything) | PENDING |

### 0.3 Role abbreviations

Per audit conventions:
- **A** — Admin
- **PM** — Project Manager
- **SR** — Sales Rep
- **Tech** — Technician
- **Sub** — Subcontractor (external; portal access only)
- **Acc** — Accounting
- **VO** — View Only

Plus the additional custom roles surfaced through the audit:
- **Dispatcher** (introduced in M12)
- **Bookkeeper** (introduced in M11 — view + post manual GL entries; cannot close periods)
- **HR-role** (introduced as needed for payroll + employee data)
- **Executive** (introduced in M13 — cross-user reports + executive financial reports)

Operators can create unlimited custom roles via the M2 framework.

---

═══════════════════════════════════════════════════════════════════
# 1. Naming convention specification
═══════════════════════════════════════════════════════════════════

## 1.1 Format

```
resource:verb[:qualifier]
```

- **resource** — plural noun, lowercase, snake_case if multi-word. Plural because we're naming the entity type, not a specific instance. Examples: `clients`, `invoices`, `ap_bills`, `gl_journal_entries`, `contractor_work_orders`.
- **verb** — single verb in camelCase, drawn from a fixed verb taxonomy (§2). Compound verbs allowed where they express a distinct workflow action (`recordPayment`, `markComplete`).
- **qualifier** — optional, drawn from a fixed qualifier taxonomy (§3). Used when the same verb needs different scopes or modes.

All three parts lowercase except the verb portion (camelCase). Colon-separated.

## 1.2 Resource naming rules

- **Plural always.** `clients` not `client`.
- **Snake_case for multi-word.** `ap_bills`, `gl_journal_entries`, `contractor_work_orders`.
- **Resources are namespaced by module.** Within M9: `invoices` (AR), `ap_bills` (AP), `payments`, `credit_notes`. Avoid generic names that could collide across modules.
- **Match the database table name** where possible. The resource name in the action string IS the table name. Exception: shorter alias allowed for very long table names (e.g., `coa` instead of `chart_of_accounts`).

## 1.3 Verb naming rules

- **camelCase always.** `viewList`, `markPaid`, `applyDiscount`.
- **Single verb root + optional modifier.** `view`, `viewList`, `viewMy` (all variants of "view"). `record`, `recordPayment`, `recordBounce` (all variants of "record").
- **Compound verb forms are OK** when they express a distinct workflow action. `markPaid` (state transition), `recordPayment` (creating a payment record). Don't break these apart unnecessarily.
- **Verb root from the fixed taxonomy** (§2). New verbs require an addition to the taxonomy.

## 1.4 Qualifier naming rules

- **All lowercase.** `my`, `team`, `all`, `draft`, `manual`.
- **Drawn from a fixed qualifier taxonomy** (§3).
- **Add only when needed** to disambiguate. If a verb is already unambiguous, no qualifier.

## 1.5 Examples

```
clients:view:list                   ← list view of clients
clients:view:my                     ← own clients only
clients:view:detail                 ← detail view of a single client
clients:create                      ← create new client
clients:editBasic                   ← edit basic info (compound verb, no qualifier needed)
clients:overrideSla                 ← override SLA (Admin exception per §0.4 #7)
quotes:applyDiscount                ← apply discount to a quote
invoices:markPaid                   ← state transition: mark invoice paid
payments:create                     ← create payment record (replaces "recordPayment")
ap_bills:performThreeWayMatch       ← workflow verb
gl_journal_entries:create:manual    ← manual GL entry (modal qualifier)
gl_journal_entries:post             ← post a GL entry
contractor_work_orders:startLienPeriod ← compound verb for distinct workflow action
appointments:create                 ← create appointment
appointments:view:my                ← own appointments only (Tech default)
reports:view:library                ← view report library
reports:runReport                   ← execute a report
```

## 1.6 What's NOT in action names

- **Tense.** Never `created`, `viewed`. Always present-tense action.
- **Role.** Never `admin:hardDelete`. Roles are separate from actions — same action with different role default grants.
- **Negation.** Never `cannotView`. Permissions are positive grants.
- **Module name.** Never `m9:invoices:create`. Module is implied by resource.

---

═══════════════════════════════════════════════════════════════════
# 2. Verb taxonomy
═══════════════════════════════════════════════════════════════════

Every action verb in the system must be drawn from one of these eight categories.

## 2.1 View verbs (read-only access)

| Verb | Meaning | Example |
|---|---|---|
| `view` | Generic view (use with qualifier) | `clients:view:list` |
| `viewList` | List view (collection) | `clients:viewList` |
| `viewDetail` | Single entity detail | `clients:viewDetail` |
| `viewMy` | Filtered to user's own data | `clients:viewMy` |
| `viewAll` | Unfiltered cross-tenant view (Admin) | `gl_journal_entries:viewAll` |
| `viewHistory` | Historical/audit view | `gl_journal_entries:viewHistory` |
| `viewMappings` | View entity relationships | `coa:viewMappings` |
| `viewAuditLog` | Module audit drilldown | `clients:viewAuditLog` |
| `viewParameters` | View configurable params | `reports:viewParameters` |
| `viewHistoricalRuns` | View past executions | `reports:viewHistoricalRuns` |
| `export` | Generic export | `clients:export` |
| `exportPdf` | PDF export (often eight-layer protected) | `quotes:exportPdf` |
| `exportCsv` | CSV export | `reports:exportCsv` |
| `exportExcel` | Excel export | `reports:exportExcel` |

**Compound view verbs** (acceptable):
- `viewBanking` / `viewBankingDetails` — banking-section view (gated)
- `viewLaborRates` — labor-rate section view
- `viewT5018Ytd` — T5018-section view
- `viewWsib` — WSIB-section view
- `viewWorkerManifest` — worker manifest section view
- `viewSourceTraceability` — source drill-back view (M11)

These are sub-views of an entity treated as separate actions for fine-grained gating.

## 2.2 Create verbs (entity creation)

| Verb | Meaning | Example |
|---|---|---|
| `create` | Generic create | `clients:create` |
| `createFrom<source>` | Create from another entity | `invoices:createFromQuote`, `projects:createFromQuote` |
| `generate` | Generate something derivable | `tax_filings:generateHstGstReturn` |
| `generateNext` | Generate next in series | `recurring_invoice_templates:generateNext` |
| `importCsv` | Bulk import via CSV | `clients:importCsv` |
| `importFromTemplate` | Import from template | `coa:importFromTemplate` |
| `duplicate` | Copy existing entity | `custom_reports:duplicate` |

## 2.3 Edit verbs (entity modification)

| Verb | Meaning | Example |
|---|---|---|
| `edit` | Generic edit | `clients:edit` |
| `editBasic` | Basic info edit | `clients:editBasic` |
| `editAdvanced` | Advanced/admin edit | `clients:editAdvanced` |
| `editDraft` | Edit only in Draft state | `invoices:editDraft` |
| `editAddress` | Edit address section | `clients:editAddress` |
| `editBilling` | Edit billing section | `clients:editBilling` |
| `editBankingDetails` | Edit banking (gated) | `vendors:editBankingDetails` |
| `editRequirements` | Edit gate/requirement config | `vendors:editRequirements` |
| `applyDiscount` | Apply discount workflow | `quotes:applyDiscount` |
| `applyTax` | Apply tax | `invoices:applyTax` |
| `applyTemplate` | Apply template | `appointments:applyTemplate` |
| `applyMultiplier` | Apply rate multiplier | `contractor_labor_rates:applyMultiplier` |
| `recategorize` | Change category | `coa:recategorize` |
| `addLine` | Add line to entity | `invoices:addLine` |
| `removeLine` | Remove line from entity | `invoices:removeLine` |
| `setEffectiveDate` | Set/change effective date | `contractor_labor_rates:setEffectiveDate` |

## 2.4 State-transition verbs (lifecycle)

| Verb | Meaning | Example |
|---|---|---|
| `submit` | Submit for approval | `invoices:submit` |
| `approve` | Approve | `invoices:approve` |
| `reject` | Reject | `invoices:reject` |
| `dispute` | Dispute (e.g., AP bill) | `ap_bills:dispute` |
| `send` | Send to recipient | `invoices:send` |
| `resend` | Re-send | `invoices:resend` |
| `void` | Void/cancel terminal | `invoices:void` |
| `cancel` | Cancel | `appointments:cancel` |
| `reopen` | Reopen from terminal state | `invoices:reopen` (A only) |
| `archive` | Archive (soft delete) | `clients:archive` |
| `unarchive` | Restore from archive | `clients:unarchive` |
| `markPaid` | Mark paid (shortcut) | `invoices:markPaid` |
| `markComplete` | Mark complete | `appointments:markComplete` |
| `recordPayment` | Record payment (compound) | `payments:create` (preferred) |
| `recordBounce` | Record payment bounce | `payments:recordBounce` |
| `recordRefund` | Record refund | `payments:recordRefund` |
| `recordNoShow` | Record customer no-show | `appointments:recordNoShow` |
| `recordCompleted` | Record completion (sub-context) | `contractor_work_orders:recordCompleted` |
| `recordAcknowledgement` | Contractor acknowledged WO | `contractor_work_orders:recordAcknowledgement` |
| `recordOnSite` | Record on-site arrival | `appointments:recordOnSite` |
| `recordInProgress` | Record in-progress | `contractor_work_orders:recordInProgress` |
| `promote` | Promote (e.g., Lead → Active) | `clients:promote` |
| `softClose` | Soft close period (Acc) | `accounting_periods:softClose` |
| `hardClose` | Hard close (A + Acc co-sign) | `accounting_periods:hardClose` |
| `reopenPeriod` | Reopen closed period | `accounting_periods:reopenPeriod` |
| `pause` | Pause | `recurring_invoice_templates:pause` |
| `resume` | Resume | `recurring_invoice_templates:resume` |
| `escalate` | Escalate (dispatch, breach) | `dispatch_records:escalate` |
| `acknowledge` | Acknowledge alert | `sla_breach_alerts:acknowledge` |
| `releaseRetention` | Release retention | `contractor_work_orders:releaseRetention` |
| `startLienPeriod` | Start lien clock | `contractor_work_orders:startLienPeriod` |
| `closeWO` | Close after lien deadline | `contractor_work_orders:closeWO` |

## 2.5 Configuration verbs (settings-style)

| Verb | Meaning | Example |
|---|---|---|
| `configure` | Generic configuration | `workflow_rules:configure` |
| `configureRoleAccess` | Configure role defaults | `reports:configureRoleAccess` |
| `configureUserOverride` | Configure per-user override | `reports:configureUserOverride` |
| `configureMappings` | Configure mappings | `accounting_integrations:configureMappings` |
| `configureAlertThresholds` | Configure alerts | `sla_breach_alerts:configureAlertThresholds` |
| `configureFilingSchedule` | Configure tax filing schedule | `tax_filings:configureFilingSchedule` |
| `setBudget` | Set budget | `accounting_periods:setBudget` |
| `runFxRevaluation` | Run FX revaluation | `fx_revaluation_runs:run` |
| `runPeriodEndChecks` | Run period-end checks | `accounting_periods:runPeriodEndChecks` |
| `runReconciliation` | Run reconciliation | `bank_reconciliation_sessions:run` |
| `triggerSync` | Trigger integration sync | `accounting_integrations:triggerSync` |

## 2.6 Communication verbs

| Verb | Meaning | Example |
|---|---|---|
| `send` | Send to recipient | `invoices:send` |
| `sendReminder` | Send reminder | `invoices:sendReminder` |
| `sendReceipt` | Send payment receipt | `payments:sendReceipt` |
| `sendStatement` | Send statement | `customer_statements:sendStatement` |
| `sendBatch` | Send batch | `customer_statements:sendBatch` |
| `notify` | Generic notify | `appointments:notify` |
| `mentionTeam` | @mention in comm log | `clients:mentionTeam` |

## 2.7 Admin verbs (typically A-only)

| Verb | Meaning | Example |
|---|---|---|
| `hardDelete` | Permanent delete | `clients:hardDelete` |
| `merge` | Merge duplicate entities | `clients:merge` |
| `overrideSla` | Override SLA (Admin exception §0.4 #7) | `clients:overrideSla` |
| `overrideNormalScheduling` | Emergency dispatch override | `dispatch_records:overrideNormalScheduling` |
| `recordSlaWaiver` | Waive SLA breach | `sla_breach_alerts:recordSlaWaiver` |
| `manualOverrideWsib` | Override WSIB auto-block (§0.4 #12) | `contractors:manualOverrideWsib` |
| `manualOverrideInsurance` | Override insurance auto-block | `vendors:manualOverrideInsurance` |
| `runOnBehalf` | Run report as another user | `reports:runOnBehalf` |
| `forcePosting` | Force GL post bypassing checks | `gl_journal_entries:forcePosting` |
| `deleteSnapshot` | Delete report snapshot | `report_snapshots:deleteSnapshot` |

## 2.8 Workflow verbs (multi-step)

| Verb | Meaning | Example |
|---|---|---|
| `executePaymentRun` | Execute AP payment batch | `ap_payment_runs:executePaymentRun` |
| `performThreeWayMatch` | 3-way match PO + Receipt + Bill | `ap_bills:performThreeWayMatch` |
| `runReport` | Execute a report | `reports:runReport` |
| `bulkReverse` | Bulk reverse GL entries | `gl_journal_entries:bulkReverse` |
| `generateBatch` | Generate batch (T5018, T4) | `tax_filings:generateBatch` |

---

═══════════════════════════════════════════════════════════════════
# 3. Qualifier taxonomy
═══════════════════════════════════════════════════════════════════

Qualifiers further refine action scope. Drawn from a fixed set.

## 3.1 Scope qualifiers (data scope)

Used to narrow which records the action applies to.

| Qualifier | Meaning | Example |
|---|---|---|
| `:list` | List/collection view | `clients:view:list` |
| `:detail` | Single entity detail | `clients:view:detail` |
| `:my` | Records owned by user | `clients:view:my`, `appointments:view:my` |
| `:team` | Records owned by user's team | `projects:view:team` |
| `:assigned` | Records assigned to user | `tasks:view:assigned` |
| `:project` | Records within user's project | `gl_journal_entries:view:project` |
| `:tier` | Records of specific customer tier | `clients:view:tier` |
| `:category` | Records of specific category | `vendors:view:category` |
| `:all` | All records unrestricted | `clients:view:all` (Admin) |

## 3.2 State qualifiers (entity state)

Used when an action is only allowed in specific entity state.

| Qualifier | Meaning | Example |
|---|---|---|
| `:draft` | Only when entity is Draft | `invoices:edit:draft` (typically `editDraft` compound verb form) |
| `:pending` | Only when Pending | `invoices:edit:pending` |
| `:approved` | Only when Approved | `invoices:edit:approved` |
| `:sent` | Only when Sent | `invoices:resend:sent` |
| `:paid` | Only when Paid | `invoices:reopen:paid` (A only) |
| `:void` | Only when Void | `invoices:reopen:void` (A only) |

Note: state qualifiers are often expressed via compound verbs in the audit (`editDraft` instead of `edit:draft`). Both forms are valid; compound verbs preferred when the action is fundamentally distinct in that state.

## 3.3 Modal qualifiers (read/write/execute/delete)

Used when the same noun has multiple distinct modes.

| Qualifier | Meaning | Example |
|---|---|---|
| `:read` | Read mode | `bank_accounts:view:read` |
| `:write` | Write mode | `bank_accounts:edit:write` |
| `:execute` | Execute mode (run, post) | `gl_journal_entries:post:execute` |
| `:delete` | Delete mode | (rare; hardDelete is preferred verb) |
| `:manual` | Manual mode (vs system) | `gl_journal_entries:create:manual` |
| `:auto` | Auto mode (vs manual) | `gl_journal_entries:create:auto` (system-generated) |

## 3.4 Field-section qualifiers (sub-section gating)

Used for field-level visibility on entity sub-sections. These map to `visibility.*` flags.

| Qualifier | Meaning | Example |
|---|---|---|
| `:banking` | Banking section | `vendors:view:banking` |
| `:labor_rates` | Labor rates section | `contractors:view:labor_rates` |
| `:profit` | Profit/margin field | `invoices:view:profit` |
| `:internal_notes` | Internal notes field | `clients:view:internal_notes` |
| `:executive` | Executive-only section | `reports:view:executive` |
| `:payroll` | Payroll section | `employees:view:payroll` |
| `:cost_rate` | Cost rate field | `employees:view:cost_rate` |
| `:geolocation` | Geolocation field | `appointments:view:geolocation` |
| `:worker_manifest` | Worker manifest section | `contractors:view:worker_manifest` |
| `:tax_forms` | Tax forms section | `vendors:view:tax_forms` |
| `:wsib` | WSIB section | `contractors:view:wsib` |
| `:full_card_number` | Full card number (PCI) | `payments:view:full_card_number` (never granted) |

---

═══════════════════════════════════════════════════════════════════
# 4. Resource taxonomy
═══════════════════════════════════════════════════════════════════

The complete list of resources across all 13 modules. Each maps to a database table (or alias).

## 4.1 M1: Clients + Sites + Contacts

`clients`, `client_addresses`, `client_contacts`, `client_sla_config`, `sites`, `site_response_times`, `contacts` (misc), `service_contracts`, `client_communication_log`, `client_communication_preferences`, `client_onboarding_gates`, `client_payment_terms`, `client_holdback_config`, `client_tags`, `client_custom_fields`

## 4.2 M2: Employees + Permissions

`employees`, `employee_certifications`, `employee_territories`, `employee_absences`, `employee_documents`, `employee_banking`, `employee_payroll`, `users`, `roles`, `permissions`, `permission_overrides`, `request_admin_access`, `effective_permissions_cache`

## 4.3 M3: Settings

`settings`, `currency_codes`, `tax_codes`, `cost_centers`, `customer_types`, `customer_tiers`, `payment_methods`, `payment_terms`, `email_templates`, `pdf_templates`, `sms_templates`, `workflow_rules`, `notification_rules`, `custom_field_definitions`, `address_types`, `contact_types`, `relationship_types`, `language_codes`

## 4.4 M4: Dashboard

`dashboards`, `dashboard_widgets`, `dashboard_layouts`, `widget_definitions`

## 4.5 M5: Quotes

`quotes`, `quote_lines`, `quote_line_taxes`, `quote_terms`, `quote_revisions`, `quote_communications`, `quote_portal_access`, `quote_acceptance_records`

## 4.6 M6: Projects

`projects`, `project_phases`, `project_tasks`, `project_costs`, `project_committed_costs`, `project_actual_costs`, `project_resources`, `change_orders`, `change_order_amendments`, `commissioning_records`, `commissioning_test_results`, `handover_packages`, `project_timesheets`, `project_acceptance`, `lien_records`, `project_progress_claims`, `project_warranty_terms`

## 4.7 M7: Inventory

`inventory_items`, `inventory_categories`, `stock_locations`, `inventory_movements` (append-only), `serial_numbers`, `inventory_adjustments`, `inventory_photos`, `purchase_orders`, `po_lines`, `po_receipts`, `vendor_catalog`, `inventory_reservations`, `fifo_layers`

## 4.8 M8: Vendors

`vendors`, `vendor_contacts`, `vendor_banking`, `vendor_t5018_records`, `vendor_w9_w8ben`, `vendor_onboarding_requirements`, `vendor_onboarding_gate_fulfillments`, `vendor_insurance_certs`, `vendor_wsib_records`, `vendor_performance_scores` (append-only)

## 4.9 M9: Invoices

`invoices`, `invoice_lines`, `invoice_taxes`, `invoice_payments`, `payments`, `credit_notes`, `credit_note_lines`, `customer_statements`, `ap_bills`, `ap_bill_lines`, `ap_bill_payments`, `ap_payment_runs`, `ap_payment_run_lines`, `recurring_invoice_templates`

## 4.10 M10: Subcontractors

`contractors`, `contractor_contacts`, `contractor_labor_rates`, `contractor_skills`, `contractor_territories`, `contractor_worker_manifest`, `contractor_performance_scores` (append-only), `contractor_onboarding_requirements`, `contractor_onboarding_gate_fulfillments`, `contractor_insurance_certs`, `contractor_wsib_records`, `contractor_t5018_records`, `contractor_work_orders`, `contractor_wo_line_items`

## 4.11 M11: Financials

`coa` (chart_of_accounts), `gl_journal_entries`, `gl_journal_lines` (append-only), `bank_accounts`, `bank_transactions`, `bank_reconciliation_sessions`, `accounting_periods`, `tax_filings`, `recurring_journal_templates`, `fx_revaluation_runs`, `accounting_integrations`, `accounting_integration_sync_log`

## 4.12 M12: Scheduling

`appointments`, `appointment_resources`, `appointment_recurrence_rules`, `appointment_change_log` (append-only), `resource_availability_blocks`, `dispatch_records`, `schedule_templates`, `sla_breach_alerts`, `external_calendar_sync_state`, `travel_time_estimates`

## 4.13 M13: Reports

`reports`, `report_definitions`, `custom_reports`, `report_subscriptions`, `scheduled_report_deliveries`, `report_snapshots` (immutable), `report_execution_log`, `report_dashboards`, `report_categories`

---

═══════════════════════════════════════════════════════════════════
# 5. Action grouping for permissions editor UI
═══════════════════════════════════════════════════════════════════

The M2 six-tab permissions editor needs a hierarchy. With ~1260 actions, flat listing is unusable.

## 5.1 Tier hierarchy

**Tier 1 — Module group** (13 tabs corresponding to M1-M13)

**Tier 2 — Resource within module** (typically 3-10 resources per module)

**Tier 3 — Action category within resource:**
- View
- Create
- Edit
- State Transitions
- Communication
- Reporting
- Admin Override
- Configuration

**Tier 4 — Individual action** (leaf node — the actual permission row)

## 5.2 Plus orthogonal cross-cuts (separate tabs)

Beyond the module-tab structure, the permissions editor exposes orthogonal cross-cuts that span modules:

| Cross-cut tab | Contents |
|---|---|
| **Field Visibility** | All `visibility.*` flags (50+) — controlled separately from action grants |
| **Data Scopes** | Per-user `my` / `team` / `project` / `all` overlays — controlled per role |
| **Cross-Module Patterns** | Separation of duties, regulatory expiry, geolocation retention — usually system-locked but operator can configure thresholds |
| **Per-User Overrides** | List of users with overrides + the specific actions overridden + audit |
| **Custom Roles** | Role builder; clone existing role + modify |
| **Audit Log** | All permission grants/revokes/overrides with who/when/why |

## 5.3 The six-tab editor from M2 — now specified

From M2 we committed to a six-tab permissions editor. Now refined:

| Tab | Purpose |
|---|---|
| 1. **Actions** | The 13-module hierarchy (Tier 1-4); core action grants |
| 2. **Field Visibility** | The orthogonal `visibility.*` flag set |
| 3. **Data Scopes** | Per-role scope qualifiers (`my`/`team`/`project`/`all`) |
| 4. **Overrides** | Per-user overrides + audit |
| 5. **Custom Roles** | Role builder + clone/modify |
| 6. **Audit Log** | Permission change audit (append-only) |

## 5.4 UI presentation rules per §0.4 #2

Every gated control renders in one of three UI states:

- **hidden** — control completely absent from UI (default for cross-user data SR doesn't have)
- **disabled** — control visible but greyed out (default for transitional states where action would fail)
- **interactive** — control fully usable (default for granted permissions)

Operator can override default per action per role via the permissions editor.

---

═══════════════════════════════════════════════════════════════════
# 6. Full action catalog (by module)
═══════════════════════════════════════════════════════════════════

Every action in the system, normalized to the naming convention from §1, with default role grants.

Conventions for the catalog:
- ✓ = granted by default
- ⊘ = explicitly denied (not just absent — actively blocked)
- 🔒 = sensitive (requires audit-on-grant)
- ⚠ = high-impact (requires confirmation UI before execution)
- (scope) = data scope automatically applied (e.g., "my" = own records only)

## 6.1 Module 1 — Clients + Sites + Contacts (~110 actions)

### Clients lifecycle

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `clients:viewList` | ✓ | ✓ | ✓(my) | ✓(assigned) | ✓ | ✓ | |
| `clients:viewDetail` | ✓ | ✓ | ✓(my) | ✓(assigned) | ✓ | ✓ | |
| `clients:viewAll` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `clients:create` | ✓ | ✓ | ✓ | ⊘ | ✓ | ⊘ | |
| `clients:editBasic` | ✓ | ✓ | ✓(my) | ⊘ | ✓ | ⊘ | |
| `clients:editAdvanced` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only — tier, holdback, SLA |
| `clients:editAddress` | ✓ | ✓ | ✓(my) | ⊘ | ✓ | ⊘ | |
| `clients:editBilling` | ✓ | ⊘ | ⊘ | ⊘ | ✓ | ⊘ | Acc + A only |
| `clients:editTier` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `clients:editHoldbackConfig` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `clients:editPaymentTerms` | ✓ | ⊘ | ⊘ | ⊘ | ✓ | ⊘ | |
| `clients:editLateFeePolicy` | ✓ | ⊘ | ⊘ | ⊘ | ✓ | ⊘ | |
| `clients:editOnboardingGates` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `clients:overrideSla` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | 🔒 A only — §0.4 #7 contractual integrity exception |
| `clients:archive` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `clients:unarchive` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `clients:hardDelete` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | 🔒⚠ A only |
| `clients:merge` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | 🔒⚠ A only |
| `clients:promote` | ✓ | ✓ | ✓ | ⊘ | ⊘ | ⊘ | Lead → Active |
| `clients:putOnStop` | ✓ | ⊘ | ⊘ | ⊘ | ✓ | ⊘ | Blocks send/dispatch |
| `clients:releaseStop` | ✓ | ⊘ | ⊘ | ⊘ | ✓ | ⊘ | |
| `clients:importCsv` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `clients:export` | ✓ | ✓ | ✓(my) | ⊘ | ✓ | ⊘ | |
| `clients:view:internal_notes` | ✓ | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | Field-level §6.X |
| `clients:viewAuditLog` | ✓ | ✓(assigned) | ⊘ | ⊘ | ✓ | ⊘ | |

### Sites

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `sites:viewList` | ✓ | ✓ | ✓(my) | ✓(assigned) | ✓ | ✓ | |
| `sites:viewDetail` | ✓ | ✓ | ✓(my) | ✓(assigned) | ✓ | ✓ | |
| `sites:create` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `sites:edit` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `sites:editSlaResponseTime` | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | ⊘ | |
| `sites:editAccessInfo` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `sites:viewEquipmentInstalled` | ✓ | ✓ | ✓(my) | ✓(assigned) | ⊘ | ⊘ | |
| `sites:archive` | ✓ | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | |

### Contacts (per-client and standalone)

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `client_contacts:viewList` | ✓ | ✓ | ✓(my) | ⊘ | ✓ | ⊘ | |
| `client_contacts:create` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `client_contacts:edit` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `client_contacts:delete` | ✓ | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | |
| `client_contacts:setPrimary` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |

### Service contracts

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `service_contracts:viewList` | ✓ | ✓ | ✓(my) | ⊘ | ✓ | ⊘ | |
| `service_contracts:create` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `service_contracts:edit` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `service_contracts:renew` | ✓ | ✓ | ✓(my) | ⊘ | ✓ | ⊘ | |
| `service_contracts:terminate` | ✓ | ✓(my) | ⊘ | ⊘ | ✓ | ⊘ | |

### Communication log

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `client_communication_log:viewList` | ✓ | ✓ | ✓(my) | ✓(assigned) | ✓ | ✓ | |
| `client_communication_log:createEntry` | ✓ | ✓ | ✓(my) | ✓(assigned) | ✓ | ⊘ | |
| `client_communication_log:editEntry` | ✓ | ✓(own) | ✓(own) | ✓(own) | ⊘ | ⊘ | Own entries only |
| `client_communication_log:deleteEntry` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |

### Reports for M1

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `clients:viewReport:retention` | ✓ | ✓ | ⊘ | ⊘ | ✓ | ⊘ | |
| `clients:viewReport:revenue` | ✓ | ✓ | ⊘ | ⊘ | ✓ | ✓(no detail) | |
| `clients:viewReport:onboardingStatus` | ✓ | ✓ | ✓(my) | ⊘ | ⊘ | ⊘ | |

**Module 1 actions total: ~110.** Full enumeration would expand each row above with all sub-resources (sites SLA precedence, contact roles, holdback exception workflows, etc.); maintained in v0.2 as actionable catalog.

## 6.2 Module 2 — Employees + Permissions (~80 actions)

*[Full catalog same pattern. Notable rows:]*

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `employees:viewList` | ✓ | ✓ | ⊘ | ✓(team) | ✓ | ✓ | |
| `employees:viewDetail` | ✓ | ✓(team) | ⊘ | ✓(self) | ✓ | ⊘ | |
| `employees:viewBanking` | ✓ | ⊘ | ⊘ | ⊘ | ✓(audit-on-read) | ⊘ | 🔒 |
| `employees:viewPayroll` | ✓ | ⊘ | ⊘ | ✓(self) | ✓ | ⊘ | |
| `employees:viewCertifications` | ✓ | ✓ | ⊘ | ✓(self) | ✓ | ⊘ | |
| `employees:editCertifications` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A or HR-role |
| `employees:create` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A or HR-role |
| `permissions:viewRoles` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `permissions:editRoleGrants` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | 🔒 A only |
| `permissions:setUserOverride` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | 🔒 A only |
| `request_admin_access:create` | ✓ | ✓ | ✓ | ✓ | ✓ | ⊘ | Any user can request |
| `request_admin_access:approve` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `request_admin_access:reject` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |

## 6.3 Module 3 — Settings (~270 actions)

*[Settings module has the most actions because of the 29 operator-editable lookups + 12 custom-field-definition managers + ~70 sub-pages. Pattern is consistent: A-only for most editor actions; specific sub-areas (Email Templates, PDF Templates, Workflow Rules) may be granted to Acc or PM with reason.]*

Key categories:
- `settings:view:*` — broad view across config (A, Acc default)
- `settings:edit:*` — narrow edit per-section
- `custom_fields:create:*` — per-entity custom field creation (A only)
- `workflow_rules:*` — workflow rule CRUD (A only)
- `email_templates:*` / `pdf_templates:*` — template management (A + designated role)
- Tax codes, currencies, cost centers — A only for create/edit

## 6.4 Module 4 — Dashboard (~35 actions)

*[Smaller surface. Notable rows:]*

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `dashboards:view:my` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Default role layout |
| `dashboards:edit:my` | ✓ | ✓ | ✓ | ✓ | ✓ | ⊘ | Personal customization |
| `dashboards:configureRoleDefault` | ✓ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | A only |
| `dashboard_widgets:view:list` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `dashboard_widgets:resetToDefault` | ✓ | ✓ | ✓ | ✓ | ✓ | ⊘ | |

## 6.5 Module 5 — Quotes (~85 actions)

*[Lifecycle pattern same as M1 with additional state transitions:]*

| Action | A | PM | SR | Tech | Acc | VO | Notes |
|---|---|---|---|---|---|---|---|
| `quotes:viewList` | ✓ | ✓ | ✓(my) | ⊘ | ✓ | ✓ | |
| `quotes:create` | ✓ | ✓ | ✓ | ⊘ | ⊘ | ⊘ | |
| `quotes:edit:draft` | ✓ | ✓(my) | ✓(my) | ⊘ | ⊘ | ⊘ | Draft only |
| `quotes:applyDiscount` | ✓ | ✓(my) | ✓(my, threshold) | ⊘ | ⊘ | ⊘ | Threshold-gated per Settings |
| `quotes:submit` | ✓ | ✓(my) | ✓(my) | ⊘ | ⊘ | ⊘ | |
| `quotes:approve` | ✓ | ✓(value-gated) | ⊘ | ⊘ | ⊘ | ⊘ | Threshold per Settings |
| `quotes:send` | ✓ | ✓(my, approved) | ✓(my, approved) | ⊘ | ⊘ | ⊘ | |
| `quotes:exportPdf` | ✓ | ✓(my) | ✓(my) | ⊘ | ✓ | ⊘ | Eight-layer protected |
| `quotes:view:margin` | ✓ | ✓ | ⊘ | ⊘ | ✓ | ⊘ | Field-level — hidden from SR |
| `quote_portal_access:create` | ✓ | ✓(my) | ✓(my) | ⊘ | ⊘ | ⊘ | Signed URL for portal |

## 6.6 Module 6 — Projects (~110 actions)

*[Largest action set after Settings + Invoices. Three-state costing + change orders + commissioning + handover + lien tracking each generate distinct action groups.]*

Key categories:
- `projects:*` — lifecycle (create, edit, archive, view)
- `project_phases:*` / `project_tasks:*` — phase + task management
- `project_costs:view:*` — three-state costing (estimated, committed, actual) with field-level visibility
- `change_orders:*` — full change order workflow with customer signature
- `commissioning_records:*` — append-only commissioning ledger
- `handover_packages:*` — handover package assembly
- `project_timesheets:*` — time entries (read by M11 for payroll)
- `lien_records:*` — lien deadline tracking

## 6.7 Module 7 — Inventory (~95 actions)

*[Notable: append-only `inventory_movements` ledger means certain actions are write-once.]*

Key categories:
- `inventory_items:*` — item master
- `stock_locations:*` — multi-location management
- `inventory_movements:create` — write to ledger (append-only; no edit/delete)
- `serial_numbers:*` — serial lifecycle
- `purchase_orders:*` / `po_receipts:*` — PO workflow
- `vendor_catalog:syncWithVendor` — catalog sync (A, Acc)

## 6.8 Module 8 — Vendors (~65 actions)

*[Notable: T5018 YTD + insurance/WSIB expiry + performance ledger.]*

Key categories:
- `vendors:*` — vendor master
- `vendor_banking:*` — encrypted, audit-on-read (Acc only)
- `vendor_t5018_records:*` — T5018 management (Canada)
- `vendor_insurance_certs:*` / `vendor_wsib_records:*` — compliance tracking with auto-PO-block
- `vendors:manualOverrideInsurance` — Admin exception per §0.4 #12

## 6.9 Module 9 — Invoices (~115 actions)

*[Largest because of dual flows (AR + AP) plus payments, credit notes, statements, payment runs, recurring.]*

Key categories:
- AR side: `invoices:*`, `payments:*`, `credit_notes:*`, `customer_statements:*`, `recurring_invoice_templates:*`
- AP side: `ap_bills:*`, `ap_payment_runs:*`
- 3-way match: `ap_bills:performThreeWayMatch`
- Separation of duties enforced per §0.4 #11 (AP bill creator ≠ approver; payment run creator ≠ approver)
- `payments:view:full_card_number` — never granted (PCI compliance)
- Customer payment portal — signed URL actions outside the role hierarchy

## 6.10 Module 10 — Subcontractors (~75 actions)

*[Mirror of vendors with labor-specific extensions.]*

Key categories:
- `contractors:*` — contractor master
- `contractor_labor_rates:*` — versioned rates with effective-dating
- `contractor_skills:*` / `contractor_territories:*` — matching inputs
- `contractor_worker_manifest:*` — individual workers + cert verification
- `contractor_wsib_records:*` — WSIB with auto-WO-block per §0.4 #12
- `contractor_t5018_records:*` — mandatory T5018 tracking
- `contractor_work_orders:*` — WO lifecycle with lien deadline tracking

## 6.11 Module 11 — Financials (~90 actions)

*[GL backbone with strict separation of duties.]*

Key categories:
- `coa:*` — chart of accounts
- `gl_journal_entries:*` — auto-posted entries + manual entries (creator ≠ poster per §0.4 #11)
- `bank_accounts:*` / `bank_reconciliation_sessions:*` — bank rec
- `accounting_periods:softClose` (Acc) / `:hardClose` (A + Acc co-sign per §0.4 #11)
- `tax_filings:*` — HST/GST/PST/T4/T5018 generation
- `fx_revaluation_runs:*` — FX revaluation
- `accounting_integrations:*` — QBO/Xero/Sage 50

## 6.12 Module 12 — Scheduling (~75 actions)

*[Heaviest cross-module reader. Five-dimensional auto-suggest engine.]*

Key categories:
- `appointments:*` — appointment lifecycle with state transitions
- `appointment_recurrence_rules:*` — series management
- `appointment_change_log:*` — append-only audit
- `dispatch_records:*` — emergency dispatch with override
- `sla_breach_alerts:*` — SLA enforcement
- `schedule_templates:*` — template management
- `appointments:overrideCertExpiry` — Admin exception per §0.4 #12 extended to scheduling
- `appointments:recordSlaWaiver` — Admin exception with reason

## 6.13 Module 13 — Reports (~55 actions)

*[Cross-module reporting layer.]*

Key categories:
- `reports:viewLibrary` / `reports:runReport` — execution
- `reports:viewReport:[id]` — per-report access (gated per report_definitions.default_role_access)
- `custom_reports:*` — operator-defined
- `report_subscriptions:*` — user subscriptions
- `scheduled_report_deliveries:*` — scheduled delivery
- `report_snapshots:*` — immutable historical snapshots
- `reports:view:cross_user_data` — cross-user data flag (explicit grant required)
- `reports:runOnBehalf` — Admin exception

---

═══════════════════════════════════════════════════════════════════
# 7. Cross-references between actions
═══════════════════════════════════════════════════════════════════

## 7.1 Action dependencies

Some actions require other actions as prerequisites. Captured here so the resolution algorithm (Pass 3) can enforce them.

| Action | Requires (also-granted) |
|---|---|
| `invoices:send` | `invoices:viewDetail`, `clients:viewDetail` (target client), `email_templates:read` (template used) |
| `quotes:approve` | `quotes:viewDetail`, `quotes:view:margin` (to verify pricing) |
| `appointments:create` | `appointments:viewDetail` (the created one), plus reads of M1 site + M2 employee availability |
| `contractor_work_orders:create` | `contractors:viewDetail` (target contractor), `contractor_labor_rates:viewList` |
| `payments:create` | `invoices:viewDetail` (target invoice), `payments:view:list` (to check duplicates) |
| `gl_journal_entries:create:manual` | `coa:viewList` (to select accounts), `accounting_periods:viewList` (to verify period open) |
| `clients:overrideSla` | `clients:viewDetail`, audit row capture (always) |
| `contractors:manualOverrideWsib` | `contractors:viewDetail`, `contractor_wsib_records:viewList`, reason capture (always) |

## 7.2 Mutually exclusive actions (separation of duties §0.4 #11)

The resolution algorithm enforces these exclusions at runtime per-record:

| Action A | Mutually exclusive with Action B (same user, same record) |
|---|---|
| `ap_bills:create` (for record X) | `ap_bills:approve` (for same record X) |
| `ap_payment_runs:create` | `ap_payment_runs:approve` (same run) |
| `gl_journal_entries:create:manual` | `gl_journal_entries:post` (same entry) |
| `accounting_periods:softClose` (user A) | `accounting_periods:hardClose` (user A — needs Acc co-signer who is different user) |

## 7.3 Action chains (multi-step workflows)

These represent natural workflows where multiple actions are typically performed in sequence, and the runtime tracks the chain:

| Chain name | Sequence |
|---|---|
| Quote → Project | `quotes:approve` → `quotes:send` → portal acceptance → `projects:createFromQuote` |
| Project → Invoice (progress claim) | `project_phases:complete` → `invoices:createFromProject` → `invoices:submit` → `invoices:approve` → `invoices:send` |
| AP bill → Payment | `ap_bills:create` → `ap_bills:performThreeWayMatch` → `ap_bills:approve` (by different user) → `ap_payment_runs:addBill` → `ap_payment_runs:approve` (by different user) → `ap_payment_runs:executePaymentRun` |
| Period close | `accounting_periods:runPeriodEndChecks` → `accounting_periods:softClose` (Acc) → `accounting_periods:hardClose` (A + Acc co-sign) |
| Contractor WO completion | `contractor_work_orders:recordCompleted` → `contractor_work_orders:requestInspection` → `contractor_work_orders:approve` → `contractor_work_orders:startLienPeriod` → 60 days → `contractor_work_orders:closeWO` |

---

═══════════════════════════════════════════════════════════════════
# 8. Special-case action treatment
═══════════════════════════════════════════════════════════════════

## 8.1 Public actions (signed URL, no role)

Some actions execute via signed URL with no authenticated user:

- `quote_portal_access:viewQuoteOnline` — customer views quote
- `quote_portal_access:acceptQuote` — customer accepts (e-signature captured)
- `payments:viewInvoiceOnline` — customer views invoice for payment
- `payments:payOnline` — customer pays via Stripe

These don't go through role-based permissions. They're gated by signed URL token validation + scope-to-single-entity + expiry.

## 8.2 Admin exceptions (always with reason capture + audit)

Per §0.4 #7 and #12:

- `clients:overrideSla` — contractual integrity exception (A only)
- `clients:editTier` — A only
- `clients:editHoldbackConfig` — A only
- `clients:hardDelete` — A only, ⚠ confirmation, audit
- `vendors:manualOverrideInsurance` — A only, reason captured
- `vendors:manualOverrideWsib` — A only, reason captured
- `contractors:manualOverrideWsib` — A only, reason captured
- `contractors:manualOverrideInsurance` — A only, reason captured
- `appointments:overrideCertExpiry` — A only, reason captured
- `sla_breach_alerts:recordSlaWaiver` — A only, reason captured
- `dispatch_records:overrideNormalScheduling` — A or Dispatcher, reason captured
- `accounting_periods:reopenPeriod` — A only, reason captured
- `report_snapshots:deleteSnapshot` — A only, reason captured

All A-only override actions write to a dedicated audit table with `action`, `user_id`, `target_entity_id`, `reason`, `timestamp`.

## 8.3 System-generated actions (never user-initiated)

These actions execute automatically by the system in response to events:

- `gl_journal_entries:create:auto` — auto-posted GL entries on M5/M6/M7/M8/M9/M10/M2 state changes
- `vendor_t5018_records:autoUpdate` — T5018 YTD update on AP payment
- `contractor_t5018_records:autoUpdate` — T5018 YTD update
- `inventory_movements:create:auto` — auto inventory consumption on issue
- `commissioning_records:autoAttachUlcCert` — ULC fire alarm verification auto-attached
- `accounting_periods:lockGlEntries` — locking entries on period close
- `sla_breach_alerts:generate` — auto-generated based on threshold
- `client_communication_log:autoLogScheduleChange` — schedule change auto-notify
- `appointment_change_log:autoLogChange` — every appointment edit

System-generated actions are not gated by role permissions; they execute under a system user identity. But they ARE logged to audit.

## 8.4 Append-only actions (write-once, no edit/delete)

Per §0.4 #10. Actions that write to append-only ledgers:

- `inventory_movements:create` — no edit/delete after creation
- `commissioning_records:create` — append-only
- `project_acceptance:create` — append-only
- `vendor_performance_scores:create` — append-only
- `contractor_performance_scores:create` — append-only
- `gl_journal_lines:create` — append-only (reversals create offsetting entries)
- `appointment_change_log:create` — append-only
- `report_snapshots:create` — immutable; only `deleteSnapshot` by A
- `permission_audit_log:create` — append-only

The resolution algorithm enforces "no edit, no delete after creation" for these resources.

---

═══════════════════════════════════════════════════════════════════
# 9. Open questions (Pass 1)
═══════════════════════════════════════════════════════════════════

1. **Compound verbs vs qualifier form** — should `editDraft` always be `edit:draft`? Decision: keep compound for state-distinct workflows (`markPaid`, `recordPayment`); use qualifier form for scope-distinct same workflows (`view:my` vs `view:all`). Both forms accepted in schema; the catalog uses compound where clearer.

2. **Per-record vs per-class actions** — Is `clients:overrideSla` a single permission, or one-permission-per-client? Decision: one permission grants the *capability*; the action enforces audit + reason at runtime per-record.

3. **Role inheritance** — Should custom roles inherit from base roles? Decision: NO at v1 (flat role model, clone-and-modify). Role hierarchy in Phase 2.

4. **Per-tenant action vocabulary** — Can operators add custom actions for custom modules? Decision: NO at v1 (fixed catalog). Custom actions Phase 2 when plugin architecture lands.

5. **Action versioning** — When we add a new action, how do existing role grants behave? Decision: new actions default to "denied for all" until A explicitly grants. Migration scripts add new actions to baseline roles per change log.

6. **Action deprecation** — How do we sunset an action? Decision: mark deprecated in catalog; runtime keeps it functional for 1 release; clean up in second release. Audit reads always preserved.

---

═══════════════════════════════════════════════════════════════════
# 10. What's next (Pass 2 preview)
═══════════════════════════════════════════════════════════════════

**Pass 2: Database schema.**

The action vocabulary catalog above gives us the inventory. Pass 2 designs the tables that store and resolve permissions at runtime:

- `permissions` — master action catalog (≈1260 rows; one per action; populated from this document)
- `roles` — role definitions (Admin, PM, SR, Tech, Sub, Acc, VO + custom)
- `role_permissions` — junction (which roles get which actions by default)
- `user_permission_overrides` — per-user overrides (grant/revoke specific actions)
- `field_visibility_definitions` — the 50+ `visibility.*` flags
- `role_field_visibility` — role defaults
- `user_field_visibility_overrides` — per-user overrides
- `data_scope_definitions` — the scope qualifiers (`my`/`team`/`project`/`all`)
- `role_data_scopes` — role defaults
- `user_data_scope_overrides` — per-user overrides
- `permission_audit_log` — append-only audit (all grants/revokes/overrides)
- `effective_permissions_cache` — denormalized cache for fast runtime lookups

Plus the cross-cutting tables:
- `separation_of_duties_constraints` — defines mutually-exclusive action pairs
- `regulatory_expiry_block_overrides` — overrides for §0.4 #12 auto-block
- `geolocation_retention_policy` — per-tenant retention config per §0.4 #13

**End of v0.1.** Pass 1 (Action Vocabulary Catalog) complete. ~1260 actions normalized to consistent naming. Verb taxonomy, qualifier taxonomy, resource taxonomy locked. Action grouping for permissions editor UI specified. Cross-references between actions documented. Special-case treatment (public, admin exceptions, system-generated, append-only) catalogued. Six open questions resolved with explicit decisions.

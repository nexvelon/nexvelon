# BUILD_STATE_AUDIT.md — Built-vs-Designed reality audit (REALITY-1)

> **READ-ONLY on code.** This audit changed no app code, no migration, no
> dependency. Its companion deliverables are the resynced `NEXVELON_ROADMAP.md`
> and the `CLAUDE_CONTEXT.md` "Current Session State" block — this document is
> the evidence behind those edits.

| Field | Value |
|---|---|
| **HEAD sha** | `f69b815d0999520853516050a965d669ac366690` |
| **Latest merged PR** | **#388** (SNAP-1 — daily balance snapshots) |
| **Highest migration** | **0124** (`0124_balance_snapshots.sql`); next free = 0125 |
| **Date** | 2026-09-24 |
| **Method** | Five parallel read-only sweeps over `app/`, `components/`, `lib/`, `supabase/migrations/` (124 numbered migrations), cross-checked against `NEXVELON_FEATURE_AUDIT.md`, `NEXVELON_PERMISSIONS_DESIGN.md`, and `docs/USER_FACING_CHANGELOG.md`. Verdicts cite files/tables actually opened, not the changelog alone. |

---

## 2. Executive summary

1. **The core ERP shipped end to end.** All 13 designed modules exist with real DB tables and server actions: Clients/Sites/Contacts, Users, Settings, Dashboard, Quotes, Projects & Jobs, Inventory, Vendors, Invoices/AR, Subcontractors, Financials, Scheduling, Reports. The roadmap listing them as "pending/upcoming" is stale by ~115 PRs.
2. **Two stale files misled every fresh session.** `CLAUDE_CONTEXT.md` said "PR #273 / migration 0075"; `NEXVELON_ROADMAP.md` still sequenced shipped modules as next-up. Both are corrected by this chunk.
3. **Depth is uneven.** Projects & Jobs (incl. the full Gantt arc), Dashboard, Invoices, Subcontractors and Quotes are deep and real. Settings and Reports shipped a fraction of their designed scope.
4. **Permissions is the largest genuine design gap.** What shipped (PERM-1..4 + DES-1/2) is a coarse-but-sound `role×resource×action` matrix with per-user overrides + audit. Of the designed ten-dimension model, **eight dimensions are absent or client-side-only** (see §4).
5. **P0 — live field-level confidentiality leak.** Inventory `unit_cost` (and quote margin, and internal notes) are hidden **client-side only** while the server returns them in the payload. A SalesRep/Technician/ViewOnly can read cost/margin via the network tab. `inventory/actions.ts` gates reads on `inventory:view` only; `viewCost` is enforced in `StockTab.tsx:49` et al.
6. **P0 — invoices write no audit trail.** `lib/api/invoices.ts` and `invoices/actions.ts` make **zero** `logActivity` calls; a core financial entity has no who-changed-what history despite `invoice` being an allowed `ACTIVITY_ENTITY_TYPES` value (§5 violation).
7. **Reports is a static gallery, not the designed platform.** ~14 of ~40 reports render; **no custom builder, no scheduled delivery, no subscriptions/history, and zero of the 7 designed report tables exist.**
8. **No client-facing portals anywhere.** The designed quote e-acceptance (`/q/[token]`) and invoice customer-payment portals were not built; only the internal client-onboarding `app/invite/[token]/client` route exists.
9. **All external integrations are label-only** — Stripe, QuickBooks/Xero/Sage 50. `SettingsPanes.tsx` confirms the integration list was removed.
10. **Two locked cross-cutting commitments are unbuilt:** FIFO inventory layers (§0.4 #8 — zero code references) and field-level margin/cost visibility as a server-enforced dimension (§0.4 — client-only today).
11. **Hygiene debt exists but §3 boilerplate is clean.** Every table created in migrations 0110–0124 has GRANT + RLS + policy. Dormant permission schema (0005/0006, ~21 tables) is dead and unreferenced; a `user_permission_overrides` schema collision (0006 vs 0115) exists.
12. **Build is green on the supported path.** `next build --turbopack` (a plain webpack `next build` breaks on `@react-pdf/renderer` ESM), typecheck clean, ~1,450+ vitest tests pass. This audit leaves all of that untouched.

---

## 3. Module-by-module: built vs designed

Designed scope from `NEXVELON_FEATURE_AUDIT.md` (§1–§13). "Exists" cites files/tables actually opened. Route counts are indicative — the build deliberately consolidated many designed multi-route trees into tabbed single-page views, so a low route count is not itself a gap; missing capabilities are.

| Module | Designed (one line) | What exists (evidence) | Materially missing | Conf. |
|---|---|---|---|---|
| **Clients / Sites / Contacts (M1)** | ~110 actions, per-site SLA precedence, holdback config, 15 lookup tables | `app/(app)/{clients,sites}/**`, `lib/api/clients.ts`, `client-invitations.ts`; tables `clients`/`sites`/`contacts` (0001) + invites (0056–0060) + tiers (0058/0061); bulk import; onboarding/pending review | Per-site **SLA engine** absent; client **holdback config** absent; **Contracts tab is a placeholder** (`ClientDetailView.tsx:406`); no dedicated `/contacts` detail route; ~half designed lookup tables absent | High |
| **Users / user-mgmt (M2)** | ~80 actions, employee HR (certs, multi-territory), six-tab editor | `app/(app)/users/**` (Users/Roles/Matrix/Role Baselines/Activity/Invitations), `RoleBaselineEditor`, `UserPermissionsSheet`; `profiles` (0002), `user_grants` (0029); per-user activity page | Employee **HR surface** (certifications, territories) not in Users — techs' certs live only under Settings→Techs | High |
| **Settings (M3)** | ~270 actions, ~70 sub-pages, Workflow Rules, email/PDF template editors, 16 tables | 23 sections; real+persisted: Company Profile, Branding/Themes (`custom_themes` 0117), Quote Defaults, Tiers, Classifications, Categories, Manufacturers, Locations, Techs+availability, Labour, Cost Codes, Working Calendar, Numbering, Tax, PO Email, Security | **Stubs:** Integrations (empty), Notifications (no persistence), API & Webhooks (fake toast), Billing (static), Audit/Backups display-only. **No Workflow Rules, no template editors.** ~35–40% of designed actions | High |
| **Dashboard (M4)** | ~35 actions, ~20 widgets, 6 role layouts, 3-way visibility gate | `lib/dashboard/widgets.ts` (10 split KPI tiles + charts + panels + quick-actions, all `canSeeWidget`-gated); templates (4); `dashboard_layout` (0122); **SNAP-1** `balance_snapshots` (0124) + cron + lazy capture + deltas/sparklines/"building history" | 4 templates vs 6 role layouts; ~12–14 widgets vs ~20. Otherwise the most complete module (exceeds design on balance history) | High |
| **Quotes (M5)** | 12 tables, 3 quote types, client portal e-acceptance, immutable send snapshots, T&C auto-composition | Full builder `app/(app)/quotes/**` (~30 builder components, PDF preview, scope/dispatch/monitoring editors); `lib/api/quotes.ts`, `quote-audit.ts`; `quotes` (0027), `quote_audit_log` (0038/0040), quote labour (0055); quote→project/CO conversion (0086) | **No client portal / e-acceptance**; **no immutable send-snapshot table**; 3 quote types reduced to a 2-value target-kind flag; ~2–4 tables vs 12 | High |
| **Projects & Jobs (M6)** | 24 routes, 3-state costing, change orders, commissioning + ULC, handover/warranty clock; + Gantt arc | Deepest module. `projects/**` incl. `[id]/schedule`; 15 action files; ~40 components; tables `project_jobs`/`job_tasks`/`job_dependencies`/`job_deficiencies`/`commissioning_*`/`project_bonds`/`warranties`/`schedule_*`. **Gantt arc fully built** (`lib/gantt/*`, `lib/api/gantt.ts`, `InteractiveGantt`, critical path, resource lane, working calendar, baselines) | **ULC verification** not built as a project feature; handover/warranty-clock only partial (table + card, no handover-package flow) | High |
| **Inventory (M7)** | 15 tables, multi-location, FIFO valuation, append-only movements ledger, serial lifecycle, vendor catalog sync | `inventory/**` (~30 components: Stock/Allocations/CycleCounts/Movements/Transfers/PurchaseOrders/pickup slips/RMA); `products.ts`, `stock-movements.ts`, `inventory-counts.ts`; serial lifecycle real (0047/0048) | **No FIFO valuation** (zero code refs — a §0.4 #8 item); movements "append-only" not enforced as a true ledger; vendor catalog sync thin; ~10 tables vs 15 | High (FIFO), Med (ledger) |
| **Vendors (M8)** | 8 tables, T5018, onboarding gates, insurance/WSIB expiry, performance scoring w/ auto-degrade, banking encrypted | `vendors/**`, `vendors.ts`, `vendor-bills.ts`, `vendor-metrics.ts`, `purchase-orders.ts`, `t5018.ts`; `vendors` (0030), `purchase_orders` (0031), `vendor_bills` (0092); T5018 real; scorecard derived from PO receipts (0109) | Performance scoring is **read-only/derived** (no auto-degrade, no stored score/preferred-status); **no banking encryption** (no bank/encrypt columns); insurance/WSIB expiry lives in subs, not vendors; ~5 tables vs 8 | High |
| **Invoices / AR (M9)** | 14 tables, AR+AP, Stripe customer payment portal, 3-way match, SoD on AP, holdback | Real: `invoices/**`, `lib/api/invoices.ts` (1218 ln), `holdback.ts`, `deposits.ts`; `invoices`+`invoice_lines`+`invoice_counters` (0043), `invoice_payments` (0090), `project_deposits`+`deposit_applications` (0091), `holdback_releases` (0094) | **No Stripe/customer payment portal**; no standalone 3-way-match / SoD UI; ~4 routes vs 22 | High |
| **Subcontractors (M10)** | 13 tables, WSIB auto-block, T5018, lien-deadline tracking, worker manifest + cert verify, skill+territory match | Rich: `subcontractors/**`, `subcontractor-compliance.ts`, `sub-agreements.ts`, `t5018.ts`; `subcontractors` (0095), `compliance_docs` (0096), `sub_agreements` (0098); work-order PDFs; eligibility logic | **Skill+territory matching** and **lien-deadline tracking** not surfaced; work orders lack a dedicated route tree | High |
| **Financials (M11)** | 26 routes, built-in GL + source-back, period close w/ SoD, FX revaluation, bank rec, QBO/Xero/Sage export | Tabbed `financials/page.tsx` (Overview/Invoices/Receivables/Bills/Projects/WIP/P&L/Tax) + statement routes; `financials.ts`, `project-pnl.ts`, `ar-aging.ts`, `ap-aging.ts`, `wip.ts` | **No general ledger / journals / chart-of-accounts**, no period-close, FX revaluation, or bank reconciliation; **QBO/Xero/Sage export not built**. Computed roll-ups, not an accounting engine; ~4 routes vs 26 | High |
| **Scheduling / dispatch (M12)** | 10 tables, 5-dimensional auto-suggest, cert-expiry auto-block, SLA auto-enforce, mobile geo clock-in | `scheduling/{page,jobs,tech}`; dispatch model (0111), availability `tech_working_hours`/`tech_absences`/`tech_certifications` (0112); `schedule-jobs.ts`, `dispatch-board.ts`, `tech-availability.ts`, `gantt.ts` | **No SLA auto-enforcement, no cert-expiry auto-block on booking, no mobile geolocation clock-in**; `dispatch-board.ts` thin | High |
| **Reports (M13)** | ~40 reports/7 categories, custom builder, scheduled email/PDF delivery, subscriptions, immutable snapshots; 7 tables | `/reports` hub + **~14 static reports** render (business-snapshot, wip, pnl, margin, profitability, ar/ap-aging, hst, pipeline, utilization, vendor-spend, inventory-valuation, t5018, dup-quote-numbers); export foundation (REP-1..4) | **BIGGEST GAP:** ~35% of designed reports; **no custom builder, no scheduled delivery, no subscriptions/history**; **zero of 7 designed report tables** exist (categories are a hard-coded array) | High |

### Cross-cutting build-vs-design observations
- **Client-facing portals are absent app-wide** — designed for Quotes (e-acceptance `/q/[token]`) and Invoices (customer payment). Only the internal client-onboarding `app/invite/[token]/client` route exists.
- **All external integrations are label-only** — Stripe, QuickBooks/Xero/Sage 50 export. `SettingsPanes.tsx` confirms the integration list was removed.
- **FIFO inventory layers never implemented** (§0.4 #8) — zero code references.
- **Immutable/versioned snapshots are partial** — SNAP-1 balances + schedule baselines are immutable; but quote send-snapshots, and general §0.4 #8 durability, are largely unbuilt.
- **Route consolidation** — many designed multi-route trees became tabbed single-page views. Data models are largely real even where route counts are low.

---

## 4. The permissions gap (dimension by dimension)

**What shipped** (PERM-1..4 + DES-1/2): a lean, standalone `role×resource×action`
matrix — deliberately NOT the v0.11 design.
- **PERM-1** `role_permission_matrix` (migration `0114`) + `lib/permissions/db-matrix.ts`.
- **PERM-2** request-scoped resolver `lib/permissions/resolve.ts` — deny>grant>default precedence, **fail-safe to the static `ROLE_PERMISSIONS`** (never grant-on-error), resolved once per request via React `cache()`, enforced at ~27 server call sites via `can()`/`requirePermission()`/`requireAdmin()`.
- **PERM-3** `user_permission_overrides` + append-only `permission_audit` (migration `0115`, with a `block_permission_audit_mutation` trigger).
- **PERM-4** `resolveEffectiveForUser` admin effective-view.
- **DES-1/2** `Warehouse` first-class role + admin self-lockout guard (`lib/permissions/guard.ts`, `0116`).

The v0.11 **dormant schema** (`0005`/`0006` — ~21 catalog/cache/runtime tables) exists but is **dead**: grep finds zero references from `app/ lib/ components/`, and `0114`'s own header says it deliberately does not wire them.

### 4.1 Six-phase build plan (`NEXVELON_PERMISSIONS_DESIGN.md` §12.1)

| Phase | Intent | Status | Evidence |
|---|---|---|---|
| 1 Foundation (schema+backfill) | ~38 tables, 8 partitioned ledgers, ~1260 perm defs | **PARTIAL** | Real foundation is lean `0114`/`0115`/`0116`; the designed dormant tables (`0005`/`0006`) are abandoned + unused |
| 2 Resolution algorithm online | A1/A2/A3 7-phase engine + cache/warm-up/observability | **PARTIAL** | `resolve.ts` ships role×resource×action resolve-once only — no A2 (scopes), no A3 (fields), no 7-phase, no DB cache/warm-up |
| 3 Field visibility + data scopes | `<FieldGated>`, serialization transformer, RLS scopes | **NOT STARTED** | No transformer/`FieldGated`/scope filter; only client-side hiding |
| 4 Status bindings + cross-cutting | SoD, regulatory expiry, lien clock, co-sign | **NOT STARTED** | `status_behavior_bindings`/`separation_of_duties_constraints` dormant; no runtime check |
| 5 Editor UI + request workflow | 6-section editor + request/approve/notify | **PARTIAL** | Role-baseline + override editors shipped; **request-admin-access workflow not wired** |
| 6 Full activation + cutover | All users on the 10-dim system; legacy removed | **NOT STARTED** | Static `hasPermission` still used client-side; no cutover — the shipped system is not the designed one |

### 4.2 Ten enforcement dimensions

| # | Dimension | Status | Evidence |
|---|---|---|---|
| 1 | Field-level visibility | **PARTIAL — client-side only** | `viewMargin/viewCost/viewInternal` hidden in client components (`StockTab.tsx:49`, `AllocationsTab.tsx:30`, `PurchaseOrdersTab.tsx:60`, `ReportsTab.tsx:34`, `TotalsBar.tsx:40`, `NotesCards.tsx:171`); **server does not strip the fields** (`inventory/actions.ts` gates only `inventory:view`). See P0-1. |
| 2 | Data scopes (own/team/project/client/all) | **ABSENT** | `DATA_SCOPES` only in the UI catalog `permissions-matrix.ts`; scope tables dormant; no filter injection, no scoping RLS |
| 3 | Time-bounded grants w/ expiry | **ABSENT** | Live `user_permission_overrides` (`0115`) has `revoked_at` but **no `expires_at`**; resolver filters `revoked_at IS NULL` only |
| 4 | Approval delegation w/ value caps | **ABSENT** | No code |
| 5 | Request-admin-access workflow | **ABSENT** | Only dormant table refs in `smoke_chunk_02.sql`; no submit/approve/notify path |
| 6 | Encryption-at-rest (gate codes, bank #) | **PARTIAL — enforced where applicable (SEC-2, PR #392)** | App-layer AES-256-GCM (`lib/crypto/credentials.ts`), key in `CREDENTIAL_ENCRYPTION_KEY` env only (never in DB/Vault/backups). Applied to `vendors.account_number` (mig 0125/0126 + backfill). NOTE: the audit's premised gate/alarm-code columns **do not exist** in the schema — no plaintext codes to encrypt today; the mechanism + standing rule (NEXVELON_PRINCIPLES §2) cover any such field added later. |
| 7 | Audit-on-read (high-sensitivity reads) | **PARTIAL — present for the vendor-banking reveal (SEC-2)** | A reveal of `vendors.account_number` writes an `activity_log` row (who + which vendor, never the value) via `revealVendorAccountNumberAction`. A dedicated `read` action enum (vs reusing `update`) + `requires_audit_on_read` config remain follow-ups. `permission_audit` still logs writes only. |
| 8 | Eight-layer print protection | **ABSENT** | Only a plain `@media print` chrome-hide (`globals.css:231`); no watermark/PDF protection |
| 9 | Append-only permission ledgers | **PARTIAL** | One genuine ledger: `permission_audit` (`0115`, mutation-block trigger). Design wanted 8 partitioned; shipped 1, unpartitioned |
| 10 | Effective-permissions caching | **PARTIAL** | React per-request `cache()` only; DB cache tables dormant; no invalidation triggers or warm-up |

### 4.3 Verdict

The **action/route layer is coarse-but-safe** — server-enforced, deny>grant precedence, fail-safe. The **field layer is not**: sensitive fields are hidden client-side over an unstripped payload, an inconsistency with the financials/WIP paths that *do* strip server-side (`wip-actions.ts:46` gates cost on `financials:edit`). This is a real, currently-exploitable leak (P0-1). The remaining eight designed dimensions are effectively absent.

---

## 5. Debt & bug register

Each item: **[verified]** — title — `location` — impact.

**Correctness / security / data-integrity**
- **[TRUE]** Field cost/margin/internal leak — `app/(app)/inventory/actions.ts` (read gates only `inventory:view`) + client-only `viewCost` in `StockTab.tsx:49`/`AllocationsTab.tsx:30`/`PurchaseOrdersTab.tsx:60`/`ReportsTab.tsx:34`; quote margin `TotalsBar.tsx:40`; notes `NotesCards.tsx:171` — lower-privilege users receive data they must not see. **→ P0-1.**
- **[TRUE]** Invoices write no `activity_log` — `lib/api/invoices.ts` + `app/(app)/invoices/actions.ts` (0 `logActivity`) — a core financial entity has no audit trail (§5). **→ P0-2.**
- **[TRUE]** QuoteHistoryPanel re-summarises audit values pre-AUDIT-FIX-2 — `components/modules/quotes/builder/QuoteHistoryPanel.tsx:58-69` (`String(v)`, renders `[object Object]`) instead of the shared `lib/audit/format-activity-value.ts`. **→ P2.**
- **[TRUE]** Activity diffs render raw FK UUIDs — `lib/audit/format-activity-value.ts:17-19` (acknowledged: no human-label registry). **→ P2.**
- **[FALSE]** Recent tables missing §3 boilerplate — checked 0110–0124; every `CREATE TABLE` has GRANT + RLS + policy (append-only tables correctly SELECT+INSERT only). **No gap.**

**Build / tooling**
- **[TRUE, partial]** Build pinned to Turbopack; no webpack path — `package.json` (`build: next build --turbopack`), empty `next.config.ts`, `@react-pdf/renderer` in 10+ components. Consistent with "webpack build breaks on react-pdf ESM," but the failure is undocumented in any repo note. **→ P2 (document it).**

**Permissions hygiene**
- **[TRUE]** Dormant dead schema `0005`/`0006` (~21 tables) — unreferenced by app code; confusing to future sessions. **→ P2.**
- **[TRUE]** `user_permission_overrides` schema collision — `0006` (uuid/`override_state`/`expires_at`) vs live `0115` (text/`state`/no expiry); code reads the `0115` shape. **→ P2.**

**Polish / UX**
- **[TRUE]** BrandingThemes 3 non-functional "preview only" controls — `components/modules/settings/BrandingThemes.tsx:29,44,48` (logo upload, login-bg picker, email signature). **→ P2.**
- **[TRUE]** Clients Export not implemented — `app/(app)/clients/ClientsView.tsx:353` (`toast.info("Export not implemented yet.")`). **→ P2.**
- **[TRUE]** Quote letterhead "coming soon" — `components/modules/quotes/builder/DocumentStyleCard.tsx:126`. **→ P2.**
- **[TRUE]** ProjectEditForm PM is a free-text UUID input — `components/modules/projects/ProjectEditForm.tsx:8` (TODO PROJ2-4, needs a user picker). **→ P2.**
- **[TRUE]** Holdback HST treatment TODO — `lib/api/invoices.ts:15` (unresolved tax question). **→ P1 (correctness of a tax figure).**
- **[TRUE]** ~182 hardcoded hex outside tokens — many are legitimate `@react-pdf` docs (can't read CSS vars); real UI offenders: `components/modules/purchase-orders/po-status.tsx:12-17` (status palette), brand-gold `#C9A24B` inline in `WipTab.tsx:74`, `ExpiryBadge.tsx:12`, `ComplianceRiskPanel.tsx:28`. **→ P2.**
- **[TRUE]** Dead entity type — `lib/types/database.ts:633` `inventory_product` declared but never emitted (writes use `"inventory"`). **→ P3.**
- **[TRUE]** Settings stubs — Integrations (empty), Notifications (no persistence), API & Webhooks (fake toast), Billing (static) in `SettingsPanes.tsx`. **→ P2 (or P3 for the integration-dependent ones).**

---

## 6. Tiered pending list

Tiered on evidence. Each item states why.

### P0 — something is wrong or unsafe now
- **P0-1 — Server-strip field-gated data (cost / margin / internal notes). ✅ CLOSED (SEC-1, PR #390).** Reasoning: a lower-privilege authenticated user could read cost/margin/notes from the wire payload; the field-visibility dimension was substituted with cosmetic client-side hiding. Confidentiality breach. **Fix:** one shared server-side redactor (`lib/permissions/field-redaction.ts`) applied at every read/action/export boundary — inventory cost (catalog, detail, allocations, PO totals, valuation report + exports, dashboard donut), quote margin (line cost/margin, TotalsBar) and internal notes (notes + technician names). Redaction is `null`/absent (never zeroed, §2.8), fails closed, and `upsertQuoteAction` preserves the real values from the prior blob so a redacted edit never clobbers them. No role's capabilities changed. *(No migration.)*
- **P0-2 — Invoice audit trail. ✅ CLOSED (AUD-4, PR #391).** Reasoning: financial-entity mutations wrote no `activity_log` — a §5 launch-gate violation and an integrity/traceability gap on money. **Fix:** every invoice / payment / deposit / holdback-release mutation now writes a best-effort `entity_type: "invoice"` (or project) activity row with a readable label and the money amount, rolled up to the project; issue and void are distinguishable; removed lines/reversed payments keep their label; the Activity tab mounts on the invoice detail page, gated on `financials:view`. No SEC-1-redacted field appears in any invoice audit payload. *(No migration — `invoice` was already an allowed `entity_type` since migration 0120.)*

### P1 — designed, materially absent, commercially matters
- **P1-1 — Reports platform:** custom/copy-modify builder, scheduled email/PDF delivery, subscriptions, immutable snapshots, the 7 report tables. Today ~14 static reports, zero infra.
- **P1-2 — FIFO inventory valuation** (§0.4 #8 locked commitment) — never built; costing accuracy.
- **P1-3 — Accounting export (QuickBooks/Xero/Sage 50)** — §3's stated integration backbone; absent.
- **P1-4 — Quote client portal + e-acceptance (`/q/[token]`) + immutable send snapshots** — the revenue surface's close step.
- **P1-5 — Invoice customer payment portal (Stripe)** — the AR collection step.
- **P1-6 — Holdback HST treatment. ✅ CLOSED (FIN-TAX-1, PR #393).** The `invoices.ts:15` TODO is resolved. The treatment is now EXPLICIT (`lib/tax/holdback-hst.ts`), org-configurable (company_settings `holdback_hst_treatment`, Admin-editable, defaulting to the pre-existing `charged_upfront` behaviour so deploy changes nothing), and snapshot per-invoice (migration 0127) so a setting change never alters an issued invoice (§2.2). The HST return still sums stored `invoices.tax_amount` — the same source the invoice charged, so they cannot disagree. No pre-existing bug was found (the code was internally consistent; this was a policy choice to surface + make switchable). Confirm the chosen treatment with the bookkeeper.

### P2 — polish / designed-but-deferred
- Permissions dimensions 2–10 build-out (data scopes, time-bound grants, request-access workflow, approval delegation, audit-on-read, eight-layer print, encryption-at-rest, persistent cache) — the rest of the v0.11 design.
- Permissions hygiene: drop dormant `0005`/`0006`; resolve the `user_permission_overrides` schema collision.
- Client SLA engine + client-level holdback config; Clients **Contracts tab** (placeholder `ClientDetailView.tsx:406`); `/contacts` detail route.
- Settings: Workflow Rules engine; email/PDF template editors; wire Notifications/API-Webhooks (the non-integration stubs).
- Employee HR surface in Users (certifications, territories).
- Scheduling: SLA auto-enforcement, cert-expiry auto-block on booking, mobile geolocation clock-in.
- Subcontractors: skill+territory matching; lien-deadline tracking.
- Vendors: banking encryption-at-rest; performance auto-degrade + stored score.
- ULC verification in commissioning; project handover-package flow.
- Dashboard: remaining role templates (4→6) + widget catalogue breadth.
- UI-arc catalogued items: base primitives (switch / slider / stepper / date-picker / calendar), exotic chart forms, presentation-timeline export, per-widget range override, per-opco balance trends, count trend lines, per-resource calendars.
- Bug polish: QuoteHistoryPanel → `formatActivityValue`; activity UUID→label registry; BrandingThemes controls; Clients Export; quote letterhead; ProjectEditForm PM picker; hardcoded-hex cleanup; document the Turbopack-only build.

### P3 — catalogued only, no near-term intent
- Deferred modules: **Expenses / Receipt OCR / Payroll-HR** (`docs/FUTURE_MODULES_EXPENSES_PAYROLL.md`).
- **Training package** (Jay-triggered; not started by design).
- Permissions Phase-2 deferrals: multi-tenant per-tenant rollout, SSO/SAML, API tokens, role hierarchy, crews.
- Dead entity-type cleanup (`inventory_product`).

---

## 7. Proposed sequence (each a single Claude Code paste)

Ordered by tier, then by dependency. **(M)** = needs a migration.

1. **SEC-1 — server-strip field-gated data. ✅ DONE (PR #390).** Redact `unit_cost`/margin/internal notes in the server reads by permission, mirroring the WIP `canSeeCost` pattern; tests assert a non-`viewCost`/`viewMargin`/`viewInternal` role's payload (and every export) omits the field. *(P0-1, no migration.)*
2. **AUD-4 — invoice audit trail. ✅ DONE (PR #391).** `logActivity("invoice", …)` on create/update/line-edit/issue/void/payment/deposit/holdback; readable labels per AUD-2B; Activity tab on the invoice detail page. *(P0-2, no migration.)*
3. **FIN-TAX-1 — holdback HST treatment. ✅ DONE (PR #393).** Resolved `invoices.ts:15`; explicit + org-configurable treatment, per-invoice snapshot, return derives from stored tax. *(P1-6, migration 0127 — additive.)*
4. **PERM-HYGIENE-1 — drop dormant `0005`/`0006`; reconcile the override schema collision.** **(M)** — needs a decision (§8 Q4) since it drops tables.
5. **REP-5 — report platform foundation.** `report_definitions` + `report_subscriptions` + `report_snapshots` + `scheduled_reports`; copy-modify builder. **(M)**
6. **REP-6 — scheduled delivery** (cron + Resend, reusing the SNAP-1 cron pattern). *(possibly (M) for run history.)*
7. **QBO-1 — accounting export** (write-only QuickBooks first). **(M)** (sync-state table).
8. **QUOTE-PORTAL-1 — `/q/[token]` e-acceptance + immutable send snapshots.** **(M)**
9. **PAY-PORTAL-1 — invoice customer payment (Stripe).** **(M)**
10. **FIFO-1 — inventory FIFO layers.** **(M)**
11. **POLISH-* — batched P2 bug/polish chunks** (QuoteHistoryPanel formatter, activity label registry, hardcoded-hex, BrandingThemes, Clients Export, PM picker, Turbopack-build note). *(mostly no migration.)*
12. **PERM-DIM-* — permission dimensions 2–10**, sequenced per the v0.11 phases, when commercially triggered. **(M each)**

---

## 8. Open decisions for Jay (each one question)

1. **Is P0-1 (field leak) a stop-the-line fix now, or scheduled next sprint?** It is live today; recommend SEC-1 first.
2. **Invoice audit (P0-2): retrofit only new writes, or also backfill a synthetic "history began" marker?** History can't be reconstructed for past edits.
3. **Reports: build the full designed platform (builder + scheduling + subscriptions), or formally downscope to the static gallery + a smaller curated set?** This is the biggest scope decision.
4. **Dormant permission schema `0005`/`0006`: drop it (a table-dropping migration, against the additive-only §1 default), or leave it documented-as-dead?** Recommend drop with the reverse migration captured.
5. **Accounting posture: confirm QuickBooks export is still "integration, not replacement" (§3), i.e. NO built-in GL/period-close/bank-rec — so those stay out of scope?**
6. **Permissions: commit to building dimensions 2–10 (the v0.11 vision) as a dedicated arc, or freeze the coarse model as the product and retire the v0.11 design doc?** The answer changes whether §4's gaps are "debt" or "not our product."
7. **Which client portals are in scope, and when — quote e-acceptance, invoice payment, both, neither?**
8. **Trigger the training package now that the core ERP is complete, or keep it parked?**

---

*End of REALITY-1 audit. No app code, migration, or dependency was modified in producing this document.*

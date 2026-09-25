# INTENT_RECOVERY.md — Historical intent recovery (REALITY-2)

> **READ-ONLY archaeology. Nothing in the codebase, schema, or any other document was changed to produce this file.** This is the only file this chunk adds.
>
> REALITY-1 (`docs/BUILD_STATE_AUDIT.md`) established what is *built* versus what the *current* design docs describe. It could not see what *earlier* versions of those docs described. This document reads the git history — every historical version of the roadmap, the pre-condensation feature audit, the handoff docs, the eleven permissions design passes, removed code TODOs, and every abandoned branch / closed-unmerged PR — and reports what was promised and quietly disappeared.

## 1. Baseline

| | |
|---|---|
| HEAD | `746321f` (Merge PR #393 — FIN-TAX-1) |
| Latest merged PR | **#393** |
| Total commits on `main` | **858** |
| Highest migration | **0127** (241 files in `supabase/migrations/`, incl. smoke/data-patch) |
| Date | 2026-09-25 |
| Branch | `docs/reality-2-intent-recovery` |
| Status | **READ-ONLY; nothing changed.** `git diff --stat` shows exactly one added file: this one. |

## 2. Method

History read, and how far back:

- **Roadmap** — all 40 revisions of `NEXVELON_ROADMAP.md` (born 2026-05-11 `6e6e41f`), each diffed against its predecessor; substantive removals extracted and cross-checked against the changelog, code, and schema.
- **Feature audit** — the pre-v0.14 (pre-condensation) versions of `NEXVELON_FEATURE_AUDIT.md` recovered from git (richest per-module versions: M1–M4 `6283d0f`, M5 `5633e25`, M6 `bafb708`, M7 `f7cee0d`, M8 `f3a763a`, M9 `681b2ad`, M10 `4c0b33b`, M11 `b60caf7`, M12 `06261f6`; condensation `ffa6526`).
- **Handoffs** — all 37 `NEXVELON_SESSION_*_HANDOFF.md` + `docs/HANDOFF-SESSION-*.md` (a `git log --all --diff-filter=D` confirms **none were ever git-deleted** — they *stopped being written* ~PR #151 / the 2026-07-05 snapshot).
- **Permissions passes** — the eleven design-pass commits named in `NEXVELON_PERMISSIONS_DESIGN.md` §0.2 (`9008fad`, `1bafbd4`, `3c21e58`, `c090599`, et al.), read directly.
- **Removed TODOs** — every commit that deleted a `TODO`/`FIXME`/`DEFERRED`/"phase 2"/"later"/"follow-up" marker from `lib`/`app`/`components`, checked against current code.
- **Branches / PRs** — `gh` (authenticated): all 393 closed PRs (4 closed-without-merge) and all 4 remote branches unmerged into `main`.

Cross-referencing standard: an item counts as **SHIPPED** only with concrete evidence (a changelog line, a migration, a code path). If it could not be proven shipped, it was not classified SHIPPED.

## 3. Executive summary (led by the silent losses)

1. **The reconciliation was largely faithful.** The 2026-09-24 REALITY-1 resync deleted the entire 13-module roadmap sequence in one commit (`662cd4e`) under an "all shipped" banner. Verified module-by-module: the modules did ship as real DB + server-action features, and most designed-but-unbuilt *depth* (QBO/Xero export, both client portals, Reports platform, FIFO, permissions dims 2–10, the accounting engine) was honestly carried into "Remaining work." **Most gaps are DROPPED-DELIBERATE (tracked), not lost.**
2. **One roadmap item fell entirely through: invoice write-off approval** (`invoices:approveWriteOff` + the AR write-off workflow). It is in no code, no permission matrix, no changelog, and — unlike every other unbuilt invoice capability — not in the resync's carry-forward list. **The single clean roadmap-level silent casualty.**
3. **A coherent commercial theme was silently lost in the feature-audit condensation: recurring revenue + onboarding gates.** `service_contracts` (M1) → the *Service Contract* quote type (M5) → recurring invoice templates (M9), plus the onboarding-gate / auto-composed-T&C framework (M1 → vendor M8 → contractor M10). None shipped, none are in the roadmap. **This is the most commercially significant silent loss.**
4. **Scheduling (M12) lost the most designed surface silently:** the five-dimensional auto-suggest dispatch engine (the flagship differentiator), cross-resource scheduling, recurring appointments, travel-time estimates, external-calendar export, and emergency-dispatch override — all zero code, none carried to the roadmap.
5. **The permissions passes silently dropped five concrete audit/admin commitments** the condensed design doc no longer mentions: denied-attempt auditing, IP capture + 12-month IP nulling, system-actor audit rows, a CSV grants round-trip, and a self-service `/profile/permissions` page. The shipped `permission_audit` collapsed a designed 32-event catalog to 4 change-types.
6. **The largest single UNCERTAIN item is the built-in General Ledger (M11)** — chart-of-accounts, journal entries, period close, bank reconciliation, FX revaluation — designed as the "no separate accounting product needed" differentiator, now reduced to computed roll-ups. Its fate is an *explicit open decision* (`BUILD_STATE_AUDIT.md` Q5), so it is flagged-but-unresolved, not silent.
7. **Contractor-side parity was silently dropped:** versioned labor-rate tables, a worker manifest with per-worker cert verification, a contractor performance ledger, and contractor onboarding gates — all shipped for *vendors* but never for *subcontractors*, and never re-listed.
8. **Removed TODOs are clean:** every `TODO`/`FIXME`/`DEFERRED` deleted from code was deleted by the commit that did the work (verified). No dropped-commitment TODOs.
9. **Abandoned branches are clean:** of 4 closed-unmerged PRs, #153's intent shipped by another path and #49/#16/#15 are the deliberately-abandoned quote-PDF-theme lineage. **No live intent stranded in a branch.**
10. **Two current docs carry stale claims** worth a later correction (recorded, not fixed here): the current feature audit still headlines "Three quote types" and "T&C auto-composition" (neither shipped), and `BUILD_STATE_AUDIT.md §3 M12` says cert-expiry auto-block is missing when it demonstrably shipped (`lib/api/schedule-assignments.ts`).

## 4. Roadmap archaeology (2a)

40 revisions; ~30 diffs are trivial (session/last-updated markers, wording tweaks, progress-line churn consumed by the commit that shipped the sub-item). The one substantive removal is the REALITY-1 resync (`f03f49d → 662cd4e`, 2026-09-24, −215 lines) that deleted the whole numbered module sequence at once.

| Removed item | Class | Evidence |
|---|---|---|
| 1. Feature audit + sidebar expansion | SHIPPED | `NEXVELON_FEATURE_AUDIT.md` v0.14; `BUILD_STATE_AUDIT.md` |
| 2. Permissions design pass | SHIPPED | `NEXVELON_PERMISSIONS_DESIGN.md` v0.11 (11 passes in git) |
| 3. Permissions build — core | SHIPPED | PERM-1..4/DES-1; migrations `0114/0115/0116`; `lib/permissions-matrix.ts` |
| 3b. Permissions dims 2–10 (field-visibility engine, request-access, audit-on-read, print, encryption, caching) | SUPERSEDED (carried fwd) | roadmap "Permissions dimensions 2–10"; `BUILD_STATE_AUDIT.md` §7 |
| 4. Quotes v1 | SHIPPED | migration `0027`; `quotes.viewMargin/viewInternal/approve/convert` gates |
| 5. Projects v1 | SHIPPED | migration `0041`; changelog PROJ2-* |
| 6. Inventory v1 | SHIPPED | migrations `0021–0026`; INV-* |
| 6b. Inventory FIFO valuation | SUPERSEDED (carried fwd) | roadmap FIFO-1 "(zero code today)" |
| 6c. `low_stock_rules` per-vendor reorder table | SUPERSEDED | replaced by per-part reorderPoint/qty (`lib/inventory-import-template.ts:8`) |
| 7. Vendors + PO module | SHIPPED | migrations `0030/0031`; `inventory.approvePO` |
| 8. Invoices v1 (core) | SHIPPED | migrations `0043/0090`; AUD-4 |
| 8b. Invoices QBO write-only sync | DROPPED-DELIBERATE (carried fwd) | roadmap QBO-1 "label-only today" |
| **8c. `invoices:approveWriteOff` + AR write-off workflow** | **DROPPED-SILENT** | none found — absent from code, matrix, changelog, audit, AND the carry-forward list |
| 8d. `invoices:viewMargin` gate | UNCERTAIN | no invoice-specific margin gate; margin gated only at quote/project/financials |
| 9. Subcontractors v1 (incl. insurance/WSIB hard-block) | SHIPPED | migrations `0095–0099`; server hard-block `lib/api/job-assignments.ts` |
| 10. Financials v1 | SHIPPED (roll-ups only) | `lib/api/financials.ts`; NB no GL/journals/period-close (`BUILD_STATE_AUDIT.md:51`) |
| 11. Scheduling v1 (incl. cert hard-block) | SHIPPED | migrations `0111–0113`; DES-2 |
| 11b. Scheduling route/capacity optimisation | DROPPED-DELIBERATE | spec said "v2"; resync P2 "resource levelling / auto-assignment" |
| 12. Reports v1 (static) | SHIPPED | REP-1..4 |
| 12b. Reports builder + scheduled delivery + snapshots | SUPERSEDED (carried fwd) | roadmap REP-5 |
| Client quote e-acceptance portal `/q/[token]` | SHIPPED | QUOTE-PORTAL-1 (PR #397, migration 0129) |
| Invoice customer payment portal (Stripe) | DROPPED-DELIBERATE (carried fwd) | roadmap PAY-PORTAL-1 |
| Gantt presentation-export templates | DROPPED-DELIBERATE (carried fwd) | resync P2 "presentation-timeline export" |

## 5. Feature-audit recovery (2b)

The pre-v0.14 audit catalogued M1–M12 at a per-capability level, then delegated the detail to git. REALITY-1 later re-derived most designed-vs-built gaps into the roadmap tiers (those are **DROPPED-DELIBERATE — tracked**). The rows below are the capabilities that appear in **none** of: current code, current feature audit, current roadmap, changelog, or `BUILD_STATE_AUDIT.md`.

| Module | Recovered capability (missing everywhere) | Class |
|---|---|---|
| M1 | Service contracts (recurring per-site maintenance plans + billing cycles) | DROPPED-SILENT |
| M1 | Onboarding gates + auto-composed T&C clauses (insurance/MSA/deposit/bond/NDA) | DROPPED-SILENT |
| M1 | Native communication log (email/call/SMS per client) | DROPPED-SILENT |
| M1 | Misc-contacts directory (inspectors/brokers/lawyers/ULC) + global search | DROPPED-SILENT (the `/contacts` *route* is tracked; the directory concept is not) |
| M1 | Client merge with dual-side audit | DROPPED-SILENT |
| M1 | Late-fee config + auto-apply (pct/compounding/grace) | DROPPED-SILENT (`lib/late-payment-rates.ts` is T&C text only) |
| M1 | Client-level encrypted banking | DROPPED-SILENT (only vendor banking encrypted, SEC-2) |
| M2 | Equipment assignments (trucks/test-kits/laptops/devices) | DROPPED-SILENT |
| M2 | Sessions view + force sign-out | DROPPED-SILENT |
| M2 | Employee map view + Licence Matrix report | DROPPED-SILENT |
| M2 | MFA enrollment | UNCERTAIN (`0002` references `mfa`; no enrollment UI) |
| M3 | Audit retention / 7-yr cold-storage rotation config | DROPPED-SILENT (`AuditCompliance` pane is mock) |
| M3 | Sidebar-badge operator config; settings change-preview ("affects N records") | DROPPED-SILENT (only theme `ApplyDefaultDialog` exists) |
| M3 | Backups pane (schedule/retention/restore-test) | UNCERTAIN (S3 inputs, no backing table — likely stub) |
| M4 | Per-widget CSV export; per-user custom landing page | DROPPED-SILENT |
| M5 | Pre-built assemblies library | DROPPED-SILENT |
| M5 | Master pricebook catalog | DROPPED-SILENT |
| M5 | T&C auto-composition from onboarding gates | DROPPED-SILENT (audit **still headlines it** — stale) |
| M5 | Service Contract quote type (3rd type → recurring billing) | DROPPED-SILENT (audit **still claims "Three quote types"** — stale) |
| M5 | Threshold-based multi-step approval routing (`quote_approvals`) | DROPPED-SILENT (single approve button today) |
| M6 | Per-equipment GPS/date-stamped photo evidence + append-only immutability | UNCERTAIN |
| M6 | Phase-completion progress-invoice auto-generation | UNCERTAIN |
| M7 | 3-way match (PO↔receipt↔bill) / price-discrepancy auto-flag | DROPPED-SILENT (only thin matching in `vendor-bills.ts`) |
| M7 | Scheduled low-stock cron email digest | DROPPED-SILENT (cron infra exists; low-stock never wired) |
| M7 | Photo-on-receive; true turnover ratio | UNCERTAIN / PARTIAL (ledger `0046` exists; ReportsTab labels turnover a "PROXY") |
| M8 | Vendor onboarding gates + T&C versioning | DROPPED-SILENT |
| M8 | Vendor insurance/WSIB expiry + PO auto-block | DROPPED-SILENT (expiry exists for *subs* only) |
| M9 | Late-fee auto-application + compounding | DROPPED-SILENT |
| M9 | Recurring invoice templates (linked to service contracts) | DROPPED-SILENT |
| M9 | Multi-currency invoices + FX-rate snapshot | DROPPED-SILENT (minor; CAD-only today) |
| M10 | Versioned labor-rate tables (effective-dated per-role base/OT/weekend/holiday/travel) | DROPPED-SILENT (collapsed to one `default_labour_rate`) |
| M10 | Worker manifest + per-worker cert verification | DROPPED-SILENT |
| M10 | Contractor performance ledger + auto-degrade | DROPPED-SILENT (shipped for vendors only) |
| M10 | Contractor onboarding gates + MSA/NDA composition | DROPPED-SILENT |
| M11 | Built-in General Ledger (chart-of-accounts, journals) + period close, bank rec, FX, recurring journals | UNCERTAIN (open decision Q5) |
| M11 | Tax-filing records (`tax_filings`) + PST returns + CRA-confirmation tracking | DROPPED-SILENT (only computed HST CSV + T5018 shipped) |
| M12 | Five-dimensional auto-suggest dispatch engine (skill+cert+territory+availability+SLA) | DROPPED-SILENT (flagship differentiator; zero code) |
| M12 | Cross-resource scheduling (contractors/vehicles/equipment as resources) | DROPPED-SILENT |
| M12 | Recurring appointment series; travel-time estimates; external-calendar (iCS) export; emergency-dispatch override | DROPPED-SILENT (four distinct subsystems, zero code) |

*Skipped as non-capability trivia: field-name lists, action-count totals, route→tab consolidation, custom-field enums, badge-count logic, widget refresh TTLs.*

## 6. Handoff commitments (2c)

All 37 handoffs still exist on disk; **none were git-deleted.** They *stopped* being written ~PR #151 (2026-07-05). Because ~240 migrations landed after that snapshot, most deferrals were honoured incidentally. The residue:

| Handoff | Deferred item | Honoured? | Class |
|---|---|---|---|
| AG/AH/AI/AJ | Scheduled low-stock **cron** digest | no | DROPPED-SILENT (cron infra built for snapshots only) |
| AH | Un-convert doesn't auto-return committed stock (forward-only) | no | DROPPED-SILENT (returns are manual) |
| AG/AH | Movements ledger → true turnover ratio | partial | PARTIAL (ledger `0046`; still a labelled proxy) |
| AG/AH | Project-vs-site allocation reconciliation ("needs Jay's business decision") | — | UNCERTAIN (allocations wired; the decision fork not traced) |
| AH/AJ | Wire free-text `inventory_products.vendor` → vendors FK | partial | UNCERTAIN |
| Final (7/5) | INV-1c per-vendor-tab YTD-spend/lead-time/top-parts | — | UNCERTAIN (`vendor-spend` report exists; per-tab not confirmed) |
| Final (7/5) | Permissions runtime cutover (schema built, static matrix not retired) | partial | PARTIAL |
| AI/AJ | Guardian letterhead own phone/email; `default_opco` auto-select | — | UNCERTAIN |
| AA–AJ | Guardian HST reg; client_code gen; universal attachments; drawings; Inventory Sprint; quotes→DB; sites/subs/scheduling/financials/dashboard builds | yes | SHIPPED (migrations 0008–0123; changelog) |
| AI | Combined "first-year total" on acceptance page | no | DROPPED-DELIBERATE (marked optional) |

## 7. Permissions design passes (2d)

The eleven passes locked an elaborate system; the condensed v0.11 doc + shipped code retain a fraction. Migrations `0005`/`0006` created ~21 designed tables that **no code references** (inert schema); the runtime is a simpler static-matrix model (`0114`) + minimal `permission_audit` (`0115`, 4 change-types vs a designed 32-event catalog). Most of the gap is REALITY-1's ten dimensions. The **orphan** locked commitments — in the passes, absent from the doc AND the system AND the ten dimensions:

| Pass (sha) | Locked decision | Class |
|---|---|---|
| 8 (`c090599` §24.5) | CSV bulk import/export of the role-grants matrix (edit offline, re-import, validation) | DROPPED-SILENT |
| 8 (`c090599` §24.3) | Self-service `/profile/permissions` (a user's own effective grants + overrides) | DROPPED-SILENT (admin-side computation exists; no user page) |
| 6 (`3c21e58` §21.4) | Audit captures IP; IP column auto-nulled after 12 months | DROPPED-SILENT (`permission_audit` has no ip column) |
| 6 (`3c21e58` §21.3) | Audit records FAILED/denied action attempts | DROPPED-SILENT (audit logs only permission *changes*) |
| 6 (`3c21e58` §21.7) | System-actor audit rows (`actor_type='system'`) | DROPPED-SILENT (minor) |
| 1 (`9008fad` OQ5) | Action-versioning: new action defaults denied-for-all until granted | SUPERSEDED (static hand-edited matrix) |
| 1 (`9008fad` OQ6) | Action-deprecation lifecycle | SUPERSEDED |
| 2 (`1bafbd4` §16) | Materialized `permission_resolution_view`, nightly + on-save refresh | SUPERSEDED (folds into unbuilt cache) |
| 1 (`9008fad` §8.2) | Dedicated admin-exception override audit (SLA/insurance/WSIB/period-reopen, each w/ reason) | UNCERTAIN (those override actions don't exist yet — REALITY-1 territory) |

Passes 3, 5, 7, 9, 10, 11 held no additional orphans (explicit Phase-2 deferrals, or already in the ten dimensions / current doc).

## 8. Removed TODOs (2e)

**No dropped-commitment TODOs.** Only three commits ever removed hard `TODO`/`FIXME`/`DEFERRED` markers from `lib`/`app`/`components`, and all three removed the marker *as part of doing the work* (verified against current code):

| Removed TODO | Deferred | Done now? | Class |
|---|---|---|---|
| `d04de44` invoices.ts | holdback-HST treatment | yes — FIN-TAX-1 (#393) | SHIPPED |
| `d6b5d69` vendors | INV-1c vendor YTD spend / lead time / top parts | yes — `getVendorMetrics()` | SHIPPED |
| `470097308` inventory/actions.ts | INV-3 `logActivity("inventory",…)` seams | yes — same commit added the calls | SHIPPED |

Softer markers ("Phase 2"/"later"/"placeholder") were likewise all resolved by their own commit (AUD-4 invoice audit, DASH-3 panels, UIDG-4 theme backend, client Excel import). The one lingering deferral — the project-list `manager/systems/budget/progress/dates` columns dropped in `428da057` — **still carries its tracking comment** (`app/(app)/projects/page.tsx:6`), so it is deliberate, not silent.

## 9. Abandoned branches and closed PRs (2f)

Of 393 closed PRs, exactly **4 closed without merge**, mapping 1:1 onto the only 4 remote branches unmerged into `main`.

| PR# / branch | Intent | Class |
|---|---|---|
| #153 `feature/inventory-part-numbers` | Migration 0032 UPC / master / replacement part numbers | SHIPPED-OTHERWISE (re-committed to main as `b347f5a`; `0032_part_identifiers.sql` live) |
| #49 `fix/qd2-phase4-remove-overlay` | Revert a react-pdf gloss overlay | DROPPED-DELIBERATE (gloss never reached main; part of the abandoned quote-theme lineage) |
| #16 `feature/quote-theme-chunk-l-calendar` | "Programme of Works" calendar quote page | DROPPED-DELIBERATE (known obsolete quote-theme branch) |
| #15 `feature/quote-theme-chunk-k-pray-observe` | "Not Included" exclusions block on the Agreement page | DROPPED-DELIBERATE (known obsolete quote-theme branch) |

**Besides #15/#16, the closed PRs / unmerged branches carrying live unsatisfied intent are: NONE.** (#153 shipped by another path; #49 is moot and part of the same abandoned quote-PDF-theme effort.)

## 10. Full classified findings — counts

| Classification | Count (approx.) | Where |
|---|---|---|
| SHIPPED | 13 module lines + 3 TODOs + 1 branch + many handoff items | §4, §6, §8, §9 |
| SUPERSEDED | ~7 | §4 (FIFO/reports/low-stock-rules), §7 (action-versioning ×2, resolution-view) |
| DROPPED-DELIBERATE (tracked in roadmap/audit) | ~15 | §4 (QBO, both portals, presentation-export), §5 (SLA engine, template editors, ULC, handover, skill/lien, reports platform), §9 (#49/#15/#16) |
| **DROPPED-SILENT** | **~38** | §4 (1), §5 (~27), §6 (2), §7 (5) |
| UNCERTAIN | ~11 | §4 (1), §5 (5), §6 (5), §7 (1) |

## 11. DROPPED-SILENT + UNCERTAIN, tiered, with assessment (Step 4)

Tiers follow REALITY-1 (P0 = correctness/security now; P1 = designed, materially absent, commercially matters; P2 = polish / designed-but-deferred; P3 = catalogued only, no near-term intent). **Honest framing:** the feature audit was a *scoping catalog* aimed at simPRO/Q360 parity, so many silent items are "designed-but-never-built catalog capabilities" rather than firm build promises — tiered accordingly, not inflated.

### P1 — designed, materially absent, commercially matters
- **Recurring-revenue theme** — `service_contracts` (M1) → *Service Contract* quote type (M5) → recurring invoice templates (M9), + late-fee auto-application (M1/M9). *What it did:* recurring per-site maintenance plans with automatic periodic billing and enforced late fees. *Why it matters:* recurring maintenance is a core revenue stream for a security integrator; its absence caps the product at one-off project billing. *Not covered elsewhere.* (Component pieces could ship incrementally; the anchor is `service_contracts`.)
- **M11 tax-filing / PST / CRA-confirmation records** — durable filing records beyond the computed HST CSV + T5018. *Why it matters:* filing durability + multi-province (PST) is a compliance gap; the computed return has no persisted, acknowledged filing trail.

### P2 — designed, real gap, not blocking
- **Invoice write-off approval** (`invoices:approveWriteOff`, §4) — a permission-gated workflow to write off an uncollectible receivable with reason + audit. *Why it matters:* today a write-off would be an untracked edit — a financial-control gap. The clean roadmap-level casualty.
- **Onboarding gates + auto-composed T&C** (M1 → vendor M8 → contractor M10) — per-party compliance gates that inject clause text. Flagged in the audit as a differentiator ("no competitor does this"). Only static boilerplate shipped.
- **M12 scheduling depth** — five-dimensional auto-suggest dispatch engine, cross-resource scheduling, recurring appointments, emergency-dispatch override. The flagship scheduling differentiator; leaner tech-dispatch shipped instead.
- **Contractor-side parity** (M10) — versioned labor-rate tables, worker manifest + per-worker cert verification, contractor performance ledger + auto-degrade. All shipped for *vendors*; never for *subcontractors*.
- **Vendor onboarding gates + T&C versioning; vendor insurance/WSIB expiry + PO auto-block** (M8) — expiry/auto-block exist for subs only.
- **Permissions audit-capture commitments** (§7) — denied-attempt auditing, IP capture + 12-month nulling, system-actor rows. Forensic/privacy commitments; the shipped audit logs only successful permission *changes*.
- **AP 3-way match / price-discrepancy auto-flag** (M7); **scheduled low-stock cron digest** (M7 + handoff) — cron infra already exists; low-stock was never wired.
- **M5 pre-built assemblies + master pricebook** — quote-building productivity catalogs (simPRO parity).
- **M1 communication log** — a native per-client email/call/SMS log (basic CRM surface).

### P3 — catalogued only, no near-term intent
- **Permissions admin conveniences** — CSV grants round-trip; self-service `/profile/permissions` page.
- **M2** — equipment assignments; sessions view + force sign-out; employee map + licence-matrix report.
- **M3** — audit-retention / cold-storage config; sidebar-badge config; settings change-preview.
- **M4** — per-widget CSV export; per-user landing-page choice.
- **M1** — misc-contacts directory; client merge; client-level encrypted banking.
- **M9** — multi-currency + FX snapshot.
- **M12** — travel-time estimates (also collides with the no-paid-subscription constraint); external-calendar (iCS) export.
- **Handoff** — un-convert auto-return of committed stock (manual works today).

### UNCERTAIN (cannot confirm shipped or dropped from history alone)
- **M11 built-in General Ledger** (+ period close, bank rec, FX revaluation, recurring journals) — the largest designed capability, now computed roll-ups. Its fate is an *explicit open decision* (`BUILD_STATE_AUDIT.md` Q5: keep GL out of scope in favour of QuickBooks export?). Warrants a deliberate keep/drop ruling, not silent limbo.
- **`invoices:viewMargin`** — likely folded into `projects.viewFinancialsTab`, but the consolidation is unrecorded.
- **Admin-exception override audit** — depends on override actions that don't exist yet (REALITY-1 territory).
- **M6** — commissioning GPS/photo evidence + RLS immutability; phase-completion progress-invoice auto-generation.
- **M2 MFA enrollment; M3 backups pane (stub?); M7 photo-on-receive; M7 turnover ratio (proxy today).**
- **Handoff decision-forks** — project-vs-site allocation reconciliation; free-text vendor→FK wiring; INV-1c per-vendor-tab metrics; Guardian letterhead / `default_opco` auto-select; permissions runtime cutover completeness.

## 12. Recommended follow-ups (for a SEPARATE chunk — nothing changed here)

1. **Add to the roadmap (P1):** the recurring-revenue theme (`service_contracts` → Service Contract quote type → recurring invoices → late-fee engine) as one coherent initiative; M11 tax-filing/PST/CRA record layer.
2. **Add to the roadmap (P2):** invoice write-off approval; onboarding-gates + auto-T&C framework; M12 scheduling depth (auto-suggest, cross-resource, recurring, emergency override); contractor-side parity (labor-rate tables, worker manifest, perf ledger, onboarding gates); vendor gates + expiry auto-block; permissions audit-capture (denied attempts, IP, system actor); AP 3-way match; low-stock cron digest; assemblies + pricebook; client communication log.
3. **Resolve the open decision:** rule on the M11 built-in General Ledger (Q5) — keep-and-build, or formally drop in favour of QuickBooks export — so it leaves UNCERTAIN limbo.
4. **Correct two stale current-doc claims** (documentation-currency, §8 of PRINCIPLES): the feature audit still headlines "Three quote types" and "T&C auto-composition" (neither shipped); `BUILD_STATE_AUDIT.md §3 M12` says cert-expiry auto-block is missing when it shipped (`lib/api/schedule-assignments.ts`).
5. **Confirm-or-drop the UNCERTAIN items** by inspecting the live system (MFA, backups pane, commissioning photo/immutability, turnover ratio, the handoff decision-forks).

None of the above is acted on in this chunk. Recovery and repair are kept separate so both stay trustworthy.

## 13. Confidence statement — what history could NOT tell me

- **Git shows removals, not intent.** A capability catalogued in the feature audit and never built could have been a firm commitment or an aspirational parity note; the archaeology cannot always distinguish the two. Silent items from the *feature-audit catalog* are therefore weighted as "designed-but-uncommitted" and tiered conservatively (mostly P2/P3), except where a coherent cross-module theme (recurring revenue, onboarding gates) signals genuine intent.
- **"Not found in code" is bounded by search.** Absence was established by grepping `lib/`, `app/`, `components/`, `supabase/migrations/`, and the changelog. A capability implemented under an unexpected name could be misclassified DROPPED-SILENT. Where that risk was real, the item was marked UNCERTAIN instead.
- **The handoff premise was wrong in a useful way.** No handoff was git-deleted (the spec anticipated deletions); they simply stopped ~PR #151. So handoff losses are limited to *deferrals never revisited*, not *documents erased* — a smaller surface than feared.
- **The M7–M9 feature-audit detail** was synthesized from `BUILD_STATE_AUDIT.md §3` + direct grep because one sub-thread was still running at synthesis time; those rows are corroborated but slightly less deeply sourced than M1–M6/M10–M12.
- **The GL question is genuinely open, not silent.** It is flagged as an explicit decision in the current audit, so it is UNCERTAIN-by-design, not lost.
- **This document proves nothing shipped.** It only records the balance of evidence found in history as of HEAD `746321f`. Anything marked SHIPPED cites concrete evidence; anything that could not be proven shipped was not classified SHIPPED.

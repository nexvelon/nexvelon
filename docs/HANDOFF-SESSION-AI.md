# HANDOFF — SESSION AI

**Scope:** Quote-control epic, full Terms & Conditions overhaul, and the Guardian entity quote mode.
**Supersedes:** HANDOFF-SESSION-AH.md (retain AH + earlier as history).
**Shipped this session:** PRs #128–#146. **Migrations added this session: none** (all work was code + jsonb; per-entity terms reuse the existing `company_settings` table from migration 0028).

---

## Operator & workflow (carry-forward)

Jay = non-technical owner/operator of Nexvelon ERP (Next.js + Supabase + Vercel; repo `github.com/nexvelon/nexvelon`, app `app.nexvelonglobal.com`). Strategist Claude authors decisive specs; Jay pastes them into Claude Code (CC) and reports results. One decisive thing per CC paste; large/new-table features go two-phase (read-only Phase 1 inspect → Phase 2 build). Migrations run **only** via Supabase Dashboard SQL Editor. Region: Toronto/Ontario (EDT).

**New process lesson this session (important):** when several chunks touch the same files, **merge each PR before starting the next.** Stacking unmerged PRs that share files (e.g. all the Guardian schedule chunks touch `quote-schedules.ts`, `QuoteDocument.tsx`, `SchedulesCard.tsx`, `QuoteBuilder.tsx`) forces avoidable reconciles. Once we merged-between-chunks (GF-3 onward), every chunk branched clean and needed zero reconcile. For multi-chunk series, also add a **guard** to later specs that greps main for the prior chunk's marker and aborts if missing.

---

## Corporate structure (context that now lives in code + terms)

- **Nexvelon Inc.** — parent holding company. Owns the registered business name **"Nexvelon Global."** Ont. Corp. No. 1001583198; BIN 1001583824 (the "Nexvelon Global" name). Not an operating entity.
- **Nexvelon Integrated Solutions Inc.** — operating co. Supply/install/program/commission/service of low-voltage security/CCTV/access/intercom/fire systems, **plus CCTV/video monitoring** (subcontracted, possibly offshore). Ont. Corp. No. **1001583803**; HST **785486770 RT0001**. The default quote entity.
- **Nexvelon Guardian Inc.** — operating co. **ULC fire alarm supply/install/program + monitoring** (ULC fire, elevator, intrusion). Ont. Corp. No. **1001583800**; HST **720125632 RT0001**.
- All three share the registered office (350 Rutherford Road South, Plaza II, Unit 104, Brampton, ON L6W 4N6) and present under the licensed "Nexvelon Global" brand; each is separately insured/banked/operated for liability isolation. Inter-company trade-name licence agreements (parent→each opco) and an Integrated↔Guardian referral agreement exist (provided by Jay as PDFs).

---

## What shipped this session (PRs #128–#146)

**Post-handoff polish & fixes (#128–#131):** editable "Prepared by" on quotes (jsonb, no migration); timezone fix for prepared/issued dates (`BUSINESS_TIMEZONE="America/Toronto"`, `businessDateISO`/`businessDatePlusDaysISO` in `lib/format.ts`); timestamp quote numbers `YYMMDDHHMM` (`businessQuoteNumber`); duplicate-quote fix (fresh number + deep-copied sections, cleared `committedStockId`).

**Quote-control epic (#132–#136):** acceptance page → "ACCEPTANCE OF PROPOSAL", client-only signature + "authority to bind", removed decorative ornaments; settings-managed default Terms (`company_settings` key/value, admin editor in Quote Defaults); post-approval lock with Admin-only reopen; Terms editor + Agreement/Acceptance-schedule delete gated to Admin; discount lock with a per-user grant layer (`user_grants`, `lib/grants.ts`, `GRANT_EDIT_DISCOUNT`).

**Rate reconciliation (#137):** interest standardized to **2.5%/mo (30%/yr)**, credit-card surcharge **2.5%** everywhere (Canada row of `lib/late-payment-rates.ts`, template literals, form help).

**Terms & Conditions overhaul (#138–#139):** Integrated's DEFAULT_TERMS replaced with a comprehensive **23-section** plain-text T&C (corporate-structure/affiliate clauses, monitoring-by-affiliate framing, low-voltage/not-a-licensed-electrical-contractor scope, one-training-session-per-system, permits/ESA, concealed/hazardous conditions, change orders, commissioning/acceptance, PPSA, software licensing, CCTV/PIPEDA, subcontractors, H&S, compliance, dispute resolution, order of precedence, net-30 max payment term). Acceptance page gained the signing-awareness statement. PDF Terms render at compact ~7pt (`agreementBody` style) so they span fewer pages. **Liability cap $1,000 / 3-months is a placeholder for the lawyer.**

**Guardian entity quote mode (#140–#146):**
- **#140 (G1):** fixed Guardian template identity (its own HST `720125632 RT0001` + footer; previously cloned Integrated's) and **admin-gated** Guardian selection in the document/template picker (Integrated stays open to all; a quote already on Guardian stays usable for non-admins).
- **#141 (G2):** **per-entity default terms** — `DEFAULT_TERMS_GUARDIAN` + `DEFAULT_TERMS_BY_TEMPLATE`, a Guardian settings key + admin editor in Quote Defaults, both quote routes pass a `defaultTermsByTemplate` map, and `handleTemplateChange` swaps terms to the new entity's default **only when the current terms are an unedited default** (customized terms preserved).
- **#142–#145 (GF-1…GF-4):** four Guardian-only schedule "kinds" — **monitoring** (self-contained recurring monthly→annual ×12 billed-in-advance fee table), **dispatch** (police/fire/ambulance authorization + accept-regional-fees vs decline-police election + notes), **keyholders** (keyholder/pass-card list + burglar/fire/duress/medical response sequences), **pad** (pre-authorized payment authorization page — **no bank/card/CVV fields ever stored**; method checkboxes + signature + "details collected on a separate secure form"). Each mirrors the `assurance` kind, is offered in the picker only when `templateSlug === "guardian"`, and is fully self-contained from the one-time pricing pipeline.
- **#146 (GF-5):** selecting Guardian **auto-assembles** the four sections in canonical order (when none present), and the PDF **excludes Guardian-only kinds when `template.slug !== "guardian"`** (so they never render on an Integrated quote). `GUARDIAN_ONLY_KINDS` + `createGuardianDefaultSchedules()` centralized in `lib/quote-schedules.ts`.

---

## Architecture & key decisions

- **Entity/template system (pre-existing, now fully used):** a quote persists `templateSlug?: "integrated_solutions" | "guardian"` inside its jsonb blob (no column). `QUOTE_TEMPLATES` registry in `lib/company-profile.ts` holds each entity's letterhead (legalName, brand, address, HST, footers). The PDF resolves identity via `getQuoteTemplate(templateSlug)` → `template` prop in `QuoteDocument`; `templateSlug` itself does not reach the PDF except as `template.slug`.
- **Per-entity terms:** code consts `DEFAULT_TERMS` (Integrated 23-section) and `DEFAULT_TERMS_GUARDIAN` (Guardian 26-section) + `DEFAULT_TERMS_BY_TEMPLATE` map; Settings keys `default_quote_terms` (Integrated) and `default_quote_terms_guardian` (Guardian) override the consts. **A saved Settings value overrides the const** — after any terms code change, Jay must re-paste into Settings if he keeps a custom value there. Swap-on-entity-change only fires for unedited defaults.
- **Guardian sections are self-contained:** recurring monitoring fees compute inside the monitoring schedule (`monitoringTotals`: monthly, annual = ×12, setup); the core one-time `quoteTotals`/`TotalsBar` are untouched. Result: the PDF shows two independent money figures (one-time grand total; recurring annual). A combined "first-year total" is a deliberate future option, not built.
- **Admin gating:** `const isAdmin = role === "Admin"` in `QuoteBuilder`; Guardian template selection is admin-only; the Guardian and Integrated default-terms editors are admin-only.
- **No new schema:** schedule kinds are an additive tagged union; new kinds need no migration. PAD deliberately stores no financial account data.

---

## Key file locations (updated)

- **Terms/quote core:** `lib/quote-helpers.ts` (`DEFAULT_TERMS`, `DEFAULT_TERMS_GUARDIAN`, `DEFAULT_TERMS_BY_TEMPLATE`, `nextQuoteNumber`, `quoteTotals`), `lib/format.ts`, `lib/quote-store.ts`, `lib/use-read-only.ts`, `lib/grants.ts`, `lib/late-payment-rates.ts`.
- **Entity registry:** `lib/company-profile.ts` (`COMPANY_PROFILE` legacy; `QUOTE_TEMPLATES`, `QuoteTemplateSlug`, `getQuoteTemplate`, `DEFAULT_QUOTE_TEMPLATE_SLUG`).
- **Schedules/sections:** `lib/quote-schedules.ts` (`QuoteScheduleKind`, all instance interfaces, `QUOTE_SCHEDULE_DEFINITIONS`, factories, `GUARDIAN_ONLY_KINDS`, `createGuardianDefaultSchedules`, `monitoringTotals`).
- **Quote builder:** `components/modules/quotes/builder/` — `QuoteBuilder` (`handleTemplateChange`: terms swap + Guardian auto-assembly), `DocumentStyleCard` (template picker + `isAdmin` gate), `SchedulesCard` (kind picker, inline editors via `patchAt`, Guardian-only filter), `MonitoringEditor`/`DispatchEditor`/`KeyholdersEditor`/`PadEditor` (+ `AssuranceCardEditor`), `QuoteDocument` (`MonitoringPage`/`DispatchPage`/`KeyholdersPage`/`PadPage`/`ParticularsPage`/`AgreementPage`/`AcceptancePage`/`CoverPage`/`SectionTitle`, included-filter entity scoping), `PdfPreviewPane` (resolves template), `NotesCard` (Terms editor), `TotalsBar`.
- **API/actions:** `lib/api/company-settings.ts` (`DEFAULT_TERMS_KEY`, `DEFAULT_TERMS_GUARDIAN_KEY`), `app/(app)/settings/company-settings-actions.ts` (Integrated + Guardian get/set, admin-gated), `lib/api/quotes.ts`, `lib/api/products.ts`, `lib/api/user-grants.ts`.
- **Settings/users:** `components/modules/settings/SettingsPanes.tsx` (Quote Defaults pane: two admin-only terms editors), `components/modules/users/Tabs.tsx`.
- **Routes:** `app/(app)/quotes/{new/[page,NewQuotePageClient], [id]/page}`, `settings/page.tsx`, `users/page.tsx`.
- **Handoffs:** `docs/HANDOFF-SESSION-AI.md` (this, canonical), AH/AG/AE-AF (history).

---

## Pending / next

1. **Lawyer review (highest priority before client use):** both T&C drafts — Integrated 23-section and Guardian 26-section `.docx` (produced this session). Flag specifically: the **$1,000 / 3-month liability cap** (placeholder), the **4-hour deemed-acceptance** window, risk-transfer + consequential-damages clauses, the **offshore CCTV cross-border / PIPEDA** clause (Integrated §3), and the **PAD** wording (Canadian pre-authorized-debit formalities). Settings values must be re-pasted from the plaintext files after any terms code change.
2. **Guardian letterhead contact info** — confirm own phone/email/web vs. the shared Nexvelon Global values (one-line `company-profile.ts` edit if distinct).
3. **Combined "first-year total"** on the acceptance page (one-time + 12×monthly) — optional, not built.
4. **Client ↔ entity link** — clients carry `default_opco`; deferred decision on auto-selecting the Guardian template from a Guardian-default client (currently fully manual).
5. **Guardian regional false-alarm fee schedule** — the dispatch section references it; Guardian fills its own fee table (Jay had more docs to send).
6. **F-series commit/decrement live-test** — still never run on real inventory; recommended before production reliance.
7. **Backlog (unchanged):** PO/Vendors module, vendors-as-managed-list, CSV/PDF export, scheduled low-stock cron email, movements ledger, project-vs-site reconciliation (needs business decision), `/sites/[id]` detail page, eslint baseline (~1,600 pre-existing errors), `permissions.ts`↔`permissions-matrix.ts` consolidation.

---

## Operational notes & lessons

- **Merge-between-chunks** for multi-chunk series; add a grep guard to later specs (proved out GF-3→GF-5: zero reconciles).
- **Big string consts** (the 23/26-section terms) splice cleanly via CC's temp-file technique with no-backtick / no-`${` asserts.
- **Settings overrides the terms const** — the #1 recurring gotcha after terms edits.
- **PAD/financial data:** never capture or store account/card/CVV in the quote; authorization page only.
- Deliverable lawyer docs this session: `Nexvelon-Terms-and-Conditions-DRAFT.docx` (Integrated), `Nexvelon-Guardian-Terms-DRAFT.docx` (Guardian), plus matching plaintext files for Settings paste.

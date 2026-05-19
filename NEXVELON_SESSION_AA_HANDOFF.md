# NEXVELON — SESSION AA HANDOFF

Tuesday, May 19, 2026 · written by the strategist before the Claude Code session rolled over.

---

## 1. What shipped this session

**Chunk CL-2 — Client Form Expansion** — PR #17, 7 phases + smoke, awaiting merge.

- Migration `0007_clients_cl2_form_expansion.sql` — 22 additive columns on `public.clients` (billing_*, default_opco, allowed_opcos, tax_*, payment_*, portal_*, deleted_by). Run via Dashboard, file committed in repo.
- Server actions in `app/(app)/clients/actions.ts` — validation rules + admin-only Guardian gate + soft-delete + new `restoreClientAction` + `listClientsAction` admin-gated for archived view.
- `lib/api/clients.ts` — `getClients` / `getClientById` filter `deleted_at IS NOT NULL` by default; `includeDeleted` param available. New `restoreClient` helper.
- `app/(app)/clients/ClientFormDrawer.tsx` — full rewrite into 8 collapsible sections: Identity & Classification, Primary Contact, Billing Address, Operating Company, Tax, Payment Terms & Method, Portal Access, Notes.
- `components/ui/AddressAutocomplete.tsx` — new shared component; Google Places autocomplete on the billing street field; graceful fallback when `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` is absent (renders as plain input, no errors). Canada-restricted.
- `app/(app)/clients/ClientsView.tsx` — kebab row menu with Delete/Restore, confirmation dialog (reuses existing dialog primitive), admin-only "Show archived" toggle in filter bar, archived rows visually muted with strikethrough.
- `supabase/smoke/smoke_cl2.sql` — 27 schema verification checks; **all PASSED** on prod (2026-05-19). NOTE: file currently at `supabase/smoke/` but established convention is `supabase/migrations/` — small housekeeping pending (Phase 8, intentionally skipped to preserve handoff budget).
- New deps: `use-places-autocomplete` (^4.0.1, ~5KB hooks-only) + `@types/google.maps` (devDep, types-only peer).

## 2. NEW architectural locks this session (not yet in NEXVELON_FULL_HANDOVER.md)

### Sidebar — final, locked

Top-level menu order:

    Dashboard
    People
    Sales
    Jobs
    Inventory
    Orders
    Systems Configuration
    Invoices
    Scheduling
    Financials
    AI
    Reports
    Settings

Sub-items per group:

- **People**: Clients / Sites / Users / Employees / Vendors / Contractors / Misc Contacts  (three-state per Session D §0.7)
- **Sales**: Leads (Project / Service / Closed-Archived) · Quotes (Project Open / Service / Closed-Archived)
- **Jobs**: Projects / Service / Recurring Jobs
- **Inventory**: Allocation / Catalog / Counts
- **Orders**: Purchase Orders
- **Systems Configuration**: Extract info / Drawing Takeoff / System Design / Commissioning Files / Access Control / CCTV / Intercoms / ULC Fire / Intrusion / Monitoring / Integration
- **Invoices**: Contractor / Vendor
- **Scheduling**: Create-View / Timesheets / Work Orders / Task
- **Financials**: Financial Operations / Employee Salary-Commissions

**simPRO is the competitive floor** for Quotes / Projects / Inventory / Scheduling per `NEXVELON_PRINCIPLES.md` §3.

### Users vs Employees semantics

- **Users** = external accounts. Clients we choose to give scoped portal access. Read-only view of their own projects, gantt charts, commissioning files. Login provisioning ships with the Users module (not built).
- **Employees** = internal staff. Admin / sales reps / technicians / PMs / etc.

### Operating company details (locked)

| Field | Integrated Solutions Inc. | Guardian Inc. |
|---|---|---|
| HST/GST | 785486770 RT0001 | 785486770 RT0001 †FLAG |
| Address | Unit 104, 350 Rutherford Rd S, Plaza II, Brampton, ON L6W 4N6 | Same |
| Trade name | Nexvelon Global (licensed from holding co) | Nexvelon Global (licensed from holding co) |

†Guardian's HST/GST is shown as the same number as Integrated Solutions — almost certainly wrong (separate corporations need separate BNs). Guardian likely has no HST registration yet. Confirm with Jay when not in flight. Not blocking: no quotes go out under Guardian yet (template disabled).

### Permissions rule (locked)

Every employee defaults to **Integrated Solutions** access only. **Guardian access is admin-granted and time-limited.** Wired into `validateClientPayload` in CL-2 Phase 3 for `allowed_opcos` writes.

## 3. Pending sprint — run in this order

Each is one chunk = one PR.

1. **QB-1 — Quote builder bugs.** Site dropdown doesn't select (PDF preview already shows the site, so data binding works — the dropdown UI is broken). Sales rep dropdown shows the user UUID after selection instead of "Jay Shah · Admin". Template picker should enable Integrated Solutions for admin (Guardian disabled — defer Guardian template creation).
2. **QB-2 — Pricing overhaul.** Remove markup entirely → margin only, default 40% per line with per-line override. Discount currently doesn't reduce margin (bug). Discount value on PDF shows wrong number. Line totals always 2 decimals (no $16.50→$17 rounding). Tax rounding per CRA half-up rule at 3rd decimal.
3. **QB-3 — Parts & Labour line fields.** Parts form is missing the Part Name field. Labour line currently has the description box overlaying where hours should be — separate them. Labour must have the same fields as parts (qty / unit cost / margin / unit price / line total) and same behavior.
4. **QB-4 — Quote PDF visibility toggles.** Per-quote on/off for: unit price column, part #, part name, part description, vendor name. Defaults OFF for vendor name and part #. Part name and description independently toggleable. Same UX pattern as the existing show-unit-price toggle.
5. **QD-1 — Design template content & colors.** Add "Nexvelon Integrated Solutions Inc." after "Nexvelon Global" on the quote letterhead. Add tagline "Engineered to Protect Everything That Matters." Update color of "Nexvelon" inside "Nexvelon Global." Update background color of the design. **Hard requirement: every quote and invoice MUST show both the trade name (Nexvelon Global) AND the operating company legal name (Integrated Solutions Inc. / Guardian Inc.).**

## 4. Small deferred follow-ups (slot in when convenient)

- **client_code auto-generator** — no scheme defined; form currently shows "Auto-generated on save" placeholder and sends null. Suggested scheme: `C-YYYY-NNNN` per opco. Tiny chunk.
- **ContactFormDrawer `is_primary=true` default prop** — needed so the Primary Contact picker in ClientFormDrawer can preset the flag when creating inline. Tiny chunk.
- **CL-2 Phase 8 housekeeping** — move `supabase/smoke/smoke_cl2.sql` → `supabase/migrations/smoke_cl2.sql`, mark PR #17 ready for review (or do directly on GitHub after merge). Trivial.
- **Confirm Guardian HST/GST number** — ask Jay; if Guardian doesn't have its own registration yet, leave the field empty in opco config rather than duplicating Integrated Solutions'.

## 5. Paused sprints (resume after QD-1)

### Universal Attachments (Chunks N1–N9 + revised M)

Spec exists in earlier session chat. Goal: every entity type (Clients / Sites / Leads / Projects / Quotes / Employees / Contractors / Vendors) gets attachments via a polymorphic `(entity_type, entity_id)` engine. Includes Supabase Storage bucket + per-folder permissions + admin-configurable folder templates per entity type. Migrates everything from localStorage → Supabase along the way. Paused to ship the quote-first work.

### Quote Schedule M (drawings)

Originally a single floor-plan image with base64 in localStorage. Paused because Jay needs full-page drawings, 1 to 100+ pages per quote, high-res with small markups. Will resume in revised form after Universal Attachments lands — drawings stored in Supabase Storage as attachments on the Quote, Schedule II reads them from there.

## 6. Big roadmap captured (not active)

- AI assistant scoped per user's permissions; can read / answer / act on anything in the user's accessible scope; trainable from uploaded documents
- Systems Configuration auto-design engine: ingests RFP + client docs, outputs takeoff + 2D/3D system design + commissioning files + parts list + cable counts + permit list. Hardware vendor logic baked in (Axis cameras, Uniview switches, Kantech / ICT / Genetec / Keyscan, licenses, etc.). Major differentiator.
- Vendor integrations: ADI / Provo / Anixter / etc., onboarded one at a time, real-time catalog pricing sync
- QuickBooks sync — clients, invoices, payments, A/R, A/P
- Client intake form template — exportable as PDF / Word / email, sendable to client, returned PDF uploaded back creates or updates the client record (versioned, doesn't lose history)
- Full CSV / PDF / Excel export and import with date-range + entity filters (Settings → Export)
- Credit-card surcharge on invoices: 2.5% + applicable HST when client pays by credit card (flag captured on client record in CL-2)
- Mobile field app + external client portal — long arc

## 7. Architectural locks — DO NOT re-decide

- Two-template architecture (Integrated Solutions + Guardian) — Guardian disabled
- Page size Letter (8.5 × 11), not A4
- 13 quote themes, default `default_theme_grayish`
- 7 schedule kinds in the quote
- `auth.users` translation rule — every `REFERENCES users(id)` → `REFERENCES auth.users(id)`
- Nothing in localStorage except transient UI state (Attachments sprint enforces this)
- DB migrations via Supabase Dashboard SQL Editor only — no CLI, no GitHub Actions for DB
- Smoke files in `supabase/migrations/` alongside migrations, temp-table aggregation pattern, single final SELECT
- One chunk = one PR. No compressed / parallel chunking
- Branch naming: `feature/<scope>-<chunk-id>-<short-name>`
- Commit format: `<type>(<scope>): <Chunk ID> — <description>`
- Vercel auto-deploys from `main` on push
- **NEVER run** `scripts/wipe-test-data.sql`

## 8. Operator style — critical for next session

Jay is non-technical. He pastes specs into Claude Code and pastes the output back to the strategist chat. Rules that came out of this session the hard way:

- **ONE Claude Code paste per strategist turn.** Not a phase plan, not multiple options. One thing to copy and paste.
- **Paste-able content must be in fenced code blocks** so the chat UI shows the copy button. Loose text without a code block is hard to copy on mobile.
- **Do not ask redundant questions.** If the answer is in the conversation, in an audit output, or in a file already returned — use it. Re-asking frustrates the operator.
- **Do not dump huge specs as prose with embedded instructions.** Claude Code reads the spec; the operator just copies. Length is fine; format matters more.
- **Slow and steady.** No compressed work without explicit go-ahead. No batching of unrelated chunks.
- **Be decisive.** Options-menus frustrate the operator. Pick a path, flag the tradeoff, move.
- **When the operator pushes back hard, take it seriously and adjust.** Apologise once if warranted, then deliver. Don't get defensive, don't grovel.

## 9. How to resume in the next Claude Code session

1. Read this file in full first.
2. Skim `NEXVELON_FULL_HANDOVER.md` at the repo root — 13-module roadmap, locked decisions.
3. Skim `CLAUDE_CONTEXT.md` sections: §4 (Folder Structure), §5 (DB Schema), §14 (Critical Files Inventory), §15 (Conventions). The "Current Session State" block at the top of CLAUDE_CONTEXT.md is stale through CL-2 — trust this handoff over it until refreshed.
4. Confirm to the operator (Jay) with one sentence: "Loaded session AA handoff. CL-2 merged, sidebar locked, next chunk is QB-1. Ready when you are."
5. Wait for the operator's go. Then spec QB-1.

---

End of handoff.

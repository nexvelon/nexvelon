# Nexvelon — Session AE Handoff

**Period covered**: Session AE (POLISH-N polish series — PRs #252–#273)
**Started**: After CL-5c Phase 2b (PR #68) closed Session AD
**Ended**: After the trade-name routing fix (PR #273)
**Modules updated this session**: Clients + Sites + Contacts — delete-behavior overhaul, contact routing fix, site contacts UI/CRUD, client detail redesign, Company Address inheritance, site-code unification, Excel single + bulk templates, email/T&C polish
**Modules in queue**: None pinned — polish arc wrapped; Jay will direct the next sprint
**Current status**: POLISH-N series complete. Migrations applied through 0075. Repo docs refreshed so future sessions need no chat handover.
**Last shipped PR**: #273 (trade-name routing fix)

> **Doc-debt note.** Before this session the repo continuity docs
> (`CLAUDE_CONTEXT.md`, `NEXVELON_ROADMAP.md`, the AD handoff) were ~200
> PRs behind reality — they described state through PR #68 / migration
> 0017 while `main` was actually at PR #273 / migration 0075. This handoff
> closes that gap. `NEXVELON_SESSION_AD_HANDOFF.md` (CL-5 trilogy) is the
> prior handoff; the POLISH-43→#273 arc summarized here is the missing
> narrative between AD and now.

---

## §1. Session AE Summary — Arcs Shipped (PRs #252–#273)

The POLISH-N working numbering scheme (sequential session counter) maps to
GitHub PRs as noted per arc below. One focused, non-draft PR per task
throughout.

### Client / Site delete-behavior overhaul (POLISH-43–46 · PRs #252–#255)
- **Clients: soft-delete default + optional hard-delete via type-to-confirm.**
  `UPDATE … SET deleted_at = now()` is the button default; permanent
  removal is gated behind a type-the-name confirmation dialog.
- **Sites: hard-delete with atomic plpgsql cascade.** Archive (soft) +
  Permanently Delete (hard) on the site surface.
- **Migrations:**
  - `0068_client_delete_policy.sql` — DELETE RLS policy.
  - `0069_hard_delete_client.sql` — `hard_delete_client()` SECURITY DEFINER
    plpgsql function (atomic cascade).
  - `0070_site_delete.sql` — `hard_delete_site()` SECURITY DEFINER plpgsql
    function (atomic cascade).
- **WHY plpgsql, not sequential JS DELETEs:** the FK graph has hidden
  `ON DELETE RESTRICT` edges (e.g. `labour_entries → project_cost_centers`).
  A JS sequence of DELETEs across the chain can half-complete and strand
  rows or error mid-way; a single SECURITY DEFINER plpgsql function deletes
  the whole graph atomically in dependency order or rolls back entirely.
- **`activity_log` rows are preserved** across hard-delete per the Snapshot
  Principle — the audit trail outlives the business record.

### Contact routing fix — was a bug (POLISH-47–49 · PRs #256–#258)
- **Invite-approved contacts now flow into the `contacts` table.** They were
  previously being dumped as free text into a notes field on approval — a
  real data-loss-shaped bug. Fixed so `clientInsertFrom` / `siteInsertFrom`
  route contacts to proper `contacts` rows.
- **Also fixed:** sites not appearing after invite approval (#257); GC
  contact field showing on the client form when it belongs only on the site
  form (#256/POLISH-47).
- **SCHEMA REALITY (documented to stop future guessing):**
  - `contacts` uses **boolean flags** `is_primary`, `is_billing`,
    `is_accounts_payable`, `is_emergency` plus a free-text
    `contact_type_custom` — **there is no `role` column.**
  - Phones jsonb shape is **`{label, number}`**, NOT `{label, value}`.
- **Site contacts** are stored with `client_id = NULL` + `site_id = <set>`
  so they don't pollute the client's contact tab — site-scoped contacts
  stay on the site, client-scoped contacts stay on the client.

### Site Contacts UI + CRUD (POLISH-50, 58 · PRs #259, #266)
- **Read-only display first** on `/sites/[id]` (#259), then **full CRUD**
  (#266).
- CRUD reuses `ContactFormDrawer` via a new **`create-site` mode** rather
  than a duplicated drawer.
- **Pattern locked:** extend a shared component with a `mode` prop
  (`create` / `edit` / `create-site`) instead of forking. One component,
  three behaviors.

### Client detail page redesign (POLISH-51, 52 · PRs #260, #261)
- All client fields render **inline in a responsive 2-col grid** (replaced
  the drawer-only view). Site address moved into its own Site Addresses
  section (#260).
- **Per-section pencil edit** — only one section editable at a time; a
  top-right "Edit all" button is preserved as a backup full-edit path.
- **CRITICAL REACT PATTERN:** `SectionCard` **MUST be hoisted to module
  scope.** Defining it inside the parent component re-creates the component
  type on every render → React unmounts/remounts the subtree → **input
  focus is lost while typing.** This bit us and the fix is non-negotiable.
  (See `app/(app)/clients/[id]/ClientInfoSections.tsx`.)

### Company Address field + copy-resolved inheritance (POLISH-53–55 · PRs #262–#264)
- **New top-level Company Address:** `company_address_line1`,
  `company_address_line2`, `company_address_city`, `company_address_province`,
  `company_address_postal`, `company_address_country`.
- **Migrations:**
  - `0071_client_company_address.sql` — adds the company address columns.
  - `0072_address_inheritance_flags.sql` — adds the "same as" flag columns
    + backfill.
  - `0073_mailing_same_as_site.sql` — adds `sites.mailing_same_as_site`.
- **ARCHITECTURE SWITCH: copy-resolved + flag tracking, NOT
  NULL-when-inheriting.** When a "same as" toggle is on, the actual address
  values are **copied** into the billing/mailing fields and a flag column
  records the inheritance. Editing the source address pops a **cascade
  dialog**: "Update dependent to match?"
  - **WHY:** Jay needs to extract field values directly from a single row.
    NULL-when-inheriting forces a resolution join/walk at every read; copied
    values are immediately queryable.
- **Mailing supports TWO "same as" options** (Billing **or**
  Company/Site) plus a manual-entry fallback (#264/POLISH-55).
- **Clean read separation:** the **PDF generators and the Submission Detail
  view read the form jsonb** (which is NULL for inherited fields, i.e.
  frozen at submit time); the **live client/site row is copy-resolved**
  (flag-driven, mutable). Don't conflate the two.
- **Real column names (discovered in pre-flight, correcting naive
  assumptions):** billing uses `billing_street`, `billing_city`,
  `billing_unit`, `billing_province`, `billing_postal`, `billing_country`
  — **NOT** `billing_address_line1`. Only the **company** address uses the
  `_line1`/`_line2` naming.

### Site code unification (POLISH-57, 59 · PRs #265, #267)
- **`0074_backfill_site_code.sql`** — backfilled invite sites from NULL into
  a global `S-NNN` format.
- **`0075_unify_site_codes.sql`** — backfilled `client_code` as
  **`C-IS-{year}-{NNNN}`** (per-opco, per-year, 4-digit) and renumbered all
  invite sites into the per-client **`S-{client_code}-NNN`** (3-digit
  per-client) format.
- **WHY:** invite-originated clients had `NULL` `client_code`, so the
  per-client site format had nothing to hang off of. The backfill + helpers
  unify the manual path and the invite path onto one scheme.
- **Helpers added** in `lib/api/clients.ts`: `nextClientCode(opco_prefix,
  year)` and `nextSiteCodeForClient(clientId)` — reused by both
  `clientInsertFrom`/`siteInsertFrom` (invite path) and
  `createClient`/`createSite` (manual path).

### Excel templates — single + bulk (POLISH-60, 61 · PRs #268, #269)
- **Single-client onboarding template:** Company Address appended at rows
  **49–56** (safe end-append, no row shifts), template version bumped
  **v3 → v4** (`nexvelon-onboarding-v4`).
  - **WHY end-append:** the parser reads addresses by **absolute row
    numbers**; inserting rows mid-sheet would shift every downstream field
    and break the parser.
- **NEW bulk client importer:** a **46-column wide** template, one row per
  client, parsed in-browser; server action `bulkImportClientsAction`,
  admin-only dialog (`BulkImportClientsDialog.tsx`,
  `lib/client-bulk-template.ts` version `nexvelon-client-bulk-v1`).
- **Two flows coexist:** single-client **prefills the create form** for
  human review; bulk **creates many directly** via the service action.

### T&C documents updated — manual via Settings → Quote Defaults (NOT in git)
> These live in the database via the `LegalDocEditor` in Settings, not in
> source. Recorded here for continuity only.
- Both **IS** and **Guardian** T&C now split the **Warranty** section into
  **5 sub-clauses**: manufacturer pass-through, workmanship warranty, delay
  impact on warranty, storage fees (with 15% handling fee), disclaimer.
- **NEW Section 24 (IS) / Section 27 (Guardian) — Consumer Clients**
  (Ontario CPA carve-out). Lets Nexvelon serve residential consumers while
  preserving commercial-grade harsh terms for B2B.
- **Pending Ordower Law review.**

### Email infrastructure notes
- **Microsoft 365 for `nexvelonglobal.com` fully configured** — SPF + DKIM
  + DMARC all complete.
- **Aliases on `ceo@`:** `IntegratedSolutionsPayments@`, `GuardianPayments@`,
  `NexvelonPayments@`, `ClientsAndSitesInfo@`, `inquiries@`.

### Misc polish (POLISH-62–64, #273 · PRs #270–#273, plus earlier #248–#251)
- Tier benefit bullet line spacing tightened (next-line, not double-space)
  — `margin 24px → 4px` (#270/POLISH-62).
- Confirmation email closing simplified; invite bullets get a **hanging
  indent** (`padding-left: 24px` + `text-indent: -24px`) (#271/POLISH-63).
- Site form placeholder **"Head Office" → "Project Name"** (#272/POLISH-64).
- **Trade-name routing bug (#273):** `clientInsertFrom` was setting the
  display `name` from the **legal** name instead of the entered **trade /
  business** name. Fixed so the entered trade name is stored as the display
  name; "Company Trade/Business Name" label unified across surfaces.
- Earlier email-copy arc (#248–#251 / POLISH-40–42): confirmation email
  cleanup, approval/tier-change bullet rendering.

---

## §2. Architectural Locks (carried forward from AD + extended this session)

### §2.1 Past-Data Preservation
Unchanged in principle; extended this session:
- Hard-delete functions preserve `activity_log` rows (audit outlives the
  record).
- Dormant columns from earlier sprints are **not** dropped (e.g. legacy
  `billing_same_as_primary_site`, site systems columns).

### §2.2 Snapshot Principle (universal)
Extended: **PDF + Submission Detail read the form jsonb** (frozen at submit
time, NULL when inheriting); the **live row is copy-resolved** (mutable,
flag-driven). These are deliberately two different read paths.

### §2.3 Page Size: A4
Unchanged.

### §2.4 Inventory cost tracking: specific-identification per-lot
Unchanged (Inventory not yet built).

### §2.5 Form section consistency
ClientFormDrawer / client-detail section order is now (post-POLISH):
Identity & Classification → **Company Address** → Billing Address →
Mailing Address (two "same as" options) → Tax → Payment Terms & Method →
Portal Access → Notes → Contact Information (dynamic, create-mode only).
The Operating Company section flagged for removal in AD's CL-6 plan is gone.

### §2.6 Delete safety (NEW from AE)
Cascade deletes across an FK graph are **atomic plpgsql SECURITY DEFINER
functions** (`hard_delete_client`, `hard_delete_site`) — never JS sequential
DELETEs. The FK graph must be enumerated from migration files before any
destructive scope is written, because of hidden `ON DELETE RESTRICT` edges.

### §2.7 Copy-resolved inheritance (NEW from AE)
"Same as" relationships copy real values into the dependent fields and track
the relationship with a flag column. Editing a source address prompts a
cascade dialog to update dependents. Chosen over NULL-when-inheriting so
field values are directly queryable without a resolution walk.

---

## §3. Modules Status (End of Session AE)

| Module | Status | Notes |
|--------|--------|-------|
| Dashboard | Basic | Placeholder, future work |
| **Quotes** | **100% DONE** | (carried) |
| Projects | Basic | Future module |
| **Clients** | **100% DONE + POLISH arc** | Delete overhaul, Company Address inheritance, detail-page redesign, bulk + single Excel import |
| **Sites** | **100% DONE + POLISH arc** | Hard-delete cascade, site contacts UI/CRUD, code unification |
| **Contacts** | **100% DONE** | Routing bug fixed; site-scoped via client_id=NULL + site_id |
| Inventory | Queued (next horizon) | INV-1 through INV-6 per ROADMAP §6 |
| Scheduling | Future | |
| Financials | Future | |
| Reports | Future | |
| Users | Basic | |
| Settings | Functional | Hosts LegalDocEditor (T&C) + Quote Defaults |

---

## §4. Key File Locations — Updates from AE

### New migrations (all applied through 0075)
- `0068_client_delete_policy.sql` (+ smoke) — DELETE RLS
- `0069_hard_delete_client.sql` (+ smoke) — atomic client cascade
- `0070_site_delete.sql` (+ smoke) — atomic site cascade
- `0071_client_company_address.sql` (+ smoke) — company address columns
- `0072_address_inheritance_flags.sql` (+ smoke) — "same as" flags + backfill
- `0073_mailing_same_as_site.sql` (+ smoke) — sites.mailing_same_as_site
- `0074_backfill_site_code.sql` (+ smoke) — invite sites → global S-NNN
- `0075_unify_site_codes.sql` (+ smoke) — client_code backfill + per-client renumber
- **Next migration number: 0076.**

### Key files touched / added
- `lib/api/clients.ts` — `nextClientCode`, `nextSiteCodeForClient`,
  `createClient`, `createSite`, `getContactsBySite`
- `lib/api/client-invitations.ts` — `submitInvitation`, `clientInsertFrom`,
  `siteInsertFrom` (contact routing + trade-name fix)
- `app/(app)/clients/[id]/ClientInfoSections.tsx` — inline grid, per-section
  edit, cascade dialog. **SectionCard hoisted to module scope.**
- `components/modules/clients/BulkImportClientsDialog.tsx` — admin-only bulk import
- `components/modules/sites/SiteContactsPane.tsx` — site contacts CRUD
- `components/modules/contacts/ContactFormDrawer.tsx` — `create` / `edit` /
  `create-site` modes
- `app/(app)/clients/pending/[id]/PendingReviewDetail.tsx` — reads form jsonb
- `lib/client-onboarding-template.ts` — single-client xlsx (v4)
- `lib/client-bulk-template.ts` — bulk xlsx (`nexvelon-client-bulk-v1`)
- `lib/auth/email.ts` — invite / confirmation / approval / tier-changed emails
- `lib/auth/client-form-pdf.tsx`, `lib/auth/site-form-pdf.tsx` — PDF generators

---

## §5. Lessons Learned — Architectural Patterns to Preserve

1. **Atomic plpgsql for cascade deletes.** Sequential JS DELETEs are unsafe
   when the FK graph has hidden `ON DELETE RESTRICT` edges. Use SECURITY
   DEFINER plpgsql functions that delete the whole graph or roll back.
2. **Copy-resolved inheritance with flag columns > NULL-when-inheriting** for
   any data that has to be directly queryable. Copy the values; track the
   relationship with a flag; cascade-prompt on source edits.
3. **Two read paths for snapshots.** PDF / Submission Detail read the form
   jsonb (frozen at submit, NULL when inheriting); the live row is
   copy-resolved (mutable). Keep them distinct.
4. **Stale-refetch is the recurring failure class.** Set local state the
   instant a server action returns `ok` — never rely on `router.refresh()`
   to update UI for just-changed data.
5. **Pre-flight FK-graph enumeration is mandatory** before any destructive
   scope. Read the migration files; map the edges; then write the cascade.
6. **Verify field names against the schema** — real columns differ from
   naive assumptions (`billing_street` not `billing_address_line1`; phones
   `{label, number}` not `{label, value}`; boolean flags not a `role`
   column).
7. **Hoist nested components to module scope** to avoid React re-creating the
   component type each render (causes input focus loss while typing).
8. **Form-to-mode pattern:** extend a shared component via a `mode` prop
   rather than duplicating it.
9. **Excel absolute-row parsers:** append-at-end is safe; inserting rows
   mid-sheet shifts everything and breaks the parser.

---

## §6. Deferred Items (Tracked)

Carried from AD where still relevant; new from AE below.

NEW deferred items from AE:
1. **T&C Ordower Law review** — the Warranty 5-sub-clause split and the new
   Consumer Clients section (IS §24 / Guardian §27) are pending legal review.
   Stored in DB via LegalDocEditor, not in source.
2. **`title` → `role` column rename** (carried from AD §6 #5) — still UI-only
   relabel; DB column remains `title`. Not urgent.
3. **Single-client template Site fields** — sites are created separately;
   the template focuses on client + company/billing/mailing addresses.

---

## §7. Operating Context

Unchanged operator style: one chunk per non-draft PR; pre-flight read +
report before implementing; Supabase Dashboard SQL Editor for migrations
(never the CLI); strategist (claude.ai) writes specs, Claude Code executes
and flags spec-vs-reality deviations.

Patterns reinforced this session:
- **Pre-flight caught spec errors** — naive column names
  (`billing_address_line1`) corrected to reality (`billing_street`) before
  any SQL was written.
- **Backwards-compat at migrations** — backfill before any column semantics
  change; dormant columns left in place.
- **Cross-chunk awareness** — the trade-name fix (#273) surfaced from the
  invite-path refactors; caught and corrected end-to-end.

---

## §8. Tooling

Unchanged stack: Next.js 15 App Router + RSC, Supabase (auth, DB, storage),
@react-pdf/renderer, exceljs (dynamic-imported), Base UI (`@base-ui/react`,
no `asChild`), Tailwind v4, Resend, Vercel (iad1).

New this session:
- Atomic plpgsql cascade-delete pattern (`hard_delete_client`,
  `hard_delete_site`).
- Copy-resolved address inheritance + cascade-dialog pattern.
- Bulk Excel importer (46-column wide template + in-browser parse + service
  action).

---

## §9. What's Pending / Next Horizon

The POLISH-N polish arc is **wrapped**; no sprint is currently pinned. Jay
will direct the next sprint.

Standing roadmap candidates (per `NEXVELON_ROADMAP.md`, strategic intent
unchanged):
- **Inventory Sprint (INV-1 → INV-6)** — the next major module per ROADMAP §6.
- Permissions module build phase + the Quotes→Reports v1 sequence remain the
  long-horizon plan; their session-state numbering in the older docs is
  historical, but the strategic sequencing still holds.

---

## §10. How to Start a New Claude Session

1. **Read docs in this order:**
   - `NEXVELON_PRINCIPLES.md` (the six non-negotiables)
   - `CLAUDE_CONTEXT.md` "Current Session State" block (now current as of AE)
   - `NEXVELON_SESSION_AE_HANDOFF.md` (THIS document — latest)
   - `NEXVELON_ROADMAP.md` (strategic intent + v1 acceptance bars)
   - `NEXVELON_SESSION_AD_HANDOFF.md` (prior — CL-5 trilogy) and earlier
     handoffs as historical reference
2. **Current state at end of AE:** migrations applied through **0075**; last
   merged PR **#273**; client/site/contact modules complete through the
   POLISH arc. Repo docs are now the source of truth — no chat handover
   required.
3. **Next migration number: 0076.**
4. **Architectural locks:** §2.1–§2.7 are non-negotiable.
5. **Phase 1 inspect → Phase 2 implement** for any non-trivial chunk: read +
   report (especially FK graphs and real column names) before editing.
6. **One non-draft PR per task**; verify with
   `npx tsc --noEmit && npm run lint && npm run build && npm test`.

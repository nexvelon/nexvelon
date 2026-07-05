# Nexvelon Session Handoff — for next Claude chat

**Prepared:** July 5, 2026
**Purpose:** Give the next Claude chat everything it needs to continue Jay Shah's Nexvelon ERP + website work without re-audit or memory loss. Paste the entire contents of this file at the start of the new chat.

---

## Who Jay Shah is + how we work

Jay is founder and sole director of Nexvelon corporate group (Brampton, Ontario). Non-technical. Business/product owner. He does not write code.

**Working loop (locked pattern):**

1. Jay says what he wants in plain language
2. Claude (strategist) writes ONE decisive Claude Code spec per turn
3. Jay pastes the spec into Claude Code
4. Claude Code opens a PR
5. Jay pastes the Claude Code report back to Claude
6. Claude interprets, tells Jay to merge, gives next spec
7. Repeat without stopping until Jay says stop

**Jay's rules for Claude:**
- No menus, no clarifying questions unless truly ambiguous
- No option lists — pick decisively and flag deviations
- Bake-in decisions rather than asking
- Very short replies. Just what's needed to move to the next step
- Never make Jay hunt for things — copy-paste blocks only
- Communication style: Jay types fast with typos; single-word confirms mean proceed
- Concise for conceptual questions; detailed structured output for specs

**Pace:** "We only stop when I tell you, else we just keep going."

---

## Corporate structure

- **Nexvelon Inc.** — Holdco, business name "Nexvelon Global", owns NEXVELON trademark
- **Nexvelon Integrated Solutions Inc.** — Opco (install/supply/program/commission), HST 785486770 RT0001
- **Nexvelon Guardian Inc.** — Opco (service/maintenance/monitoring), HST 720125632 RT0001

Address: 350 Rutherford Rd S, Unit 104, Brampton, ON L6W 4N6 (virtual office).

Jay is legally allowed to work anywhere in Canada.

All employees are hired under Integrated Solutions. Trademark licensed holdco → opcos.

---

## Repos + infrastructure

- **ERP repo:** github.com/nexvelon/nexvelon (public)
- **Website repo:** github.com/nexvelon/nexvelon-website (public)
- **Hosting:** Vercel (Hobby plan)
- **Live URLs:** nexvelonglobal.com (marketing) · app.nexvelonglobal.com (ERP)
- **Database:** Supabase (ca-central-1). All migrations applied via Supabase Dashboard SQL Editor (no CLI)
- **Email delivery:** Resend, from-domain nexvelonglobal.com (SPF + DKIM + DMARC verified)
- **Business email:** Microsoft 365 on nexvelonglobal.com
- **Deployment:** Vercel auto-deploys from main branch push

**Cosmetic Vercel warning:** jayshahvip warning appears on every PR — ignore it, it's a Git author metadata thing that doesn't block anything. Made both repos public to resolve preview blocking.

---

## Tech stack (ERP)

- Next.js 15 App Router, TypeScript strict mode
- Tailwind v4, Base UI components
- Supabase (auth + Postgres + Storage)
- @react-pdf/renderer for PDFs
- Resend for email
- Vitest + Testing Library for tests

---

## Persistence documents in ERP repo root

Claude Code should read these at start of every session:
- NEXVELON_PRINCIPLES.md — architectural non-negotiables (§1-§7)
- NEXVELON_ROADMAP.md — module roadmap
- NEXVELON_CLAUDE_CONTEXT.md — session context
- NEXVELON_FEATURE_AUDIT.md — feature status
- NEXVELON_PERMISSIONS_DESIGN.md — permissions design
- docs/handoff-session-*.md — session-by-session handoffs

---

## NEXVELON_PRINCIPLES §3 — Supabase Data API GRANTs (MANDATORY)

After Oct 30, 2026, new tables in public schema will not be auto-exposed to supabase-js/PostgREST/GraphQL. Every new-table migration MUST include:

1. CREATE TABLE
2. GRANT select, insert, update, delete ON public.new_table TO authenticated
3. GRANT select, insert, update, delete ON public.new_table TO service_role
4. ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY
5. At least one RLS policy

Skipping any produces silent runtime failures.

Existing tables keep their grants — no retroactive changes needed.

---

## Website state (nexvelon-website)

Fully complete after 14 PRs merged (June 28-30, 2026).

Live at nexvelonglobal.com with:
- 6-slide hero rotation (5.5s cycle, brightness 75%)
- Branded fleet image (Mercedes Sprinters with NEXVELON GLOBAL livery)
- Sector I: Commercial (mall atrium photo)
- Sector II: Residential (unchanged)
- Sector III: Industrial (night facility photo)
- Sector IV: Institutional (library interior photo — Unsplash by Dominic Kurniawan Suryaputra)
- "Our capabilities" mosaic (8 tiles, enlarged 33%)
- Guardian section mentions both companies
- CTA copy: "Secure your family, business, and the things that matter most to you by being a Nexvelon client."
- Fleet section, then CTA (yacht background)
- Section order: Hero → Industries → Work → Fleet → CTA → Partners → Process → Guardian → Divisions → Craft → FAQ
- Schema.org Organization + LocalBusiness JSON-LD (Nexvelon Inc. holdco + 2 opcos + WebSite)
- Logo file: images/nexvelon-logo.png (1024×1024 transparent PNG)
- Google Search Console verified, sitemap submitted (submitted July 3 — expect indexing 2-6 weeks)

**Website workflow:** Same as ERP. Chat → spec → Claude Code PR → merge → Vercel auto-deploys.

---

## ERP module state (as of July 5, 2026)

### ✅ COMPLETE modules (real DB, wired, live)

| # | Module | Notes |
|---|---|---|
| 1 | Auth & Users | Supabase Auth + profiles, OTP email |
| 2 | Clients | Heavily polished (POLISH-43→64 arc): soft/hard delete cascade, contact CRUD, address inheritance, bulk import |
| 3 | Sites | Full CRUD, hard delete cascade |
| 4 | Contacts | Full CRUD, routing bug fixed |
| 5 | Employees | Live |
| 6 | Settings | Company + app settings, PO sender email pane |
| 7 | Attachments | Polymorphic engine wired to clients/quotes/sites/inventory |
| 8 | Inventory | Full sprint: catalog, xlsx import, receiving, stock lifecycle, allocation, low-stock, all 7 tabs on real DB |
| 9 | Vendors | Real FK'd, includes sales_rep_email |
| 10 | Purchase Orders | Full loop: create → issue → email vendor with PDF → receive → inventory |
| 11 | Invoices | Schema + code live |
| 12 | Quotes | Real DB list page, 12 themes, 2-company templates, Tiptap rich text, delete + send guards |

### 🟡 PARTIAL

| # | Module | Gap |
|---|---|---|
| 13 | Projects | Schema exists (0041, 0042), route exists, thin build — created as quote conversion target only |
| 14 | Labour | Schema exists (0054, 0055), code partial |

### 🔴 NOT BUILT

| # | Module | Status |
|---|---|---|
| 15 | Dashboard | Mock UI shell |
| 16 | Scheduling | Mock UI shell |
| 17 | Financials | Mock UI shell |
| 18 | Reports | Mock UI shell (real reports are inside Inventory tab) |
| 19 | Subcontractors | Nothing — no route, no table |

### 🟡 Permissions runtime

- Schema built (20+ tables from 0005/0006/0029, plus supporting migrations)
- Data NOT seeded (0 rows in permission_definitions, role_permissions, etc.)
- App still uses static matrix at lib/permissions.ts
- 33 files import the static matrix
- Cutover to DB-driven runtime is deferred until all modules are built (so we know all permission needs)

---

## Recent PR arc (Sprints 1, 1.5, 1.6 — July 4-5, 2026)

### Sprint 1: Fix Quotes (all merged)
- **PR #276** — QUOTES-1: cut list page off localStorage, wire to real DB
- **PR #277** — QUOTES-2: fix Send to Client (UI disable + server guard + honest toast)
- **PR #278** — QUOTES-3: admin can delete Draft quotes (confirmation + audit + project-ref guard)
- **PR #279** — QUOTES-4: cleanup, real sites in list, deprecate quote-store, smoke test
- **PR #289** — QUOTES-5: fix builder Send for Approval bypass + data patch reverted Q-260622184512-57

### Sprint 1.5: Vendor PO Template (all merged)
- **PR #280** — PO-1: schema (vendor sales_rep fields, PO fields, activity_log CHECK widening) — migration 0076
- **PR #281** — PO-2: PurchaseOrderDocument PDF template + preview pane
- **PR #282** — PO-3: sender email setting + Settings UI pane (default ceo@nexvelonglobal.com)
- **PR #283** — PO-4: issue action with PDF render + vendor email + Storage upload — migration 0077

### Sprint 1.6: Inventory sweep (all merged)
- **PR #284** — INV-1a: wire POs, Vendors, Categories tabs to real DB
- **PR #285** — INV-1b: wire Transfers + Allocations tabs to real DB, fix stat cards
- **PR #286** — INV-2: serial-number global search + carry serial onto quote/invoice lines
- **PR #287** — INV-3: pickup slip PDF + signature capture — migration 0078
- **PR #288** — INV-4: RMA flow (return to vendor with PDF authorization) — migration 0079

All migrations 0076-0079 applied via Supabase Dashboard SQL Editor.

---

## Deferred / tracked-not-blocking

- Live end-to-end PO email test (PO-4 shipped but Jay didn't do live test)
- INV-1c: Vendor tab YTD spend / lead time / top parts metrics
- INV-3b: Pickup slip panel on product detail page
- Invoice-time consumption reconciliation
- Physical/cycle count workflow

---

## Sprint sequence going forward (Jay's confirmed order)

1. **Sprint 2 — Projects depth** ← NEXT
2. **Sprint 3 — Scheduling**
3. Order for Sprints 4+ TBD after 2 and 3 ship

Then eventually:
- Financials
- Dashboard (wire to real data)
- Reports
- Permissions runtime cutover
- Subcontractors
- Mobile field app (Phase 2)
- External client portal (Phase 2)

---

## Sprint 2 kickoff — Projects depth

The Projects module is thin. Only exists as the target of quote→project conversion. Real project management needs building.

**Sprint 2 requires an audit first** (proven pattern to avoid wrong-assumption specs).

### Audit spec ready to paste in next chat:

Task: Audit-only. Read and report on the Projects module in the ERP repo. NO code changes.

Context: The Projects module currently exists (migration 0041 created it as quote conversion target) but is thin. Sprint 2 will build real project management depth. Need to know exactly what's there before writing the build.

Steps:
1. Run git pull on main. Stay on main.
2. AUDIT PROJECTS SCHEMA. Search for project-related tables in migrations. Report every table and column with types.
3. AUDIT PROJECTS ROUTES. Report every route and its purpose.
4. AUDIT PROJECTS UI. For each component, report data source (real vs mock) and available actions.
5. AUDIT SERVER ACTIONS. Report every action, its gate, and side effects.
6. AUDIT QUOTE→PROJECT CONVERSION. What transfers, what gets created.
7. AUDIT COST CENTERS (project_cost_centers table).
8. AUDIT PROJECT LIFECYCLE. Status values, transitions, state gates.
9. AUDIT INTEGRATION with Inventory, Invoices, Labour, POs, Attachments.
10. AUDIT MISSING PIECES vs full PM system: change orders, progress invoicing (Ontario lien law), substantial completion, deficiency/punch list, commissioning, warranty, margin view, timeline, team assignments, documents storage, site visit logs, client portal (flag not build).
11. Produce structured report with recommended chunk sequence for Sprint 2.

Read-only. No changes.

---

## Communication reminders for next Claude

- Jay hates long replies. Give short answers + spec block.
- Every mutation-affecting spec: fresh-fetch check FIRST (git fetch, log HEAD..origin/main), reset if behind.
- Every new-table migration: GRANTs + RLS + policy per §3.
- Every spec must include: fresh-fetch check, explicit branch name, verification commands (typecheck, lint, build, test), commit message, PR title + body.
- Migrations are Jay's to apply via Supabase Dashboard. Never say "run migration locally."
- Ignore Vercel jayshahvip warning on every PR — it's cosmetic.
- Match existing patterns; do not invent new conventions. If audit shows the codebase uses one style, mirror it exactly.
- Best-effort semantics on PDF/email: status transitions must succeed atomically; PDF/email failures return warning not error.
- Deferred items go in the PR body as TODO ARC-Nb: description — track them, don't scope-creep.

---

## File paths canon

- Migrations: supabase/migrations/NNNN_name.sql + paired smoke_NNNN_name.sql
- Data patches: supabase/migrations/data_patch_<descriptor>.sql (unnumbered, one-off, Jay runs manually)
- Server actions per module: app/(app)/<module>/actions.ts
- API queries: lib/api/<module>.ts
- PDF templates: components/modules/<module>/<Module>Document.tsx
- PDF renderers: lib/pdf/render-<module>.ts
- Storage uploaders: lib/storage/<module>-pdfs.ts
- Types: lib/types/database.ts (source of truth for Db* types + ActivityEntityType)
- Tests: __tests__/<module>/<test>.test.tsx

---

## Test coverage baseline

Current tests total: ~35 across various modules. Vitest + Testing Library + vi.mock for external services. No live DB in tests.

---

*End of handoff. Everything the next Claude needs is above. No memory required.*

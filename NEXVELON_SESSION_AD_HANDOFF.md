# Nexvelon — Session AD Handoff

**Period covered**: Session AD (continued from DOCS-AC PR #64)
**Started**: After DOCS-AC merged (PR #64 closed Session AC's first comprehensive handoff)
**Ended**: After CL-5c Phase 2b ship (PR #68)
**Modules updated this session**: Clients module — CL-5 trilogy (form cleanup, mailing address, dynamic multi-phone contacts)
**Modules in queue**: CL-6 sprint (Client polish + Contact Type expansion + Excel single sheet + Full-screen client/site + Site field expansion + Activity log) → then Inventory Sprint (INV-1 through INV-6)
**Current status**: CL-5 complete. CL-6 sprint specced and queued.
**Last shipped PR**: #68 (CL-5c Phase 2b)

---

## §1. Session AD Summary — Chunks Shipped (PRs #65–#68)

After DOCS-AC (PR #64) locked in Session AC's snapshot through CL-4, Session AD continued with operator-requested changes to the client form (CL-5 trilogy).

### CL-5a — Client form cleanup (PR #65)
- Section 1 labels: "Legal name *" → "Company legal name *", "Trade / display name" → "Company trade / display name"
- Status default: "Active" → "Prospect" (already in DB enum, no migration)
- DELETED Section 2 (Primary Contact stub) + full supporting cast: primaryContact state, refreshPrimaryContact function + useEffect, bottom ContactFormDrawer render, 3 now-unused imports
- DELETED billing "Same as primary site" toggle + state + 6 disabled attrs (always no-op at create time)
- DELETED Initial Site section + state + validation + handleSubmit site block + createSiteAction import
- Toast drops the site clause: "Added X · N contacts added"
- Single-file: ClientFormDrawer.tsx — net +14 / −284 lines
- Cross-dep catch: handleUploadTemplate (CL-4) had leftover setInitialSite call — fixed in same PR

### CL-5b — Mailing Address section (PR #66)
- Migration 0012: 7 new clients columns mirroring billing_* pattern
  - mailing_street, mailing_unit, mailing_city, mailing_province (default 'ON'), mailing_postal, mailing_country (default 'Canada')
  - mailing_same_as_billing boolean NOT NULL DEFAULT false
- Smoke file: smoke_cl5b.sql (7 checks)
- DbClient + DbClientInsert extended with 7 fields
- New "Mailing Address" section in ClientFormDrawer after Billing, before Initial Contacts
- "Same as billing address" toggle — eager-copy in payload when ON; fields disabled and visually display billing values
- AddressAutocomplete on Mailing Street (auto-fills city/province/postal/country)
- Cleaned up 6 cosmetic JSX artifacts in Billing section (leftover from CL-5a's replace_all of disabled={billSameAsSite})
- 4 files modified: migration + smoke + database.ts + ClientFormDrawer.tsx

### CL-5c Phase 2a — Phones JSONB migration + dynamic Contact Information (PR #67)
- Migration 0013: 
  - ADD contacts.phones jsonb NOT NULL DEFAULT '[]'::jsonb
  - ADD CHECK (jsonb_typeof(phones) = 'array')
  - BACKFILL: existing phone/mobile → phones JSONB with labels "Phone"/"Mobile"
  - DROP contacts.phone, contacts.mobile (clean drop, data preserved in JSONB)
- New ContactPhone interface: `{ label: string; number: string }`
- DbContact + DbContactInsert: phone/mobile fields → phones: ContactPhone[]
- ClientFormDrawer "Initial Contacts" (3 fixed slots) → "Contact Information" (dynamic):
  - Unlimited contacts via "Add contact" button
  - Per contact: first/last name, role (uses title column), email, multiple phones with label dropdowns, 3 type checkboxes
  - X button to remove a contact, X button per phone
  - Submit handler loops through active contacts, creates all in parallel
- ⚠️ Spec deviation: Phase 1 §9 said "don't touch ContactFormDrawer + ContactsPane in 2a" but TypeScript's strictness made this impossible — dropping phone/mobile from DbContact breaks consumers at compile time. Minimal non-lossy fixes:
  - ContactsPane: displays c.phones[0].number instead of c.phone (first phone; full multi-phone display deferred to 2b)
  - ContactFormDrawer: kept 2-field Phone/Mobile UX backed by phones array, init by label match, save rebuilds phones preserving other-labeled entries
- handleUploadTemplate (CL-4) rewritten to build dynamic contact rows
- 6 files modified

### CL-5c Phase 2b — Shared PhonesEditor + display + Title→Role (PR #68)
- New `app/(app)/clients/_components/PhonesEditor.tsx` — shared dynamic phone-list editor
  - Label dropdown with locked 6 options (Office/Personal/Mobile/Emergency/Fax/Other)
  - Dynamic + button to add, X button per row to remove
  - Used by both ClientFormDrawer (Contact Information section) and ContactFormDrawer (standalone)
- ClientFormDrawer: ~30 lines of inline phones JSX → single `<PhonesEditor>` call
- ContactFormDrawer: 2-field Phase 2a shim removed → `<PhonesEditor>`; "Title" → "Role" UI rename (DB column stays `title`)
- ContactsPane: renders all phones with labels per contact ("Office: ...", "Mobile: ...")
- ContactsCard (sidebar): renders first 2 phones + "+N more" for compactness
- ⚠️ Sharp legacy-data handling: PhonesEditor dropdown offers locked 6 labels, but migration 0013's backfill creates contacts with label "Phone" (not in the 6). Controlled <select> with unmatched value renders blank — would break editing on every pre-migration contact. PhonesEditor dynamically appends the current label as an option when it's outside the 6, gracefully displaying legacy data without making the dropdown free-text.
- 4 files modified

---

## §2. Architectural Locks (carried forward from AC, unchanged)

### §2.1 Past-Data Preservation
Compat shims transformative not destructive. Examples extended this session:
- CL-5a's deletion of Initial Site section in ClientFormDrawer: the createSiteAction wasn't deleted (still used by SITES-1's SitesView); the billing_same_as_primary_site column wasn't dropped (still used by update path's applyBillingSameAsSite helper, now dormant).
- CL-5c Phase 2a's phones JSONB migration: existing phone/mobile data backfilled into JSONB with labels before columns dropped — no data loss.

### §2.2 Snapshot Principle (universal)
Unchanged.

### §2.3 Page Size: A4
Unchanged.

### §2.4 Inventory cost tracking: specific-identification per-lot
Unchanged.

### §2.5 Form section consistency (NEW from AD)
ClientFormDrawer section order (post-CL-5a/b):
1. Identity & Classification
2. Billing Address (no toggle)
3. Mailing Address (with "Same as billing" toggle from CL-5b)
4. Operating Company (FLAGGED FOR REMOVAL in CL-6)
5. Tax
6. Payment Terms & Method
7. Portal Access
8. Notes
9. Contact Information (CL-5c, dynamic, create-mode only)

Edit-mode-only sections: existing client sees sections 1-8, no Contact Information at the bottom (contacts managed on /clients/[id]).

---

## §3. Modules Status (End of Session AD)

| Module | Status | Notes |
|--------|--------|-------|
| Dashboard | Basic | Placeholder, future work |
| **Quotes** | **100% DONE** | (carried from AC) |
| Projects | Basic | Future module |
| **Clients** | **100% DONE + CL-5 polish** | CL-5 trilogy added cleanup, mailing, multi-phone contacts |
| **Sites** | **100% DONE** | (carried from AC; SITES-2 expansion is the next major sprint) |
| **Contacts** | **100% DONE + multi-phone** | (CL-5c added phones JSONB + Role field) |
| Inventory | Queued (after CL-6 sprint) | INV-1 through INV-6 |
| Scheduling | Future | |
| Financials | Future | |
| Reports | Future | |
| Users | Basic | |
| Settings | Functional | |

---

## §4. Key File Locations — Updates from AD

### New files (CL-5)
- `supabase/migrations/0012_client_mailing_address.sql` — mailing address columns
- `supabase/migrations/smoke_cl5b.sql` — 7 checks
- `supabase/migrations/0013_contact_phones.sql` — phones JSONB migration with backfill
- `supabase/migrations/smoke_cl5c.sql` — 6 checks (including negative test for CHECK constraint)
- `app/(app)/clients/_components/PhonesEditor.tsx` — shared dynamic phone-list editor

### Modified files (CL-5)
- `lib/types/database.ts` — DbClient/DbClientInsert += 7 mailing fields; DbContact/DbContactInsert: phone/mobile → phones: ContactPhone[]
- `app/(app)/clients/ClientFormDrawer.tsx` — many changes:
  - Removed: Section 2 (Primary Contact stub), billing "Same as primary site" toggle, Initial Site section
  - Added: Mailing Address section (CL-5b), Contact Information dynamic section (CL-5c)
  - Labels: "Company legal name *", "Company trade / display name"
  - Status default: "Prospect"
- `app/(app)/clients/ContactFormDrawer.tsx` — uses PhonesEditor; "Title" → "Role" UI label
- `app/(app)/clients/_components/ContactsPane.tsx` — renders all phones with labels (ContactsPane); first 2 + "+N more" (ContactsCard)

### Unchanged this session
All other files from DOCS-AC's file index remain accurate.

---

## §5. Forward Plan — CL-6 Sprint (Detailed)

Operator request batch received at end of Session AD: 7 items including activity logging, full-screen creation forms, contact type expansion, Excel polish, and major site form expansion. Locked sprint plan:

### CL-6 — Client form quick polish (no schema, single file)
- Show "Client created on: [date]" in edit mode (read from created_at column, already exists)
- Mailing address default = same as billing (invert toggle UX with radio button: Same / Different)
- Remove word "(optional)" from Contact Information header
- Remove the entire Operating Company section (Section 4)
- Single PR · ClientFormDrawer.tsx only

### CL-7 — Multi-select contact type expansion (small migration)
- Migration 0014: ADD COLUMN contacts.is_accounts_payable boolean DEFAULT false
- Migration 0014: ADD COLUMN contacts.contact_type_custom text
- DbContact + DbContactInsert: +2 fields
- ContactFormDrawer + ClientFormDrawer Contact Information: add AP checkbox + Custom checkbox with text field
- RoleBadges: extend to 5 badges (Primary amber, Billing emerald, Emergency red, AP blue, Custom purple-with-text)
- ContactRowState type: +2 fields
- Single PR · migration + smoke + 4 files

### CL-8 — Excel template single sheet + visual polish (no schema)
- Refactor generateClientTemplate to ONE sheet (currently 4 sheets)
- Better visual styling — section dividers, instructions inline, formatted table layout
- Refactor parseClientTemplate to read the new single-sheet layout
- Maintain round-trip integrity (downloaded file → filled → uploaded → parses correctly)
- Single PR · lib/client-onboarding-template.ts only

### CL-9 — Client form to full-screen page (navigation pattern change)
- New route /clients/new
- Extract ClientFormDrawer content → ClientFormView (full-screen component)
- "Add client" button on /clients navigates instead of opening drawer
- Edit mode: still uses drawer for now (separate decision; could become full-screen too)
- Single PR · 2-3 new files + nav updates

### SITES-2a — Site schema expansion (migration only)
- Migration 0015: add to sites table:
  - tax_rate numeric(5,3) (e.g., 13.000 for 13%)
  - billing_street/unit/city/province/postal/country (6 cols)
  - billing_same_as_client boolean DEFAULT true
  - mailing_street/unit/city/province/postal/country (6 cols)
  - mailing_same_as_billing boolean DEFAULT true
  - hst_gst_number text
  - tax_exempt boolean + tax_exempt_certificate_number text
  - payment_terms text + payment_terms_custom text
  - preferred_payment_method text
  - apply_cc_surcharge boolean
  - credit_limit numeric + credit_hold boolean
  - preferred_currency text
  - portal_access_enabled boolean + portal_contact_email text
  - inherit_payment_terms_from_client boolean DEFAULT true
- KEEP existing systems columns dormant (panel_system/intrusion_system/cameras_count/etc.) per §2.1 past-data preservation
- DbSite + DbSiteInsert extensions
- Smoke file pairing
- Single PR · migration + smoke + types

### SITES-2b — Site form to full-screen + expanded UI
- New `lib/tax-rates.ts` — province → rate map (ON=13, BC=12, AB=5, SK=11, MB=12, QC=14.975, NB=15, NS=15, PE=15, NL=15, YT=5, NT=5, NU=5)
- New route /clients/[id]/sites/new (or /sites/new)
- Extract SiteFormDrawer content → SiteFormView with new sections:
  - Site address (existing)
  - Billing Address (with "Same as client" toggle — auto-inherits when ON)
  - Mailing Address (with "Same as billing" toggle)
  - Tax (province select + tax_rate auto-fills + override + HST/GST + tax_exempt)
  - Payment Terms (with "Same as client" checkbox — inherits dynamically)
  - Portal Access
  - Notes
  - Contact Information (multi-contact with site_id FK)
- REMOVE from UI: panel_system, intrusion_system, cameras_count, controllers_count, doors_count, cards_issued (kept in DB)
- "Add site" buttons navigate to new route
- Single PR (substantial) · new view + tax-rates lib + nav updates

### SITES-3 — Site attachments
- Migration 0016: site_attachments table (id, site_id FK, filename, file_path, size, mime, uploaded_at, uploaded_by)
- Supabase Storage bucket: "site-attachments" (private, RLS)
- Upload UI in site form (drag-drop or button)
- Display: list of attachments with download links
- Single PR · migration + storage + UI

### ACT-1 — Activity log infrastructure + integration
- Migration 0017: activity_log table (id, entity_type, entity_id, action, changes JSONB, user_id, created_at)
  - entity_type enum: 'client', 'site', 'contact', 'quote'
  - action enum: 'create', 'update', 'delete'
  - changes JSONB: { field: { from: value, to: value }, ... }
- lib/api/activity-log.ts — logActivity helper
- Wire into createClientAction, updateClientAction, deleteClientAction
- Wire into createSiteAction, updateSiteAction, deleteSiteAction
- Wire into contact actions (createContactAction, updateContactAction, deleteContactAction)
- Wire into quote save action
- ActivityLog component for /clients/[id], /sites/[id], /quotes/[id] (and maybe /contacts/[id] if that route exists)
- Format: latest on top, "[Mar 15, 10:23 AM] Updated by Jay Shah: Status: Prospect → Active"
- Single PR · migration + API + multiple action files + UI component

**Sprint total**: 8 PRs across CL-6 through ACT-1 + DOCS-AE (final session handoff)

### Sprint operator decisions (recorded for AD)
1. **Multi-select contact types** — keep boolean pattern, add 2 columns (is_accounts_payable + contact_type_custom)
2. **Auto-inherit from client** — per-section "Same as client" toggles in site form (NOT blanket copy)
3. **Province-based tax** — hardcoded map in lib/tax-rates.ts, override at site level

---

## §6. Deferred Items (Tracked)

(Items from DOCS-AC carry forward; new items added below.)

NEW deferred items from AD:
1. **Operating Company section removal** — Jay wants this gone in CL-6 (was on a "may be useful" path before). Confirmed for removal.
2. **Inventory-module SKU vocab** — still kept as "SKU" (deferred).
3. **CL-4 template Site sheet** — Phase 2a removed the Initial Site form section in CL-5a but the Excel template still has a Site sheet — CL-8 single-sheet refactor will incorporate site fields differently OR drop them since sites are created separately now.
4. **Client phone/mobile flat columns** — DROPPED in CL-5c Phase 2a (no longer dormant; gone). Data backfilled into phones JSONB before drop. §2.1 compliant.
5. **Title → Role column rename** — CL-5c Phase 2b only renamed UI label. The DB column is still `title`. Future cleanup could rename the column for clarity but not urgent.

---

## §7. Operating Context

Unchanged from DOCS-AC. Same operator style (one chunk per PR), same trust in Claude Code's spec deviation flagging, same migration process via Supabase Dashboard SQL Editor.

Notable patterns reinforced this session:
- **Backwards compat at migrations**: CL-5c Phase 2a's phones JSONB migration backfilled existing data BEFORE dropping the columns, preserving all phone numbers. The PhonesEditor in Phase 2b then dynamically appends legacy labels ("Phone", "Mobile") to its dropdown when encountered.
- **Cross-chunk awareness**: CL-3a/3b/3c → CL-5a chain had cross-dependencies (handleUploadTemplate referenced removed state) that Claude Code caught via tsc errors. Spec deviations explicitly flagged in PR bodies.
- **Network resilience**: Multiple network timeouts during pushes were handled gracefully via background retry loops. Commits stay safe locally; pushes happen when connectivity returns.

---

## §8. Tooling

Unchanged from DOCS-AC. Same stack:
- Next.js App Router + RSC
- Supabase (auth, DB, storage)
- @react-pdf/renderer + pdfjs-dist v5
- exceljs (dynamic-imported)
- shadcn/ui + Tailwind

New additions this session:
- JSONB column pattern established (contacts.phones — first array-of-objects JSONB in the schema)
- PhonesEditor shared component pattern (reusable across multiple form contexts)

---

## §9. How to Start a New Claude Session

1. **Read docs in this order**:
   - `CLAUDE_CONTEXT.md` (orientation)
   - `NEXVELON_PRINCIPLES.md` (architectural locks)
   - `NEXVELON_ROADMAP.md` (current state)
   - `NEXVELON_SESSION_AD_HANDOFF.md` (THIS document — latest)
   - `NEXVELON_SESSION_AC_HANDOFF.md` (previous session — DOCS-AC)
   - `NEXVELON_SESSION_AB_HANDOFF.md` (earlier session)
   - `NEXVELON_SESSION_AA_HANDOFF.md` (foundations)

2. **Current state at end of AD**: CL-5 trilogy shipped. Client module has mailing address + multi-phone contacts. PR #68 is the last shipped.

3. **Next sprint**: CL-6 sprint (8 PRs across client polish, full-screen forms, site field expansion, activity log). Operator decisions for the sprint recorded in §5.

4. **Architectural locks**: §2.1–§2.5 are non-negotiable.

5. **Strategist trusts Claude Code** to flag spec-vs-reality deviations and adapt — proven multiple times this session including cross-chunk dependency catches and legacy-data handling.

6. **Phase 1 inspect → Phase 2 implementation pattern**: For any non-trivial chunk, do a Phase 1 inspect (no edits, just read + report) before Phase 2. This pattern caught many gotchas this session — schema column naming, smoke file conventions, cross-chunk dependencies, type strictness forcing unplanned file touches.

7. **Multi-PR chunk pattern**: For large refactors (like CLIENTS-FS and CL-5c), split into separable PRs (2a = schema, 2b = behavior). Each PR stays reviewable.

8. **Inline SQL pattern**: When operator-side SQL execution is needed (Supabase Dashboard SQL Editor), give SQL inline in chat rather than asking operator to navigate GitHub PR files. Reduces friction.

# Nexvelon Build — Comprehensive Handoff
**Sessions AE + AF**

- **Generated**: 2026-05-27 (Session AF wrap)
- **Repo**: github.com/nexvelon/nexvelon
- **App**: https://app.nexvelonglobal.com
- **Operator**: Jay Shah
- **Coverage**: PRs #70 through #94 (25 PRs)

---

## 1. Executive Summary

Sessions AE + AF advanced the Nexvelon ERP build through five major thrusts:

1. **Client onboarding flow** — full-screen form, Excel template round-trip, contact management with multi-phone + type taxonomy
2. **Site onboarding flow** — full-screen form, inheritance UX (billing/mailing/payment from parent client), Excel template
3. **Multi-country support** — 5 countries (Canada, USA, UAE, India, Ireland) with dependent province dropdowns, per-country tax rates, dynamic late-payment Excel formulas
4. **Currency expansion** — 5 currencies (CAD, USD, AED, INR, EUR) with DB CHECK constraints and form/template dropdowns
5. **Activity log infrastructure** — best-effort audit trail spanning clients/sites/contacts

The codebase shipped 25 PRs across sessions AE-AF. Migrations 0016 through 0020 applied. Schema is flexible: adding a 6th country needs only `lib/countries.ts` + `lib/tax-rates.ts` + `lib/late-payment-rates.ts` updates — no migration.

---

## 2. Sprint Dashboard

### Session AE Chunks (PRs #70-77)

| PR | Chunk | Description | Migration |
|----|-------|-------------|-----------|
| #70 | CL-6 | Client form polish (mandatory markers, section reorder) | — |
| #71 | CL-7 | AP + Custom contact types | 0014 |
| #72 | CL-8 | Excel single-sheet template | — |
| #73 | CL-9 | Client form full-screen (extracted from drawer) | — |
| #74 | SITES-2a | Sites schema +28 columns | 0015 |
| #75 | SITES-2b | Site form full-screen + inheritance UX | — |
| #76 | SITES-2c | Systems UI cleanup | — |
| #77 | ACT-1 | Activity log infrastructure | 0016 |

### Session AF Chunks (PRs #78-94)

| PR | Chunk | Description | Migration |
|----|-------|-------------|-----------|
| #78 | FIX-1 | Hard delete model (vs soft delete) | 0017 |
| #79 | CL-10 | Excel template overhaul v2 | — |
| #80 | FIX-2 | Phone input validation | — |
| #81 | CL-11 | Cash payment method + Excel v3 | 0018 |
| #82 | CL-12 | Excel polish (title row, font colors) | — |
| #83 | CL-13 | Payment restructure, drop Acknowledge | — |
| #84 | CL-14 | Column A auto-fit | — |
| #85 | CL-15 | Filename + multiplier tighten | — |
| #86 | CL-16 | "Client Template" rename | — |
| #87 | CL-17 | "Client Form" rename | — |
| #88 | CL-18 | Width bump | — |
| #89 | CL-19 | Payment terms text update | — |
| #90 | SITES-3 | Site Form Excel template | — |
| #91 | SITES-4 | Site/Project Name rename | — |
| #92 | ADDR-1 | Multi-country support (5 countries) | 0019 |
| #93 | ADDR-2 | Multi-country polish (dropdowns, dynamic late payment) | — |
| #94 | CL-20 | Currency expansion + Excel polish | 0020 |

---

## 3. Architectural Locks

These locks govern all future development. Immutable unless explicitly revisited.

### §2.1 Past-data preservation
DROP CONSTRAINT before re-adding with new values. Old values stay in DB. Dormant columns (`deleted_at`, `deleted_by`) remain in schema even if no longer used by current code.

### §2.2 Snapshot Principle
Snapshots are immutable. Quote line items saved with full snapshot at quote time (rate, description, currency). Future rate changes don't retroactively modify historical quotes.

### §2.3 A4 page size
All printable documents use A4 (210mm × 297mm). Letter-size only if explicitly requested.

### §2.4 Inventory specific-identification cost tracking
Each physical unit of inventory has its own cost row. No weighted average, no FIFO/LIFO. Necessary for accurate margin tracking on equipment-heavy projects.

### §2.5 ClientFormDrawer section order
1. Client Identity (legal name, trade name, opco assignment, status)
2. Billing Address
3. Mailing Address
4. Tax (HST/GST, exempt status, cert number)
5. Payment (terms, method, currency, locked terms text)
6. Contacts (4-row table with merge-by-name)

This order is preserved across the drawer → full-screen extraction.

### §2.6 Form-to-full-screen extraction pattern (CL-9, SITES-2b)
When migrating a form from a drawer to a full-screen route:
- Shared body component (e.g., `ClientForm.tsx`) used by BOTH the drawer and the standalone route
- RSC page (e.g., `app/(app)/clients/new/page.tsx`) renders a client-component wrapper
- All form state lifts into the shared body — the drawer becomes a thin presentation wrapper

### §2.7 Inheritance UX (SITES-2b)
For inherited fields (e.g., site billing inherits from client):
- NULL stored in DB when inheriting
- Toggle ON → fields disabled, shows parent's values read-only
- Toggle OFF → one-time copy of parent's values into local state + persisted to DB
- No real-time sync after toggle-off (parent changes don't propagate to the snapshot)

### §2.8 Activity logging (ACT-1)
- Best-effort: log failures don't block the user action
- Empty-diff skip: don't log if no field changed
- Two-query actor resolution: first query gets activity rows, second resolves actor display names
- Logs survive entity deletion (no FK on `entity_id`)

---

## 4. Operator Decisions Log

Decisions locked across Sessions AE + AF (chronological):

1. **Hard delete over soft delete** (FIX-1). Activity log preserves audit. Sites + contacts cascade-delete via FK ON DELETE CASCADE.
2. **Mandatory field handling: warn and proceed** (CL-10). Parser populates what's there; toast lists what's missing. No hard-block except for fundamental fields.
3. **Contact merge by name** (CL-10). Excel rows 1+2 with same name → 1 contact with 2 phones; rows 3+4 similarly.
4. **Industry dropped from template** (CL-10). Operator-only field.
5. **Version stamp via workbook.subject** (CL-11). Hidden from users; parser uses it to detect cross-template uploads.
6. **Drop Acknowledge field entirely** (CL-13). Payment terms text block replaces it.
7. **Multi-country: full lists, true dependent dropdowns, per-country tax auto-fill, display strings as values** (ADDR-1).
8. **AddressSection shared component, uniform `_Regions` suffix, defensive migration 0019** (ADDR-1).
9. **Excel single-sheet + dynamic late payment formula** (ADDR-2). Lists sheet deleted; data inline at row 200+ with triple hiding.
10. **Visual middle-align + dropdown placeholder + currency expansion** (CL-20).

---

## 5. Key File Locations

### Migrations
- `0001_clients_schema.sql` — original clients/sites tables
- `0007_cl2_form_expansion.sql` — billing fields + payment terms
- `0008_line_item_classifications.sql` — quote line items
- `0009_service_applies_to.sql` — services scope
- `0010_margin_tiers.sql` — pricing tiers
- `0011_quote_drawings.sql` — drawing file attachments
- `0012_client_mailing.sql` — mailing address fields
- `0013_contact_phones.sql` — multi-phone support
- `0014_contact_type_expansion.sql` — Primary/AP/Custom contact types
- `0015_sites_expansion.sql` — +28 site columns
- `0016_activity_log.sql` — audit table
- `0017_hard_delete_cleanup.sql` — hard delete model
- `0018_payment_method_cash.sql` — cash payment method
- `0019_normalize_country_values.sql` — country enum normalization
- `0020_currency_expansion.sql` — AED/INR/EUR currencies

### Types (`lib/types/database.ts`)
- `DbClient`, `DbSite`, `DbContact`, `DbContactPhone`
- `DbActivityLog`, `DbActivityLogWithActor`
- `ActivityEntityType`, `ActivityAction`, `ActivityChange`, `ActivityChanges`
- `DbClientPaymentTerms`, `DbClientPaymentMethod` (includes 'cash'), `DbClientCurrency` ('CAD'|'USD'|'AED'|'INR'|'EUR')
- `Country` = "Canada" | "USA" | "UAE" | "India" | "Ireland" (re-exported from `lib/countries.ts`)

### Constants
- `lib/countries.ts` — `Country` union, `PROVINCES_BY_COUNTRY` (5 countries), `PROVINCE_LIST_NAME_BY_COUNTRY`
- `lib/tax-rates.ts` — `TAX_RATES_BY_COUNTRY_PROVINCE` + `defaultTaxRateForProvince(country, province)`
- `lib/late-payment-rates.ts` — `LATE_PAYMENT_RATES_BY_COUNTRY` (monthly/annual/CC surcharge)
- `lib/phone.ts` — `sanitizePhoneInput()` regex

### APIs
- `lib/api/clients.ts` — hard delete, auto-coded `client_code` (C-{IS|GD}-YYYY-NNNN)
- `lib/api/sites.ts` — auto-coded `site_code` (S-{client_code}-NNN)
- `lib/api/activity-log.ts` — `computeChanges()`, `logActivity()`, `listActivityFor()`

### Excel Templates
- `lib/client-onboarding-template.ts` — Sheet "Client Onboarding", Title "Client Form", filename "Client Form.xlsx", `workbook.subject="nexvelon-onboarding-v3"`
- `lib/site-form-template.ts` — Sheet "Site Onboarding", Title "Site Form", filename "Site Form.xlsx", `workbook.subject="nexvelon-site-v1"`

### Components
- `app/(app)/clients/_components/ClientForm.tsx` — shared body (5 sections)
- `app/(app)/clients/_components/SiteForm.tsx` — shared body with 3 inheritance toggles
- `app/(app)/clients/_components/AddressSection.tsx` — shared component (5 invocations across both forms)
- `components/activity/ActivityLog.tsx` — UI list
- `components/contacts/PhonesEditor.tsx` — multi-phone editor
- `components/modules/users/InviteUserDrawer.tsx` — user invite flow

### Routes
- `/clients/new` — RSC + NewClientPageClient wrapper
- `/sites/new?clientId=X` — RSC + NewSitePageClient wrapper

### Deleted Files
- `lib/canada-provinces.ts` — folded into `lib/countries.ts` (ADDR-1)

---

## 6. Schema State (Current)

### clients
- `id`, `legal_name` (req), `name`, `default_opco`, `allowed_opcos` (text[]), `status`
- `client_code` (auto: C-{IS|GD}-YYYY-NNNN)
- `trade_name`
- `billing_*`: street, unit, city, province, postal, country (5-country enum)
- `mailing_*`: same as billing
- `preferred_payment_terms`: 'Due on receipt', 'Net 7', 'Net 15', 'Net 30'
- `preferred_payment_method`: 'eft', 'e_transfer', 'wire', 'credit_card', 'cash' (cheque kept dormant per §2.1)
- `preferred_currency`: 'CAD', 'USD', 'AED', 'INR', 'EUR'
- `hst_gst_number`, `tax_exempt` (bool), `tax_cert_number`
- `credit_limit` (nullable), `portal_access` (bool), `notes`, `industry` (all dropped from template but kept in schema)
- `created_at`, `updated_at`
- `deleted_at`, `deleted_by` (dormant after FIX-1)

⚠️ **No top-level `country` or `province` columns on clients** (only billing/mailing variants).

### sites
- `id`, `client_id` (FK), `name` (renamed to "Site/Project Name" in UX), `site_code` (S-{client_code}-NNN)
- Physical address (`street`, `unit`, `city`, `province`, `postal`, `country`) — `country` is NOT NULL DEFAULT 'Canada'
- `billing_same_as_client` (bool) + `billing_*` fields (NULL when inheriting)
- `mailing_same_as_billing` (bool) + `mailing_*` fields (NULL when inheriting)
- `inherit_payment_terms_from_client` (bool) + tax/payment/currency fields (NULL when inheriting)
- System info fields
- `deleted_at` (dormant; deleted_by gap recoverable via activity log)

### contacts
- `id`, `client_id` (FK CASCADE), `site_id` (FK CASCADE, nullable for client-level contacts)
- `name`, `role`, `email`, `contact_type` ('primary_work', 'primary_personal', 'ap_work_ext', 'ap_direct', 'custom')

### contact_phones
- `id`, `contact_id` (FK), `phone`, `label`

### activity_log
- `id`, `entity_type`, `entity_id` (no FK), `action`, `changes` (jsonb), `actor_id`, `created_at`

---

## 7. Pending / Deferred Items

### Code debt
- Guardian own HST registration
- `DEFAULT_LABOR_RATE` export removal
- `roundCRA` float-precision fix
- Quotes v1 DB persistence (currently localStorage; activity log will wire when DB-backed)
- `site_code` UNIQUE constraint
- Audit columns (`updated_by`) on sites
- `deleted_by` columns on sites + contacts (gap recoverable from activity log)

### UI work
- `/sites/[id]` detail page
- `/contacts/[id]` detail page
- Site attachments UI (SITES-3 follow-up)
- Inheritance-flip noise reduction in activity log
- Real-time activity log subscriptions (vs current polling)
- `restoreClientAction` stays removed (hard delete is final)

### Functional gaps
- USA city/county tax add-ons (operator overrides per-site for now)
- India per-category GST (uniform 18% B2B default)
- Ireland reduced VAT rates (uniform 23% standard)
- Stale province after country change in Excel (VBA macro would solve; documented Excel limitation; cell comment provides workaround)

---

## 8. Inventory Sprint Plan (Next Major Work)

Per §2.4 (specific-identification cost tracking), the Inventory module is the next sprint.

### INV-1: Inventory schema
- Table: `inventory_items`
- Columns: `id`, `sku`, `name`, `description`, `category`, `unit_cost`, `quantity_on_hand`, `location`, `supplier`, `created_at`, `updated_at`
- Specific-identification: each physical unit can have its own row (no aggregate qty)
- Migration 0021

### INV-2: Inventory CRUD UI
- `/inventory` list view with search + filter
- `/inventory/new` add form
- `/inventory/[id]` detail with edit
- Bulk CSV upload

### INV-3: Inventory ↔ Sites
- Items allocatable to sites
- Track allocation history
- Activity log integration

### INV-4: Cost tracking
- Quote line items can reference specific inventory units
- Margin calculation uses actual cost from inventory
- Snapshot principle: cost frozen at quote time (§2.2)

### INV-5: Reorder thresholds
- Min/max levels per item
- Low-stock alerts (UI badge, optional email)

### INV-6: Inventory reports
- Stock valuation
- Turnover analysis
- Aging report

---

## 9. Process Conventions

### Branch naming
- `feature/<scope>-<chunk>-<short>` — new features
- `fix/<scope>-<chunk>-<short>` — bug fixes
- `polish/<scope>-<short>` — UI/UX polish
- `docs/<topic>` — documentation
- `hotfix/<topic>` — production hotfixes

### Commit format
`<type>(<scope>): <Chunk ID> — <description>`

Example: `feat(addresses): ADDR-1 — multi-country support (Canada/USA/UAE/India/Ireland)`

### PR conventions
- One chunk = one PR
- Pre-flight verification spec before implementation
- Two-phase for big chunks: Phase 1 inspect (read-only) → Phase 2 implementation
- NON-draft PRs (mark ready for review on push)
- PR body documents the change and the architectural rationale

### Deployment
- Vercel auto-deploys from `main`
- Production: app.nexvelonglobal.com
- DB migrations via Supabase Dashboard SQL Editor ONLY (never CLI/scripts)
- Smoke files use temp-table aggregation + FAILs-first ORDER BY + ROLLBACK
- NEVER run `scripts/wipe-test-data.sql`

### Sanity testing
- Browse routes in production after Vercel deploy
- Run smoke SQL in Supabase Dashboard
- Visual checks for Excel templates (Name Manager, dropdowns, locked text alignment)

### Operator style (Jay)
- Non-technical operator
- Pastes specs into Claude Code
- Pastes results back to strategist
- ONE Claude Code paste per turn
- Decisive specs (no options-menus from strategist)
- Inline SQL given directly to Jay when migration needed

### Memory limits
- Sessions compact when context fills
- Transcript files preserve full history at `/mnt/transcripts/`
- Session journal at `/mnt/transcripts/journal.txt` catalogs all sessions

---

## 10. How to Resume

### For a future Claude session strategist
1. Read this handoff document completely
2. Check `/mnt/transcripts/journal.txt` for session list and pick the latest transcript for any context needed
3. Pull latest from git (`git pull origin main`)
4. Verify schema state matches §6 by listing `supabase/migrations/`
5. Check if any `feature/*` branch is in-progress
6. Ask Jay: "What's next?"
7. Follow process conventions (§9): pre-flight inspect first, decisive specs, ONE paste at a time

### For a new developer
1. Read this doc
2. Read the project README
3. Set up dev environment (Node 20+, Next.js, Supabase project)
4. `git pull main`, `npm install`, `npm run dev`
5. Test routes: `/clients/new`, `/sites/new?clientId=...`
6. Read the architectural locks (§3) before making changes
7. Follow the chunk → PR → smoke flow for any changes

---

End of handoff document.

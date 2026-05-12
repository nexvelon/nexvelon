# NEXVELON_SESSION_C_HANDOFF.md

> **Hand-off document for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-C codification.
> Session C was a pure design pass — operator review of Module 1
> of the comprehensive feature audit. No code changes shipped;
> all output is documentation that codifies decisions for the
> permissions build and downstream module builds.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md` — six non-negotiables + Session B
>      and C clarifications in §2 and §6.
>   2. `CLAUDE_CONTEXT.md` "Current Session State" block.
>   3. **This file** — Session C state + decisions made.
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.2 — Module 1 fully scoped.
>   5. `NEXVELON_ROADMAP.md` — what's next.
>   6. `NEXVELON_SESSION_B_HANDOFF.md` — prior session reference.
>   7. `NEXVELON_SESSION_A_HANDOFF.md` — historical auth reference.

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session C focus

Operator design pass on Module 1 of the feature audit (Clients +
Sites + Contacts). Resulted in a comprehensive v0.2 of
`NEXVELON_FEATURE_AUDIT.md` with the 14-subsection rubric proved
out against real code, plus extensive operator-driven feature
additions.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_FEATURE_AUDIT.md` | Replaced v0.1 with v0.2 — Module 1 fully scoped (~1000 lines) |
| `NEXVELON_PRINCIPLES.md` | Appended Session C clarifications to §2 (Granular permissions) and §6 (Extensibility) |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" block with Session C state |
| `NEXVELON_ROADMAP.md` | Updated items 1, 2, and 4 to reflect Session C decisions |
| `NEXVELON_SESSION_C_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run build` → `✓ Compiled successfully`. **0 TypeScript errors.** **5 ESLint warnings** unchanged (all pre-existing in `components/modules/financials/Tabs.tsx`). **Zero new warnings.**

### Deploy status

No code changes → no new deploy → Vercel reflects last Session B commit.

═══════════════════════════════════════════════════════════════════════════════
## 2. MODULE 1 SPEC SUMMARY
═══════════════════════════════════════════════════════════════════════════════

Module 1 (Clients + Sites + Contacts) spec captured in
`NEXVELON_FEATURE_AUDIT.md` §1. Stats:

- **~110 actions** enumerated across Clients (~30), Sites (~15),
  Contacts (~12), SLAs (8), Service Contracts (6), Onboarding
  Gates (7). Of those, 6 are Built or Stub today; **~104 are
  surfaced new by the audit**.
- **14 new field-level visibility flags** for the permissions
  build to wire (Gap 4 from baseline).
- **15 lookup tables** introduced or seeded by Module 1, each
  with behavior bindings per the §6 clarification.
- **54 acceptance-criteria test scenarios** that become the QA
  bar for the Clients module build phase (which lands alongside
  permissions + Quotes v1).

### Major architectural decisions from Session C

All captured in audit doc §1 and PRINCIPLES clarifications:

1. **Lookup rows carry behavior bindings**, not just labels
   (PRINCIPLES §6 Session C clarification)
2. **Guided-creation wizards** for every lookup-table "+ Add"
   flow (PRINCIPLES §6 Session C clarification)
3. **Versioned T&C clauses + templates + SLA language** —
   snapshot at dispatch time (PRINCIPLES §6 Session C clarification)
4. **Ten dimensions of permission control** (PRINCIPLES §2
   Session C clarification)
5. **Contractual integrity exception** — `clients:overrideSla
   ResponseTime` is Admin-only, no per-user override permitted
   (PRINCIPLES §2 Session C clarification)
6. **Eight-layer print protection** for sensitive PDFs (PRINCIPLES
   §2 Session C clarification)
7. **SLAs per-site, not per-client** — property management firms
   have different service expectations per building
8. **Response time precedence:** site SLA > site response field
   > client response field > tier default
9. **Individual vs Company toggle** on client creation
10. **Client field rename:** Common Name + Legal Name (replacing
    "Name + Legal Name")
11. **16 customer types** (industry-flavored, replacing abstract
    Commercial/Residential/Government/Institutional)
12. **Banking + On Stop + holdback + PO required + late fee config**
    — all on the Client record with appropriate field-level gates
13. **Onboarding gates with clause-per-gate composition**
    auto-injected into quote T&C — per-client gate selection
    (Required/Waived/Optional) with tier-driven smart defaults
14. **Address autocomplete via OpenStreetMap Nominatim** — free,
    no billing account, manual entry fallback for misses
15. **Comprehensive logging visibility** — per-record audit tab on
    every entity, system-wide activity feed, per-user activity
    report, audit-driven notification rules

═══════════════════════════════════════════════════════════════════════════════
## 3. OPEN QUESTIONS PARKED FOR LATER
═══════════════════════════════════════════════════════════════════════════════

14 open questions parked in audit doc §1.13. Most are operator
decisions that don't block the audit walk or the permissions
design; they get answered during the build pass for Module 1
(which lands alongside Quotes v1 + permissions build).

High-priority ones to resolve before build:
- Global contacts directory: sidebar entry or search-only?
- Gate code encryption: pgcrypto column-level (recommended) vs
  Postgres default?
- Client merge mechanics: FK update with pointer (recommended) vs
  duplicate strategy?
- Late fee compounding default (recommend yearly with monthly)
- Holdback default (recommend 10% / Exclusive / 45-day Ontario
  standard)

Lower-priority parked: contact-client multiplicity, service
history scope, equipment-list modeling, risk tag enum vs lookup,
top-clients widget gating for SR, approval delegation v1 defaults,
service contract billing cycles, SLA per-service-type (Phase 2),
communication log Twilio integration timing.

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT
═══════════════════════════════════════════════════════════════════════════════

In order:

1. **Feature audit Modules 2-13** — walk the same 14-subsection
   rubric across Users + Permissions, Settings, Dashboard, Quotes,
   Projects, Inventory, Vendors, Invoices, Subcontractors,
   Financials, Scheduling, Reports. Most modules will be less deep
   than Module 1 because cross-cutting commitments were captured.
   May be 1 module per session or several per session depending on
   complexity.

2. **Permissions module — design pass** (ROADMAP item 2). Consumes
   the consolidated action vocabulary + Session C ten-dimensional
   model + contractual integrity exception + eight-layer print
   requirements.

3. **Permissions module — build** (ROADMAP item 3).

4. **Quotes v1** (ROADMAP item 4) — first revenue module. Brings
   along SLA management UI, onboarding gates, T&C composition,
   eight-layer print, On Stop enforcement.

5. **Projects → Inventory → Vendors → Invoices → Subcontractors →
   Financials → Scheduling → Reports.**

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

To start the next claude.ai session about Nexvelon, paste this:

> Continuing Nexvelon build. Before responding to anything, read
> these files in order: `NEXVELON_PRINCIPLES.md`,
> `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md`,
> `NEXVELON_ROADMAP.md`, then the latest
> `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo:
> github.com/nexvelon/nexvelon. Live:
> https://app.nexvelonglobal.com. Working with Claude Code in
> parallel — I'll paste its outputs back to you.

**End of Session C handoff.**

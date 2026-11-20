# PHASE2_FEATURES.md — the Phase-2 feature set (captured, NOTHING built)

| | |
|---|---|
| Date | 2026-11-15 |
| HEAD when written | `a95e770` (merge of PR #406, INV-FIX-1) |
| Highest migration | **0135** |
| Source | **Captured from conversation with Jay. Nothing here is built, designed in detail, or scheduled.** |
| Why this file exists | REALITY-2 (`docs/INTENT_RECOVERY.md`, PR #394) recovered ~38 items that were described and then silently lost. This file writes down 23 capabilities Jay described so they can't be lost the same way. |

> **None of this is scheduled. The core ERP work on `NEXVELON_ROADMAP.md` continues first.** These are ideas recorded with an honest first sizing. Each one needs its own design pass before it's built.

**Sizing key:** **S** = days · **M** = weeks · **L** = months · **XL** = a product in its own right.

**What "exists today" means here.** It was verified against the code at the HEAD above, not taken from older design docs. Jay's three *existing tools* (Riser Studio, Camera Coverage Vision, the photo markup tool) live **outside this repository**. Nothing below assumes how they're built, and that's the first thing to establish (decision D3).

---

## 1. The consolidated modules (23 ideas, 1 dropped → 10 active modules + 1 platform decision)

Many of the 23 items describe one capability from different angles. Grouped by what they actually build. Module numbers stay stable: **M6 is kept as a dropped row rather than renumbering the others**, so earlier references still resolve.

| # | Module | Items folded in | Size | Depends on |
|---|---|---|---|---|
| **F** | **Foundation: Device Register**: **BUILT, DEVREG-1 (migration 0136)** | — (implied by 4, 9, 10, 12, 21, 23, and the portal's device list) | **L** | Sites, projects, jobs, serialized inventory (all built) |
| **M1** | **Design-to-Documents** (Riser Studio integration) | 1, 4, 5, 13, 23 | **XL** | F; Riser Studio's data format (D3); DXF output (D2, **decided**) |
| **M2** | **Field Capture & Takeoff** | 9, 11, 14 | **L** (14 alone: L) | F; the plan import; the price list (built); the indoor-location approach (D4) |
| **M3** | **Photo Workspace** | 3, 15, 16 | **M** | Attachments (built); the photo markup tool (D3) |
| **M4** | **Job Record — "one job, one thread"** | 6 | **L** | Attachments, activity feed, invoices (built); client messaging (**not** built) |
| **M5** | **Field QA (photo checks)** | 10, 12 | **L** | Structured checklist templates (not built); M1's saved wiring diagrams (for 12); an AI vision provider |
| ~~**M6**~~ | ~~**Door Passport (asset QR)**~~ — **DROPPED by Jay, 2026-11-16** | ~~17~~ | — | Not built. See item 17 and §1a. |
| **M7** | **Client Proof & Handover — the Living Site Portal** (D5, decided) | 18, 19; hosts 23's viewer | **M** | The quote portal's token *security* (built, reuse), **not** its frozen snapshot; sites (built); M3; commissioning results (built) |
| **M8** | **Camera Design Tools** | 2, 21 | **M–L** | F (camera position + bearing); Camera Coverage Vision (D3) |
| **M9** | **Fault Finder** (knowledge base) | 22 | **M** | Attachments (built); optionally F (fault history per device type) |
| **M10** | **Ask Your Business** (natural-language questions) | 8 | **M–L** | The REP-5 report datasets (built); SEC-1 field redaction (built); an AI provider |
| **M11** | **Pitch Cinema** | 20 | **M** (with a video service) – **L** | M3 photos + markups; a third-party video-generation service |
| **P** | **Platform decision: Offline-first** | 7 | **XL** if retrofitted app-wide | Everything (see D1) |

**The single most important observation: almost everything needs a Device Register first.** Today Nexvelon knows *parts* (inventory lots, including serialized units with custody status) and *lines* (quote/job lines). It doesn't know *installed devices*: "the reader on the door to the right of reception, on this plan, wired like this, tested on this date". Commissioning items are free-text rows that aren't tied to any device, part or serial.

Walk-and-Tap (9), Mistake Radar (10), Wire Whisperer (12), Sun Glare (21), the 3D Site Viewer (23), the Living Site Portal's device list (D5) and Riser Studio's design-once paperwork (4) all assume a device record with a location on a plan. **Building the register once, before any of them, avoids building it several times inconsistently.**

### 1a. Re-check after dropping Door Passport (2026-11-16)

Door Passport (17) was one of the Device Register's stated dependants, so the foundation was re-checked when it was dropped.

**Verdict: the Device Register is still the right foundation to build first, and the priority order doesn't change.**

**Why it's still first.** Door Passport was only one of several dependants, and arguably the lightest: it *read* the register but added nothing to it. Every remaining heavy module still needs a located device record:
- **M1 (items 4, 5, 13, 23):** the design-to-documents generator and the 3D Site Viewer need devices and their positions to draw anything.
- **M2 (item 9):** Walk-and-Tap *writes* devices onto a plan. Without a register it has nowhere to put them.
- **M5 (items 10, 12):** per-device checklist items and wiring checks need to know which device they're about.
- **M8 (item 21):** sun glare needs each camera's position and bearing.
- **M7, the Living Site Portal:** its device-list and 3D-viewer sections (D5) read from the register.

Both the desk path (Riser Studio) and the field path (Walk-and-Tap) still need to write to **one** register. That was the main reason for building it first, and it's untouched.

**What changes: the register's scope gets smaller.** Without Door Passport it no longer needs:
- a per-device public identity (a QR code or sticker ID) or a printable sticker sheet;
- a per-device history page that pulls together job record, faults and fixes for anyone who scans it, and the question of who may open one at the door.

What's left is a plain internal record: device, type, site, plan, position, drop/route, serial link, and test status. That's still sized **L**, but at the lower end.

**Knock-on edits made with this check:**
- No QR library is needed by any remaining item **except** item 19's "scannable QR". That can be a plain QR to the site's portal link, an **S**-sized addition inside M7.
- M9 no longer depends on M6; it can use fault history per device type from F instead.
- Scoped offline (D1) now covers M2, M3 and M5.
- Indoor positioning (D4) loses the "door stickers as location markers" option.


---

## 2. The 23 items, as Jay stated them

Each item: Jay's description (kept as stated) → plain description → size → depends on → overlaps. "Built" means it exists in this repo today.

### Existing tools to fold in

**1. Riser Studio** — *Jay's separate 3D security design and estimating app.*
- **What it is:** a separate application where security systems are designed in 3D and estimated. "Folding it in" means Nexvelon receiving its designs (devices, parts, quantities, positions), and possibly embedding it.
- **Size:** the integration alone is **L**; folding the whole app into Nexvelon would be **XL**.
- **Depends on:** what Riser Studio is built on and what it can export (D3).
- **Overlaps:** it's the design front end of M1 (items 4, 5, 13), the likely source of the 3D Site Viewer (23), and a natural source for the Device Register (F) and for camera positions (M8).

**2. Camera Coverage Vision**
- **What it is:** an existing camera-coverage tool. It shows what each camera sees given its position, lens and field of view.
- **Size:** integration **M**.
- **Depends on:** D3; camera positions on a plan (F).
- **Overlaps:** item 21 (Sun Glare) uses the same camera position + bearing data. Riser Studio's 3D model may already compute coverage, so check before keeping both.

**3. Photo markup tool**
- **What it is:** an existing tool for drawing on site photos (arrows, circles, notes).
- **Size:** integration **S–M**.
- **Depends on:** D3; attachments (built).
- **Overlaps:** **nothing in Nexvelon marks up photos today** (no markup, annotation or device-placement code exists). Items 15, 16, 18, 19 and 20 all consume marked-up photos, so it's the base of M3.

### Headline capabilities

**4. Design once, paperwork builds itself** — *placing devices in Riser Studio auto-produces quote, parts list, wiring drawings, commissioning workbook and handover package with nothing retyped. Also auto-finds each part number's datasheet online and files it in a project folder.*
- **What it does:** one design produces every downstream document automatically.
- **Size:** **XL**, as the sum of M1 + M7 + the datasheet finder.
- **Depends on:**
  - F and D3;
  - the quote and its parts list (built: quotes, the catalog, job line items);
  - wiring drawings (item 5);
  - a commissioning workbook (commissioning runs are built, but have no templates and no per-device items);
  - handover (M7).
- **The datasheet finder** is a separate **M**. It needs web search per part number, and its results need a human check: a wrong datasheet filed confidently is worse than none. Job folders already exist (19 default subfolders per job), so filing is easy; *finding the right PDF* is the hard part.
- **Overlaps:** this is M1's headline. It's the same capability as items 5 and 13, from the design side.

**5. BOM + theory-of-operation → auto-drawn wiring diagrams and commissioning file, output as AutoCAD, Word and PDF.**
- **What it does:** given the parts list and a written description of how the system works, it generates wiring diagrams and the commissioning file.
- **Size:** **L–XL**. Diagram generation from rules is the hard core, The AutoCAD output is DXF (D2, decided).
- **Depends on:**
  - a wiring rules library (how each device type connects to each panel);
  - F;
  - DXF output for AutoCAD (**D2, decided**: no licence needed);
  - Word output (a library; S);
  - PDF output (built: the app already renders PDFs).
- **Overlaps:** the same generator as items 4 and 13, with only the input differing. It's also the source of the saved diagrams that item 12 checks against.

**6. One job, one thread** — *every photo, markup, test result, invoice and client message on a single job page.*
- **What it does:** a single chronological record per job.
- **Size:** **L**.
- **Depends on:** what's partly built:
  - job folders with photos;
  - site logs with photos;
  - deficiencies with photos;
  - commissioning runs;
  - invoices;
  - an audit activity feed that already rolls child events up to the project.

  **Client messaging is not built** (there are no message threads), and there's no combined gallery view.
- **Overlaps:** it's the timeline that items 18 and 19 draw from (and that the dropped item 17 would have). The existing activity feed is an *audit* trail of create/update/delete events, not a client-readable thread, so it's a starting point, not the answer.

**7. Works with no signal** — *full offline operation in basements, parkades and mechanical rooms, syncing later.*
- **What it does:** the app keeps working with no connection and reconciles when back online.
- **Size:** **XL** if the whole app goes offline; **L** if scoped to a field-capture surface.
- **Depends on:** a platform decision. **Nothing offline exists today**: no service worker, no app manifest, no local database, no sync. See **D1**.
- **Overlaps:** every field tool (M2, M3, M5) is far more useful offline, which is why D1 can't wait.

**8. Ask your business anything** — *natural-language questions answered from his own data ("which jobs lost money this year?").*
- **What it does:** type a question in plain English, get an answer from Nexvelon's own data.
- **Size:** **M** if it answers by choosing and filtering the existing reports; **L** if it writes its own queries.
- **Depends on:**
  - an AI provider (none is integrated today);
  - the REP-5 report datasets (built; they already resolve dates and opco filters);
  - **SEC-1 field redaction and per-user permissions (built), which it must obey.**
- **Overlaps:** REP-5's saved reports. The safest first version answers *through* the existing reports, which already enforce permissions, rather than querying the database freely.

### Field tools

**9. Walk and Tap Takeoff** — *walk the site tapping devices against an imported plan, with spoken location references ("the door on the right of reception") and a full per-device option tree (system type, lens, mount, indoor/outdoor, resolution, retention days, recording mode), producing a markup, takeoff and draft quote before the rep leaves site.*
- **What it does:** on a phone, walking the site, the rep taps where each device goes on the floor plan, says where it is, picks its options, and leaves with a marked-up plan, a takeoff and a draft quote.
- **Size:** **L**.
- **Depends on:**
  - F;
  - plan import (PDF plans can already be uploaded and rendered to images for quotes, but nothing places devices on them);
  - an option tree per device type;
  - the price list (built: list price, cost, margin tiers);
  - speech-to-text;
  - **D4 (indoor location)**;
  - and, in practice, **D1 (offline)**.
- **Overlaps:**
  - **Item 11** heavily (below).
  - **Item 14** shares the plan-on-phone view.
  - **Riser Studio (1)**: Walk-and-Tap is a *field* way to produce the same device list Riser Studio produces at a desk. The two must write to one Device Register, or Jay ends up with two competing device lists.
  - Quote `takeoffGroups()` today only sums quote lines by classification. It isn't a plan takeoff.

**10. Mistake Radar** — *checks photos and notes against the job checklist and flags what is missing before leaving site.*
- **What it does:** before the tech leaves, it compares what was captured with what the job's checklist requires and lists the gaps.
- **Size:** **M** for rule-based checks ("no photo for checklist item X"); **L** if AI judges photo content.
- **Depends on:** **structured checklist templates, which are not built.** Commissioning items are free-text rows with no templates, and **commissioning items can't take photos** (only deficiencies can). Then F (to know which devices exist), and an AI vision provider for the photo-content version.
- **Overlaps:** the existing commissioning checklist (see §3).

**11. Quote in 60 Seconds** — *photograph the area, state what the client wants, get a priced quote PDF from his own price list.*
- **What it does:** a fast quote from a photo plus a spoken request.
- **Size:** **M** once M2 exists; **L** on its own.
- **Depends on:**
  - the price list (built);
  - the quote PDF (built);
  - an AI vision/language provider to turn photo + speech into a device list;
  - speech-to-text.
- **Overlaps:** **item 9** heavily (below).

**12. Wire Whisperer** — *photo of a terminal block, tap each wire, matched against the saved wiring diagram to flag swaps.*
- **What it does:** the tech photographs a terminal block and taps each wire, and the app checks it against the design.
- **Size:** **L**.
- **Depends on:** **saved wiring diagrams, which don't exist until item 5 is built**; F (which device/panel this is); an AI vision provider, or tap-to-label as a first step.
- **Overlaps:** it consumes M1's output and is the second half of M5.

**13. Say It, See It Wiring** — *speak a door's devices, it draws the wiring diagram.*
- **What it does:** a voice front end to the wiring generator.
- **Size:** **S–M** *on top of* item 5; **L** without it.
- **Depends on:** item 5's generator; speech-to-text.
- **Overlaps:** **the same capability as 5 and Riser Studio**, with only the input changing (voice vs BOM vs 3D design). Build the generator once.

**14. Plan Ghost Vision** — *saved plan overlaid on the live phone camera view.*
- **What it does:** augmented reality that shows the floor plan (and devices) laid over what the camera sees.
- **Size:** **L**. AR alignment is hard indoors.
- **Depends on:** the plan; F; AR support on the phone (a native app or a WebXR-capable browser); the same alignment problem as D4.
- **Overlaps:** item 9's plan view. Treat it as a later enhancement to M2, not a separate product.

**15. Site Tour Builder** — *site photos linked into a tappable walkthrough.*
- **What it does:** links photos into a click-through tour of the site.
- **Size:** **M**.
- **Depends on:** photos (built), linked by position or by plan.
- **Overlaps:** M3; it gets much easier with photos pinned to a plan (F).

**16. Then and Now Slider** — *before/after photos from the same angle with a slider.*
- **What it does:** a before/after comparison slider.
- **Size:** **S** for the slider; **M** to guide the tech to the same angle.
- **Depends on:** photos (built); pairing before/after.
- **Overlaps:** M3; consumed by M7's proof page.

### Asset and client-facing

**17. Door Passport** — *a QR code per door or panel showing its hardware, wiring photos, test results, past faults and who fixed what. Includes a printable PDF of all a project's codes laid out for sticker labels.*

> ❌ **DROPPED by Jay, 2026-11-16.** Jay decided not to build Door Passport, including the per-door QR codes and the printable sticker sheet. It's kept here, as originally stated and analysed, so the intent is **recorded as dropped rather than vanishing** (§8; the REALITY-2 lesson in `docs/INTENT_RECOVERY.md`). Don't build it, or reintroduce it under another name, without a new decision from Jay. The effect on the Device Register is in §1a.

*The analysis below is as it stood before the drop:*
- **What it does:** a sticker on each door/panel opens that device's history.
- **Size:** **M**.
- **Depends on:**
  - **F (a door/panel record to point at)**;
  - M4 (its history);
  - a QR library (**no QR generation exists today**);
  - PDF sticker sheets (PDF rendering is built);
  - access control: who can open a passport, and whether a technician at the door must sign in. That's a security question for an access-control company.
- **Overlaps:** **this is the client- or tech-facing face of the Device Register.** "Past faults" ties to deficiencies (built) and Fault Finder (22).

**18. Proof of Work Page** — *one client link with before/after photos, test results, date, time and location.*
- **What it does:** a link the client opens to see what was done.
- **Size:** **M** (shared with 19).
- **Depends on:**
  - the **Living Site Portal** (D5, decided): one live link per site;
  - photos (built);
  - commissioning results (built);
  - item 16's slider.
- **Overlaps:** **item 19** (nearly the same deliverable) and the **quote portal** (the same token security, but deliberately *different* content rules). See §3 and D5.

**19. Handover in One Tap** — *one client package of photos, test results, diagrams plus a scannable QR.*
- **What it does:** the end-of-project package for the client.
- **Size:** **M** (shared with 18).
- **Depends on:**
  - the **Living Site Portal** (D5, decided);
  - commissioning certificates (built: they already render a signed PDF);
  - diagrams (item 5, or uploaded drawings);
  - a QR code to the site's portal link (a small, **S** addition; item 17's QR work is dropped);
  - warranty and handover records (built as *fields* on a warranty, but **nothing generates a handover package today**).
- **Overlaps:** **item 18**. See §3.

**20. Pitch Cinema** — *cinematic proposal video from site photos and markups.*
- **What it does:** turns site photos and markups into a short proposal video.
- **Size:** **M** with a third-party video service; **L** to build in-house.
- **Depends on:** M3 photos and markups; a video-generation or editing service; storage for video files.
- **Overlaps:** none in the ERP. It's a sales asset, a good candidate to buy rather than build, and the least connected to the core.

**21. Sun Glare Predictor** — *the hours and months the sun shines into a camera lens for a given position and bearing.*
- **What it does:** from a camera's location and the direction it faces, it shows when the sun will blind it.
- **Size:** **S–M**. Sun-position maths is well understood and computed from latitude/longitude, date and time.
- **Depends on:**
  - the camera's position (latitude/longitude), bearing and tilt;
  - F, or Riser Studio, or Camera Coverage Vision as the source of those values;
  - optionally, nearby obstructions.
- **Overlaps:** **item 2**. Both need camera pose, so they belong together as M8.

**22. Fault Finder Trail** — *tap the symptom, get likely causes in order; Jay adds PDFs, images, audio and text over time so it improves with his experience.*
- **What it does:** a troubleshooting guide Jay builds up over time: pick a symptom, see causes ranked, each with supporting material.
- **Size:** **M** for a curated tree; **L** if causes are ranked from fault history automatically.
- **Depends on:** attachments (built) for the PDFs, images and audio; an authoring screen for Jay. **Nothing like it exists today.**
- **Overlaps:** deficiencies (built). With F, fault history per device type could feed the ranking. (It also overlapped Door Passport's "past faults" (17), now dropped.)

**23. 3D Site Viewer** — *a self-contained HTML file showing the whole building in 3D, with all floor plans, rotatable, showing device locations and drops in place.* (Added after first capture.)

> **Delivery decided 2026-11-16 (D5):** it is **not a sent file**. The viewer is shown inside the **Living Site Portal**, one durable, revocable link per site that always shows current content. The original wording above is kept as Jay first stated it.
- **What it does:** a 3D view of the whole building, opened from the site's portal link in any browser with no install. It shows every floor stacked in 3D, can be rotated and zoomed, and shows each device and cable drop where it sits, **as currently recorded**.
- **Size:**
  - **M** if Riser Studio can export its 3D model and device positions; the viewer is then mostly an export plus a portal page.
  - **L** if built from Nexvelon's own data, by stacking the imported 2D floor plans as levels and placing devices from the Device Register.
- **Depends on:**
  - **Riser Studio (1), most likely.** It already holds the 3D design, so its export format (D3) decides most of the cost.
  - F (device positions per floor).
  - The floor plans for every level, plus floor heights.
  - **Drop/cable-route data.** "Drops in place" needs where each cable runs or terminates, which the Device Register as described doesn't hold yet. The register would need a drop or route record added.
  - A 3D rendering library (for example three.js) loaded by the portal page.
  - **The Living Site Portal (M7, D5)** to deliver it.
- **Security, resolved by D5:**
  - The earlier concern was that a sent file is a forwardable copy of a security system's layout that can't be revoked. **That concern is superseded:** a revocable, expiring, view-logged link solves it.
  - Like everything in the portal, the viewer **never carries SEC-1 cost, margin or internal notes.**
- **Overlaps:**
  - **Item 1, heavily:** it's essentially a shareable *output* of Riser Studio's 3D model, so it belongs in M1 as one more document the design produces.
  - **Item 14, partly:** both show the plan and devices in space, but 14 is live AR on site and 23 is a browser model for the office or client. They share the device-position data from F, not the viewer itself.
  - **Item 3, none really.** Site photos could later be pinned into the viewer, but that's an enhancement, not an overlap.
  - **M7 / items 18–19:** the viewer is one of the sections Jay can switch on in the site's portal (D5).

---

## 3. Overlap analysis

**18 + 19 are nearly the same deliverable.**
- **Both are a client link to a curated set of photos, test results and documents.** Proof of Work is scoped to a visit (date, time, location); Handover is scoped to the whole project and adds diagrams and a QR.
- **Build one "client package" page with two presets**, *visit proof* and *project handover*, not two products.

**18 / 19 + the quote portal share token security, not content rules.**
- **What M7 reuses from the quote portal:**
  - unguessable tokens (`randomUUID`);
  - service-role reads scoped by the token;
  - the audit trail.
- **What it deliberately does *not* reuse:**
  - the quote portal's frozen snapshot;
  - its 30-day, per-recipient, per-quote link.
- **The Living Site Portal (D5) is per site, durable and live.** See D5 for why the two differ on purpose.

**11 + 9 overlap heavily.**
- **Both turn what's on site into a device list and then a priced quote from Jay's price list.**
  - Quote in 60 Seconds is the *quick* mode: one area, photo plus speech, rough.
  - Walk and Tap is the *thorough* mode: whole site, plan-referenced, full option tree.
- **Same pipeline:** capture → device list → price → quote PDF. **Build the pipeline once (M2), with 11 as its express mode.** Otherwise there are two ways to make a quote from a site visit that disagree.

**10 + the existing commissioning checklist.**
- **What exists:** commissioning runs per job, made of free-text items (category, description, expected result, pass/fail/na, actual result), with re-tests kept, failed items able to raise a deficiency, and a signed certificate PDF.
- **What's missing:**
  - **no checklist templates** (every run is typed from scratch);
  - **no link to devices**;
  - **no photos on items**.
- **Mistake Radar can't check "what's missing" against a list that doesn't exist.** Its real prerequisite is to *upgrade the commissioning checklist*: templates per system type, per-device items, photo evidence per item. That upgrade is valuable on its own (it also feeds the commissioning workbook in item 4), and Mistake Radar is then a check on top of it.

**13 + 5 + Riser Studio describe one capability: "devices in, wiring diagrams and commissioning paperwork out."**
- **Only the input differs:** Riser Studio's 3D design (1/4), a BOM plus a written theory of operation (5), or speech (13).
- **Build one generator** (a wiring-rules library producing diagrams and the commissioning file) and treat those three as front ends to it. That's M1. Building any of them separately would mean three wiring engines giving three answers for the same door.

**Also worth naming:**
- **9 and Riser Studio both produce a device list.**
  - If both exist, **they must write to the same Device Register** (F), with a clear rule for which one wins when they disagree.
  - Otherwise the desk design and the site walk diverge.
- **2 and 21 both need camera pose** (position, bearing, tilt, lens). Keep them together (M8), fed from the register or Riser Studio.
- **17 and 6 (17 dropped 2026-11-16):**
  - The Door Passport would have been the job record (M4) filtered to one device.
  - With 17 dropped, tagging M4 entries to a device is now optional rather than a requirement.
- **14 and 9:**
  - Plan Ghost Vision is an enhancement to Walk-and-Tap's plan view, not a separate tool.
  - It shares the indoor-alignment problem (D4).
- **23 and Riser Studio (1):**
  - The 3D Site Viewer is an export of the 3D design, so it sits in M1.
  - It shares device positions with 14 (AR) through F; it doesn't overlap 3.

---

## 4. Decisions (D2 and D5 decided; D1, D3, D4 open)

### D1 — Offline-first (item 7). *Cannot wait: it shapes every field tool.*

**What it is.** Making the app work with no signal isn't a feature added on top. It changes three things:
- **Where data lives.** A copy on the phone (an on-device database), not only on the server.
- **How changes are saved.** Every edit is queued locally and sent later. That includes photos, which are large and fail to upload mid-way.
- **What happens when two people change the same thing while offline (conflicts).** Two techs edit the same checklist, or the office changes a quote while a rep edits it on site. Someone has to win, by a rule, without silently losing work.

It also changes how every screen behaves. Each one must show "saved on this phone, not yet synced" honestly, which is §2.8 applied to sync.

**Where Nexvelon is today.** It's server-first:
- pages render on the server and every change is a server action straight to the database;
- permissions and field redaction (SEC-1) are enforced on the server at read time;
- nothing offline exists: no service worker, manifest, local database or sync.

**The real cost, now vs later.**
- **Whole app offline, retrofitted:** **XL** (months). Every module would need a local copy, a sync queue and conflict rules. Server-side permission checks would also need an offline equivalent, because cost and margin data (SEC-1) can't simply be copied onto every phone. **The cost grows with every module built server-first in the meantime**, because each one is more to retrofit.
- **Scoped offline: only the field-capture surface** (M2, M3, M5), as a separate phone-first app or installable web app that syncs into the ERP: **L**.
  - **What goes offline:** the field tools.
  - **What stays server-first:** the office ERP (quotes, invoices, financials).
  - **Why it's cheaper:**
    - field capture is mostly *append* (new photos, new taps, new results), which rarely conflicts;
    - cost and margin data need never leave the server.
  - **What it costs:** two surfaces to maintain, and a clear boundary (what a tech can edit offline vs what needs a connection).
- **Later:** the scoped approach stays about as expensive whenever it's started, *provided* the field tools are designed for it from the start. If the field tools are first built server-first and then retrofitted, the cost roughly doubles.

**What Jay should weigh:**
- **How often there's really no signal:** every basement and parkade, or occasionally?
- **Whether a tech would accept** "capture now, it uploads when you're back upstairs" (append-only offline) instead of full offline editing of quotes and jobs.
- **Whether field tools should be a separate phone app.** That's also the natural home for camera, AR (14), speech and QR scanning.
- **The rule that matters most:** decide this *before* building M2, M3 or M5, because it decides how they're built.

*Not decided here.*

### D2 — AutoCAD output (item 5) — **DECIDED: DXF, not native DWG**

**Decision (Jay, 2026-11-15):** generated drawings are output as **DXF** (plus PDF, and Word where a document is needed). **Native DWG isn't pursued**, so there's no Autodesk RealDWG or ODA licence and no separate native CAD service.

**What this means for the build:**
- **No licence, no extra service.** DXF is AutoCAD's open, documented exchange format and can be written from Nexvelon's own diagram model with an open-source library. Engineering size: **M**.
- **AutoCAD opens the files directly.** A recipient who needs a `.dwg` opens the DXF and uses "Save As DWG" in one step.
- **Known limits, accepted with this choice:**
  - some AutoCAD-native features don't carry over (for example dynamic blocks, some annotation and layout features, proxy objects);
  - large drawings are bigger files.

  For generated wiring diagrams (lines, text, simple blocks, layers) this is normally invisible.
- **Revisit only if a real client contractually requires native DWG.** The DWG path would then cost a commercial licence (get quotes) plus a separate native service (**L**). It would be added alongside DXF, not instead of it.

**Options that were considered:**

| Path | Licence | Engineering | Fidelity | Status |
|---|---|---|---|---|
| **DXF** (open) | None | **M** | Opens in AutoCAD; some native features unavailable | **Chosen** |
| DWG via a commercial SDK (ODA, or Autodesk RealDWG) | Commercial licence or membership; not estimated | **L**, plus a native service | Native DWG | Not pursued |
| PDF / Word only | None | **S–M** | Not editable in AutoCAD | Still produced alongside DXF |

### D3 — The three existing tools (items 1, 2, 3). *Needed before M1, M3 and M8 can be sized properly.*

> **ANSWERED for Riser Studio (DEVREG-1, 2026-11-19).** The ERP stores Riser
> Studio's project JSON (one object per site, to be held by DEVREG-2), and the
> **Device Register holds its devices**: one row per Riser `devices[]` entry,
> with the original record kept verbatim so it exports unchanged. Its catalog (62
> types: access 18, cctv 9, fire 8, intrusion 8, network 6, intercom 5,
> electrical 4) carries name, system, label prefix, default mount height, default
> cable type, what it homes to, optional field of view and accessories as
> `[name, qty]` pairs, and **no pricing**. A mapping from Riser types and
> accessories to ERP inventory products is therefore required (**DEVREG-3**).
> Camera Coverage Vision and the photo markup tool are still open.
>
> **What DEVREG-1 established about the two device models:**
> - **Riser Studio** (design): a device is `{id, t, b, f, x, z, rot, lab, mdl, to, ct, mh, notes, fov?, door?}`,
>   positioned in **metres** on an authored floor.
> - **3D System Design View** (as-built): a device is `{id, p:[x,y], t, ip, model, type, sw, swip, port, vlan, mask, gw, mbps, ch, nvr[], det, inj, acc, r[]}`,
>   positioned **normalised 0–1** on a floor plan image, with its conduit route in the same space.
> - **Canonical position is metres.** The 0–1 plan position is also stored when a
>   source supplies it. Converting between them needs the floor plan's real-world
>   origin and extent, stored on the floor and never assumed. Without them the
>   conversion is refused.
> - **Design and as-built are kept apart**: the as-designed record and the
>   commissioned record are each stored verbatim, and an edit or as-built value
>   never overwrites the design record (§2.2).

Riser Studio, Camera Coverage Vision and the photo markup tool are outside this repo. Before any integration work, establish for each:
- what it's built on and who owns the code;
- what it can import and export (file formats, an API);
- whether it should be *embedded* in Nexvelon, *linked* to it (data flows between them), or *rebuilt* inside it.

Integrate-by-data-exchange is usually far cheaper than folding a whole app in. Each tool's answer changes the sizes above.

### D4 — Indoor positioning for Walk-and-Tap (item 9). *Flagged, not decided.*

**Phone GPS is roughly 5–15 metres off indoors** (often worse in basements, and absent underground). **It can't tell which door a rep is standing at.** The realistic mechanism is the one already in Jay's description: **tap the device's position on the imported plan, plus the spoken location reference** ("the door on the right of reception"). GPS can at most confirm *which building or floor*.

**More precise options, each a cost of its own:**
- AR anchoring to the plan (the item 14 problem);
- Bluetooth beacons;
- scanning a QR or marker at a known spot. (Item 17's door stickers could have doubled as these, but item 17 is dropped.)

### D5 — Client delivery: the Living Site Portal (items 18, 19, 23) — **DECIDED 2026-11-16**

**Decision (Jay, 2026-11-16):** client-facing content (the 3D Site Viewer, proof of work, handover) is delivered through a **Living Site Portal**, **not a sent file**. It's one durable link per **site**. The link stays valid while work continues and always shows current content.

**What's decided:**
- **The link lives on the SITE, not the project.** A client with several projects at one building has **one** link, not one per job.
- **Jay controls expiry per link:** a set number of days, a fixed date, or no expiry.
- **Jay can revoke or regenerate a link at any time.** Revoking takes effect **immediately**: the next request with the old link is refused.
- **Updating the content does not change the link.** The client keeps the same URL for the whole project and beyond.
- **It shows the current state.**
- **Jay chooses what each site's portal exposes.** It isn't all-or-nothing. Sections:
  - the 3D viewer (23);
  - the device list;
  - photos;
  - test results;
  - handover documents.
- **It never carries cost, margin or internal notes** (SEC-1). Those are excluded on the server, not hidden in the page.
- **Every view is logged** (who, meaning which link, and when), because the portal shows a client's device positions.

> ⚠️ **Deliberately different from the quote portal. Don't "fix" one to match the other.**
>
> | | Quote portal (`/q/[token]`) | Living Site Portal |
> |---|---|---|
> | Content | **Frozen snapshot** of exactly what was sent, because a quote is an offer and must not change under the client | **Live, current state**, because a site record is meant to stay up to date |
> | Scope | One link per recipient per quote | One link per site |
> | Expiry | 30 days | Jay's choice: days, a fixed date, or none |
>
> Both share the same token *security* (unguessable token, server-side scoped reads, audit). Their *content rules* are opposite on purpose.

**What this supersedes:** the earlier item-23 concern that a sent HTML file could not be expired or revoked. A revocable, expiring, view-logged link solves it, so the self-contained-file approach is dropped.

**Still open:**
- **Where the portal and its settings live in the site record.** Today a site has no client-facing settings, so it's still to decide:
  - where the link(s), the expiry rule and the exposed sections are stored;
  - whether a site can hold more than one live link (for example, one per client contact so each can be revoked separately).
- **Whether a client needs any identification beyond holding the link.** Options to weigh later:
  - the link alone (like the quote portal);
  - the link plus an emailed one-time code;
  - the link plus a client login.

  The portal shows a security system's layout, so this deserves an explicit decision rather than defaulting to the quote portal's link-only model.

---

## 5. Recommended order *if and when* Phase 2 starts (not a schedule)

1. **Decide D1 (offline) and D3 (existing tools).** They're cheap to decide and expensive to reverse. (D2, the CAD format, is decided: DXF.)
2. **F, the Device Register, plus the commissioning checklist upgrade** (templates, per-device items, photo evidence). These are foundations, and both are useful straight away. Still first after Door Passport was dropped (§1a); the register's scope is smaller.
3. **M7, the Living Site Portal (client proof and handover).** Highest client-visible value for the least new machinery: it reuses the quote portal's token security and commissioning results, with live, per-site content (D5).
4. **M2, field capture and takeoff** (express mode first, per item 11), built to the D1 decision.
5. M1, M3, M8, then M4, M5, M9, M10, M11 as value and capacity allow. (M6, Door Passport, is dropped.)

---

## 6. Status

**None of this is scheduled. Nothing here is built.** The active work is `NEXVELON_ROADMAP.md` → *Remaining work*, and it continues first. When a Phase-2 module is picked up, it gets its own design pass and its own roadmap entry; until then this file is the record. Update it in the same PR as any related decision (§8 of `NEXVELON_PRINCIPLES.md`).

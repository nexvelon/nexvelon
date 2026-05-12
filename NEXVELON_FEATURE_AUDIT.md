# NEXVELON_FEATURE_AUDIT.md

> **Comprehensive feature audit + sidebar expansion.** The scoping
> pass that lands before the permissions module is designed.
>
> A new Claude Code session reads, in order:
>   1. `NEXVELON_PRINCIPLES.md` — the six non-negotiables.
>   2. `CLAUDE_CONTEXT.md` "Current Session State" block.
>   3. `NEXVELON_SESSION_<latest>_HANDOFF.md`.
>   4. `NEXVELON_ROADMAP.md`.
>   5. **This file** — feature audit + sidebar expansion.
>
> **Status:** v0.13 — Modules 1-12 fully scoped through Sessions C-N.
> Module 13 (Reports) pending. M1-M11 condensed to headline stats
> per file-size management pattern; current module gets full content.

---

## 0. How to use this document

### 0.1-0.7

Per v0.12 spec. Per-module rubric (14 subsections); role abbreviations (A/PM/SR/Tech/Sub/Acc/VO); action table columns; ten dimensions of permission control; baseline gaps from Session C.

### 0.4 Permissions model — locked commitments

Through Sessions B-N:

1. **Role default + bidirectional per-user override.**
2. **Three UI states per gated control:** hidden / disabled / interactive.
3. **Fine-grained by default.**
4. **Lookup-table rows carry behavior bindings.**
5. **Guided creation, never lazy creation.**
6. **Ten dimensions of permission control.**
7. **Contractual integrity exception:** `clients:overrideSlaResponseTime` Admin-only.
8. **Versioned T&C clauses + workflow rules + dashboard widgets + quote terms snapshots + change order amendments + commissioning records + FIFO inventory layers + vendor-side T&C clauses + invoice send snapshots + contractor WO terms snapshots + labor rate snapshots + GL period locking + SLA response time snapshots on appointments.**
9. **Eight-layer print protection** for sensitive PDFs (quotes, contracts, payroll, HR docs, commissioning certificates, handover packages, PO PDFs, remittance advice, T5018 forms, invoices, credit notes, statements, contractor WOs, MSA forms, tax filings, financial reports).
10. **Comprehensive logging visibility** per PRINCIPLES §4. **Append-only ledgers** for inventory movements, commissioning records, acceptance records, vendor/contractor performance scoring, GL postings, schedule change log.
11. **Separation of duties** enforcement (AP bill creator ≠ approver; payment run creator ≠ approver; GL manual entry creator ≠ poster; hard close requires A + Acc co-sign).
12. **Regulatory expiry auto-block enforcement** (insurance + WSIB + certification expired → PO/WO/appointment creation blocked; manual override requires A approval + reason).
13. **Geolocation privacy retention** (mobile clock-in/out geolocation data retained 30 days default; operator-configurable).

### 0.6 Walk order

1. Clients + Sites + Contacts *(complete §1)*
2. Employees + Permissions *(complete §2)*
3. Settings *(complete §3)*
4. Dashboard *(complete §4)*
5. Quotes *(complete §5)*
6. Projects *(complete §6)*
7. Inventory *(complete §7)*
8. Vendors *(complete §8)*
9. Invoices *(complete §9)*
10. Subcontractors *(complete §10)*
11. Financials *(complete §11)*
12. **Scheduling** *(complete §12)*
13. Reports

### 0.7 Sidebar architecture *(unchanged from Session K)*

```
🧭 Sidebar (top-level)
─────────────────────
📊 Dashboard
👥 People (parent)
💰 Quotes
📋 Projects
📦 Inventory
📅 Scheduling             ← Module 12 surface
💵 Financials (parent — 16 sub-items spanning M9 + M11)
📈 Reports
⚙️ Settings
```

---

═══════════════════════════════════════════════════════════════════
# 1-11. Modules 1-11 — condensed headline stats
═══════════════════════════════════════════════════════════════════

## §1. Clients + Sites + Contacts
23 routes, ~110 actions, 15 lookup tables, 14 field visibilities. Per-site SLAs with precedence. Contractual integrity exception. Holdback (10%/Excl/45 Ontario). 54 acceptance criteria. Permissions: items 1-14. (Full content at `073b393`.)

## §2. Employees + Permissions
25 routes, ~80 actions, 11 lookup tables, 14 field visibilities. Six-tab permissions editor. 25+ seeded certifications. Multi-territory. Resource Absences. 55 acceptance criteria. Permissions: items 15-22. (Full content at `4dc0cc2`.)

## §3. Settings
~70 sub-pages, ~270 actions, 16 tables, 4 status surfaces. 29 operator-editable lookups. Workflow Rules. Email/PDF templates. 42 acceptance criteria. Permissions: items 23-27. (Full content at `87a9fc8`.)

## §4. Dashboard
3 routes, ~35 actions, 5 owned tables, 3 status surfaces. ~20 seeded widgets, 6 role layouts. Three-way visibility gate. UI presentation as 10th dimension. 25 acceptance criteria. Permissions: items 28-30. (Full content at `6283d0f`.)

## §5. Quotes
18 routes + 1 portal, ~85 actions, 12 owned tables, 5 status surfaces. Three quote types. Online portal acceptance. Immutable send snapshots. T&C auto-composition. 52 acceptance criteria. Permissions: items 31-37. (Full content at `5633e25`.)

## §6. Projects
24 routes, ~110 actions, 12 owned tables, 8 status surfaces. Three-state costing. Change order workflow. Commissioning + ULC verification. Handover with warranty clock. Progress invoicing. Lien deadline tracking. 58 acceptance criteria. Permissions: items 38-44. (Full content at `bafb708`.)

## §7. Inventory
26 routes, ~95 actions, 15 owned tables, 6 status surfaces. Multi-location stock. FIFO valuation. Append-only movements ledger. Serial lifecycle. Photo on receive. Vendor catalog sync. 48 acceptance criteria. Permissions: items 45-49. (Full content at `f7cee0d`.)

## §8. Vendors
18 routes, ~65 actions, 8 owned tables, 4 status surfaces. T5018 YTD + annual report. Vendor onboarding gates. Insurance/WSIB expiry tracking with auto-PO-block. Performance scoring with auto-degrade. Banking encrypted at rest. 35 acceptance criteria. Permissions: items 50-53. (Full content at `f3a763a`.)

## §9. Invoices
22 routes + 1 portal, ~115 actions, 14 owned tables, 5 status surfaces. AR + AP parallel flows. Customer payment portal with Stripe. 3-way match. Separation of duties on AP. T5018 auto-update. Canadian Construction Act holdback. 55 acceptance criteria. Permissions: items 54-58. (Full content at `681b2ad`.)

## §10. Subcontractors
23 routes, ~75 actions, 13 owned tables, 5 status surfaces. WSIB auto-block (Ontario regulatory; §0.4 #12). T5018 mandatory. Lien deadline tracking. Worker manifest with cert verification. Skill + territory matching. Versioned labor rates. Cross-link with M8. 38 acceptance criteria. Permissions: items 59-62. (Full content at `4c0b33b`.)

## §11. Financials
26 routes, ~90 actions, 12 owned tables, 6 status surfaces. Built-in GL with source-back traceability. Canadian-first tax compliance (HST/GST/PST + T4 + T5018). Period close with separation of duties (soft Acc → hard A+Acc co-sign). FX revaluation. Bank reconciliation. QBO/Xero/Sage 50 export at v1. Project P&L drilling. Recurring journals. Holdback payable separate liability. 45 acceptance criteria. Permissions: items 63-67. (Full content at `b60caf7`.)

---

═══════════════════════════════════════════════════════════════════
# 12. Module: Scheduling
═══════════════════════════════════════════════════════════════════

## 12.1 Purpose

Operational scheduling layer. Multi-resource calendar (employees + contractors + equipment + vehicles). Drag-drop appointment scheduling. SLA response time enforcement consuming M1 site-level SLAs. Capacity planning with heatmap. Skill + certification + territory + availability auto-suggest engine. Mobile schedule view for technicians with clock-in/out feeding M6 timesheets. Multi-day project phase scheduling. Recurring service appointments. Emergency dispatch with override workflow.

For security integrators specifically:
- **Certification expiry blocks scheduling** — worker can't be scheduled to fire alarm install if ULC expired (extends §0.4 #12 to scheduling)
- **SLA response time auto-enforcement** — emergency response within 4 hours, Type A within 8 hours, etc. per M1 client config
- **Per-site response time precedence** — emergency vs scheduled work routed differently
- **Cross-resource scheduling** — employees + contractors + vehicles + equipment all schedulable
- **Mobile clock-in geolocation** linked to project + phase + cost-centre (drives M6 timesheets)

**Major reader of:** M1 (sites, response times, on-stop status), M2 (employees, certifications, territories, availability, absences), M3 (workflow rules, notification rules), M6 (project phases, tasks), M10 (contractor work orders).

## 12.2 Sidebar surface

Top-level 📅 Scheduling per §0.7. Badge: SLA breach alerts + dispatcher queue depth + unassigned emergency dispatches + appointments today pending confirmation.

## 12.3 Routes & sub-routes

| Route | Renders | Primary gate |
|---|---|---|
| `/scheduling` | Today dashboard with KPIs | `scheduling:view` |
| `/scheduling/calendar` | Main calendar | `scheduling:viewCalendar` |
| `/scheduling/calendar/day` | Day view | `scheduling:viewCalendar` |
| `/scheduling/calendar/week` | Week view | `scheduling:viewCalendar` |
| `/scheduling/calendar/month` | Month view | `scheduling:viewCalendar` |
| `/scheduling/dispatch` | Emergency dispatch queue | `dispatch:view` |
| `/scheduling/dispatch/new` | Create emergency dispatch | `dispatch:create` |
| `/scheduling/gantt` | Project Gantt cross-projects | `scheduling:viewGantt` |
| `/scheduling/resources/employees` | Employee resource calendar | `scheduling:viewEmployees` |
| `/scheduling/resources/contractors` | Contractor resource calendar | `scheduling:viewContractors` |
| `/scheduling/resources/vehicles` | Vehicle/equipment calendar | `scheduling:viewVehicles` |
| `/scheduling/capacity` | Capacity heatmap | `scheduling:viewCapacity` |
| `/scheduling/appointments/[id]` | Appointment detail | `appointments:viewDetail` |
| `/scheduling/appointments/new` | Create appointment wizard | `appointments:create` |
| `/scheduling/recurring` | Recurring series management | `scheduling:viewRecurring` |
| `/scheduling/sla-alerts` | SLA breach warnings | `scheduling:viewSlaAlerts` |
| `/scheduling/templates` | Schedule templates | `schedule_templates:viewList` |
| `/scheduling/audit-log` | Module audit | `scheduling:viewAuditLog` |
| `/scheduling/mobile` | Mobile-optimized today view | `scheduling:viewMobile` |
| `/scheduling/route-optimizer` | Route optimization (Phase 2 placeholder) | `scheduling:viewRouteOptimizer` |

## 12.4 Resources

### Owned tables (10)

- `appointments` — main appointment: appointment_number (auto), title, description, appointment_type_id, status_id, priority_id, start_datetime, end_datetime, timezone (UTC stored, displayed in user TZ), location_type (Site/Office/Travel/Remote), site_id (nullable; FK to M1), client_id (nullable; FK to M1), project_id (nullable; M6), project_phase_id (nullable; M6), project_task_id (nullable; M6), contractor_wo_id (nullable; M10), source_recurring_series_id (nullable), is_emergency_dispatch, created_by, assigned_dispatcher_id, customer_notified_at, technician_notified_at, customer_confirmed_at, custom_fields jsonb, snapshot_sla_response_time (captured at creation for legal durability per §0.4 #8)
- `appointment_resources` — M:N: appointment_id, resource_type (Employee/Contractor/Vehicle/Equipment), resource_id (polymorphic FK), role (Lead Tech/Helper/Apprentice/Supervisor), is_required
- `appointment_recurrence_rules` — series config: series_name, first_appointment_id, recurrence_type, recurrence_interval, end_condition (After N / By Date / Never), exception_dates jsonb (holidays, blackouts), status_id, generated_count
- `appointment_change_log` — append-only audit per §0.4 #10: appointment_id, change_type, changed_by, changed_at, before_snapshot jsonb, after_snapshot jsonb, change_reason
- `resource_availability_blocks` — calculated capacity per resource per day (computed periodically): resource_type, resource_id, date, available_minutes, scheduled_minutes, utilization_pct, conflict_count
- `dispatch_records` — emergency dispatch events: dispatch_number, caller_name, caller_phone, urgency, response_time_required (from M1 SLA), assigned_appointment_id, dispatched_by, dispatched_at, acknowledged_by_tech_at, on_site_at, resolved_at, sla_breach (boolean)
- `schedule_templates` — reusable templates: name, description, default_appointment_type, default_duration_minutes, required_skills jsonb, required_certifications jsonb, default_resource_count, equipment_required jsonb
- `sla_breach_alerts` — alerts for upcoming/actual violations: alert_type (Approaching/Imminent/Breached), site_id, appointment_id (nullable), client_id, required_response_time, actual_response_time (nullable), severity, generated_at, acknowledged_at, acknowledged_by, escalation_level
- `external_calendar_sync_state` — Google/Outlook export sync: user_id, calendar_type, last_sync_at, sync_token, mapping_rules
- `travel_time_estimates` — between-sites: from_site_id, to_site_id, estimated_travel_minutes, mode (Driving/Walking/Transit), last_calculated_at (using Google Distance Matrix API)

### Status lookup tables (4)

| Table | Seeded values | Behavior bindings |
|---|---|---|
| `appointment_statuses` | Tentative, Confirmed, En Route, On Site, In Progress, Completed, Cancelled by Customer, Cancelled by Us, No Show, Rescheduled | allows-edit, triggers-notification, terminal flag |
| `appointment_types` | Installation, Service Call, Maintenance, Commissioning, Emergency Dispatch, Inspection, Training, Travel Time, Internal Meeting, Site Visit (pre-quote), Pickup/Delivery | default duration, default required skills, color coding |
| `priority_levels` | Critical (P0), High (P1), Normal (P2), Low (P3) | SLA response time mapping, escalation thresholds |
| `sla_breach_statuses` | Approaching (warning at 75%), Imminent (alert at 90%), Breached (notification), Acknowledged, Waived, Resolved | escalation, customer notification |

## 12.5 Actions (~75 actions across 12 categories)

**Calendar views (8):** viewMyDay, viewMyWeek, viewMyMonth, viewTeamCalendar, viewResourceCalendar, viewSiteCalendar, switchView, exportCalendar.

**Appointments lifecycle (15):** viewList, viewDetail, create (with auto-suggest engine), edit, reschedule, cancel, markComplete, recordNoShow, recordCustomerCancellation, applyTemplate, generateFromProjectPhase (auto from M6), generateFromTask (auto from M6), viewActivity, exportPdf, sendReminder.

**Resources (8):** viewEmployeeAvailability, viewContractorAvailability, viewVehicleAvailability, assignResource, removeResource, viewConflicts (double-booking, cert expired, absence overlap), viewCapacityHeatmap, blockTimeOff (creates M2 absence record).

**Dispatch (6):** viewQueue, createEmergencyDispatch, assignToTech, overrideNormalScheduling (with reason captured), viewDispatchHistory, escalate.

**Recurring (5):** createSeries, editSeries, pauseSeries, cancelSeries, generateNextOccurrence.

**SLA monitoring (5):** viewBreachAlerts, configureAlertThresholds, escalateBreachInternally, recordSlaWaiver (A only with reason), viewSlaPerformance.

**Auto-suggest engine (4):** suggestForAppointment, suggestRebalancing, viewSuggestionLog, acceptSuggestion.

**Templates (5):** viewList, create, edit, applyTemplate, archive.

**Mobile (5):** viewMobileSchedule, recordClockIn (geolocation captured), recordClockOut, recordOnSite, recordCompletedOnSite.

**External calendar sync (3):** connectGoogleCalendar (one-way export at v1), connectOutlook (one-way at v1), exportToIcs.

**Reports (5):** scheduleAdherenceReport, utilizationByResource, slaPerformanceByResponseType, dispatchTimeMetrics, customerCancellationsReport.

**Audit (4):** viewAuditLog, viewChangeHistory, exportChangeLog, viewScheduleSnapshot.

**Default grants:**
- **A:** full
- **Dispatcher (special role via M2):** full scheduling, dispatch authority, override
- **PM:** create/edit/reschedule appointments for own projects' phases + tasks
- **SR:** viewMy (own client appointments — read only)
- **Tech:** viewMobileSchedule (own), clockIn/Out, markComplete (own)
- **Acc:** viewList read-only (time reconciliation)
- **VO:** viewList only

## 12.6 Views

### Today dashboard (`/scheduling`)

KPI tiles: Today's appointments / In Progress now / Completed today / SLA breaches today / Emergency dispatch queue / Unassigned. Quick actions. Live activity feed.

### Main calendar (`/scheduling/calendar`)

Day/Week/Month toggle. Multi-resource view (rows = resources, columns = time). Drag-drop to move appointments. Resize to change duration. Color-coded by appointment type. Filter chips: priority, status, project, technician, contractor, site, customer tier.

Conflict detection visual indicators:
- 🟥 Double-booking
- 🟧 Certification expired for required skill
- 🟨 Outside service territory
- 🟪 Resource absence overlap
- 🟦 SLA response time approaching

### Appointment create wizard

Multi-step:
1. Type & priority
2. Customer & site
3. Date & duration
4. Required skills/certs (from M2)
5. Auto-suggest resources (ranked list)
6. Assign resources
7. Travel time estimate (Google Distance Matrix)
8. Notifications
9. Review & confirm

### Emergency dispatch flow

1. Caller info captured
2. Site selected → SLA response time computed (M1 site response → client default → tier default precedence)
3. Available technicians ranked: distance + skills + currently uncommitted time
4. Override normal scheduling if needed (reason captured)
5. Dispatch sent → tech notified → SLA clock starts
6. Tech acknowledges → on-site → resolves → dispatch closed

### Resource availability calendar

Per-resource view: scheduled appointments + absences (M2) + cert expiry alerts. Color-coded utilization (red >90%, orange 75-90%, yellow 50-75%, green <50%).

### Capacity heatmap (`/scheduling/capacity`)

Calendar grid showing utilization per day across teams. Drill into day → see all resources + bookings. Identify under-utilized days for proactive outreach.

### Mobile technician view (`/scheduling/mobile`)

Today's schedule list. Each card:
- Time + duration
- Customer + site address (tap → navigate)
- Type + priority
- Required tools/equipment
- Customer phone (tap to call)
- Clock-in / Clock-out (geolocation)
- Mark Complete with notes + photos + customer signature

### Schedule change log

Append-only audit. Filter by appointment, technician, date range. Shows: who changed what when, before/after snapshots, reason for change.

### SLA breach alerts (`/scheduling/sla-alerts`)

Active alerts panel: Approaching (75%) / Imminent (90%) / Breached. Click → drill into appointment → re-assign or escalate.

## 12.7 Field-level visibility (5 flags)

- `visibility.scheduling.fullCalendarAcrossTeams` — A, Dispatcher only
- `visibility.scheduling.employeeCostRate` — A, Acc only
- `visibility.scheduling.privateAppointments` — owner-only
- `visibility.scheduling.customerPii` — A, PM, assigned-tech
- `visibility.scheduling.geolocationHistory` — A, owner only (30-day retention default per §0.4 #13)

## 12.8 Custom-field surfaces

Per-appointment custom fields managed in Settings → Custom Fields → Appointments. Examples: Customer Phone Confirmed, Equipment to Bring, Special Access Required (gate code, key location), Customer Pet (warning), Site-Specific PPE Required, Parking Notes, Building Restrictions, Multi-Day Project Day Number.

## 12.9 Status surfaces

4 lookup tables (see §12.4).

## 12.10 Cross-module relationships

### Reads (extensive — Module 12 is heaviest reader)

- **Clients (M1):** site, response_times, on_stop status (blocks new appointments)
- **Sites (M1):** location, access info, equipment installed
- **SLAs (M1):** per-site response time → SLA enforcement
- **Employees (M2):** availability, certifications, territories, absences, hourly_rate
- **Settings (M3):** workflow rules, notification rules, appointment types, priorities, schedule templates
- **Projects (M6):** project phases + tasks (work to schedule), project_pm + assigned techs
- **Contractors (M10):** contractor work orders for sub-contractor scheduling

### Writes

- **Communication log (M1):** auto-notify customer on schedule changes + reminders
- **Timesheets (M6):** mobile clock-in/out creates time entries on project_phase + cost_center
- **Audit on every schedule change**

### Events emitted

`appointment.created`, `appointment.scheduled`, `appointment.rescheduled`, `appointment.assigned`, `appointment.customer_notified`, `appointment.tech_notified`, `appointment.confirmed_by_customer`, `appointment.en_route`, `appointment.on_site`, `appointment.in_progress`, `appointment.completed`, `appointment.cancelled`, `appointment.no_show`, `dispatch.created`, `dispatch.acknowledged`, `dispatch.on_site`, `dispatch.resolved`, `sla_breach.approaching`, `sla_breach.imminent`, `sla_breach.breached`, `sla_breach.acknowledged`, `sla_breach.waived`, `recurring_series.next_generated`, `schedule_change.logged`.

## 12.11 Competitive floor delta

Combines best of:
- **ServiceTitan dispatch:** drag-drop, capacity heatmap, mobile route, real-time location, customer notifications
- **simPRO scheduling:** multi-resource, drag-drop, recurring, contractor scheduling
- **FieldWire:** project-specific scheduling, plan-attachment to appointments
- **Salesforce Field Service:** advanced AI routing + skill-based dispatch

**Nexvelon-unique:**
- **Skill + cert + territory + availability + SLA-aware auto-suggest engine** — combines all five dimensions in ranking
- **Certification expiry auto-block on scheduling** — extends §0.4 #12 regulatory expiry to scheduling layer
- **SLA response time auto-enforcement** — per-site response time from M1; alerts at 75%/90%/breached
- **Per-site response time precedence** — site SLA > site response > client response > tier default
- **Cross-resource scheduling** — employees + contractors + vehicles + equipment in one calendar
- **Mobile clock-in geolocation linked to project + phase + cost-centre** — drives M6 timesheets with proper cost allocation
- **Emergency dispatch override workflow** with reason capture + audit
- **Multi-day project phase scheduling** with phase-level Gantt
- **Schedule change auto-notifies customer + tech** with operator-configurable templates
- **Append-only schedule change log**
- **Travel time estimates** between consecutive site appointments (Google Distance Matrix)
- **External calendar one-way export at v1** (Google/Outlook); bidirectional sync Phase 2
- **Geolocation privacy retention** (30-day default per §0.4 #13)

## 12.12 Permissions design implications (items 68-72)

68. **Certification expiry blocks scheduling** — extends §0.4 #12 regulatory expiry pattern to scheduling. Worker with expired cert can't be assigned to appointment requiring that cert. Manual override (A) requires reason.
69. **SLA response time auto-enforcement** — appointments must satisfy per-site SLA. Creating outside SLA window triggers warning. SLA waiver requires Admin + reason.
70. **Mobile clock-in geolocation captured** — privacy implications. Geolocation visible only to A and owner. Retained 30 days default per §0.4 #13 (operator-configurable).
71. **Schedule view scoping per role** — Tech sees own; PM sees own team + own projects; Dispatcher sees all; SR sees own clients only; A sees all.
72. **Customer-facing appointment notifications** gated by client communication preferences (from M1); operator-configurable opt-in/out per channel (email/SMS/none).

## 12.13 Open questions — RESOLVED IN SESSION N

1. ✅ **Route optimization at v1 or Phase 2:** Phase 2 (v1 manual ordering with travel time display).
2. ✅ **AI scheduling recommendations:** Phase 2 (simple weighted scoring at v1).
3. ✅ **Customer self-service scheduling portal:** Phase 2.
4. ✅ **Mobile geolocation tracking continuously or only on clock events:** Only on clock events at v1; continuous Phase 2 with explicit opt-in.
5. ✅ **Schedule conflict resolution UI:** YES at v1.
6. ✅ **Multi-timezone scheduling:** YES at v1 (UTC stored, user TZ displayed).
7. ✅ **Recurring appointment series with exceptions:** YES at v1.
8. ✅ **External calendar sync (Google/Outlook):** one-way export at v1; bidirectional Phase 2.
9. ✅ **Travel time calculation:** YES at v1 via Google Distance Matrix API.
10. ✅ **Geolocation retention:** 30 days default operator-configurable; locked as §0.4 #13.

Remaining:
11. **In-app messaging between dispatcher and tech:** SMS via Twilio at v1; in-app chat Phase 2.
12. **Customer photo upload from appointment confirmation:** Phase 2.
13. **Multi-day appointment block with overnight stays:** YES at v1.

## 12.14 Acceptance criteria (~50 scenarios)

### Functional — Appointment lifecycle (1-10)

1. Create appointment from project phase; auto-suggests resources.
2. Drag-drop reschedule; change_log audit row written.
3. Conflict detection: double-booking → red.
4. Certification expiry: worker with expired ULC can't be assigned to fire alarm install.
5. Customer On Stop (M1) → new appointment blocked.
6. Emergency dispatch overrides normal scheduling with reason captured.
7. Recurring series creates 12 monthly appointments; exception dates skipped.
8. Customer cancellation → status updated; M9 invoice flag for fee.
9. No-show recording → status + PM notification.
10. Mobile completion → M6 timesheet entry created with phase + cost-centre.

### Functional — Auto-suggest engine (11-14)

11. Skill match.
12. Territory match.
13. Availability match.
14. Performance grade weighted in ranking.

### Functional — SLA enforcement (15-19)

15. Emergency client (4hr SLA) → appointment scheduled 5hr out → warning.
16. SLA approaching alert at 75%.
17. SLA imminent alert at 90%.
18. SLA breach notification with escalation.
19. SLA waiver (Admin only) with reason.

### Functional — Dispatch (20-23)

20. Emergency dispatch; nearest tech ranked.
21. Override scheduled appointment with reason + audit.
22. Tech acknowledges → on-site → resolved → SLA recorded.
23. Dispatch metrics: avg ack, avg on-site, breach rate.

### Functional — Mobile (24-29)

24. Tech opens mobile schedule → today's appointments.
25. Tap to navigate → Google Maps.
26. Clock-in records geolocation + timestamp.
27. Clock-out records + creates M6 timesheet entry.
28. Mark complete with photos + customer signature.
29. Customer email confirmation sent.

### Functional — Resource calendar (30-34)

30. Employee calendar shows schedule + absences + cert warnings.
31. Contractor work order on contractor calendar.
32. Vehicle/equipment scheduling.
33. Capacity heatmap identifies overbooked days.
34. Block time off creates M2 absence.

### Functional — Recurring & templates (35-37)

35. Recurring with end date generates correct count.
36. Schedule template applied.
37. Template versioning (existing appointments retain original snapshot).

### Functional — External calendar (38-39)

38. Export to Google Calendar via iCS.
39. Outlook export.

### Functional — Permissions (40-44)

40. Tech sees own schedule only.
41. PM sees own team + projects.
42. Dispatcher sees full calendar.
43. SR sees only own client appointments.
44. Geolocation visible to A + owner only.

### Functional — Performance & security (45-50)

45. Calendar with 500 appointments + 50 resources loads <3s.
46. Drag-drop reschedule <500ms.
47. Auto-suggest with 100 candidates <1s.
48. RLS blocks unauthorized calendar view.
49. Geolocation purged after 30 days.
50. Mobile clock-in idempotent.

---

═══════════════════════════════════════════════════════════════════
# Module 13: pending walk
═══════════════════════════════════════════════════════════════════

- §13 — Reports

---

═══════════════════════════════════════════════════════════════════
# Consolidated outputs
═══════════════════════════════════════════════════════════════════

## 99. Consolidated action vocabulary

*Running count: ~1205 actions across 12 modules (~110 M1 + ~80 M2 + ~270 M3 + ~35 M4 + ~85 M5 + ~110 M6 + ~95 M7 + ~65 M8 + ~115 M9 + ~75 M10 + ~90 M11 + ~75 M12).*

## 100. Final sidebar tree

*Refined Session K — see §0.7.*

## 101. Module dependency graph

*Populated after M13 walked.*

## 102. Cumulative permissions design implications

*72 items so far (1-14 M1, 15-22 M2, 23-27 M3, 28-30 M4, 31-37 M5, 38-44 M6, 45-49 M7, 50-53 M8, 54-58 M9, 59-62 M10, 63-67 M11, 68-72 M12).*

## 103. Cumulative acceptance criteria

*~559 scenarios so far (54 M1 + 55 M2 + 42 M3 + 25 M4 + ~52 M5 + ~58 M6 + ~48 M7 + ~35 M8 + ~55 M9 + ~38 M10 + ~45 M11 + ~50 M12).*

---

**End of v0.13.** Modules 1-12 complete. Scheduling module scoped as the heaviest cross-module reader (M1+M2+M3+M6+M10) with skill+cert+territory+availability+SLA-aware auto-suggest engine, certification expiry auto-block extending §0.4 #12 to scheduling, SLA response time auto-enforcement with 75%/90%/breach alerts, per-site response time precedence, cross-resource scheduling (employees + contractors + vehicles + equipment), mobile clock-in geolocation linked to project + phase + cost-centre driving M6 timesheets, emergency dispatch override workflow with reason capture, append-only schedule change log, travel time estimates via Google Distance Matrix API, external calendar one-way export (Google/Outlook) at v1. New cross-cutting commitment §0.4 #13 locked: geolocation privacy retention (30-day default operator-configurable). Cross-cutting commitments from Sessions C-N propagate forward.

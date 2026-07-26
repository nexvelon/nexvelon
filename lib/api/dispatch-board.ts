import "server-only";

// SCHED-1 — the dispatch-board read assembly. ONE query set that returns
// everything the (SCHED-2) calendar/swimlane board renders: tech rows, the
// bookings inside a window, and the unscheduled backlog. Shaped to match the
// mock board's field expectations so SCHED-2's wiring is minimal.
//
// Read-only: assembles plan data. It never touches labour_entries / cost.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { expiryState } from "@/lib/expiry-state";
import { CERT_WARN_DAYS } from "@/lib/scheduling/tech-eligibility";
import type {
  DbScheduleJobPriority,
  DbScheduleJobType,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export interface DispatchTechRow {
  id: string;
  name: string;
  is_active: boolean;
  cert_summary: { valid_types: string[]; expiring_count: number; expired_count: number };
}

export interface DispatchBookingRow {
  id: string;
  schedule_job_id: string;
  tech_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  site_label: string | null;
  priority: DbScheduleJobPriority;
  job_type: DbScheduleJobType;
}

export interface DispatchUnscheduledRow {
  schedule_job_id: string;
  title: string;
  priority: DbScheduleJobPriority;
  job_type: DbScheduleJobType;
  required_certs: string[];
  site_label: string | null;
  estimated_hours: number | null;
  window_start: string | null;
  window_end: string | null;
}

export interface DispatchBoard {
  techs: DispatchTechRow[];
  bookings: DispatchBookingRow[];
  unscheduled: DispatchUnscheduledRow[];
  range: { from: string; to: string };
}

export async function getDispatchBoard(window: {
  from: string;
  to: string;
}): Promise<DispatchBoard> {
  const supabase = await db();
  const today = businessDateISO();

  // Techs (the rows) + their certs.
  const { data: techData, error: tErr } = await supabase
    .from("techs")
    .select("id, name, is_active")
    .order("name", { ascending: true });
  if (tErr) throw new Error(`getDispatchBoard/techs: ${tErr.message}`);
  const techs = (techData ?? []) as { id: string; name: string; is_active: boolean }[];
  const techIds = techs.map((t) => t.id);

  const certsByTech: Record<string, { cert_type: string; expiry_date: string | null }[]> = {};
  if (techIds.length > 0) {
    const { data: certData, error: cErr } = await supabase
      .from("tech_certifications")
      .select("tech_id, cert_type, expiry_date")
      .in("tech_id", techIds);
    if (cErr) throw new Error(`getDispatchBoard/certs: ${cErr.message}`);
    for (const c of (certData ?? []) as { tech_id: string; cert_type: string; expiry_date: string | null }[]) {
      (certsByTech[c.tech_id] ??= []).push({ cert_type: c.cert_type, expiry_date: c.expiry_date });
    }
  }

  // Bookings inside the window (active only).
  const { data: bookData, error: bErr } = await supabase
    .from("schedule_assignments")
    .select("id, schedule_job_id, tech_id, starts_at, ends_at, status")
    .neq("status", "cancelled")
    .lt("starts_at", window.to)
    .gt("ends_at", window.from)
    .order("starts_at", { ascending: true });
  if (bErr) throw new Error(`getDispatchBoard/bookings: ${bErr.message}`);
  const bookings = (bookData ?? []) as {
    id: string; schedule_job_id: string; tech_id: string;
    starts_at: string; ends_at: string; status: string;
  }[];

  // The schedule_jobs referenced by those bookings + the unscheduled backlog.
  const bookedJobIds = [...new Set(bookings.map((b) => b.schedule_job_id))];
  const jobById: Record<string, {
    id: string; title: string; priority: DbScheduleJobPriority; job_type: DbScheduleJobType; site_id: string | null;
  }> = {};
  if (bookedJobIds.length > 0) {
    const { data, error } = await supabase
      .from("schedule_jobs")
      .select("id, title, priority, job_type, site_id")
      .in("id", bookedJobIds);
    if (error) throw new Error(`getDispatchBoard/bookedJobs: ${error.message}`);
    for (const j of (data ?? []) as typeof jobById[string][]) jobById[j.id] = j;
  }

  const { data: unschedData, error: uErr } = await supabase
    .from("schedule_jobs")
    .select("id, title, priority, job_type, required_certs, site_id, location_text, estimated_hours, window_start, window_end")
    .eq("status", "unscheduled")
    .order("created_at", { ascending: false });
  if (uErr) throw new Error(`getDispatchBoard/unscheduled: ${uErr.message}`);
  const unschedJobs = (unschedData ?? []) as {
    id: string; title: string; priority: DbScheduleJobPriority; job_type: DbScheduleJobType;
    required_certs: string[]; site_id: string | null; location_text: string | null;
    estimated_hours: number | null; window_start: string | null; window_end: string | null;
  }[];

  // Site labels for every site referenced.
  const siteIds = [
    ...new Set([
      ...Object.values(jobById).map((j) => j.site_id),
      ...unschedJobs.map((j) => j.site_id),
    ].filter((s): s is string => !!s)),
  ];
  const siteName: Record<string, string> = {};
  if (siteIds.length > 0) {
    const { data } = await supabase.from("sites").select("id, name").in("id", siteIds);
    for (const s of (data ?? []) as { id: string; name: string }[]) siteName[s.id] = s.name;
  }
  const labelFor = (siteId: string | null, locationText: string | null): string | null =>
    (siteId && siteName[siteId]) || locationText || null;

  return {
    techs: techs.map((t) => {
      const certs = certsByTech[t.id] ?? [];
      const valid_types: string[] = [];
      let expiring = 0;
      let expired = 0;
      for (const c of certs) {
        const state = expiryState(c.expiry_date, today, CERT_WARN_DAYS);
        if (state === "expired") expired += 1;
        else {
          if (!valid_types.includes(c.cert_type)) valid_types.push(c.cert_type);
          if (state === "expiring_soon") expiring += 1;
        }
      }
      return {
        id: t.id,
        name: t.name,
        is_active: t.is_active,
        cert_summary: { valid_types, expiring_count: expiring, expired_count: expired },
      };
    }),
    bookings: bookings.map((b) => {
      const j = jobById[b.schedule_job_id];
      return {
        id: b.id,
        schedule_job_id: b.schedule_job_id,
        tech_id: b.tech_id,
        title: j?.title ?? "—",
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        status: b.status,
        site_label: j ? labelFor(j.site_id, null) : null,
        priority: j?.priority ?? "normal",
        job_type: j?.job_type ?? "service",
      };
    }),
    unscheduled: unschedJobs.map((j) => ({
      schedule_job_id: j.id,
      title: j.title,
      priority: j.priority,
      job_type: j.job_type,
      required_certs: j.required_certs,
      site_label: labelFor(j.site_id, j.location_text),
      estimated_hours: j.estimated_hours,
      window_start: j.window_start,
      window_end: j.window_end,
    })),
    range: window,
  };
}

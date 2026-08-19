import "server-only";

// UIDG-14 — the resource-lane read layer. Assembles the PROJECT-SCOPED (2e) inputs
// for the pure computeResourceLoad: assigned+dated tasks (planned), this project's
// dispatch bookings (booked), and the techs' working-hours patterns + approved
// absences (capacity). Bounded query count (≈6), independent of task/booking
// volume. day_of_week is 0=Sunday, matching the app's Date.getDay() convention.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeResourceLoad,
  type RlInput,
  type RlPerson,
  type RlTask,
  type RlBooking,
  type RlWorkingHours,
  type RlAbsence,
  type ResourceLoad,
} from "@/lib/gantt/resource-load";

async function db() {
  return createSupabaseServerClient();
}

/** "HH:MM[:SS]" → minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface TaskRow {
  id: string;
  title: string;
  assignee_tech_id: string | null;
  assignee_subcontractor_id: string | null;
  start_date: string | null;
  end_date: string | null;
  due_date: string | null;
}
interface BookingRow {
  tech_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  schedule_jobs: { title: string | null; reference: string | null } | null;
}

/**
 * The whole project's resource load over [from, to]. computeResourceLoad is pure;
 * this only fetches + shapes. Gated by the caller (scheduling:view).
 */
export async function getProjectResourceLoad(
  projectId: string,
  from: string,
  to: string
): Promise<ResourceLoad> {
  const supabase = await db();

  // 1. Assigned + dated tasks (planned load). A task needs an assignee and a start
  //    to be placeable; an assigned-but-undated task can't be positioned (skipped).
  const { data: taskData, error: taskErr } = await supabase
    .from("job_tasks")
    .select("id, title, assignee_tech_id, assignee_subcontractor_id, start_date, end_date, due_date")
    .eq("project_id", projectId)
    .or("assignee_tech_id.not.is.null,assignee_subcontractor_id.not.is.null");
  if (taskErr) throw new Error(`getProjectResourceLoad/tasks: ${taskErr.message}`);
  const taskRows = (taskData ?? []) as TaskRow[];

  // 2. This project's dispatch bookings (booked load).
  const { data: bookingData, error: bookingErr } = await supabase
    .from("schedule_assignments")
    .select("tech_id, starts_at, ends_at, status, schedule_jobs!inner(title, reference, project_id)")
    .eq("schedule_jobs.project_id", projectId)
    .neq("status", "cancelled");
  if (bookingErr) throw new Error(`getProjectResourceLoad/bookings: ${bookingErr.message}`);
  const bookingRows = (bookingData ?? []) as unknown as BookingRow[];

  // Referenced people.
  const techIds = new Set<string>();
  const subIds = new Set<string>();
  const tasks: RlTask[] = [];
  for (const t of taskRows) {
    const start = t.start_date;
    if (!start) continue; // undated → can't place
    const end = t.end_date ?? t.due_date ?? start;
    const personId = t.assignee_tech_id ?? t.assignee_subcontractor_id;
    if (!personId) continue;
    if (t.assignee_tech_id) techIds.add(t.assignee_tech_id);
    else subIds.add(t.assignee_subcontractor_id!);
    tasks.push({ id: t.id, title: t.title, personId, start, end });
  }
  const bookings: RlBooking[] = [];
  for (const b of bookingRows) {
    techIds.add(b.tech_id);
    bookings.push({
      techId: b.tech_id,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      label: b.schedule_jobs?.reference ?? b.schedule_jobs?.title ?? "Booking",
    });
  }

  const techIdList = [...techIds];
  const subIdList = [...subIds];

  // 3–6. Names, working hours, approved absences (all bounded by referenced ids).
  const [techRes, subRes, whRes, absRes] = await Promise.all([
    techIdList.length
      ? supabase.from("techs").select("id, name").in("id", techIdList)
      : Promise.resolve({ data: [], error: null }),
    subIdList.length
      ? supabase.from("subcontractors").select("id, name").in("id", subIdList)
      : Promise.resolve({ data: [], error: null }),
    techIdList.length
      ? supabase.from("tech_working_hours").select("tech_id, day_of_week, start_time, end_time").in("tech_id", techIdList)
      : Promise.resolve({ data: [], error: null }),
    techIdList.length
      ? supabase.from("tech_absences").select("tech_id, starts_at, ends_at").in("tech_id", techIdList).eq("status", "approved")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (techRes.error) throw new Error(`getProjectResourceLoad/techs: ${techRes.error.message}`);
  if (subRes.error) throw new Error(`getProjectResourceLoad/subs: ${subRes.error.message}`);
  if (whRes.error) throw new Error(`getProjectResourceLoad/workingHours: ${whRes.error.message}`);
  if (absRes.error) throw new Error(`getProjectResourceLoad/absences: ${absRes.error.message}`);

  const people: RlPerson[] = [
    ...((techRes.data ?? []) as { id: string; name: string }[]).map((t) => ({ id: t.id, name: t.name, kind: "tech" as const })),
    ...((subRes.data ?? []) as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name, kind: "subcontractor" as const })),
  ];
  const workingHours: RlWorkingHours[] = ((whRes.data ?? []) as { tech_id: string; day_of_week: number; start_time: string; end_time: string }[]).map((w) => ({
    techId: w.tech_id,
    dayOfWeek: w.day_of_week,
    startMinute: timeToMinutes(w.start_time),
    endMinute: timeToMinutes(w.end_time),
  }));
  const absences: RlAbsence[] = ((absRes.data ?? []) as { tech_id: string; starts_at: string; ends_at: string }[]).map((a) => ({
    techId: a.tech_id,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
  }));

  const input: RlInput = { people, tasks, bookings, workingHours, absences };
  return computeResourceLoad(input, from, to);
}

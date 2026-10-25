import "server-only";

// REP-5 — resolve users into permission Principals for an UNATTENDED run (2e).
// Same precedence as the request resolver (role matrix default + grants − denies;
// lib/permissions/resolve.ts mergeEffective), but read through the client the
// runner passes (service-role — there is no session) and FAIL-CLOSED:
//
//   • role matrix can't load      → the static matrix (identical by the PERM-1
//     parity gate — never more permissive);
//   • a user's overrides can't load → THROW. The interactive resolver falls back
//     to role defaults on that error, which would silently restore access a DENY
//     override had removed. An unattended email must not do that, so the run
//     aborts and is recorded as failed instead.

import { adaptDbRole } from "@/lib/permissions/resolve";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbRole } from "@/lib/types/database";
import type { Principal } from "@/lib/reports/access";

export async function loadPrincipals(client: SupabaseClient, userIds: string[]): Promise<Map<string, Principal>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, Principal>();
  if (ids.length === 0) return out;

  const { data: profs, error: pErr } = await client
    .from("profiles")
    .select("id, email, first_name, last_name, display_name, role, status")
    .in("id", ids);
  if (pErr) throw new Error(`loadPrincipals/profiles: ${pErr.message}`);

  let matrix: Map<string, Set<string>>;
  const { data: mRows, error: mErr } = await client.from("role_permission_matrix").select("role, resource, action");
  if (mErr || !mRows) {
    console.warn("[reports/principals] role matrix load failed — using the static matrix.", mErr?.message);
    matrix = buildGrantedMatrix();
  } else {
    matrix = new Map();
    for (const r of mRows as { role: string; resource: string; action: string }[]) {
      const set = matrix.get(r.role) ?? new Set<string>();
      set.add(`${r.resource}:${r.action}`);
      matrix.set(r.role, set);
    }
  }

  const { data: oRows, error: oErr } = await client
    .from("user_permission_overrides")
    .select("user_id, resource, action, state")
    .in("user_id", ids)
    .is("revoked_at", null);
  if (oErr) {
    throw new Error(`Couldn't load permission overrides (${oErr.message}) — not sending, so a revoked permission can't be bypassed.`);
  }
  const granted = new Map<string, Set<string>>();
  const denied = new Map<string, Set<string>>();
  for (const o of (oRows ?? []) as { user_id: string; resource: string; action: string; state: string }[]) {
    const bucket = o.state === "denied" ? denied : o.state === "granted" ? granted : null;
    if (!bucket) continue;
    const set = bucket.get(o.user_id) ?? new Set<string>();
    set.add(`${o.resource}:${o.action}`);
    bucket.set(o.user_id, set);
  }

  for (const p of (profs ?? []) as {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    role: DbRole;
    status: string;
  }[]) {
    const role = adaptDbRole(p.role);
    const eff = new Set<string>(matrix.get(role) ?? []);
    for (const k of granted.get(p.id) ?? []) eff.add(k);
    for (const k of denied.get(p.id) ?? []) eff.delete(k); // deny applied LAST
    out.set(p.id, {
      id: p.id,
      name: p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "User",
      email: p.email,
      status: p.status,
      role,
      effective: eff,
    });
  }
  return out;
}

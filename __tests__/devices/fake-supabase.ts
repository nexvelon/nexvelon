// DEVREG-1 — a tiny in-memory stand-in for the supabase-js query builder, covering
// only the chains lib/api/devices.ts uses (select / insert / update with eq, is,
// in, order, limit, maybeSingle, single). Joins in the select string are ignored.

type Row = Record<string, unknown>;

export function makeFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  let seq = 0;
  const uniqueCheck = (table: string, row: Row, selfId?: unknown) => {
    if (table !== "devices" || row.deleted_at || !row.label) return null;
    const k = (r: Row) => `${r.site_id}|${r.building_key ?? ""}|${String(r.label).toLowerCase()}`;
    const clash = (tables.devices ?? []).find((r) => r.id !== selfId && !r.deleted_at && r.label && k(r) === k(row));
    return clash ? { message: 'duplicate key value violates unique constraint "devices_site_building_label_uniq"' } : null;
  };

  function builder(table: string) {
    let mode: "select" | "insert" | "update" = "select";
    let payload: Row | null = null;
    const filters: ((r: Row) => boolean)[] = [];
    const api = {
      select() {
        return api;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
        return api;
      },
      update(p: Row) {
        mode = "update";
        payload = p;
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      is(col: string, val: unknown) {
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      or() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      run(): { data: Row[] | null; error: { message: string } | null } {
        const rows = (tables[table] ??= []);
        if (mode === "insert") {
          const row: Row = { id: `${table}-${++seq}`, deleted_at: null, created_at: "2026-11-19T00:00:00Z", updated_at: "2026-11-19T00:00:00Z", ...payload };
          const err = uniqueCheck(table, row);
          if (err) return { data: null, error: err };
          rows.push(row);
          return { data: [row], error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "update") {
          for (const r of hit) {
            const next = { ...r, ...payload };
            const err = uniqueCheck(table, next, r.id);
            if (err) return { data: null, error: err };
            Object.assign(r, payload);
          }
          return { data: hit, error: null };
        }
        return { data: hit.map((r) => ({ ...r })), error: null };
      },
      async maybeSingle() {
        const { data, error } = api.run();
        return { data: data?.[0] ?? null, error };
      },
      async single() {
        const { data, error } = api.run();
        if (error) return { data: null, error };
        if (!data?.length) return { data: null, error: { message: "no rows" } };
        return { data: data[0], error: null };
      },
      then(res: (v: { data: Row[] | null; error: { message: string } | null }) => unknown, rej?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(api.run()).then(res, rej);
        } catch (e) {
          return rej ? Promise.resolve(rej(e)) : Promise.reject(e);
        }
      },
    };
    return api;
  }

  return {
    tables,
    client: {
      from: (t: string) => builder(t),
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    },
  };
}

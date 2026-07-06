// Shared chainable Supabase mock for project-API unit tests. Not a test file
// (no *.test.* suffix) — imported by the jobs tests. A `resolve(ctx)` callback
// returns { data, error } for each terminal call, routed by (table, op,
// terminal); insert/update payloads are exposed on ctx for capture.

import { vi } from "vitest";

export type ChainCtx = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  terminal: "await" | "single" | "maybeSingle";
  payload?: unknown;
};

export function makeSupabaseMock(
  resolve: (ctx: ChainCtx) => { data: unknown; error: unknown; count?: number },
  opts?: { user?: { id: string } | null }
) {
  const user = opts?.user === undefined ? { id: "u1" } : opts.user;
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from(table: string) {
      const ctx: ChainCtx = { table, op: "select", terminal: "await" };
      const target: Record<string, unknown> = {
        insert: (p: unknown) => {
          ctx.op = "insert";
          ctx.payload = p;
          return proxy;
        },
        update: (p: unknown) => {
          ctx.op = "update";
          ctx.payload = p;
          return proxy;
        },
        delete: () => {
          ctx.op = "delete";
          return proxy;
        },
        single: () => {
          ctx.terminal = "single";
          return Promise.resolve(resolve(ctx));
        },
        maybeSingle: () => {
          ctx.terminal = "maybeSingle";
          return Promise.resolve(resolve(ctx));
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(resolve(ctx)).then(res, rej),
      };
      const proxy: Record<string, unknown> = new Proxy(target, {
        get(t, prop: string) {
          if (prop in t) return t[prop];
          return () => proxy; // any filter method (eq/in/order/limit/is/like…)
        },
      });
      return proxy;
    },
  };
}

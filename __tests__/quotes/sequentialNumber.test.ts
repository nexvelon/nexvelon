// 0089 — mintQuoteNumber() is the JS boundary over the sequential-number RPC.
// The increment ALGORITHM itself (Q-10000 on empty, max+1, ignore legacy
// timestamp numbers) lives in plpgsql and is verified end-to-end by
// smoke_0089_sequential_quote_number.sql. Here we cover the wrapper: it invokes
// the right RPC, returns its value, and surfaces errors instead of swallowing.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpcResult: { data: "Q-10001" as unknown, error: null as { message: string } | null },
  rpcCalls: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) => {
      h.rpcCalls.push(name);
      return h.rpcResult;
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import { mintQuoteNumber } from "@/lib/api/quotes";

beforeEach(() => {
  h.rpcResult = { data: "Q-10001", error: null };
  h.rpcCalls = [];
});

describe("mintQuoteNumber", () => {
  it("calls the next_sequential_quote_number RPC and returns its value", async () => {
    h.rpcResult = { data: "Q-10000", error: null };
    const n = await mintQuoteNumber();
    expect(h.rpcCalls).toContain("next_sequential_quote_number");
    expect(n).toBe("Q-10000");
  });

  it("coerces the RPC result to a string", async () => {
    h.rpcResult = { data: "Q-10042", error: null };
    expect(await mintQuoteNumber()).toBe("Q-10042");
  });

  it("throws on an RPC error rather than returning a bad number", async () => {
    h.rpcResult = { data: null, error: { message: "rpc boom" } };
    await expect(mintQuoteNumber()).rejects.toThrow(/rpc boom/);
  });
});

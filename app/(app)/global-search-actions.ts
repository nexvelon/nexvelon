"use server";

import { getClients } from "@/lib/api/clients";
import type { DbClientWithCounts } from "@/lib/types/database";

export type SearchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function searchClientsAction(
  query: string
): Promise<SearchResult<DbClientWithCounts[]>> {
  try {
    const trimmed = query.trim();
    if (!trimmed) return { ok: true, data: [] };
    const clients = await getClients({ search: trimmed });
    // Cap to 8 results for the dropdown
    return { ok: true, data: clients.slice(0, 8) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

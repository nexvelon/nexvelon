import type { Site } from "../types";

// Pre-Quotes cleanup (2026-05-11): mock data emptied. The Site type is
// preserved, and `sitesForClient(clientId)` still works (returns []) so
// consumers don't need defensive guards.
export const sites: Site[] = [];

export function sitesForClient(clientId: string): Site[] {
  return sites.filter((s) => s.clientId === clientId);
}

// Chunk 3c — client-safe grant catalog. Grants are an ALLOW-only per-user
// overlay on the role system (lib/permissions.ts): a grant unlocks an extra
// capability for a specific user, never removes one. This file is imported by
// BOTH the server API and client components, so it must stay free of
// server-only code.

export const GRANT_EDIT_DISCOUNT = "quotes.edit_discount";

export interface GrantDefinition {
  key: string;
  label: string;
}

export const GRANT_CATALOG: readonly GrantDefinition[] = [
  { key: GRANT_EDIT_DISCOUNT, label: "Can edit discounts" },
] as const;

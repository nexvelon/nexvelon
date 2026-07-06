// BUGFIX (quotes) — shared DB→builder adapters for the client/site pickers.
// Extracted from app/(app)/quotes/new/page.tsx so BOTH the "new" route AND the
// edit route (/quotes/[id]) feed the QuoteBuilder pickers from the same real
// data. The edit page previously passed NO picker overrides, so the builder
// fell back to empty mock arrays — that is why the client/site dropdowns were
// dead and the Bill-To / Service-Site boxes went blank on open. Translation
// only; no inference or fabrication.

import type {
  DbClient,
  DbClientStatus,
  DbClientType,
  DbSite,
} from "@/lib/types/database";
import type { Client, ClientStatus, ClientType, Site } from "@/lib/types";

export function adaptClientType(t: DbClientType | null): ClientType {
  // DB enum has 7 values; mock enum has 3. Anything outside the mock set folds
  // to "Commercial" for cosmetic display only — type gates nothing in the
  // builder.
  if (t === "Industrial" || t === "Residential") return t;
  return "Commercial";
}

export function adaptClientStatus(s: DbClientStatus): ClientStatus {
  // DB: Active | Inactive | Prospect | Lost. Mock: Active | Prospect | Dormant.
  if (s === "Prospect") return "Prospect";
  if (s === "Active") return "Active";
  return "Dormant";
}

export function adaptClient(c: DbClient): Client {
  return {
    id: c.id,
    name: c.name,
    type: adaptClientType(c.type),
    status: adaptClientStatus(c.status),
    contactName: "", // contacts live on public.contacts; not pulled at v1
    email: "",
    phone: "",
    address: "", // client-level address not stored — site address is the
    city: "", //    operational address; Bill-To line stays blank.
    state: "",
    createdAt: c.created_at,
    totalRevenue: Number(c.ytd_revenue ?? 0),
  };
}

export function adaptSite(s: DbSite): Site {
  const line = [s.address_line1, s.address_line2]
    .filter((v) => v && v.trim().length > 0)
    .join(", ");
  return {
    id: s.id,
    clientId: s.client_id,
    name: s.name,
    address: line,
    city: s.city ?? "",
    state: s.province ?? "",
  };
}

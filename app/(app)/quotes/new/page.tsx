// Server component — fetches real DB clients/sites and the current user's
// profile, then hands off to the interactive NewQuotePageClient. Path-1
// patch (feature/quotes-path1-real-data-real-letterhead): pre-Path-1, this
// route imported mock-data clients directly. The QuoteBuilder + QuoteDocument
// components stay on the mock-data type contract; we adapt DB rows at this
// server boundary so the swap is surgical.
//
// localStorage save in lib/quote-store.ts is untouched — Path 1 only fixes
// the input data + letterhead, not durable storage. Real `quotes` table
// ships with Quotes v1 (NEXVELON_ROADMAP.md item 4).

import Link from "next/link";
import { redirect } from "next/navigation";

import { getClients, getSitesByClient } from "@/lib/api/clients";
import { listClassifications } from "@/lib/api/classifications";
import { classificationFromDb } from "@/lib/classifications";
import { mintQuoteNumber } from "@/lib/api/quotes";
import { getCurrentProfile } from "@/lib/auth/profile";
import {
  DEFAULT_TERMS_KEY,
  DEFAULT_TERMS_GUARDIAN_KEY,
  getSetting,
} from "@/lib/api/company-settings";
import { DEFAULT_TERMS, DEFAULT_TERMS_GUARDIAN } from "@/lib/quote-helpers";
import type { QuoteTemplateSlug } from "@/lib/company-profile";
import { hasPermission } from "@/lib/permissions";
import {
  adaptClient,
  adaptSite,
} from "@/lib/quotes/picker-adapters";
import type { DbProfile, DbRole, DbSite } from "@/lib/types/database";
import type { Client, Role, Site, User } from "@/lib/types";

import { NewQuotePageClient } from "./NewQuotePageClient";

export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// Client/site adapters now live in lib/quotes/picker-adapters.ts (shared with
// the edit route). The owner/role adapters below stay local — they're only used
// when creating a new quote.
// ----------------------------------------------------------------------------

// DbRole has 11 values; the mock Role enum has 7. Map values that don't
// exist in the mock enum to their closest equivalent so the existing
// permission matrix and UI gates still resolve.
function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

function adaptProfileAsOwner(p: DbProfile): User {
  const displayName =
    p.display_name?.trim() ||
    `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
    p.email;
  return {
    id: p.id,
    name: displayName,
    email: p.email,
    role: adaptRole(p.role),
    phone: p.phone ?? "",
    hiredAt: p.created_at,
    avatarColor: "#0B1B3B",
    active: p.status === "Active" || p.status === "Invited",
  };
}

// ----------------------------------------------------------------------------

export default async function NewQuotePage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/quotes/new");
  }

  // Static permission matrix check; the DB-backed engine landed in Chunk 1/2
  // is dormant under feature flags and not consulted here.
  const role = adaptRole(profile.role);
  if (!hasPermission(role, "quotes", "create")) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">Not authorized</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Your current role does not have permission to create quotes.
        </p>
        <Link
          href="/quotes"
          className="text-brand-gold mt-4 inline-block text-sm hover:underline"
        >
          ← Back to Quotes
        </Link>
      </div>
    );
  }

  const clients = await getClients();
  const sitesByClient: Record<string, DbSite[]> = {};
  if (clients.length > 0) {
    const results = await Promise.all(
      clients.map(async (c) => ({ id: c.id, sites: await getSitesByClient(c.id) }))
    );
    for (const { id, sites } of results) sitesByClient[id] = sites;
  }

  const adaptedClients: Client[] = clients.map(adaptClient);
  const adaptedSitesByClient: Record<string, Site[]> = {};
  for (const cid in sitesByClient) {
    adaptedSitesByClient[cid] = sitesByClient[cid].map(adaptSite);
  }
  const owner = adaptProfileAsOwner(profile);

  const dbClassifications = await listClassifications();
  console.log(
    `[QB-5b] listClassifications returned ${dbClassifications.length} rows:`,
    dbClassifications.map((c) => c.name)
  );
  const classifications = dbClassifications.map(classificationFromDb);

  // Chunk 2 / G2: the admin-managed default Terms per entity (null when unset →
  // fall back to the in-code const). Best-effort — never block quote creation.
  let integratedTerms: string | null = null;
  let guardianTerms: string | null = null;
  try {
    integratedTerms = await getSetting(DEFAULT_TERMS_KEY);
  } catch {
    integratedTerms = null;
  }
  try {
    guardianTerms = await getSetting(DEFAULT_TERMS_GUARDIAN_KEY);
  } catch {
    guardianTerms = null;
  }
  const defaultTermsByTemplate: Record<QuoteTemplateSlug, string> = {
    integrated_solutions: integratedTerms ?? DEFAULT_TERMS,
    guardian: guardianTerms ?? DEFAULT_TERMS_GUARDIAN,
  };

  // 0089 — mint the next SEQUENTIAL number server-side (Q-10000, Q-10001, …).
  // Best-effort: if the RPC ever fails, the client falls back to its legacy
  // timestamp generator so quote creation is never blocked.
  let initialNumber: string | null = null;
  try {
    initialNumber = await mintQuoteNumber();
  } catch {
    initialNumber = null;
  }

  return (
    <NewQuotePageClient
      clients={adaptedClients}
      sitesByClient={adaptedSitesByClient}
      owner={owner}
      classifications={classifications}
      defaultTermsByTemplate={defaultTermsByTemplate}
      initialNumber={initialNumber}
    />
  );
}

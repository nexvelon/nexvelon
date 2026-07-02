// QUOTES-1 — server component. Mirrors the clients module (server page.tsx →
// client <View>): fetch from the real DB here, hand plain data to the
// interactive <QuotesView>. Row-action server actions revalidate("/quotes")
// and the view calls router.refresh(); force-dynamic guards against serving a
// stale static cache after a deploy.

import { QuotesView } from "./QuotesView";
import { listQuotes } from "@/lib/api/quotes";
import { getClients } from "@/lib/api/clients";
import { listVisibleProfilesAdmin } from "@/lib/api/users";
import { listProjects } from "@/lib/api/projects";
import type { DbProfile } from "@/lib/types/database";

export const dynamic = "force-dynamic";

// Sales-facing roles populate the owner filter (matches the prior mock behavior
// of showing SalesRep / ProjectManager / Admin only). DbRole strings match the
// app role names exactly, so a plain set membership test is sufficient.
const SALES_ROLES = new Set(["SalesRep", "ProjectManager", "Admin"]);

function profileName(p: DbProfile): string {
  return (
    p.display_name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    p.email
  );
}

export default async function QuotesPage() {
  const [quotes, dbClients, dbProfiles, dbProjects] = await Promise.all([
    listQuotes(),
    getClients(),
    listVisibleProfilesAdmin(),
    listProjects(),
  ]);

  const clients = dbClients.map((c) => ({ id: c.id, name: c.name, type: c.type }));
  const users = dbProfiles.map((p) => ({ id: p.id, name: profileName(p) }));
  const owners = dbProfiles
    .filter((p) => SALES_ROLES.has(p.role))
    .map((p) => ({ id: p.id, name: profileName(p) }));

  return (
    <QuotesView
      quotes={quotes}
      clients={clients}
      users={users}
      owners={owners}
      projectsCount={dbProjects.length}
    />
  );
}

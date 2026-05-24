"use client";

// SITES-2b — Full-screen site-creation view. Mirrors NewClientPageClient
// from CL-9: PageHeader + ← Back link + form constrained to max-w-4xl so
// fields don't stretch full-viewport. Submit success navigates to /sites
// (the cross-client list) since there's no /sites/[id] detail page yet —
// when one ships, swap router.push("/sites") for the detail URL.
//
// Cancel navigates back to the originating context: /clients/${id} when
// preselectedClientId is set (we came from a client detail page), or
// /sites when not (we came from the cross-client list).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteForm } from "@/app/(app)/clients/_components/SiteForm";
import type { DbClient } from "@/lib/types/database";

interface Props {
  clients: DbClient[];
  preselectedClientId: string | null;
}

export function NewSitePageClient({ clients, preselectedClientId }: Props) {
  const router = useRouter();
  return (
    <div className="space-y-5">
      <Link
        href={preselectedClientId ? `/clients/${preselectedClientId}` : "/sites"}
        className="text-muted-foreground hover:text-foreground inline-block text-sm"
      >
        ← Back to {preselectedClientId ? "client" : "Sites"}
      </Link>
      <PageHeader
        eyebrow="New site"
        title="Add a site"
        description="Create a new site under a client. Billing, tax, payment, and portal settings inherit from the parent client by default — override per section as needed."
      />
      <div className="max-w-4xl">
        <SiteForm
          mode={{
            kind: "create",
            clientId: preselectedClientId ?? undefined,
          }}
          clients={clients}
          // No /sites/[id] detail page exists yet — return to the cross-
          // client Sites list on success. When a detail page ships, swap
          // for router.push(`/sites/${siteId}`).
          onSubmitSuccess={() => router.push("/sites")}
          onCancel={() => {
            if (preselectedClientId) {
              router.push(`/clients/${preselectedClientId}`);
            } else {
              router.push("/sites");
            }
          }}
        />
      </div>
    </div>
  );
}

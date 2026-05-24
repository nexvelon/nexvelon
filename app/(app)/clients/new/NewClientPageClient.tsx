"use client";

// CL-9 — Full-screen client-creation page. Renders the shared <ClientForm>
// in a comfortable max-w-4xl container so fields don't stretch to the full
// viewport width. Submit success → router.push to /clients/${newId} so the
// operator lands on the new client's detail page. Cancel → /clients.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ClientForm } from "../_components/ClientForm";

export function NewClientPageClient() {
  const router = useRouter();
  return (
    <div className="space-y-5">
      <Link
        href="/clients"
        className="text-muted-foreground hover:text-foreground inline-block text-sm"
      >
        ← Back to Clients
      </Link>
      <PageHeader
        eyebrow="New client"
        title="Add a client"
        description="Create a new master client record. Add the primary contact below or anytime later from the client detail page."
      />
      <div className="max-w-4xl">
        <ClientForm
          mode={{ kind: "create" }}
          onSubmitSuccess={(id) => router.push(`/clients/${id}`)}
          onCancel={() => router.push("/clients")}
        />
      </div>
    </div>
  );
}

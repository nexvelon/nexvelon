import { Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";

export const metadata: Metadata = {
  title: "Clients",
};

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Clients"
        description="Commercial, industrial, and residential accounts."
      />
      <EmptyState
        icon={Users}
        title="Clients module — next iteration"
        description="The clients directory is scaffolded but not yet a primary screen. In the meantime, every client lives inside Quotes, Projects, and Financials with full searchable access."
        action={
          <Link
            href="/projects"
            className="bg-brand-navy hover:bg-brand-navy/90 inline-flex rounded-md px-4 py-2 text-xs font-medium text-white shadow-sm transition-shadow hover:shadow-md"
          >
            Browse projects by client →
          </Link>
        }
      />
    </>
  );
}

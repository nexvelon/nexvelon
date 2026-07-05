// INV-4 — RMA detail route. Fetches the RMA header + lines and hands off to the
// interactive client. 404-ish friendly message when the id doesn't resolve.

import Link from "next/link";
import { getRmaById } from "@/lib/api/rmas";
import { RmaDetailClient } from "@/components/modules/rmas/RmaDetailClient";

export const dynamic = "force-dynamic";

export default async function RmaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getRmaById(id);

  if (!detail) {
    return (
      <div className="space-y-4 p-8">
        <Link href="/rmas" className="text-brand-text text-sm underline">
          ← Back to RMAs
        </Link>
        <p className="text-muted-foreground">
          RMA not found. It may have been deleted.
        </p>
      </div>
    );
  }

  return <RmaDetailClient header={detail.header} lines={detail.lines} />;
}

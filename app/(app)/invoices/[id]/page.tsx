// INVOICE-1 — server component for a single invoice. Loads the invoice + its
// lines + client/site/project names + the project's pullable cost centers, then
// hands off to the interactive InvoiceBuilder.

import Link from "next/link";
import { getInvoiceById } from "@/lib/api/invoices";
import { InvoiceBuilder } from "@/components/modules/invoices/InvoiceBuilder";
import { ActivitySection } from "@/components/activity/ActivityTimeline";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole } from "@/lib/permissions/resolve";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getInvoiceById(id);

  // AUD-4 — the Activity tab is gated exactly as the invoice: financials view.
  const me = await getCurrentProfile();
  const canViewActivity = !!me && hasPermission(adaptDbRole(me.role), "financials", "view");

  if (!detail) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">Invoice not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          It may have been deleted or you may not have access.
        </p>
        <Link
          href="/invoices"
          className="text-brand-gold mt-4 inline-block text-sm hover:underline"
        >
          ← Back to Invoices
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <Link
        href="/invoices"
        className="text-muted-foreground hover:text-brand-charcoal text-xs"
      >
        ← Back to Invoices
      </Link>
      <InvoiceBuilder detail={detail} />
      {canViewActivity && <ActivitySection entityType="invoice" entityId={id} />}
    </div>
  );
}

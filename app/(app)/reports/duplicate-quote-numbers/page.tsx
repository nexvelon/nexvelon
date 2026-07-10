// Admin report — quote numbers shared by 2+ quotes. Sequential numbers can
// clash if an operator manually overrides a number to one already in use
// (allowed, with a warning, per the editable-number flow). This page surfaces
// every clash so they can be reconciled. Read-only; rows link to the quote.

import Link from "next/link";
import { redirect } from "next/navigation";
import { listDuplicateNumberGroups } from "@/lib/api/quotes";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { businessDate } from "@/lib/format";
import { QuoteStatusBadge } from "@/components/modules/quotes/QuoteStatusBadge";
import type { DbRole } from "@/lib/types/database";
import type { QuoteStatus, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

// DbRole (11) → app Role (7); mirrors the other pages' helper.
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

export default async function DuplicateQuoteNumbersPage() {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "reports", "view")) {
    redirect("/reports");
  }

  const groups = await listDuplicateNumberGroups();

  return (
    <div className="space-y-5 pb-12">
      <div>
        <Link
          href="/reports"
          className="text-muted-foreground hover:text-brand-charcoal text-xs"
        >
          ← Back to Reports
        </Link>
        <h1 className="text-brand-navy mt-2 font-serif text-2xl font-semibold">
          Duplicate quote numbers
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {groups.length === 0
            ? "No duplicate quote numbers — every quote has a unique number."
            : `${groups.length} number${groups.length === 1 ? "" : "s"} shared by more than one quote.`}
        </p>
      </div>

      {groups.map((group) => (
        <div
          key={group.number}
          className="bg-card overflow-hidden rounded-lg border border-[var(--border)] shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <span className="text-brand-navy font-mono text-sm font-semibold tracking-wider">
              {group.number}
            </span>
            <span className="text-muted-foreground text-xs">
              {group.quotes.length} quotes
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wider">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Site</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {group.quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="text-brand-charcoal font-medium underline-offset-2 hover:underline"
                      >
                        {q.name || "Untitled quote"}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-4 py-2">
                      {q.clientName ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-2">
                      {q.siteName ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <QuoteStatusBadge status={q.status as QuoteStatus} />
                    </td>
                    <td className="text-muted-foreground px-4 py-2">
                      {q.created_at ? businessDate(q.created_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

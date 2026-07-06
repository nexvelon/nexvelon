// BUGFIX (quotes) — read-only "Quotes" section for the Site and Client detail
// pages. A1/A4: previously neither detail page surfaced its related quotes.
// Deliberately read-only — NO "New quote" button here; creation stays on the
// /quotes surface. Rows link to the quote builder. The optional Site column is
// shown on the Client detail page (a client spans many sites); the Site detail
// page omits it (every row is the same site).

import Link from "next/link";
import { formatCurrency, businessDate } from "@/lib/format";
import { QuoteStatusBadge } from "./QuoteStatusBadge";
import type { QuoteListItem } from "@/lib/api/quotes";

export function QuotesForEntitySection({
  quotes,
  showSite = false,
  siteNameById,
}: {
  quotes: QuoteListItem[];
  /** Render a Site column (Client detail page). */
  showSite?: boolean;
  /** site_id → display name, for the Site column. */
  siteNameById?: Record<string, string>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-brand-primary font-serif text-lg font-semibold">
        Quotes
      </h2>

      {quotes.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm">
          No quotes yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="text-muted-foreground px-3 py-2 font-medium">
                  Number
                </th>
                <th className="text-muted-foreground px-3 py-2 font-medium">
                  Name
                </th>
                {showSite && (
                  <th className="text-muted-foreground px-3 py-2 font-medium">
                    Site
                  </th>
                )}
                <th className="text-muted-foreground px-3 py-2 font-medium">
                  Status
                </th>
                <th className="text-muted-foreground px-3 py-2 text-right font-medium">
                  Total
                </th>
                <th className="text-muted-foreground px-3 py-2 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr
                  key={q.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/quotes/${q.id}`}
                      className="text-brand-charcoal font-medium underline-offset-2 hover:underline"
                    >
                      {q.number ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{q.name ?? "—"}</td>
                  {showSite && (
                    <td className="px-3 py-2">
                      {q.siteId ? (siteNameById?.[q.siteId] ?? "—") : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <QuoteStatusBadge status={q.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {q.total != null ? formatCurrency(q.total) : "—"}
                  </td>
                  <td className="text-muted-foreground px-3 py-2">
                    {q.updatedAt ? businessDate(q.updatedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

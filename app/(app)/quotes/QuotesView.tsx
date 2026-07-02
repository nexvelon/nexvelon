"use client";

// QUOTES-1 — the interactive quotes list. Split out of page.tsx so the page can
// be a server component that fetches from the real DB (mirrors the clients
// module: server page.tsx → client <ClientsView>). All row-action handlers now
// call the real server actions in ./actions and refresh via router.refresh();
// nothing here touches the localStorage quote-store or lib/mock-data anymore.
//
// Deliberately-preserved bugs (fixed in later chunks):
//   - onSend flips a Draft to "Sent" without validating client/site (QUOTES-2).
//   - There is no Delete row action yet (QUOTES-3).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { parseISO } from "date-fns";
import type { SortingState } from "@tanstack/react-table";

import { PageHeader } from "@/components/layout/PageHeader";
import {
  QuoteFilters,
  EMPTY_FILTERS,
  type QuoteFilterValue,
} from "@/components/modules/quotes/QuoteFilters";
import { QuotesTable } from "@/components/modules/quotes/QuotesTable";
import { upsertQuoteAction } from "./actions";
import { formatCurrency, businessDateISO } from "@/lib/format";
import {
  newId,
  nextQuoteNumber,
  totalValue,
  weightedPipelineValue,
  QUOTE_STATUS_ORDER,
} from "@/lib/quote-helpers";
import type { Quote, QuoteStatus } from "@/lib/types";

// Minimal views of a client/owner — the list reads `name` (both) plus `type`
// (clients), looked up by id, so the real DB rows are mapped to these shapes in
// the server page.
type RefOption = { id: string; name: string };
type ClientRefOption = { id: string; name: string; type?: string | null };

interface Props {
  quotes: Quote[];
  clients: ClientRefOption[];
  /** All users, for the owner-name column lookup. */
  users: RefOption[];
  /** Sales-facing users (SalesRep / ProjectManager / Admin), for the filter. */
  owners: RefOption[];
  /** Count of existing projects — feeds the (still cosmetic) convert code. */
  projectsCount: number;
}

export function QuotesView({
  quotes: allQuotes,
  clients,
  users,
  owners,
  projectsCount,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<QuoteFilterValue>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const counts = useMemo(() => {
    const c: Record<"All" | QuoteStatus, number> = {
      All: allQuotes.length,
      Draft: 0,
      Sent: 0,
      Approved: 0,
      Revision: 0,
      Closed: 0,
      Expired: 0,
      Converted: 0,
    };
    for (const q of allQuotes) c[q.status] += 1;
    return c;
  }, [allQuotes]);

  const filtered = useMemo(() => {
    const min = filters.minValue ? parseFloat(filters.minValue) : -Infinity;
    const max = filters.maxValue ? parseFloat(filters.maxValue) : Infinity;
    const from = filters.fromDate ? parseISO(filters.fromDate).getTime() : -Infinity;
    const to = filters.toDate
      ? parseISO(filters.toDate).getTime() + 24 * 60 * 60 * 1000 - 1
      : Infinity;
    const search = filters.search.trim().toLowerCase();
    const clientById = new Map(clients.map((c) => [c.id, c]));

    return allQuotes.filter((q) => {
      if (filters.status !== "All" && q.status !== filters.status) return false;
      if (filters.ownerId !== "all" && q.ownerId !== filters.ownerId) return false;
      if (q.total < min || q.total > max) return false;
      const t = parseISO(q.createdAt).getTime();
      if (t < from || t > to) return false;
      if (search) {
        const clientName = clientById.get(q.clientId)?.name.toLowerCase() ?? "";
        if (
          !q.number.toLowerCase().includes(search) &&
          !clientName.includes(search)
        )
          return false;
      }
      return true;
    });
  }, [allQuotes, filters, clients]);

  const handlers = useMemo(
    () => ({
      onView: (q: Quote) => router.push(`/quotes/${q.id}`),
      onDuplicate: async (q: Quote) => {
        // Deep-copy sections so we don't mutate the source quote's line objects.
        // Clear committedStockId on every line (the copy must commit its OWN
        // stock — F-3b idempotency marker); keep stockUnitId pins intact.
        const sections = (q.sections ?? []).map((s) => ({
          ...s,
          items: s.items.map((it) => {
            const copy = { ...it };
            delete copy.committedStockId;
            return copy;
          }),
        }));
        const dup: Quote = {
          ...q,
          id: newId("q"),
          number: nextQuoteNumber(),
          status: "Draft",
          createdAt: businessDateISO(),
          projectId: undefined,
          sections,
        };
        const res = await upsertQuoteAction(dup);
        if (!res.ok) {
          toast.error(`Couldn't duplicate ${q.number}`, { description: res.error });
          return;
        }
        toast.success(`Duplicated ${q.number}`, {
          description: `Created ${dup.number} as a Draft.`,
        });
        router.refresh();
      },
      // QUOTES-2 will add the client/site guard here — for now the DB cutover
      // preserves the existing (buggy) behavior: a Draft can be "sent" with no
      // recipient and still reports success.
      onSend: async (q: Quote) => {
        if (q.status !== "Draft") return;
        const res = await upsertQuoteAction({ ...q, status: "Sent" });
        if (!res.ok) {
          toast.error(`Couldn't send ${q.number}`, { description: res.error });
          return;
        }
        toast.success(`${q.number} sent`, {
          description: `Status updated to Sent. Client copy queued.`,
        });
        router.refresh();
      },
      onApprove: async (q: Quote) => {
        if (q.status !== "Sent") return;
        const res = await upsertQuoteAction({ ...q, status: "Approved" });
        if (!res.ok) {
          toast.error(`Couldn't approve ${q.number}`, { description: res.error });
          return;
        }
        toast.success(`${q.number} approved`, {
          description: `Status updated to Approved — ready to convert.`,
        });
        router.refresh();
      },
      // Existing convert behavior preserved: mints a cosmetic project code and
      // links it on the quote (no real project row is created here — unchanged
      // from the mock build). The count comes from the real projects table now.
      onConvert: async (q: Quote) => {
        if (q.status !== "Approved") return;
        const year = new Date().getFullYear();
        const projectCode = `NX-${year}-${(
          projectsCount +
          16 +
          Math.floor(Math.random() * 100)
        )
          .toString()
          .padStart(3, "0")}`;
        const res = await upsertQuoteAction({
          ...q,
          status: "Converted",
          projectId: projectCode,
        });
        if (!res.ok) {
          toast.error(`Couldn't convert ${q.number}`, { description: res.error });
          return;
        }
        toast.success(`${q.number} converted`, {
          description: `Project ${projectCode} created and linked.`,
        });
        router.refresh();
      },
      // Archive stays a no-op toast: "Archived" is not a valid QuoteStatus (nor
      // in the quotes.status CHECK), so there is no safe status to write. A real
      // archive status is a separate decision; left unchanged from the mock
      // build (it never persisted anything, so no localStorage dependency).
      onArchive: (q: Quote) => {
        toast(`${q.number} archived`, {
          description: "Archive is a soft action in this build.",
        });
      },
    }),
    [router, projectsCount]
  );

  const filteredTotal = useMemo(() => totalValue(filtered), [filtered]);
  const filteredWeighted = useMemo(
    () => weightedPipelineValue(filtered),
    [filtered]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${allQuotes.length} quotes · ${counts.Approved} approved · ${counts.Sent} in flight`}
        title="Quotes"
        actions={
          <>
            <Link
              href="/quotes/new"
              className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white shadow-sm transition-shadow hover:shadow-md"
              style={{ background: "var(--brand-primary)" }}
            >
              <Plus className="h-4 w-4" />
              New Quote
            </Link>
          </>
        }
      />

      <QuoteFilters
        value={filters}
        onChange={setFilters}
        owners={owners}
        counts={counts}
      />

      <QuotesTable
        quotes={[...filtered].sort((a, b) => {
          if (sorting.length === 0) return 0;
          const s = sorting[0];
          const dir = s.desc ? -1 : 1;
          const aVal = (a as unknown as Record<string, unknown>)[s.id];
          const bVal = (b as unknown as Record<string, unknown>)[s.id];
          if (typeof aVal === "number" && typeof bVal === "number")
            return (aVal - bVal) * dir;
          return String(aVal ?? "").localeCompare(String(bVal ?? "")) * dir;
        })}
        clients={clients}
        owners={users}
        sorting={sorting}
        onSortingChange={setSorting}
        {...handlers}
      />

      <div className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-5 py-3 shadow-sm">
        <div className="text-muted-foreground text-xs">
          Showing{" "}
          <span className="text-brand-charcoal font-semibold">
            {filtered.length}
          </span>{" "}
          of {allQuotes.length} quotes
          {filters.status !== "All" && (
            <>
              {" "}
              · status{" "}
              <span className="text-brand-charcoal">{filters.status}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-muted-foreground text-[11px] uppercase tracking-wider">
              Total $
            </p>
            <p className="text-brand-navy font-serif text-lg tabular-nums">
              {formatCurrency(filteredTotal)}
            </p>
          </div>
          <div className="bg-brand-gold/40 h-8 w-px" />
          <div className="text-right">
            <p className="text-muted-foreground text-[11px] uppercase tracking-wider">
              Weighted pipeline
            </p>
            <p className="text-brand-gold font-serif text-lg tabular-nums">
              {formatCurrency(filteredWeighted)}
            </p>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground pt-1 text-center text-[11px]">
        Status order: {QUOTE_STATUS_ORDER.join(" → ")} · weighted = sum(total ×
        probability) where Approved=100%, Sent=60%, Draft=25%; Closed quotes are
        excluded from the pipeline.
      </p>
    </div>
  );
}

"use client";

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
import { useQuotes, upsertQuote } from "@/lib/quote-store";
import { clients } from "@/lib/mock-data/clients";
import { users } from "@/lib/mock-data/users";
import { projects } from "@/lib/mock-data/projects";
import { formatCurrency } from "@/lib/format";
import {
  newId,
  totalValue,
  weightedPipelineValue,
} from "@/lib/quote-helpers";
import { QUOTE_STATUS_ORDER } from "@/lib/quote-helpers";
import type { Quote, QuoteStatus } from "@/lib/types";

export default function QuotesListPage() {
  const router = useRouter();
  const allQuotes = useQuotes();
  const [filters, setFilters] = useState<QuoteFilterValue>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const owners = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === "SalesRep" ||
          u.role === "ProjectManager" ||
          u.role === "Admin"
      ),
    []
  );

  const counts = useMemo(() => {
    const c: Record<"All" | QuoteStatus, number> = {
      All: allQuotes.length,
      Draft: 0,
      Sent: 0,
      Approved: 0,
      Rejected: 0,
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
  }, [allQuotes, filters]);

  const handlers = useMemo(
    () => ({
      onView: (q: Quote) => router.push(`/quotes/${q.id}`),
      onDuplicate: (q: Quote) => {
        const dup: Quote = {
          ...q,
          id: newId("q"),
          number: `${q.number}-COPY`,
          status: "Draft",
          createdAt: new Date().toISOString().slice(0, 10),
          projectId: undefined,
        };
        upsertQuote(dup);
        toast.success(`Duplicated ${q.number}`, {
          description: `Created ${dup.number} as a Draft.`,
        });
      },
      onSend: (q: Quote) => {
        if (q.status !== "Draft") return;
        upsertQuote({ ...q, status: "Sent" });
        toast.success(`${q.number} sent`, {
          description: `Status updated to Sent. Client copy queued.`,
        });
      },
      onConvert: (q: Quote) => {
        if (q.status !== "Approved") return;
        const yearProjects = projects.filter((p) =>
          p.code.includes(`-${new Date().getFullYear()}-`)
        );
        const projectCode = `NX-${new Date().getFullYear()}-${(
          yearProjects.length +
          16 +
          Math.floor(Math.random() * 100)
        )
          .toString()
          .padStart(3, "0")}`;
        upsertQuote({ ...q, status: "Converted", projectId: projectCode });
        toast.success(`${q.number} converted`, {
          description: `Project ${projectCode} created and linked.`,
        });
      },
      onArchive: (q: Quote) => {
        toast(`${q.number} archived`, {
          description: "Archive is a soft action in this demo build.",
        });
      },
    }),
    [router]
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
        description="Manage proposals from draft to project conversion."
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
        probability) where Approved=100%, Sent=60%, Draft=25%.
      </p>
    </div>
  );
}

"use client";

// INVOICE-1 — /invoices list over real data: number-or-"Draft", entity badge
// (Guardian / Integrated), client, project link, status, total, issue date.
// Row → /invoices/[id]. There's no "new invoice" entry here — invoices are
// created project-first (Project detail → Create invoice).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { listInvoicesAction } from "./actions";
import type { InvoiceListRow } from "@/lib/api/invoices";
import {
  OPCO_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/components/modules/invoices/shared";
import { isOverdue } from "@/lib/invoice-status";

export default function InvoicesListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("All");

  useEffect(() => {
    let active = true;
    listInvoicesAction()
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        /* leave empty */
      });
    return () => {
      active = false;
    };
  }, []);

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "All" && r.status !== status) return false;
      if (q) {
        const hay = `${r.invoice_number ?? "draft"} ${r.client_name ?? ""} ${
          r.project_number ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
        title="Invoices"
        description="Per-entity invoices with flexible draws, HST, and holdback."
      />

      {/* Filters: status + text search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, client, project…"
            className="h-8 pl-8 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-brand-charcoal absolute right-2 top-1/2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "All")}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground ml-auto text-xs">
          Showing{" "}
          <span className="text-brand-charcoal font-semibold">
            {filtered.length}
          </span>{" "}
          of {rows.length}
        </p>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Issued</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {rows.length === 0
                    ? "No invoices yet. Open a project and choose Create invoice."
                    : "No invoices match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => router.push(`/invoices/${r.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="text-brand-navy font-mono text-xs font-semibold">
                    {r.invoice_number ?? (
                      <span className="text-muted-foreground italic">Draft</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="bg-muted text-brand-primary rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                      {OPCO_LABEL[r.opco] ?? r.opco}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.client_deleted ? (
                      // POLISH-44 — bill-to client archived; keep the row, flag it.
                      <span className="italic text-zinc-400">
                        {r.client_name ?? "—"} (deleted)
                      </span>
                    ) : (
                      (r.client_name ?? "—")
                    )}
                  </TableCell>
                  <TableCell
                    className="text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.project_id && r.project_number ? (
                      <Link
                        href={`/projects/${r.project_id}`}
                        className="text-brand-navy font-mono hover:underline"
                      >
                        {r.project_number}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_TONE[r.status] ?? STATUS_TONE.draft}`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {/* FIN-2 — derived overdue marker on open, past-due rows. */}
                      {isOverdue(r) && (
                        <span
                          className="text-destructive text-[10px] font-semibold uppercase tracking-wide"
                          title={`Due ${r.due_date}`}
                        >
                          • Overdue
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-brand-charcoal text-right text-xs font-semibold tabular-nums">
                    {formatCurrency(Number(r.total))}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {r.issue_date
                      ? format(parseISO(r.issue_date), "MMM d, yyyy")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

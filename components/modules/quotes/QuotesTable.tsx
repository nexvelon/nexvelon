"use client";

import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QuoteStatusBadge } from "./QuoteStatusBadge";
import { QuoteRowActions } from "./QuoteRowActions";
import { formatCurrency } from "@/lib/format";
import { ensureSections } from "@/lib/quote-helpers";
import { sites as ALL_SITES } from "@/lib/mock-data/sites";
import type { Client, Quote, User } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  quotes: Quote[];
  clients: Client[];
  owners: User[];
  onView: (q: Quote) => void;
  onDuplicate: (q: Quote) => void;
  onSend: (q: Quote) => void;
  onConvert: (q: Quote) => void;
  onArchive: (q: Quote) => void;
  sorting: SortingState;
  onSortingChange: (s: SortingState) => void;
}

export function QuotesTable({
  quotes,
  clients,
  owners,
  onView,
  onDuplicate,
  onSend,
  onConvert,
  onArchive,
  sorting,
  onSortingChange,
}: Props) {
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const siteById = useMemo(() => new Map(ALL_SITES.map((s) => [s.id, s])), []);
  const ownerById = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);

  const columns = useMemo<ColumnDef<Quote>[]>(
    () => [
      {
        accessorKey: "number",
        header: "Quote #",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onView(row.original)}
            className="text-brand-navy hover:text-brand-gold font-mono text-xs font-semibold underline-offset-2 hover:underline"
          >
            {row.original.number}
          </button>
        ),
      },
      {
        id: "client",
        header: "Client",
        accessorFn: (q) => clientById.get(q.clientId)?.name ?? "—",
        cell: ({ row }) => {
          const client = clientById.get(row.original.clientId);
          return (
            <div>
              <div className="text-brand-charcoal text-sm font-medium">
                {client?.name ?? "—"}
              </div>
              <div className="text-muted-foreground text-[11px]">
                {client?.type}
              </div>
            </div>
          );
        },
      },
      {
        id: "site",
        header: "Site",
        accessorFn: (q) => (q.siteId ? siteById.get(q.siteId)?.name : "—"),
        cell: ({ row }) => {
          const site = row.original.siteId ? siteById.get(row.original.siteId) : null;
          return (
            <span className="text-muted-foreground text-xs">
              {site?.name ?? "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs tabular-nums">
            {format(parseISO(row.original.createdAt), "MMM d, yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "expiresAt",
        header: "Valid Until",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs tabular-nums">
            {format(parseISO(row.original.expiresAt), "MMM d, yyyy")}
          </span>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (q) => ownerById.get(q.ownerId)?.name ?? "—",
        cell: ({ row }) => (
          <span className="text-brand-charcoal text-xs">
            {ownerById.get(row.original.ownerId)?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "lineItems",
        header: () => <span className="block text-right">Lines</span>,
        accessorFn: (q) =>
          ensureSections(q).reduce((sum, s) => sum + s.items.length, 0),
        cell: ({ getValue }) => (
          <div className="text-brand-charcoal text-right text-xs tabular-nums">
            {getValue<number>()}
          </div>
        ),
      },
      {
        accessorKey: "subtotal",
        header: () => <span className="block text-right">Subtotal</span>,
        cell: ({ row }) => (
          <div className="text-brand-charcoal text-right text-sm tabular-nums">
            {formatCurrency(row.original.subtotal)}
          </div>
        ),
      },
      {
        accessorKey: "tax",
        header: () => <span className="block text-right">Tax</span>,
        cell: ({ row }) => (
          <div className="text-muted-foreground text-right text-xs tabular-nums">
            {formatCurrency(row.original.tax)}
          </div>
        ),
      },
      {
        accessorKey: "total",
        header: () => <span className="block text-right">Total</span>,
        cell: ({ row }) => (
          <div className="text-brand-navy text-right text-sm font-semibold tabular-nums">
            {formatCurrency(row.original.total)}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <QuoteRowActions
              quote={row.original}
              onView={onView}
              onDuplicate={onDuplicate}
              onSend={onSend}
              onConvert={onConvert}
              onArchive={onArchive}
            />
          </div>
        ),
      },
    ],
    [clientById, siteById, ownerById, onView, onDuplicate, onSend, onConvert, onArchive]
  );

  const table = useReactTable({
    data: quotes,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-card overflow-hidden rounded-lg border border-[var(--border)] shadow-sm">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} className="select-none">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!canSort}
                        className={cn(
                          "text-muted-foreground inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                          canSort && "hover:text-brand-navy"
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && sorted === "asc" && (
                          <ArrowUp className="text-brand-gold h-3 w-3" />
                        )}
                        {canSort && sorted === "desc" && (
                          <ArrowDown className="text-brand-gold h-3 w-3" />
                        )}
                        {canSort && !sorted && (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground py-12 text-center text-sm"
              >
                No quotes match the current filters.
              </TableCell>
            </TableRow>
          )}
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-brand-gold/5">
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

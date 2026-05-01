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
import { format, parseISO } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Archive,
  Copy,
  Eye,
  FileSignature,
  MoreVertical,
  Pencil,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { MiniProgressBar } from "./ProgressRing";
import { formatCurrency } from "@/lib/format";
import type { Client, Project, User } from "@/lib/types";
import { sites as ALL_SITES } from "@/lib/mock-data/sites";
import { cn } from "@/lib/utils";

interface Props {
  projects: Project[];
  clients: Client[];
  users: User[];
  onView: (p: Project) => void;
  onDuplicate: (p: Project) => void;
  onArchive: (p: Project) => void;
  sorting: SortingState;
  onSortingChange: (s: SortingState) => void;
}

export function ProjectsTable({
  projects,
  clients,
  users,
  onView,
  onDuplicate,
  onArchive,
  sorting,
  onSortingChange,
}: Props) {
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const siteById = useMemo(() => new Map(ALL_SITES.map((s) => [s.id, s])), []);

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Project #",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onView(row.original)}
            className="text-brand-navy hover:text-brand-gold font-mono text-xs font-semibold underline-offset-2 hover:underline"
          >
            {row.original.code}
          </button>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="text-brand-charcoal max-w-[260px] text-sm font-medium">
            {row.original.name}
          </div>
        ),
      },
      {
        id: "client",
        header: "Client",
        accessorFn: (p) => clientById.get(p.clientId)?.name ?? "—",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {clientById.get(row.original.clientId)?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "site",
        header: "Site",
        accessorFn: (p) => (p.siteId ? siteById.get(p.siteId)?.name : "—"),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {row.original.siteId ? siteById.get(row.original.siteId)?.name : "—"}
          </span>
        ),
      },
      {
        id: "system",
        header: "System",
        accessorFn: (p) =>
          p.systemTypes.length > 1 ? "Mixed" : p.systemTypes[0] ?? "—",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.systemTypes.length > 2 ? (
              <span className="bg-brand-navy/10 text-brand-navy rounded px-1.5 py-0.5 text-[10px]">
                Mixed ({row.original.systemTypes.length})
              </span>
            ) : (
              row.original.systemTypes.map((t) => (
                <span
                  key={t}
                  className="bg-brand-navy/10 text-brand-navy rounded px-1.5 py-0.5 text-[10px]"
                >
                  {t}
                </span>
              ))
            )}
          </div>
        ),
      },
      {
        id: "pm",
        header: "PM",
        accessorFn: (p) => userById.get(p.managerId)?.name ?? "—",
        cell: ({ row }) => (
          <span className="text-brand-charcoal text-xs">
            {userById.get(row.original.managerId)?.name ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "startDate",
        header: "Start",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs tabular-nums">
            {format(parseISO(row.original.startDate), "MMM d, yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "targetDate",
        header: "Target",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs tabular-nums">
            {format(parseISO(row.original.targetDate), "MMM d, yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "progress",
        header: () => <span className="block">% Complete</span>,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <MiniProgressBar value={row.original.progress} className="w-24" />
            <span className="text-brand-charcoal text-[11px] font-semibold tabular-nums">
              {row.original.progress}%
            </span>
          </div>
        ),
      },
      {
        accessorKey: "budget",
        header: () => <span className="block text-right">Contract Value</span>,
        cell: ({ row }) => (
          <div className="text-brand-navy text-right text-sm font-semibold tabular-nums">
            {formatCurrency(row.original.budget)}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => onView(row.original)}>
                  <Eye className="mr-2 h-4 w-4" /> View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onView(row.original)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(row.original)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FileSignature className="mr-2 h-4 w-4" /> Generate Closeout Report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onArchive(row.original)}
                  className="text-red-600"
                >
                  <Archive className="mr-2 h-4 w-4" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [clientById, userById, siteById, onView, onDuplicate, onArchive]
  );

  const table = useReactTable({
    data: projects,
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
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
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
                No projects match the current filters.
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

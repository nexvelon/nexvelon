"use client";

// SUB-1 — subcontractors list: search + status + trade filters, a create/edit
// drawer, and delete confirm. Mirrors VendorsView (client source-of-truth,
// refreshed via the gated list action after each mutation).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, HardHat, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  listSubcontractorsAction,
  deleteSubcontractorAction,
  getRosterComplianceAction,
} from "@/app/(app)/subcontractors/actions";
import { SubcontractorFormDrawer, type DrawerMode } from "./SubcontractorFormDrawer";
import type { SubcontractorListRow } from "@/lib/api/subcontractors";
import type { ComplianceSummary, WorstState } from "@/lib/subcontractors/compliance-status";
import { DOC_TYPE_LABEL } from "@/lib/subcontractors/compliance-status";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  do_not_use: "Do not use",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  inactive: "bg-muted text-muted-foreground",
  do_not_use: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

const WORST_BADGE: Record<WorstState, { label: string; cls: string }> = {
  expired: { label: "Action needed", cls: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive" },
  expiring_soon: { label: "Expiring soon", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  ok: { label: "Compliant", cls: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]" },
};

function ComplianceBadge({ summary }: { summary: ComplianceSummary | undefined }) {
  if (!summary) return <span className="text-muted-foreground text-xs">—</span>;
  const badge = WORST_BADGE[summary.worst];
  const title =
    summary.missing_required.length > 0
      ? `Missing: ${summary.missing_required.map((t) => DOC_TYPE_LABEL[t]).join(", ")}`
      : summary.worst === "expired"
        ? `${summary.expired} expired`
        : summary.worst === "expiring_soon"
          ? `${summary.expiring_soon} expiring soon`
          : "All required documents current";
  return (
    <span
      title={title}
      className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}
    >
      {badge.label}
    </span>
  );
}

export function SubcontractorsView() {
  const router = useRouter();
  const { role } = useRole();
  const canCreate = hasPermission(role, "subcontractors", "create");
  const canEdit = hasPermission(role, "subcontractors", "edit");
  const canDelete = hasPermission(role, "subcontractors", "delete");

  const [rows, setRows] = useState<SubcontractorListRow[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [trade, setTrade] = useState("all");
  const [drawer, setDrawer] = useState<{ open: false } | { open: true; mode: DrawerMode }>({
    open: false,
  });
  const [confirmDelete, setConfirmDelete] = useState<SubcontractorListRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [compliance, setCompliance] = useState<Record<string, ComplianceSummary>>({});

  const reload = async () => {
    const res = await listSubcontractorsAction({
      status: status === "all" ? undefined : status,
      trade: trade === "all" ? undefined : trade,
    });
    if (res.ok) {
      setRows(res.data.rows);
      setTrades(res.data.trades);
      const ids = res.data.rows.map((r) => r.id);
      getRosterComplianceAction(ids).then((c) => {
        if (c.ok) setCompliance(c.data);
      });
    } else {
      toast.error(res.error);
    }
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, trade]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.trade ?? ""} ${r.contact_name ?? ""} ${r.email ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await deleteSubcontractorAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Subcontractor deleted");
      setConfirmDelete(null);
      reload();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${rows.length} subcontractor${rows.length === 1 ? "" : "s"}`}
        title="Subcontractors"
        description="Payable labour partners — trades, rates, and the vendor billing link."
        actions={
          canCreate ? (
            <Button type="button" size="sm" onClick={() => setDrawer({ open: true, mode: { kind: "create" } })}>
              <Plus className="mr-1 h-4 w-4" />
              New subcontractor
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, trade, contact…"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="do_not_use">Do not use</SelectItem>
          </SelectContent>
        </Select>
        <Select value={trade} onValueChange={(v) => setTrade(v ?? "all")}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder="All trades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trades</SelectItem>
            {trades.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Name</TableHead>
              <TableHead className="text-[11px] uppercase">Trade</TableHead>
              <TableHead className="text-[11px] uppercase">Contact</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Default rate</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Compliance</TableHead>
              <TableHead className="text-[11px] uppercase">Vendor link</TableHead>
              <TableHead className="text-[11px] uppercase" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-8 text-center text-sm">
                  {rows.length === 0
                    ? "No subcontractors yet."
                    : "No subcontractors match your filters."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => router.push(`/subcontractors/${s.id}`)}
              >
                <TableCell>
                  <div className="text-brand-charcoal inline-flex items-center gap-2 text-xs font-medium">
                    <HardHat className="text-brand-gold h-3.5 w-3.5" />
                    {s.name}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{s.trade ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  <div>{s.contact_name ?? "—"}</div>
                  {(s.phone || s.email) && (
                    <div className="text-muted-foreground text-[10px]">
                      {s.phone ?? s.email}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.default_labour_rate == null ? "—" : formatCurrency(Number(s.default_labour_rate))}
                </TableCell>
                <TableCell>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[s.status])}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </TableCell>
                <TableCell>
                  <ComplianceBadge summary={compliance[s.id]} />
                </TableCell>
                <TableCell className="text-xs">
                  {s.vendor_name ? (
                    <span className="text-[var(--brand-status-green)]">✓ {s.vendor_name}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {(canEdit || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Row actions"
                        className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex items-center justify-center rounded p-1"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem
                            onClick={() => setDrawer({ open: true, mode: { kind: "edit", sub: s } })}
                          >
                            <Edit3 className="mr-2 h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setConfirmDelete(s)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {drawer.open && (
        <SubcontractorFormDrawer
          open={drawer.open}
          mode={drawer.mode}
          onClose={() => setDrawer({ open: false })}
          onSaved={() => {
            setDrawer({ open: false });
            reload();
          }}
        />
      )}

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete subcontractor?</DialogTitle>
            <DialogDescription>
              This permanently removes {confirmDelete?.name}. Their vendor link,
              bills and history on the vendor side are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

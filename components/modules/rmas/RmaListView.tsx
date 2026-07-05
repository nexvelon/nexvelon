"use client";

// INV-4 — RMA list. Table of return authorizations with status + vendor
// filters and a Create action (inventory:edit). Rows link to the detail page.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
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
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  RMA_REASON_LABEL,
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
} from "@/lib/rma-labels";
import { CreateRmaDialog } from "@/components/modules/rmas/CreateRmaDialog";
import type { RmaListRow } from "@/lib/api/rmas";
import type { DbVendor, DbRmaStatus, DbRmaReason } from "@/lib/types/database";

const STATUS_FILTERS: (DbRmaStatus | "all")[] = [
  "all",
  "draft",
  "sent",
  "approved",
  "shipped",
  "received_credit",
  "closed",
  "cancelled",
];

export function RmaListView({
  rmas,
  vendors,
}: {
  rmas: RmaListRow[];
  vendors: DbVendor[];
}) {
  const router = useRouter();
  const { role } = useRole();
  const canManage = hasPermission(role, "inventory", "edit");
  const [status, setStatus] = useState<DbRmaStatus | "all">("all");
  const [vendorId, setVendorId] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () =>
      rmas.filter(
        (r) =>
          (status === "all" || r.status === status) &&
          (vendorId === "all" || r.vendor_id === vendorId)
      ),
    [rmas, status, vendorId]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${rmas.length} total`}
        title="Returns & RMAs"
        description="Return merchandise authorizations for defective or wrong parts sent back to vendors."
        actions={
          canManage ? (
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Create RMA
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as DbRmaStatus | "all")}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : RMA_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={vendorId} onValueChange={(v) => setVendorId(v ?? "all")}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder="Vendor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">RMA #</TableHead>
              <TableHead className="text-[11px] uppercase">Vendor</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Reason</TableHead>
              <TableHead className="text-[11px] uppercase">Created</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Lines</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Return value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-12 text-center text-sm"
                >
                  <Undo2 className="text-muted-foreground/40 mx-auto mb-2 h-7 w-7" />
                  {rmas.length === 0
                    ? "No RMAs yet. Create one to return parts to a vendor."
                    : "No RMAs match these filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/rmas/${r.id}`)}
                >
                  <TableCell className="text-brand-navy font-mono text-xs font-semibold">
                    {r.rma_number}
                  </TableCell>
                  <TableCell className="text-brand-charcoal text-xs">
                    {r.vendor_name}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        RMA_STATUS_TONE[r.status as DbRmaStatus]
                      )}
                    >
                      {RMA_STATUS_LABEL[r.status as DbRmaStatus] ?? r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {RMA_REASON_LABEL[r.reason as DbRmaReason] ?? r.reason}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {format(parseISO(r.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r.line_count}
                  </TableCell>
                  <TableCell className="text-brand-charcoal text-right text-xs font-semibold tabular-nums">
                    {formatCurrency(r.total_value)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {canManage && (
        <CreateRmaDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          vendors={vendors}
          onCreated={(rmaId) => {
            setCreateOpen(false);
            router.push(`/rmas/${rmaId}`);
          }}
        />
      )}
    </div>
  );
}

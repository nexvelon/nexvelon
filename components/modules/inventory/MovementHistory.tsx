"use client";

// FIX-BATCH-O — the part's append-only movement timeline. Shows EVERY event for
// the part across all dates (no truncation), newest first, with date AND time in
// America/Toronto (businessDateTime), paginated via the shared Paginator.
//
// POLISH-3 — Admins can HARD-delete a single movement row or the whole history
// for a part (type-to-confirm). Deletes are intentional, irreversible, and are
// NOT themselves audited.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Paginator,
  usePersistedPageSize,
} from "@/components/modules/shared/Paginator";
import { useRole } from "@/lib/role-context";
import { businessDateTime, formatNumber } from "@/lib/format";
import {
  deleteMovementByIdAction,
  deleteAllMovementsForProductAction,
} from "@/app/(app)/inventory/movement-actions";
import type { DbStockMovement } from "@/lib/types/database";

export function MovementHistory({
  movements,
  productId,
  partLabel,
}: {
  movements: DbStockMovement[];
  productId: string;
  // master_part_number ?? sku — what the admin must type to confirm a full wipe.
  partLabel: string;
}) {
  const router = useRouter();
  const { role } = useRole();
  const isAdmin = role === "Admin";

  // Hold rows locally (seeded from props) so a delete drops the row immediately;
  // re-seed when the server sends fresh props after router.refresh().
  const [rows, setRows] = useState<DbStockMovement[]>(movements);
  useEffect(() => {
    setRows(movements);
  }, [movements]);

  // Defensive: the server already orders newest-first, but sort again so the
  // panel never depends on query order.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [rows]
  );

  const [pageSize, setPageSize] = usePersistedPageSize(
    "nexvelon:movement-history:pageSize",
    10
  );
  const [page, setPage] = useState(0); // 0 = newest page
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const [pending, startTransition] = useTransition();
  // The row pending per-row delete confirmation.
  const [confirmRow, setConfirmRow] = useState<DbStockMovement | null>(null);
  // Whether the wipe-all type-to-confirm dialog is open + its input value.
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeInput, setWipeInput] = useState("");

  function deleteRow(m: DbStockMovement) {
    startTransition(async () => {
      const res = await deleteMovementByIdAction(m.id, productId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== m.id));
      setConfirmRow(null);
      toast.success("Movement deleted");
      router.refresh();
    });
  }

  function wipeAll() {
    startTransition(async () => {
      const res = await deleteAllMovementsForProductAction(productId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRows([]);
      setWipeOpen(false);
      setWipeInput("");
      setPage(0);
      toast.success(`Deleted ${res.data.deleted} movement(s)`);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Movement History{" "}
          <span className="text-muted-foreground font-normal normal-case">
            ({sorted.length})
          </span>
        </h2>
        {isAdmin && sorted.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={() => {
              setWipeInput("");
              setWipeOpen(true);
            }}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete all history
          </Button>
        )}
      </div>
      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        {sorted.length === 0 ? (
          <p className="text-muted-foreground p-5 text-xs">
            No movements recorded yet.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">When</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Qty</TableHead>
                  <TableHead className="text-[11px] uppercase">From</TableHead>
                  <TableHead className="text-[11px] uppercase">To</TableHead>
                  <TableHead className="text-[11px] uppercase">By</TableHead>
                  <TableHead className="text-[11px] uppercase">Note</TableHead>
                  {isAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                      {businessDateTime(m.created_at)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(Number(m.quantity))}
                    </TableCell>
                    <TableCell className="text-xs">{m.from_label ?? "—"}</TableCell>
                    <TableCell className="text-brand-charcoal text-xs font-medium">
                      {/* CUSTODY-1: custody events read "Marked <status>";
                          adjustments/batch ops read "Adjusted <delta>"; moves
                          show the destination label. */}
                      {m.to_type === "custody" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="border-brand-navy/30 text-brand-navy text-[9px] uppercase"
                          >
                            Custody
                          </Badge>
                          Marked {m.to_label}
                        </span>
                      ) : m.to_type === "adjustment" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-[9px] uppercase text-amber-700"
                          >
                            Adjust
                          </Badge>
                          Adjusted {m.to_label}
                        </span>
                      ) : (
                        (m.to_label ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {m.moved_by_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate text-xs">
                      {m.note ?? "—"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setConfirmRow(m)}
                          disabled={pending}
                          aria-label="Delete movement"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Paginator
              totalItems={sorted.length}
              page={safePage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(0);
              }}
            />
          </>
        )}
      </Card>

      {/* Per-row delete confirm */}
      <Dialog
        open={confirmRow !== null}
        onOpenChange={(o) => !o && setConfirmRow(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this movement?</DialogTitle>
            <DialogDescription>
              This permanently removes one row from the part&rsquo;s movement
              history. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRow(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => confirmRow && deleteRow(confirmRow)}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wipe-all type-to-confirm */}
      <Dialog
        open={wipeOpen}
        onOpenChange={(o) => {
          if (!o) {
            setWipeOpen(false);
            setWipeInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all movement history?</DialogTitle>
            <DialogDescription>
              This permanently deletes every movement row for this part. It
              cannot be undone. Type{" "}
              <span className="text-brand-charcoal font-semibold">
                {partLabel}
              </span>{" "}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={wipeInput}
            onChange={(e) => setWipeInput(e.target.value)}
            placeholder={partLabel}
            disabled={pending}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWipeOpen(false);
                setWipeInput("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={wipeAll}
              disabled={pending || wipeInput !== partLabel}
            >
              {pending ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

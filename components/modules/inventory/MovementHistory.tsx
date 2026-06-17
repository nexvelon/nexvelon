"use client";

// FIX-BATCH-O — the part's append-only movement timeline. Shows EVERY event for
// the part across all dates (no truncation), newest first, with date AND time in
// America/Toronto (businessDateTime), paginated 50/page with Newer / Older.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { businessDateTime, formatNumber } from "@/lib/format";
import type { DbStockMovement } from "@/lib/types/database";

const PAGE_SIZE = 50;

export function MovementHistory({
  movements,
}: {
  movements: DbStockMovement[];
}) {
  // Defensive: the server already orders newest-first, but sort again so the
  // panel never depends on query order.
  const sorted = useMemo(
    () =>
      [...movements].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
    [movements]
  );

  const [page, setPage] = useState(0); // 0 = newest page
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <h2 className="text-brand-navy mb-2 text-sm font-semibold tracking-wide uppercase">
        Movement History{" "}
        <span className="text-muted-foreground font-normal normal-case">
          ({movements.length})
        </span>
      </h2>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  {start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)} of{" "}
                  {sorted.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                  >
                    <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                    Newer
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                  >
                    Older
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

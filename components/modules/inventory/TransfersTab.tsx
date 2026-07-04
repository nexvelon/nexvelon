"use client";

// INV-1b — real DB. Renders the global stock_movements ledger (via
// listRecentMovements). from_label / to_label are snapshots taken at move time,
// so they survive later renames/deletes. Real transfers happen on the product
// detail page (MoveAssignDialog); this is a read-only feed.

import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StockMovementRow } from "@/lib/api/stock-movements";

function relative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function TransfersTab({ movements }: { movements: StockMovementRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) =>
      [
        m.product_name,
        m.product_sku,
        m.from_label,
        m.to_label,
        m.moved_by_name,
        m.note,
      ]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q))
    );
  }, [movements, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          <span className="text-brand-charcoal font-semibold">
            {movements.length}
          </span>{" "}
          recent stock movements. Move stock from a part&apos;s detail page.
        </p>
        <div className="relative w-64">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search product, location, person…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">When</TableHead>
              <TableHead className="text-[11px] uppercase">Product</TableHead>
              <TableHead className="text-[11px] uppercase">From → To</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Qty</TableHead>
              <TableHead className="text-[11px] uppercase">By</TableHead>
              <TableHead className="text-[11px] uppercase">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  {movements.length === 0
                    ? "No stock movements yet."
                    : "No movements match your search."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell
                    className="text-muted-foreground text-xs"
                    title={m.created_at}
                  >
                    {relative(m.created_at)}
                  </TableCell>
                  <TableCell className="text-brand-charcoal text-xs">
                    {m.product_sku ? (
                      <span className="text-brand-navy font-mono">
                        {m.product_sku}
                      </span>
                    ) : null}
                    {m.product_sku ? " · " : ""}
                    {m.product_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-brand-charcoal/80">
                        {m.from_label ?? "—"}
                      </span>
                      <ArrowRight className="text-muted-foreground h-3 w-3" />
                      <span className="text-brand-charcoal font-medium">
                        {m.to_label ?? "—"}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {Number(m.quantity)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {m.moved_by_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[220px] truncate text-xs">
                    {m.note ?? "—"}
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

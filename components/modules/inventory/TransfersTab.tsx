"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  WAREHOUSE_LOCATIONS,
  transfers as SEED,
  type StockTransfer,
} from "@/lib/inventory-data";
import { users } from "@/lib/mock-data/users";
import { cn } from "@/lib/utils";
import type { WarehouseLocation } from "@/lib/types";

export function TransfersTab() {
  const [list, setList] = useState<StockTransfer[]>(SEED);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<WarehouseLocation>("Main Warehouse");
  const [to, setTo] = useState<WarehouseLocation>("Truck 1");
  const [items, setItems] = useState<number>(4);

  const userById = new Map(users.map((u) => [u.id, u]));

  const create = () => {
    const next: StockTransfer = {
      id: `tr-${Date.now()}`,
      number: `TR-2026-${(SEED.length + list.length - SEED.length + 46).toString().padStart(4, "0")}`,
      from,
      to,
      itemCount: items,
      status: "Draft",
      date: new Date().toISOString().slice(0, 10),
      initiatedById: "u-001",
    };
    setList([next, ...list]);
    setOpen(false);
    toast.success(`${next.number} created`, { description: `${items} items, ${from} → ${to}.` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          <span className="text-brand-charcoal font-semibold">{list.length}</span> transfers across {WAREHOUSE_LOCATIONS.length} locations.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Transfer
        </Button>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Transfer #</TableHead>
              <TableHead className="text-[11px] uppercase">From</TableHead>
              <TableHead className="text-[11px] uppercase">To</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Items</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Date</TableHead>
              <TableHead className="text-[11px] uppercase">Initiated By</TableHead>
              <TableHead className="text-[11px] uppercase">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-brand-navy font-mono text-xs font-semibold">
                  {t.number}
                </TableCell>
                <TableCell className="text-xs">{t.from}</TableCell>
                <TableCell className="text-xs">{t.to}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{t.itemCount}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      t.status === "Received"
                        ? "bg-emerald-50 text-emerald-700"
                        : t.status === "In Transit"
                          ? "bg-brand-gold/15 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {t.status}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs tabular-nums">
                  {format(parseISO(t.date), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-xs">
                  {userById.get(t.initiatedById)?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[280px] truncate text-[11px]">
                  {t.notes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">New Transfer</DialogTitle>
            <DialogDescription>
              Move stock between warehouse and field trucks. The transfer
              starts as a Draft until confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-muted-foreground text-xs">From</Label>
              <Select value={from} onValueChange={(v) => setFrom((v ?? from) as WarehouseLocation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_LOCATIONS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">To</Label>
              <Select value={to} onValueChange={(v) => setTo((v ?? to) as WarehouseLocation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_LOCATIONS.filter((l) => l !== from).map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Item count</Label>
              <Input
                type="number"
                min={1}
                value={items}
                onChange={(e) => setItems(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Create transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

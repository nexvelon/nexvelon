"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { products } from "@/lib/mock-data/products";
import { projects } from "@/lib/mock-data/projects";
import { clients } from "@/lib/mock-data/clients";
import { buildMaterials } from "@/lib/project-data";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  productId: string;
  sku: string;
  description: string;
  qtyAllocated: number;
  dateAllocated: string;
  picked: boolean;
  delivered: boolean;
  status: string;
}

export function AllocationsTab() {
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const rows: Row[] = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const out: Row[] = [];
    for (const project of projects) {
      const allocs = buildMaterials(project);
      for (const a of allocs) {
        const prod = productById.get(a.productId);
        if (!prod) continue;
        out.push({
          id: a.id,
          projectId: project.id,
          projectName: project.name,
          clientName: clientById.get(project.clientId)?.name ?? "—",
          productId: a.productId,
          sku: prod.sku,
          description: prod.name,
          qtyAllocated: a.qtyAllocated,
          dateAllocated: project.startDate,
          picked: a.status === "Picked" || a.status === "Delivered" || a.status === "Installed",
          delivered: a.status === "Delivered" || a.status === "Installed",
          status: a.status,
        });
      }
    }
    return out;
  }, []);

  const filtered =
    projectFilter === "all" ? rows : rows.filter((r) => r.projectId === projectFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v ?? "all")}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Filter by project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} · {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">
          <span className="text-brand-charcoal font-semibold">{filtered.length}</span> allocations
        </span>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Project</TableHead>
              <TableHead className="text-[11px] uppercase">Client</TableHead>
              <TableHead className="text-[11px] uppercase">SKU</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Qty</TableHead>
              <TableHead className="text-[11px] uppercase">Allocated</TableHead>
              <TableHead className="text-[11px] uppercase">Picked</TableHead>
              <TableHead className="text-[11px] uppercase">Delivered</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground py-8 text-center text-xs">
                  No allocations.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-brand-charcoal max-w-[240px] truncate text-xs">
                  {r.projectName}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{r.clientName}</TableCell>
                <TableCell>
                  <div className="text-brand-navy font-mono text-xs font-semibold">
                    {r.sku}
                  </div>
                  <div className="text-muted-foreground max-w-[260px] truncate text-[10px]">
                    {r.description}
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatNumber(r.qtyAllocated)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs tabular-nums">
                  {r.dateAllocated}
                </TableCell>
                <TableCell>
                  <YN value={r.picked} />
                </TableCell>
                <TableCell>
                  <YN value={r.delivered} />
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      r.status === "Installed"
                        ? "bg-emerald-50 text-emerald-700"
                        : r.status === "Delivered"
                          ? "bg-brand-gold/15 text-amber-800"
                          : r.status === "Picked"
                            ? "bg-amber-50 text-amber-800"
                            : r.status === "Reserved"
                              ? "bg-sky-50 text-sky-700"
                              : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {r.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    {!r.picked && (
                      <Button size="xs" variant="outline" onClick={() => toast.success(`Staged ${r.sku}`)}>
                        Pick & Stage
                      </Button>
                    )}
                    {r.picked && !r.delivered && (
                      <Button size="xs" variant="outline" onClick={() => toast.success(`${r.sku} marked delivered`)}>
                        Mark Delivered
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => toast(`${r.sku} returned to stock`)}
                    >
                      Return
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function YN({ value }: { value: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        value ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      )}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

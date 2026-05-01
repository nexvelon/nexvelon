"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import type { TopClientRow } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type SortKey = "name" | "projectCount" | "revenue" | "lastActivity";
type SortDir = "asc" | "desc";

interface Props {
  rows: TopClientRow[];
}

const TYPE_VARIANT: Record<string, string> = {
  Commercial: "bg-brand-navy/10 text-brand-navy",
  Industrial: "bg-amber-100 text-amber-800",
  Residential: "bg-emerald-100 text-emerald-800",
};

export function TopClientsTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "projectCount") cmp = a.projectCount - b.projectCount;
      else if (sortKey === "revenue") cmp = a.revenue - b.revenue;
      else if (sortKey === "lastActivity")
        cmp = a.lastActivity.getTime() - b.lastActivity.getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (key !== sortKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="text-brand-gold h-3 w-3" />
    ) : (
      <ArrowDown className="text-brand-gold h-3 w-3" />
    );
  };

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">
          Top Clients — Revenue YTD
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead
                onClick={() => toggle("name")}
                icon={renderSortIcon("name")}
              >
                Client
              </SortableHead>
              <SortableHead
                onClick={() => toggle("projectCount")}
                icon={renderSortIcon("projectCount")}
                align="right"
              >
                Projects
              </SortableHead>
              <SortableHead
                onClick={() => toggle("revenue")}
                icon={renderSortIcon("revenue")}
                align="right"
              >
                Revenue
              </SortableHead>
              <SortableHead
                onClick={() => toggle("lastActivity")}
                icon={renderSortIcon("lastActivity")}
              >
                Last activity
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="py-3">
                  <div className="text-brand-charcoal font-medium">{r.name}</div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1 border-0 text-[10px] font-medium",
                      TYPE_VARIANT[r.type] ?? "bg-muted"
                    )}
                  >
                    {r.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-brand-charcoal text-right tabular-nums">
                  {r.projectCount}
                </TableCell>
                <TableCell className="text-brand-navy text-right font-semibold tabular-nums">
                  {formatCurrency(r.revenue)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(r.lastActivity, "MMM d, yyyy")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SortableHead({
  children,
  onClick,
  icon,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <TableHead
      className={cn(
        "select-none",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "hover:text-brand-navy text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors",
          align === "right" && "flex-row-reverse"
        )}
      >
        <span>{children}</span>
        {icon}
      </button>
    </TableHead>
  );
}

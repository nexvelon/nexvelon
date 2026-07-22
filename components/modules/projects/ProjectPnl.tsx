"use client";

// FIN-8 — the per-project profit & loss statement on the project page. Laid out
// like an accountant's P&L: revenue, the two canonical direct costs, gross
// profit + margin, then a memo block of context (contract, deposits, holdback,
// AR/AP, completion) that is NOT part of the gross-profit math. Cost / GP /
// margin dash for a financials:view-only caller (the action redacts them).

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getProjectPnlAction,
  exportProjectPnlCsvAction,
} from "@/app/(app)/financials/actions";
import type { ProjectPnl as ProjectPnlData } from "@/lib/api/project-pnl";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

function money(v: number | null): string {
  return v == null ? "—" : formatCurrency(v);
}
function negMoney(v: number | null): string {
  return v == null ? "—" : `(${formatCurrency(v)})`;
}

export function ProjectPnl({ projectId }: { projectId: string }) {
  const [pnl, setPnl] = useState<ProjectPnlData | null>(null);
  const [canSeeCost, setCanSeeCost] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    getProjectPnlAction(projectId).then((res) => {
      if (!active) return;
      setLoaded(true);
      if (res.ok && res.data) {
        setPnl(res.data.pnl);
        setCanSeeCost(res.data.canSeeCost);
      }
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportProjectPnlCsvAction(projectId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("P&L exported");
    } finally {
      setExporting(false);
    }
  };

  if (!loaded || !pnl) return null;

  const negativeGp = pnl.gross_profit != null && pnl.gross_profit < 0;

  return (
    <Card className="bg-card space-y-4 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-lg">Profit &amp; loss</h3>
        {canSeeCost && (
          <Button type="button" size="xs" variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Export P&amp;L (CSV)
          </Button>
        )}
      </div>

      {/* The statement */}
      <div className="space-y-1.5 text-sm">
        <StatementRow label="Revenue (earned)" value={money(pnl.revenue.earned)} strong />
        <StatementRow label="Less: Materials (billed)" value={negMoney(pnl.cost.materials_billed)} muted />
        <StatementRow label="Less: Labour" value={negMoney(pnl.cost.labour)} muted />
        <div className="border-t border-[var(--border)] pt-1.5">
          <StatementRow
            label="Gross profit"
            value={money(pnl.gross_profit)}
            strong
            tone={negativeGp ? "text-red-600" : "text-brand-navy"}
          />
          <StatementRow
            label="Gross margin"
            value={pnl.gross_margin_pct == null ? "—" : formatPercent(pnl.gross_margin_pct / 100)}
            muted
            tone={negativeGp ? "text-red-600" : undefined}
          />
        </div>
      </div>

      {!canSeeCost && (
        <p className="text-muted-foreground text-[11px]">
          Cost, gross profit and margin need the financials edit permission.
        </p>
      )}

      {/* Memo block — context, not part of the GP math */}
      <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
        <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
          Memo — context, not in gross profit
        </p>
        <MemoRow
          label="Contract (quoted)"
          value={money(pnl.memo.contract_quoted)}
          extra={
            pnl.memo.variance_vs_quoted == null
              ? undefined
              : `cost vs plan ${pnl.memo.variance_vs_quoted >= 0 ? "+" : ""}${formatCurrency(pnl.memo.variance_vs_quoted)}`
          }
        />
        <MemoRow label="Open PO commitment" value={money(pnl.memo.po_committed_open)} />
        <MemoRow
          label="Inventory drawn (not in GP)"
          value={money(pnl.memo.inventory_drawn_memo)}
        />
        <MemoRow label="Deposits held" value={money(pnl.memo.deposits_held)} />
        <MemoRow label="Holdback retained" value={money(pnl.memo.holdback_retained)} />
        <MemoRow
          label="AR / AP balance"
          value={`${money(pnl.memo.ar_balance)} / ${money(pnl.memo.ap_balance)}`}
        />
        <MemoRow
          label="Billed to date"
          value={
            pnl.memo.billed_pct == null
              ? "—"
              : `${formatPercent(pnl.memo.billed_pct)} of contract`
          }
        />
      </div>

      <p className="text-muted-foreground text-[11px]">
        Management P&amp;L (bookkeeping aid) — not a statutory financial
        statement. Cost basis: vendor-billed materials + labour; inventory drawn
        is shown for context only and is not added into cost, to avoid
        double-counting parts that were both received into stock and billed.
      </p>
    </Card>
  );
}

function StatementRow({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn(muted ? "text-muted-foreground text-xs" : "text-brand-charcoal text-sm")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-sm font-semibold" : "text-xs",
          tone ?? "text-brand-charcoal"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MemoRow({
  label,
  value,
  extra,
}: {
  label: string;
  value: string;
  extra?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-brand-charcoal tabular-nums">
        {value}
        {extra && <span className="text-muted-foreground ml-1">· {extra}</span>}
      </span>
    </div>
  );
}

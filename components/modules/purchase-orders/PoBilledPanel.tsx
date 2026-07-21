"use client";

// FIN-5 — "ordered $X, billed $Y, remaining to bill $Z" on a PO. Answers the
// question a PO alone can't: how much of what we committed has the vendor
// actually invoiced us for. Void bills are already excluded server-side.

import { useEffect, useState } from "react";
import { listBillsForPurchaseOrderAction } from "@/app/(app)/financials/actions";
import type { BillListRow } from "@/lib/api/vendor-bills";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PoBilledPanel({
  purchaseOrderId,
  orderedTotal,
}: {
  purchaseOrderId: string;
  orderedTotal: number;
}) {
  const [bills, setBills] = useState<BillListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    listBillsForPurchaseOrderAction(purchaseOrderId).then((res) => {
      if (!active) return;
      // A financials:view denial just leaves the panel empty — it's supplementary.
      if (res.ok) setBills(res.data);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [purchaseOrderId]);

  if (!loaded || bills.length === 0) return null;

  // Bill totals here (tax included) — this compares against the PO's own
  // ordered total, which is also tax-exclusive line cost... so use subtotal to
  // keep the comparison like-for-like.
  const billedSubtotal =
    Math.round(bills.reduce((s, b) => s + Number(b.subtotal), 0) * 100) / 100;
  const remaining = Math.round((orderedTotal - billedSubtotal) * 100) / 100;

  return (
    <div
      className="space-y-2 rounded-md border p-3"
      style={{ borderColor: "var(--brand-border)" }}
    >
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        Vendor billing
      </p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Figure label="Ordered" value={orderedTotal} />
        <Figure label="Billed" value={billedSubtotal} />
        <Figure
          label="Left to bill"
          value={remaining}
          tone={remaining < 0 ? "text-red-600" : undefined}
        />
      </div>
      <ul className="space-y-1">
        {bills.map((b) => (
          <li
            key={b.id}
            className="text-muted-foreground flex items-center justify-between text-[11px]"
          >
            <span className="truncate">
              <span className="font-mono">{b.bill_number}</span> · {b.bill_date}
              {b.status === "void" && " · void"}
            </span>
            <span className="tabular-nums">
              {formatCurrency(Number(b.subtotal))}
            </span>
          </li>
        ))}
      </ul>
      {remaining < 0 && (
        <p className="text-[11px] text-red-600">
          Billed more than ordered — worth checking against the PO.
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase">{label}</p>
      <p className={cn("tabular-nums font-medium", tone ?? "text-brand-charcoal")}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

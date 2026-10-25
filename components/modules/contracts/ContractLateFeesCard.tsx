"use client";

// RECUR-2 — late fees on a contract (2f). The daily job only PROPOSES; this card
// is where a person approves (→ a separate late-fee invoice is issued) or waives
// (reason required). Decided rows stay visible as history.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { approveLateFeeAction, waiveLateFeeAction } from "@/app/(app)/contracts/actions";
import type { LateFeeRow } from "@/lib/api/contract-adjustments";

export function ContractLateFeesCard({
  fees,
  canManage,
  termsText,
}: {
  fees: LateFeeRow[];
  canManage: boolean;
  termsText: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [waiving, setWaiving] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const approve = (id: string) =>
    start(async () => {
      const res = await approveLateFeeAction(id);
      if (res.ok) {
        toast.success("Late fee charged", { description: "Issued on its own invoice." });
        router.refresh();
      } else toast.error(res.error);
    });

  const waive = (id: string) =>
    start(async () => {
      const res = await waiveLateFeeAction(id, reason);
      if (res.ok) {
        toast.success("Late fee waived");
        setWaiving(null);
        setReason("");
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <Card className="bg-card p-4 shadow-sm">
      <h2 className="text-brand-navy mb-1 font-serif text-lg">Late fees</h2>
      <p className="text-muted-foreground mb-3 text-xs">{termsText}</p>
      {fees.length === 0 ? (
        <p className="text-muted-foreground text-sm">None.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-[11px] uppercase">
              <th className="py-2">Overdue invoice</th>
              <th className="py-2">Days late</th>
              <th className="py-2 text-right">Fee</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id} className="border-b align-top last:border-0">
                <td className="py-2">
                  <Link href={`/invoices/${f.source_invoice_id}`} className="text-brand-navy underline">
                    {f.source_invoice_number ?? "Invoice"}
                  </Link>
                  <span className="text-muted-foreground block text-[11px]">
                    on {formatCurrency(Number(f.basis_balance))} outstanding · month {f.block_index}
                  </span>
                </td>
                <td className="py-2 tabular-nums">{f.days_overdue}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(Number(f.amount))}</td>
                <td className="py-2 text-xs">
                  {f.status === "approved" && f.fee_invoice_id ? (
                    <Link href={`/invoices/${f.fee_invoice_id}`} className="underline">
                      Charged {f.fee_invoice_number ?? ""}
                    </Link>
                  ) : f.status === "waived" ? (
                    <span title={f.waive_reason ?? undefined}>Waived — {f.waive_reason}</span>
                  ) : (
                    <span className="font-medium text-amber-800">Awaiting approval</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {f.status === "proposed" && canManage && waiving !== f.id && (
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => approve(f.id)} disabled={pending}>
                        Charge
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setWaiving(f.id)} disabled={pending}>
                        Waive
                      </Button>
                    </div>
                  )}
                  {f.status === "proposed" && !canManage && (
                    <span className="text-muted-foreground text-[11px]">Needs financials:edit to decide</span>
                  )}
                  {waiving === f.id && (
                    <div className="flex items-center justify-end gap-1.5">
                      <Input
                        className="h-8 w-40 text-xs"
                        placeholder="Reason (required)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <Button size="sm" onClick={() => waive(f.id)} disabled={pending || !reason.trim()}>
                        Waive
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setWaiving(null)} disabled={pending}>
                        ✕
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

"use client";

// INV-9-3 — the pickup slips that issued this product. Read-only: reference,
// recipient, date, a derived signed badge (signature present), a "View PDF" link
// (signed-URL download — never browser supabase-js), and the slip's line count.
// Signed state and PDF availability are DERIVED server-side (is_signed /
// has_pdf), not status columns.

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ClipboardList, FileText } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  listPickupSlipsForProductAction,
  getPickupSlipPdfUrlAction,
} from "@/app/(app)/inventory/actions";
import type { PickupSlipForProduct } from "@/lib/api/pickup-slips";

const RECIPIENT_LABEL: Record<string, string> = {
  truck: "Truck",
  tech: "Technician",
  sub: "Subcontractor",
};

export function PickupSlipsPanel({ productId }: { productId: string }) {
  const [slips, setSlips] = useState<PickupSlipForProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listPickupSlipsForProductAction(productId).then((r) => {
      if (!active) return;
      if (r.ok) setSlips(r.data);
      setLoading(false);
    });
    return () => { active = false; };
  }, [productId]);

  const openPdf = async (slipId: string) => {
    setOpening(slipId);
    const res = await getPickupSlipPdfUrlAction(slipId);
    setOpening(null);
    if (!res.ok) { toast.error(res.error); return; }
    if (!res.data.url) { toast.error("This slip has no rendered PDF yet."); return; }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <h2 className="text-brand-navy mb-2 text-sm font-semibold tracking-wide uppercase">
        Pickup slips{" "}
        <span className="text-muted-foreground font-normal normal-case">
          ({slips.length})
        </span>
      </h2>
      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        {loading ? (
          <p className="text-muted-foreground p-5 text-xs">Loading…</p>
        ) : slips.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 p-5 text-xs">
            <ClipboardList className="h-4 w-4" />
            No pickup slips for this product yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b text-left" style={{ borderColor: "var(--brand-border)" }}>
                  <th className="px-4 py-2 font-medium uppercase">Slip</th>
                  <th className="px-4 py-2 font-medium uppercase">Recipient</th>
                  <th className="px-4 py-2 font-medium uppercase">Date</th>
                  <th className="px-4 py-2 text-center font-medium uppercase">Items</th>
                  <th className="px-4 py-2 font-medium uppercase">Signed</th>
                  <th className="px-4 py-2 text-right font-medium uppercase">PDF</th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => (
                  <tr key={s.id} className="border-b last:border-0" style={{ borderColor: "var(--brand-border)" }}>
                    <td className="px-4 py-2 font-mono">{s.reference}</td>
                    <td className="px-4 py-2">
                      <span className="text-muted-foreground">{RECIPIENT_LABEL[s.recipient_type] ?? s.recipient_type}</span>
                      {" · "}
                      <span style={{ color: "var(--brand-primary)" }}>{s.recipient_label}</span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {s.created_at ? format(parseISO(s.created_at), "d MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">{s.line_count}</td>
                    <td className="px-4 py-2">
                      {s.is_signed ? (
                        <span className="inline-flex items-center gap-1 text-[var(--brand-status-green)]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Signed
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Unsigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.has_pdf ? (
                        <button
                          type="button"
                          onClick={() => openPdf(s.id)}
                          disabled={opening === s.id}
                          className="text-brand-navy inline-flex items-center gap-1 font-medium hover:underline disabled:opacity-60"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {opening === s.id ? "Opening…" : "View PDF"}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

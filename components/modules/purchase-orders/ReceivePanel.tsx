"use client";

// PO-4 — receive panel shown inside the read-only PO detail (issued /
// partially_received). Lists each receivable line (ordered / received /
// remaining + a "receive now" input clamped 0..remaining), serial inputs for
// serialized products, and an optional receive-to-location. Submit calls
// receivePurchaseOrderAction once; the button disables while in flight so a
// receipt can't be double-submitted.

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { receivePurchaseOrderAction } from "@/app/(app)/purchase-orders/actions";
import type {
  PurchaseOrderDetail,
  PurchaseOrderLineWithProduct,
} from "@/lib/api/purchase-orders";

interface Props {
  detail: PurchaseOrderDetail;
  locationOptions: string[];
  onCancel: () => void;
  onDone: () => void;
}

interface LineState {
  receiveNow: number;
  serials: string[];
}

function remainingOf(l: PurchaseOrderLineWithProduct): number {
  return Math.max(0, l.quantity - l.received_qty);
}

export function ReceivePanel({ detail, locationOptions, onCancel, onDone }: Props) {
  const { lines } = detail;
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [state, setState] = useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const l of lines) {
      if (l.product_id) {
        const rem = remainingOf(l);
        init[l.id] = { receiveNow: rem, serials: [] };
      }
    }
    return init;
  });

  const setReceiveNow = (l: PurchaseOrderLineWithProduct, raw: number) => {
    const rem = remainingOf(l);
    const qty = Math.max(0, Math.min(rem, Math.floor(raw) || 0));
    setState((s) => {
      const prev = s[l.id] ?? { receiveNow: 0, serials: [] };
      // Resize the serial array to match qty (serialized lines).
      const serials = prev.serials.slice(0, qty);
      while (serials.length < qty) serials.push("");
      return { ...s, [l.id]: { receiveNow: qty, serials } };
    });
  };

  const setSerial = (lineId: string, idx: number, value: string) =>
    setState((s) => {
      const prev = s[lineId];
      if (!prev) return s;
      const serials = [...prev.serials];
      serials[idx] = value;
      return { ...s, [lineId]: { ...prev, serials } };
    });

  const handleSubmit = async () => {
    const receipts = lines
      .filter((l) => l.product_id && (state[l.id]?.receiveNow ?? 0) > 0)
      .map((l) => {
        const st = state[l.id];
        const isSerialized = l.product_tracking_mode === "serialized";
        return {
          lineId: l.id,
          quantity: st.receiveNow,
          serials: isSerialized ? st.serials : undefined,
          location: location || null,
        };
      });

    if (receipts.length === 0) {
      toast.error("Enter a quantity to receive on at least one line.");
      return;
    }
    // Client-side serial guard (server re-validates).
    for (const r of receipts) {
      if (r.serials) {
        const filled = r.serials.filter((x) => x.trim() !== "");
        if (filled.length !== r.quantity) {
          toast.error("Serialized lines need a serial number for every unit received.");
          return;
        }
      }
    }

    setSubmitting(true);
    const res = await receivePurchaseOrderAction(detail.header.id, receipts);
    setSubmitting(false);
    if (res.ok) {
      toast.success(`Received — status: ${res.data.status.replace("_", " ")}`);
      onDone();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">
        Receive stock
      </div>

      {locationOptions.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Receive to location (optional)</Label>
          <Select value={location} onValueChange={(v) => setLocation(v ?? "")}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Default location…" />
            </SelectTrigger>
            <SelectContent>
              {locationOptions.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ul className="space-y-2">
        {lines.map((l) => {
          const rem = remainingOf(l);
          const receivable = !!l.product_id;
          const st = state[l.id];
          const isSerialized = l.product_tracking_mode === "serialized";
          return (
            <li
              key={l.id}
              className="rounded-md border border-[var(--border)] bg-background p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {l.product_sku ? (
                    <span className="text-muted-foreground">{l.product_sku} · </span>
                  ) : null}
                  {l.product_name ?? l.description ?? "—"}
                  {!receivable && (
                    <span className="text-muted-foreground ml-1">
                      (free-text — not receivable)
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {l.received_qty}/{l.quantity} · {formatCurrency(Number(l.unit_cost))}
                </span>
              </div>

              {receivable && rem > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Label className="text-muted-foreground text-[10px]">
                    Receive now (max {rem})
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={rem}
                    step="1"
                    value={st?.receiveNow ?? 0}
                    onChange={(e) => setReceiveNow(l, parseInt(e.target.value, 10))}
                    className="h-7 w-20 text-right text-xs"
                    aria-label="Receive quantity"
                  />
                </div>
              )}
              {receivable && rem === 0 && (
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Fully received.
                </p>
              )}

              {receivable && isSerialized && (st?.receiveNow ?? 0) > 0 && (
                <div className="mt-1.5 space-y-1">
                  <Label className="text-muted-foreground text-[10px]">
                    Serial numbers ({st.receiveNow})
                  </Label>
                  {st.serials.map((sv, i) => (
                    <Input
                      key={i}
                      value={sv}
                      onChange={(e) => setSerial(l.id, i, e.target.value)}
                      placeholder={`Serial #${i + 1}`}
                      className="h-7 text-xs"
                      aria-label={`Serial number ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Back
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Receiving…" : "Receive"}
        </Button>
      </div>
    </div>
  );
}

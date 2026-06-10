"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newId } from "@/lib/quote-helpers";
import {
  monitoringTotals,
  type MonitoringScheduleInstance,
  type MonitoringService,
} from "@/lib/quote-schedules";

// GF-1 — editor for a Guardian "monitoring" schedule. Mirrors the
// AssuranceCardEditor pattern: local helpers mutate the array/fields and emit a
// partial via onChange, which SchedulesCard writes back with patchAt. Shows live
// Monthly + Annual (×12) totals. NEVER collects bank/card numbers.
interface Props {
  services: MonitoringService[];
  setupLabel?: string;
  setupAmount?: number;
  onChange: (patch: Partial<MonitoringScheduleInstance>) => void;
  disabled?: boolean;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function newService(): MonitoringService {
  return { id: newId("mon"), label: "", detail: "", monthlyFee: 0 };
}

export function MonitoringEditor({
  services,
  setupLabel,
  setupAmount,
  onChange,
  disabled,
}: Props) {
  const patchService = (idx: number, patch: Partial<MonitoringService>) => {
    onChange({
      services: services.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  };

  const move = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= services.length) return;
    const next = [...services];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ services: next });
  };

  const remove = (idx: number) => {
    onChange({ services: services.filter((_, i) => i !== idx) });
  };

  const append = () => onChange({ services: [...services, newService()] });

  const { monthly, annual } = monitoringTotals({ services, setupAmount });

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px]">
        Recurring monitoring services. Each carries a monthly fee; the page
        shows the monthly total and the annual total (×12, billed in advance).
      </p>

      <div className="space-y-2">
        {services.map((svc, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === services.length - 1;
          return (
            <div
              key={svc.id}
              className="bg-background space-y-1.5 rounded-md border border-[var(--border)] p-2"
            >
              <div className="flex items-start gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isFirst}
                    onClick={() => move(idx, "up")}
                    aria-label="Move service up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isLast}
                    onClick={() => move(idx, "down")}
                    aria-label="Move service down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <Input
                  value={svc.label}
                  onChange={(e) => patchService(idx, { label: e.target.value })}
                  disabled={disabled}
                  placeholder="Digital Remote Monitoring"
                  className="h-7 flex-1 text-sm"
                  aria-label="Service label"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={Number.isFinite(svc.monthlyFee) ? svc.monthlyFee : 0}
                  onChange={(e) =>
                    patchService(idx, {
                      monthlyFee: Math.max(
                        0,
                        Number.parseFloat(e.target.value) || 0
                      ),
                    })
                  }
                  disabled={disabled}
                  placeholder="0.00"
                  className="h-7 w-24 text-right text-sm"
                  aria-label="Monthly fee"
                />

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7 w-7 p-0"
                  disabled={disabled}
                  onClick={() => remove(idx)}
                  aria-label="Delete service"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Input
                value={svc.detail ?? ""}
                onChange={(e) => patchService(idx, { detail: e.target.value })}
                disabled={disabled}
                placeholder="Detail (optional) — e.g. 90-second check-in"
                className="h-7 text-xs"
                aria-label="Service detail"
              />
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={append}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add service
      </Button>

      {/* Optional one-time setup line */}
      <div className="grid grid-cols-[1fr_6rem] gap-2 pt-1">
        <div className="space-y-1">
          <Label className="text-[11px]">Setup label (optional)</Label>
          <Input
            value={setupLabel ?? ""}
            onChange={(e) => onChange({ setupLabel: e.target.value })}
            disabled={disabled}
            placeholder="One-time setup / activation"
            className="h-7 text-xs"
            aria-label="Setup label"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Setup amount</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={Number.isFinite(setupAmount ?? 0) ? (setupAmount ?? 0) : 0}
            onChange={(e) =>
              onChange({
                setupAmount: Math.max(
                  0,
                  Number.parseFloat(e.target.value) || 0
                ),
              })
            }
            disabled={disabled}
            placeholder="0.00"
            className="h-7 text-right text-xs"
            aria-label="Setup amount"
          />
        </div>
      </div>

      {/* Live totals */}
      <div className="bg-muted/40 mt-1 flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Monthly total{" "}
          <span className="text-brand-navy font-medium">{money(monthly)}</span>
        </span>
        <span className="text-muted-foreground">
          Annual (billed in advance){" "}
          <span className="text-brand-navy font-medium">{money(annual)}</span>
        </span>
      </div>
    </div>
  );
}

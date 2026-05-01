"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { QuoteStatus, User } from "@/lib/types";

const STATUS_OPTIONS: ("All" | QuoteStatus)[] = [
  "All",
  "Draft",
  "Sent",
  "Approved",
  "Rejected",
  "Expired",
  "Converted",
];

export interface QuoteFilterValue {
  status: "All" | QuoteStatus;
  search: string;
  ownerId: string;
  minValue: string;
  maxValue: string;
  fromDate: string;
  toDate: string;
}

export const EMPTY_FILTERS: QuoteFilterValue = {
  status: "All",
  search: "",
  ownerId: "all",
  minValue: "",
  maxValue: "",
  fromDate: "",
  toDate: "",
};

interface Props {
  value: QuoteFilterValue;
  onChange: (next: QuoteFilterValue) => void;
  owners: User[];
  counts: Record<"All" | QuoteStatus, number>;
}

export function QuoteFilters({ value, onChange, owners, counts }: Props) {
  const update = <K extends keyof QuoteFilterValue>(
    key: K,
    v: QuoteFilterValue[K]
  ) => onChange({ ...value, [key]: v });

  const isFiltering =
    value.search !== "" ||
    value.ownerId !== "all" ||
    value.minValue !== "" ||
    value.maxValue !== "" ||
    value.fromDate !== "" ||
    value.toDate !== "" ||
    value.status !== "All";

  return (
    <div className="bg-card rounded-lg border border-[var(--border)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_OPTIONS.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => update("status", s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              value.status === s
                ? "bg-brand-navy text-white"
                : "bg-muted text-brand-charcoal/70 hover:bg-brand-gold/10 hover:text-brand-charcoal"
            )}
          >
            {s}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                value.status === s
                  ? "bg-white/20 text-white"
                  : "bg-white text-brand-charcoal/60"
              )}
            >
              {counts[s] ?? 0}
            </span>
          </button>
        ))}

        {isFiltering && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-muted-foreground hover:text-brand-charcoal ml-auto inline-flex items-center gap-1 text-xs"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="relative md:col-span-4">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search quote # or client…"
            value={value.search}
            onChange={(e) => update("search", e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="md:col-span-3">
          <Select
            value={value.ownerId}
            onValueChange={(v) => update("ownerId", v ?? "all")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Assigned to" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sales reps</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Input
            inputMode="numeric"
            placeholder="Min $"
            value={value.minValue}
            onChange={(e) =>
              update("minValue", e.target.value.replace(/[^0-9.]/g, ""))
            }
          />
        </div>
        <div className="md:col-span-2">
          <Input
            inputMode="numeric"
            placeholder="Max $"
            value={value.maxValue}
            onChange={(e) =>
              update("maxValue", e.target.value.replace(/[^0-9.]/g, ""))
            }
          />
        </div>

        <div className="md:col-span-1 flex md:justify-end">
          <span className="text-muted-foreground self-center text-[11px]">
            Created
          </span>
        </div>

        <div className="md:col-span-3">
          <label className="text-muted-foreground mb-1 block text-[11px]">
            From
          </label>
          <Input
            type="date"
            value={value.fromDate}
            onChange={(e) => update("fromDate", e.target.value)}
          />
        </div>

        <div className="md:col-span-3">
          <label className="text-muted-foreground mb-1 block text-[11px]">
            To
          </label>
          <Input
            type="date"
            value={value.toDate}
            onChange={(e) => update("toDate", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

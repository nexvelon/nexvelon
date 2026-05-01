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
import type {
  Client,
  ProjectStatus,
  SystemType,
  User,
} from "@/lib/types";

const STATUS_OPTIONS: ("All" | ProjectStatus)[] = [
  "All",
  "Planning",
  "Scheduled",
  "In Progress",
  "On Hold",
  "At Risk",
  "Commissioning",
  "Completed",
  "Closed",
];

const SYSTEM_OPTIONS: ("All" | SystemType | "Mixed")[] = [
  "All",
  "Access Control",
  "CCTV",
  "Intrusion",
  "Intercom",
  "Fire Monitoring",
  "Mixed",
];

export interface ProjectFilterValue {
  status: "All" | ProjectStatus;
  search: string;
  clientId: string;
  pmId: string;
  systemType: "All" | SystemType | "Mixed";
  fromDate: string;
  toDate: string;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilterValue = {
  status: "All",
  search: "",
  clientId: "all",
  pmId: "all",
  systemType: "All",
  fromDate: "",
  toDate: "",
};

interface Props {
  value: ProjectFilterValue;
  onChange: (next: ProjectFilterValue) => void;
  clients: Client[];
  pms: User[];
  counts: Record<"All" | ProjectStatus, number>;
}

export function ProjectFilters({ value, onChange, clients, pms, counts }: Props) {
  const update = <K extends keyof ProjectFilterValue>(
    k: K,
    v: ProjectFilterValue[K]
  ) => onChange({ ...value, [k]: v });

  const dirty =
    value.status !== "All" ||
    value.search !== "" ||
    value.clientId !== "all" ||
    value.pmId !== "all" ||
    value.systemType !== "All" ||
    value.fromDate !== "" ||
    value.toDate !== "";

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
        {dirty && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_PROJECT_FILTERS)}
            className="text-muted-foreground hover:text-brand-charcoal ml-auto inline-flex items-center gap-1 text-xs"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="relative md:col-span-4">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search project # or name…"
            value={value.search}
            onChange={(e) => update("search", e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="md:col-span-3">
          <Select
            value={value.clientId}
            onValueChange={(v) => update("clientId", v ?? "all")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Select
            value={value.pmId}
            onValueChange={(v) => update("pmId", v ?? "all")}
          >
            <SelectTrigger>
              <SelectValue placeholder="PM" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All PMs</SelectItem>
              {pms.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-3">
          <Select
            value={value.systemType}
            onValueChange={(v) =>
              update("systemType", (v ?? "All") as ProjectFilterValue["systemType"])
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="System type" />
            </SelectTrigger>
            <SelectContent>
              {SYSTEM_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-3">
          <label className="text-muted-foreground mb-1 block text-[11px]">
            Start from
          </label>
          <Input
            type="date"
            value={value.fromDate}
            onChange={(e) => update("fromDate", e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <label className="text-muted-foreground mb-1 block text-[11px]">
            Start to
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

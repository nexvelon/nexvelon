"use client";

// PROJ-1 — lean real-data project detail: header (P-number, title, client/site,
// opco, status) + Cost Centers (add / rename / delete) + linked Quotes. The
// richer Tasks/Schedule/Materials/etc. tabs are future domain — not wired here.

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  addCostCenterAction,
  renameCostCenterAction,
  deleteCostCenterAction,
} from "@/app/(app)/projects/actions";
import type { ProjectDetail } from "@/lib/api/projects";
import type { DbProjectCostCenter } from "@/lib/types/database";

const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated",
  guardian: "Guardian",
};

function roleLabel(role: string): string {
  if (role === "original") return "Original";
  if (role === "change_order") return "Change order";
  return role;
}

export function ProjectDetailView({ detail }: { detail: ProjectDetail }) {
  const { project, client_name, site_name, quotes } = detail;
  const { role } = useRole();
  const canEdit = hasPermission(role, "quotes", "convert");

  const [costCenters, setCostCenters] = useState<DbProjectCostCenter[]>(
    detail.costCenters
  );
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, startTransition] = useTransition();

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await addCostCenterAction(project.id, name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCostCenters((cs) => [...cs, res.data]);
      setNewName("");
      toast.success(`Added ${res.data.cc_number}`);
    });
  };

  const handleRename = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await renameCostCenterAction(id, project.id, name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCostCenters((cs) =>
        cs.map((c) => (c.id === id ? { ...c, name: res.data.name } : c))
      );
      setEditingId(null);
      toast.success("Cost center renamed");
    });
  };

  const handleDelete = (cc: DbProjectCostCenter) => {
    if (!window.confirm(`Delete cost center "${cc.name}" (${cc.cc_number})?`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteCostCenterAction(cc.id, project.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCostCenters((cs) => cs.filter((c) => c.id !== cc.id));
      toast.success("Cost center deleted");
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card
        className="p-5 shadow-sm"
        style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-brand-navy font-mono text-xs font-semibold tracking-wider">
              {project.project_number}
            </p>
            <h1 className="font-serif text-2xl font-semibold text-brand-primary">
              {project.title || "Untitled project"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {client_name ?? "—"}
              {site_name ? ` · ${site_name}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="bg-muted rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
              {OPCO_LABEL[project.opco] ?? project.opco}
            </span>
            <span className="rounded-full bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--brand-status-green)]">
              {project.status}
            </span>
          </div>
        </div>
      </Card>

      {/* Cost Centers */}
      <div>
        <p className="nx-eyebrow-soft mb-2">
          Cost Centers{" "}
          <span className="text-muted-foreground font-normal normal-case">
            · {costCenters.length}
          </span>
        </p>
        <Card className="bg-card p-0 shadow-sm">
          {costCenters.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">
              No cost centers yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {costCenters.map((cc) => (
                <li
                  key={cc.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="text-brand-navy w-44 shrink-0 font-mono text-xs">
                    {cc.cc_number}
                  </span>
                  {editingId === cc.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 flex-1 text-xs"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(cc.id)}
                        disabled={pending}
                        className="text-brand-charcoal hover:text-brand-navy"
                        aria-label="Save"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-muted-foreground hover:text-brand-charcoal"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-brand-charcoal flex-1 truncate">
                        {cc.name}
                      </span>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(cc.id);
                              setEditName(cc.name);
                            }}
                            className="text-muted-foreground hover:text-brand-charcoal"
                            aria-label="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cc)}
                            disabled={pending}
                            className="text-muted-foreground hover:text-red-600"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="New cost center name…"
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                disabled={pending || !newName.trim()}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Linked Quotes */}
      <div>
        <p className="nx-eyebrow-soft mb-2">
          Quotes{" "}
          <span className="text-muted-foreground font-normal normal-case">
            · {quotes.length}
          </span>
        </p>
        <Card className="bg-card p-0 shadow-sm">
          {quotes.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">
              No linked quotes.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {quotes.map((q) => (
                <li
                  key={q.quote_id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <Link
                    href={`/quotes/${q.quote_id}`}
                    className="text-brand-navy font-mono text-xs font-semibold hover:underline"
                  >
                    {q.number ?? q.quote_id}
                  </Link>
                  <span className="text-muted-foreground ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {roleLabel(q.role)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

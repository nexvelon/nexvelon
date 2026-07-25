"use client";

// PROJ2-17 — Settings → Cost codes. The org-level cost taxonomy (add / edit /
// activate-deactivate / delete). Mirrors TechsPane's UX. Mutations gate
// financials:edit server-side. Delete is blocked once a code is used by line
// items (the message says Deactivate instead — the same
// preserve-history-over-destroy rule as techs).
//
// PLACEMENT: this lives in Settings alongside Techs / Categories / Labour — the
// established home for org-level reference lists — rather than the Financials
// module, which is transaction-facing. Flagged in the PR.

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  listCostCodesAction,
  createCostCodeAction,
  updateCostCodeAction,
  setCostCodeActiveAction,
  deleteCostCodeAction,
} from "@/app/(app)/projects/cost-analysis-actions";
import type { DbCostCode, DbCostCategory } from "@/lib/types/database";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";

const CATEGORIES: DbCostCategory[] = ["labour", "materials", "subcontractor", "equipment", "other"];
const CATEGORY_LABEL: Record<DbCostCategory, string> = {
  labour: "Labour", materials: "Materials", subcontractor: "Subcontractor", equipment: "Equipment", other: "Other",
};

export function CostCodesPane() {
  const { role } = useRole();
  const canEdit = hasPermission(role, "financials", "edit");
  const [rows, setRows] = useState<DbCostCode[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState<DbCostCategory>("other");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCat, setEditCat] = useState<DbCostCategory>("other");
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listCostCodesAction({ activeOnly: false });
    if (res.ok) setRows(res.data);
    else toast.error(res.error);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!newCode.trim() || !newName.trim()) return;
    start(async () => {
      const res = await createCostCodeAction({ code: newCode.trim(), name: newName.trim(), category: newCat });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Added "${newCode.trim().toUpperCase()}"`);
      setNewCode(""); setNewName(""); setNewCat("other");
      load();
    });
  };

  const beginEdit = (r: DbCostCode) => { setEditingId(r.id); setEditName(r.name); setEditCat(r.category); };
  const saveEdit = (r: DbCostCode) => {
    if (!editName.trim()) { toast.error("Name is required."); return; }
    start(async () => {
      const res = await updateCostCodeAction(r.id, { name: editName.trim(), category: editCat });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Saved"); setEditingId(null); load();
    });
  };
  const toggle = (r: DbCostCode) => start(async () => {
    const res = await setCostCodeActiveAction(r.id, !r.is_active);
    if (!res.ok) { toast.error(res.error); return; }
    load();
  });
  const del = (r: DbCostCode) => start(async () => {
    const res = await deleteCostCodeAction(r.id);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`Deleted "${r.code}"`); load();
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Cost codes</h2>
        <p className="text-muted-foreground text-sm">
          The taxonomy for categorising job line items and reading estimate-vs-actual by code.
          Deactivate a code that&rsquo;s in use rather than deleting it.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Code (e.g. RENT)" className="max-w-[10rem]" disabled={pending} />
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="max-w-xs" disabled={pending} />
          <Select value={newCat} onValueChange={(v) => setNewCat((v ?? "other") as DbCostCategory)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={pending || !newCode.trim() || !newName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24 text-[11px] uppercase">Code</TableHead>
              <TableHead className="text-[11px] uppercase">Name</TableHead>
              <TableHead className="w-40 text-[11px] uppercase">Category</TableHead>
              <TableHead className="w-24 text-[11px] uppercase">Status</TableHead>
              {canEdit && <TableHead className="w-40 text-right text-[11px] uppercase">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">No cost codes.</TableCell></TableRow>
            )}
            {!loading && rows.map((r) => {
              const editing = editingId === r.id;
              return (
                <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                  <TableCell className="font-mono text-sm">{r.code}</TableCell>
                  <TableCell className="text-sm">
                    {editing ? (
                      <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 max-w-xs" disabled={pending} />
                    ) : (
                      <span className="text-brand-charcoal">{r.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {editing ? (
                      <Select value={editCat} onValueChange={(v) => setEditCat((v ?? "other") as DbCostCategory)}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">{CATEGORY_LABEL[r.category]}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.is_active ? <span className="text-emerald-700">Active</span> : <span className="text-muted-foreground">Inactive</span>}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {editing ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => saveEdit(r)} disabled={pending} aria-label="Save"><Check className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={pending} aria-label="Cancel"><X className="h-3.5 w-3.5" /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => beginEdit(r)} disabled={pending} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => toggle(r)} disabled={pending} aria-label={r.is_active ? "Deactivate" : "Activate"} title={r.is_active ? "Deactivate" : "Activate"}><Power className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => del(r)} disabled={pending} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

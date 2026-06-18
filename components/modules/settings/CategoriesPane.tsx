"use client";

// PART-FIX-2 — Settings → Categories. A nested, arbitrary-depth category tree.
// Add a root, add children under any node, rename, and delete (cascades to the
// whole subtree — the confirm dialog names what will be removed). Writes go
// through requireAdmin-gated server actions.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  listCategoriesAction,
  createCategoryAction,
  renameCategoryAction,
  deleteCategoryAction,
} from "@/app/(app)/settings/category-actions";
import type { DbInventoryCategory } from "@/lib/types/database";

// PART-FIX-2 — an elegant per-depth marker glyph (in addition to the
// expand/collapse chevron) so the tree reads as house style rather than a
// generic browser bullet list. depth is 0-based (0 = top-level / "Depth 1").
function depthMarker(depth: number): { glyph: string; color: string } {
  switch (depth) {
    case 0:
      return { glyph: "◆", color: "#a07a2c" }; // antique gold filled diamond
    case 1:
      return { glyph: "▸", color: "#b8a86b" }; // muted gold open chevron
    case 2:
      return { glyph: "◦", color: "#1a1814" }; // deep navy hollow bullet
    default:
      return { glyph: "·", color: "#1a1814" }; // navy middot for depth 4+
  }
}

export function CategoriesPane() {
  const [rows, setRows] = useState<DbInventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoot, setNewRoot] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DbInventoryCategory | null>(
    null
  );
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listCategoriesAction();
    if (res.ok) setRows(res.data);
    else toast.error(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // parentId (or "root") → children.
  const childrenOf = useMemo(() => {
    const map = new Map<string, DbInventoryCategory[]>();
    for (const r of rows) {
      const key = r.parent_id ?? "root";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [rows]);

  const descendantNames = useCallback(
    (id: string): string[] => {
      const out: string[] = [];
      const walk = (pid: string) => {
        for (const c of childrenOf.get(pid) ?? []) {
          out.push(c.name);
          walk(c.id);
        }
      };
      walk(id);
      return out;
    },
    [childrenOf]
  );

  function addRoot() {
    const name = newRoot.trim();
    if (name === "") return;
    start(async () => {
      const res = await createCategoryAction(name, null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added "${name}"`);
      setNewRoot("");
      load();
    });
  }

  const addChild = (parentId: string, name: string) =>
    start(async () => {
      const res = await createCategoryAction(name, parentId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added "${name}"`);
      load();
    });

  const rename = (id: string, name: string) =>
    start(async () => {
      const res = await renameCategoryAction(id, name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Renamed");
      load();
    });

  function doDelete(node: DbInventoryCategory) {
    start(async () => {
      const res = await deleteCategoryAction(node.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deleted "${node.name}"`);
      setConfirmDelete(null);
      load();
    });
  }

  const roots = childrenOf.get("root") ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Categories</h2>
        <p className="text-muted-foreground text-sm">
          A nested category tree for parts. Sub-categories are local to their
          parent — CCTV&rsquo;s sub-categories are independent of Access
          Control&rsquo;s. Legacy free-text categories on existing parts are
          untouched until a part is re-saved.
        </p>
      </div>

      {/* Add root */}
      <div className="flex items-center gap-2">
        <Input
          value={newRoot}
          onChange={(e) => setNewRoot(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addRoot();
            }
          }}
          placeholder="Add a top-level category…"
          className="max-w-xs"
          disabled={pending}
        />
        <Button onClick={addRoot} disabled={pending || newRoot.trim() === ""}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <Card className="bg-card p-2 shadow-sm">
        {loading ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            Loading…
          </p>
        ) : roots.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            No categories yet. Add a top-level one above.
          </p>
        ) : (
          <ul>
            {roots.map((r) => (
              <CategoryNode
                key={r.id}
                node={r}
                depth={0}
                childrenOf={childrenOf}
                pending={pending}
                onAddChild={addChild}
                onRename={rename}
                onDelete={setConfirmDelete}
              />
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.name}”?</DialogTitle>
            <DialogDescription>
              {confirmDelete &&
                (() => {
                  const kids = descendantNames(confirmDelete.id);
                  return kids.length === 0
                    ? "This category has no sub-categories."
                    : `This also removes ${kids.length} sub-categor${
                        kids.length === 1 ? "y" : "ies"
                      }: ${kids.join(", ")}.`;
                })()}{" "}
              Parts in these categories keep their saved value but lose the tree
              link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => confirmDelete && doDelete(confirmDelete)}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryNode({
  node,
  depth,
  childrenOf,
  pending,
  onAddChild,
  onRename,
  onDelete,
}: {
  node: DbInventoryCategory;
  depth: number;
  childrenOf: Map<string, DbInventoryCategory[]>;
  pending: boolean;
  onAddChild: (parentId: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (node: DbInventoryCategory) => void;
}) {
  const kids = childrenOf.get(node.id) ?? [];
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");

  return (
    <li>
      <div
        className="hover:bg-muted/40 group flex items-center gap-1.5 rounded-md px-2 py-1.5"
        style={{ paddingLeft: 8 + depth * 18 }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {editing ? (
          <>
            <Input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const n = editValue.trim();
                  if (n && n !== node.name) onRename(node.id, n);
                  setEditing(false);
                } else if (e.key === "Escape") setEditing(false);
              }}
              className="h-7 max-w-xs text-sm"
              disabled={pending}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => {
                const n = editValue.trim();
                if (n && n !== node.name) onRename(node.id, n);
                setEditing(false);
              }}
              aria-label="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setEditing(false)}
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="inline-block w-3 text-center text-[11px] leading-none select-none"
              style={{ color: depthMarker(depth).color }}
            >
              {depthMarker(depth).glyph}
            </span>
            <span className="text-brand-charcoal flex-1 text-sm">
              {node.name}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  setAddingChild(true);
                  setExpanded(true);
                }}
                disabled={pending}
              >
                <Plus className="mr-1 h-3 w-3" />
                Child
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => {
                  setEditValue(node.name);
                  setEditing(true);
                }}
                disabled={pending}
                aria-label="Rename"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                onClick={() => onDelete(node)}
                disabled={pending}
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>

      {addingChild && (
        <div
          className="flex items-center gap-1.5 py-1"
          style={{ paddingLeft: 8 + (depth + 1) * 18 + 14 }}
        >
          <Input
            autoFocus
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const n = childName.trim();
                if (n) onAddChild(node.id, n);
                setChildName("");
                setAddingChild(false);
              } else if (e.key === "Escape") {
                setChildName("");
                setAddingChild(false);
              }
            }}
            placeholder={`Sub-category of ${node.name}…`}
            className="h-7 max-w-xs text-sm"
            disabled={pending}
          />
          <Button
            size="sm"
            className="h-7"
            onClick={() => {
              const n = childName.trim();
              if (n) onAddChild(node.id, n);
              setChildName("");
              setAddingChild(false);
            }}
            disabled={pending || childName.trim() === ""}
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              setChildName("");
              setAddingChild(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {expanded && kids.length > 0 && (
        <ul className={cn(kids.length > 0 && "space-y-0")}>
          {kids.map((k) => (
            <CategoryNode
              key={k.id}
              node={k}
              depth={depth + 1}
              childrenOf={childrenOf}
              pending={pending}
              onAddChild={onAddChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

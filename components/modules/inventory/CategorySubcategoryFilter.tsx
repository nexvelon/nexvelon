"use client";

// CAT-3b / PART-FIX-2 — reusable Category / Sub-category filter for the part
// search/pickers (quote command palette, PO line editor, catalog list).
// Controlled by the parent (which owns the {category, subcategory} names and
// applies the predicate). Now tree-aware: the category list unions the new
// category-tree roots with legacy free-text categories, and picking a category
// matches that node AND all its descendants (via the product's categoryPath) OR
// the legacy string — so legacy-categorized parts never disappear.

import { useEffect, useMemo, useState } from "react";
import {
  listInventoryVocabAction,
  listSubcategoriesAction,
} from "@/app/(app)/settings/inventory-vocab-actions";
import { listCategoriesAction } from "@/app/(app)/settings/category-actions";
import type { DbInventoryVocab } from "@/lib/api/inventory-vocab";
import type { DbInventoryCategory } from "@/lib/types/database";

export interface CatFilterValue {
  category: string;
  subcategory: string;
}

/**
 * True when a product passes the category/sub-category filter (empty = All).
 * A tree-categorized product matches when the selected name appears anywhere in
 * its root→leaf categoryPath (so "Access Control" also matches its descendants);
 * a legacy product matches by its free-text category/subcategory string.
 */
export function matchesCatFilter(
  p: {
    category?: string | null;
    subcategory?: string | null;
    categoryPath?: string[];
  },
  f: CatFilterValue
): boolean {
  if (f.category) {
    const inTree = p.categoryPath?.includes(f.category) ?? false;
    const legacy = (p.category ?? "") === f.category;
    if (!inTree && !legacy) return false;
  }
  if (f.subcategory) {
    const inTree = p.categoryPath?.includes(f.subcategory) ?? false;
    const legacy = (p.subcategory ?? "") === f.subcategory;
    if (!inTree && !legacy) return false;
  }
  return true;
}

interface Props {
  value: CatFilterValue;
  onChange: (next: CatFilterValue) => void;
  className?: string;
}

const SELECT_CLASS =
  "border-input bg-background h-9 rounded-md border px-2 text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function CategorySubcategoryFilter({ value, onChange, className }: Props) {
  const [legacyCats, setLegacyCats] = useState<DbInventoryVocab[]>([]);
  const [legacySubs, setLegacySubs] = useState<DbInventoryVocab[]>([]);
  const [tree, setTree] = useState<DbInventoryCategory[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listInventoryVocabAction("category"),
      listSubcategoriesAction(),
      listCategoriesAction(),
    ])
      .then(([cat, sub, t]) => {
        if (!active) return;
        if (cat.ok) setLegacyCats(cat.data);
        if (sub.ok) setLegacySubs(sub.data);
        if (t.ok) setTree(t.data);
      })
      .catch(() => {
        // leave empty — the filter simply offers "All".
      });
    return () => {
      active = false;
    };
  }, []);

  // Category options: tree roots ∪ legacy active categories, deduped by name.
  const categoryNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of tree.filter((c) => c.parent_id === null)) {
      if (!seen.has(r.name)) {
        seen.add(r.name);
        out.push(r.name);
      }
    }
    for (const c of legacyCats.filter((c) => c.is_active)) {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        out.push(c.name);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [tree, legacyCats]);

  // Sub-category options for the picked category: tree children of the matching
  // root ∪ legacy sub-categories of the matching legacy category.
  const subNames = useMemo(() => {
    if (!value.category) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    const root = tree.find(
      (c) => c.parent_id === null && c.name === value.category
    );
    if (root) {
      for (const child of tree.filter((c) => c.parent_id === root.id)) {
        if (!seen.has(child.name)) {
          seen.add(child.name);
          out.push(child.name);
        }
      }
    }
    const legacyCatId = legacyCats.find((c) => c.name === value.category)?.id;
    if (legacyCatId) {
      for (const s of legacySubs.filter((s) => s.parent_id === legacyCatId)) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          out.push(s.name);
        }
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [value.category, tree, legacyCats, legacySubs]);

  return (
    <div className={className ?? "flex flex-wrap items-center gap-2"}>
      <select
        aria-label="Filter by category"
        value={value.category}
        onChange={(e) =>
          // Changing the category always clears the sub-category.
          onChange({ category: e.target.value, subcategory: "" })
        }
        className={SELECT_CLASS}
      >
        <option value="">All categories</option>
        {categoryNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by sub-category"
        value={value.subcategory}
        onChange={(e) =>
          onChange({ category: value.category, subcategory: e.target.value })
        }
        disabled={!value.category || subNames.length === 0}
        className={SELECT_CLASS}
      >
        <option value="">
          {!value.category
            ? "All sub-categories"
            : subNames.length === 0
              ? "No sub-categories"
              : "All sub-categories"}
        </option>
        {subNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

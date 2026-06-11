"use client";

// CAT-3b — reusable dependent Category / Sub-category filter for the part
// search/pickers (quote command palette, PO line editor, catalog list). Controlled
// by the parent (which owns the {category, subcategory} names and applies the
// predicate); self-fetches the active vocab. Both selects carry an "All" option;
// picking a category resets the sub-category, and the sub-category select is
// disabled until a category with sub-categories is chosen.

import { useEffect, useMemo, useState } from "react";
import {
  listInventoryVocabAction,
  listSubcategoriesAction,
} from "@/app/(app)/settings/inventory-vocab-actions";
import type { DbInventoryVocab } from "@/lib/api/inventory-vocab";

export interface CatFilterValue {
  category: string;
  subcategory: string;
}

/** True when a product passes the category/sub-category filter (empty = All). */
export function matchesCatFilter(
  p: { category?: string | null; subcategory?: string | null },
  f: CatFilterValue
): boolean {
  if (f.category && (p.category ?? "") !== f.category) return false;
  if (f.subcategory && (p.subcategory ?? "") !== f.subcategory) return false;
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
  const [categories, setCategories] = useState<DbInventoryVocab[]>([]);
  const [subs, setSubs] = useState<DbInventoryVocab[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listInventoryVocabAction("category"),
      listSubcategoriesAction(),
    ])
      .then(([cat, sub]) => {
        if (!active) return;
        if (cat.ok) setCategories(cat.data);
        if (sub.ok) setSubs(sub.data);
      })
      .catch(() => {
        // leave empty — the filter simply offers "All".
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedCategoryId = categories.find((c) => c.name === value.category)?.id;
  const availableSubs = useMemo(
    () => subs.filter((s) => s.parent_id === selectedCategoryId),
    [subs, selectedCategoryId]
  );

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
        {categories
          .filter((c) => c.is_active)
          .map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
      </select>

      <select
        aria-label="Filter by sub-category"
        value={value.subcategory}
        onChange={(e) =>
          onChange({ category: value.category, subcategory: e.target.value })
        }
        disabled={!selectedCategoryId || availableSubs.length === 0}
        className={SELECT_CLASS}
      >
        <option value="">
          {!selectedCategoryId
            ? "All sub-categories"
            : availableSubs.length === 0
              ? "No sub-categories"
              : "All sub-categories"}
        </option>
        {availableSubs.map((s) => (
          <option key={s.id} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

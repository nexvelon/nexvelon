export interface LineItemClassification {
  name: string;
  appliesTo: "product" | "labor" | "misc" | "both" | "service";
  order: number;
}

// Seed / SSR fallback list. Used when the DB-backed list is unavailable or
// empty (QB-5b: the canonical source is public.line_item_classifications).
export const LINE_ITEM_CLASSIFICATIONS: LineItemClassification[] = [
  { name: "Materials", appliesTo: "product", order: 1 },
  { name: "Subcontractor Labour", appliesTo: "labor", order: 2 },
  { name: "Technician Labour", appliesTo: "labor", order: 3 },
  { name: "Project Management", appliesTo: "labor", order: 4 },
  { name: "Misc", appliesTo: "misc", order: 1 },
];

/**
 * Filter classifications by line type. If `list` is empty/undefined, falls
 * back to the hardcoded LINE_ITEM_CLASSIFICATIONS seed.
 */
export function classificationsFor(
  list: LineItemClassification[] | undefined,
  lineType: "product" | "labor" | "misc" | "service"
): LineItemClassification[] {
  const source = list && list.length > 0 ? list : LINE_ITEM_CLASSIFICATIONS;
  return source
    .filter((c) => c.appliesTo === lineType || c.appliesTo === "both")
    .sort((a, b) => a.order - b.order);
}

/** Default classification name for a new line of the given type. */
export function defaultClassificationFor(
  lineType: "product" | "labor" | "misc" | "service"
): string {
  if (lineType === "product") return "Materials";
  if (lineType === "labor") return "Technician Labour";
  if (lineType === "service") return "Warranty Cost";
  return "Misc";
}

/**
 * Maps a DB row to the in-app LineItemClassification shape. Pure function —
 * safe in both server (RSC) and client contexts.
 */
export function classificationFromDb(row: {
  name: string;
  applies_to: "product" | "labor" | "misc" | "both" | "service";
  display_order: number;
}): LineItemClassification {
  return { name: row.name, appliesTo: row.applies_to, order: row.display_order };
}

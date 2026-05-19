export interface LineItemClassification {
  name: string;
  appliesTo: "product" | "labor" | "both";
  order: number;
}

export const LINE_ITEM_CLASSIFICATIONS: LineItemClassification[] = [
  { name: "Materials", appliesTo: "product", order: 1 },
  { name: "Subcontractor Labour", appliesTo: "labor", order: 2 },
  { name: "Technician Labour", appliesTo: "labor", order: 3 },
  { name: "Project Management", appliesTo: "labor", order: 4 },
  { name: "Misc", appliesTo: "both", order: 5 },
];

/** Returns the classifications applicable to a given line type. */
export function classificationsFor(
  lineType: "product" | "labor"
): LineItemClassification[] {
  return LINE_ITEM_CLASSIFICATIONS.filter(
    (c) => c.appliesTo === lineType || c.appliesTo === "both"
  ).sort((a, b) => a.order - b.order);
}

/** Default classification name for a new line of the given type. */
export function defaultClassificationFor(
  lineType: "product" | "labor"
): string {
  return lineType === "product" ? "Materials" : "Technician Labour";
}

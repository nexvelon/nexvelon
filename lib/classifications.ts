export interface LineItemClassification {
  name: string;
  appliesTo: "product" | "labor" | "misc" | "both";
  order: number;
}

export const LINE_ITEM_CLASSIFICATIONS: LineItemClassification[] = [
  { name: "Materials", appliesTo: "product", order: 1 },
  { name: "Subcontractor Labour", appliesTo: "labor", order: 2 },
  { name: "Technician Labour", appliesTo: "labor", order: 3 },
  { name: "Project Management", appliesTo: "labor", order: 4 },
  { name: "Misc", appliesTo: "misc", order: 1 },
];

/** Returns the classifications applicable to a given line type. */
export function classificationsFor(
  lineType: "product" | "labor" | "misc"
): LineItemClassification[] {
  return LINE_ITEM_CLASSIFICATIONS.filter(
    (c) => c.appliesTo === lineType || c.appliesTo === "both"
  ).sort((a, b) => a.order - b.order);
}

/** Default classification name for a new line of the given type. */
export function defaultClassificationFor(
  lineType: "product" | "labor" | "misc"
): string {
  if (lineType === "product") return "Materials";
  if (lineType === "labor") return "Technician Labour";
  return "Misc";
}

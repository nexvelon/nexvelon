// MATERIALS-1 — compose a material invoice line's text from a per-invoice set
// of part identifiers (any combination of master part # / part # / name /
// description). Pure + isomorphic so the server (addMaterialLine /
// setLineIdentifierFields) and the client live-preview agree exactly.

export type InvoiceIdentifierField =
  | "master_part_number"
  | "part_number"
  | "name"
  | "description";

export const INVOICE_IDENTIFIER_FIELDS: {
  key: InvoiceIdentifierField;
  label: string;
}[] = [
  { key: "master_part_number", label: "Master part #" },
  { key: "part_number", label: "Part #" },
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

const ORDER: InvoiceIdentifierField[] = [
  "master_part_number",
  "part_number",
  "name",
  "description",
];

export interface IdentifierProduct {
  master_part_number: string | null;
  sku: string | null;
  name: string | null;
  description: string | null;
}

/**
 * Build a material line's description from the chosen identifier fields, in a
 * fixed order. Falls back to name/sku when the chosen fields are all empty. A
 * serialized unit's serial is appended in parentheses.
 */
export function composeIdentifier(
  product: IdentifierProduct,
  fields: string[],
  serial?: string | null
): string {
  const value = (f: InvoiceIdentifierField): string | null => {
    switch (f) {
      case "master_part_number":
        return product.master_part_number;
      case "part_number":
        return product.sku;
      case "name":
        return product.name;
      case "description":
        return product.description;
    }
  };

  const picked = ORDER.filter((f) => fields.includes(f))
    .map((f) => value(f)?.trim())
    .filter((v): v is string => !!v && v.length > 0);

  let text =
    picked.join(" · ") ||
    product.name?.trim() ||
    product.sku?.trim() ||
    "Material";
  if (serial && serial.trim()) text += ` (SN: ${serial.trim()})`;
  return text;
}

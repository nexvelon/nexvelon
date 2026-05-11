import type { Product } from "../types";

// Pre-Quotes cleanup (2026-05-11): mock data emptied. The Product type
// is preserved. Inventory module is unwired; the page renders an empty
// state until 00NN_inventory_schema.sql + lib/api/products.ts ship.
export const products: Product[] = [];

import "server-only";

// INV-1b — current stock allocations for the inventory Allocations tab.
// "Allocated" = an in_stock unit/lot whose current_cost_center_id points at a
// project cost center (0046). We read those rows with a single nested embed
// (stock → cost_center → project → client) and group by project in code.
//
// Schema notes: projects has no `name` column — it uses `project_number`
// (+ optional `title`); the project label here is `title || project_number`.
// project_cost_centers carries `cc_number` + `name`. clients has `name`.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

async function db() {
  return createSupabaseServerClient();
}

export interface AllocationStockRow {
  stockId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export interface AllocationCostCenter {
  costCenterId: string;
  costCenterName: string; // "<cc_number> · <name>"
  stockRows: AllocationStockRow[];
  subtotal: number; // Σ quantity × unit_cost
}

export interface AllocationsByProject {
  projectId: string;
  projectName: string; // title || project_number
  projectNumber: string;
  clientId: string;
  clientName: string;
  costCenters: AllocationCostCenter[];
  projectTotal: number;
}

// Shape of one embedded stock row from the query below.
interface RawRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  current_cost_center_id: string | null;
  product: { name: string; sku: string } | null;
  cost_center: {
    id: string;
    cc_number: string;
    name: string;
    project: {
      id: string;
      project_number: string;
      title: string | null;
      client: { id: string; name: string } | null;
    } | null;
  } | null;
}

export async function listStockAllocations(): Promise<AllocationsByProject[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("inventory_stock")
    .select(
      `id, product_id, quantity, unit_cost, current_cost_center_id,
       product:inventory_products(name, sku),
       cost_center:project_cost_centers(
         id, cc_number, name,
         project:projects(
           id, project_number, title,
           client:clients(id, name)
         )
       )`
    )
    .eq("status", "in_stock")
    .not("current_cost_center_id", "is", null);
  if (error) throw new Error(`listStockAllocations: ${error.message}`);

  const rows = (data ?? []) as unknown as RawRow[];

  // Group: project → cost center → stock rows.
  const projects = new Map<
    string,
    AllocationsByProject & { _cc: Map<string, AllocationCostCenter> }
  >();

  for (const r of rows) {
    const cc = r.cost_center;
    const proj = cc?.project;
    if (!cc || !proj) continue; // orphaned ref — skip defensively

    let p = projects.get(proj.id);
    if (!p) {
      p = {
        projectId: proj.id,
        projectNumber: proj.project_number,
        projectName: proj.title?.trim() || proj.project_number,
        clientId: proj.client?.id ?? "",
        clientName: proj.client?.name ?? "—",
        costCenters: [],
        projectTotal: 0,
        _cc: new Map(),
      };
      projects.set(proj.id, p);
    }

    let center = p._cc.get(cc.id);
    if (!center) {
      center = {
        costCenterId: cc.id,
        costCenterName: `${cc.cc_number} · ${cc.name}`,
        stockRows: [],
        subtotal: 0,
      };
      p._cc.set(cc.id, center);
      p.costCenters.push(center);
    }

    const qty = Number(r.quantity) || 0;
    const unitCost = Number(r.unit_cost) || 0;
    center.stockRows.push({
      stockId: r.id,
      productId: r.product_id,
      productName: r.product?.name ?? "—",
      sku: r.product?.sku ?? "",
      quantity: qty,
      unitCost,
    });
    const line = qty * unitCost;
    center.subtotal += line;
    p.projectTotal += line;
  }

  // Strip the internal map; sort by project label, cost centers already ordered.
  return [...projects.values()]
    .map(({ _cc, ...rest }) => {
      void _cc;
      return rest;
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
}

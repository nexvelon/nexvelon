import "server-only";

// JC-2 — project + cost-center cost rollup. One read that joins the four legs
// of a job's ledger so the project detail can show cost-vs-billed:
//
//   contract  — project_cost_centers.contract_value (the contracted value).
//   invoiced  — sum of ISSUED invoice totals (post-tax) for the project. Issued
//               means status IN ('sent','paid'); drafts (not issued) and voids
//               (cancelled) never count. Project-level only — not split per CC.
//   materials — actual stock cost sitting on the project's cost-centers:
//               sum(inventory_stock.unit_cost · quantity), with
//               inventory_products.default_unit_cost as the catalog fallback
//               when a row has no unit_cost.
//   labour    — sum(labour_entries.amount) per cost-center (reuses JC-1).
//
//   spent = materials + labour ;  margin = contract − spent ;
//   billed_pct = invoiced / contract (project-level; null when contract is 0).
//
// Material COST exclusion (intentionally narrower than the "billable" rule):
// rows whose custody_status is 'lost' or 'returned' are EXCLUDED. A returned
// unit already has current_cost_center_id = NULL (so the cost-center filter
// drops it anyway), and a lost unit shouldn't appear as spend on a project
// ledger you'd defend in a margin review — it no longer exists on the job.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { sumLabourCostByCostCenter } from "@/lib/api/labour";

async function db() {
  return createSupabaseServerClient();
}

// Stock custody states that do NOT count toward materials cost on the project.
const EXCLUDED_CUSTODY = new Set(["lost", "returned"]);

// labour / spent / margin are `number | null` so the action can redact them for
// callers without financials:edit (see getProjectCostRollupAction). The lib
// always fills real numbers; null only ever appears post-redaction.
export interface CostCenterRollup {
  contract: number;
  materials: number;
  labour: number | null;
  spent: number | null;
  margin: number | null;
}

export interface ProjectRollup {
  contract: number;
  invoiced: number;
  materials: number;
  labour: number | null;
  spent: number | null;
  margin: number | null;
  billed_pct: number | null;
}

export interface ProjectCostRollup {
  perProject: ProjectRollup;
  perCostCenter: Record<string, CostCenterRollup>;
}

export async function getProjectCostRollup(
  projectId: string
): Promise<ProjectCostRollup> {
  const supabase = await db();

  // Cost centers + their contract values.
  const { data: ccData, error: ccErr } = await supabase
    .from("project_cost_centers")
    .select("id, contract_value")
    .eq("project_id", projectId);
  if (ccErr) throw new Error(`getProjectCostRollup/cc: ${ccErr.message}`);
  const ccs = (ccData ?? []) as { id: string; contract_value: number | null }[];
  const ccIds = ccs.map((c) => c.id);

  // Materials cost per cost-center: stock unit_cost · qty, catalog default as
  // fallback, Lost/Returned excluded.
  const materialsByCc: Record<string, number> = {};
  if (ccIds.length > 0) {
    const { data: stockData, error: sErr } = await supabase
      .from("inventory_stock")
      .select("product_id, quantity, unit_cost, custody_status, current_cost_center_id")
      .in("current_cost_center_id", ccIds);
    if (sErr) throw new Error(`getProjectCostRollup/stock: ${sErr.message}`);
    const stock = (stockData ?? []) as {
      product_id: string;
      quantity: number | null;
      unit_cost: number | null;
      custody_status: string;
      current_cost_center_id: string;
    }[];
    const live = stock.filter((s) => !EXCLUDED_CUSTODY.has(s.custody_status));

    // Catalog fallback only for rows missing a unit_cost.
    const needFallback = [
      ...new Set(live.filter((s) => s.unit_cost == null).map((s) => s.product_id)),
    ];
    const defaultCostByProduct = new Map<string, number>();
    if (needFallback.length > 0) {
      const { data: prodData, error: pErr } = await supabase
        .from("inventory_products")
        .select("id, default_unit_cost")
        .in("id", needFallback);
      if (pErr) throw new Error(`getProjectCostRollup/products: ${pErr.message}`);
      for (const p of (prodData ?? []) as {
        id: string;
        default_unit_cost: number | null;
      }[]) {
        defaultCostByProduct.set(p.id, Number(p.default_unit_cost ?? 0));
      }
    }

    for (const s of live) {
      const unit =
        s.unit_cost != null
          ? Number(s.unit_cost)
          : defaultCostByProduct.get(s.product_id) ?? 0;
      const qty = Number(s.quantity ?? 0);
      materialsByCc[s.current_cost_center_id] = round2(
        (materialsByCc[s.current_cost_center_id] ?? 0) + unit * qty
      );
    }
  }

  // Labour per cost-center (JC-1).
  const labourByCc = await sumLabourCostByCostCenter(projectId);

  // Invoiced (issued only) — project-level.
  let invoiced = 0;
  {
    const { data: invData, error: iErr } = await supabase
      .from("invoices")
      .select("total, status")
      .eq("project_id", projectId)
      .in("status", ["sent", "paid"]);
    if (iErr) throw new Error(`getProjectCostRollup/invoices: ${iErr.message}`);
    for (const r of (invData ?? []) as { total: number | null }[]) {
      invoiced = round2(invoiced + Number(r.total ?? 0));
    }
  }

  // Assemble per cost-center + project totals.
  const perCostCenter: Record<string, CostCenterRollup> = {};
  let contractTotal = 0;
  let materialsTotal = 0;
  let labourTotal = 0;
  for (const cc of ccs) {
    const contract = Number(cc.contract_value ?? 0);
    const materials = round2(materialsByCc[cc.id] ?? 0);
    const labour = round2(labourByCc[cc.id] ?? 0);
    const spent = round2(materials + labour);
    perCostCenter[cc.id] = {
      contract,
      materials,
      labour,
      spent,
      margin: round2(contract - spent),
    };
    contractTotal = round2(contractTotal + contract);
    materialsTotal = round2(materialsTotal + materials);
    labourTotal = round2(labourTotal + labour);
  }

  const spentTotal = round2(materialsTotal + labourTotal);
  const perProject: ProjectRollup = {
    contract: contractTotal,
    invoiced,
    materials: materialsTotal,
    labour: labourTotal,
    spent: spentTotal,
    margin: round2(contractTotal - spentTotal),
    billed_pct: contractTotal > 0 ? invoiced / contractTotal : null,
  };

  return { perProject, perCostCenter };
}

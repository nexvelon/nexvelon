import "server-only";

// JC-2 — project + cost-center cost rollup. One read that joins the four legs
// of a job's ledger so the project detail can show cost-vs-billed:
//
//   contract  — project_cost_centers.contract_value (the contracted value).
//   invoiced  — sum of ISSUED invoice totals (post-tax) for the project. Issued
//               means status IN ('sent','partially_paid','paid') (FIN-2 added
//               partially_paid); drafts (not issued) and voids never count.
//               Project-level only — not split per CC.
//   materials — actual stock cost sitting on the project's cost-centers:
//               sum(inventory_stock.unit_cost · quantity), with
//               inventory_products.default_unit_cost as the catalog fallback
//               when a row has no unit_cost.
//   labour    — sum(labour_entries.amount) per cost-center (reuses JC-1).
//
//   billed_cost — FIN-5: Σ vendor_bills.subtotal attributed to the Job (tax
//               excluded — tax is a pass-through, mirroring how `invoiced`
//               stays out of the margin legs). This is a SUPPLEMENTARY leg: it
//               is deliberately NOT added to `spent`, because receiving a PO
//               already writes its line unit_cost onto inventory_stock, which
//               `materials` sums. Adding bills on top would count the same
//               physical goods twice. Choosing bills-vs-inventory as the single
//               canonical actual is a real decision, left open on purpose.
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
import {
  computeQuotedEstimatedLegs,
  type JobLineVarianceInput,
  type VarianceLeg,
} from "@/lib/jobs/totals";

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

// PROJ2-6b — the Quoted/Estimated/Actual/Variance block. Quoted reads the §2.2
// quoted_* snapshots only; Estimated reads the live line-item values; Actual
// derives from real transactions (invoiced / stock cost / labour entries).
// Variance baselines: revenue + margin vs Quoted (falling back to Estimated
// when the Job has no quoted snapshot); the cost legs vs Estimated. The whole
// block is redacted to null for callers without financials:edit.
export interface JobVarianceBlock {
  has_quoted_baseline: boolean;
  quoted: VarianceLeg;
  estimated: VarianceLeg;
  actual: VarianceLeg;
  variance: {
    revenue: number;
    materials: number;
    labour: number;
    // SUB-4 — actual sub-labour vs estimated (always 0 estimated, since quoted
    // lines aren't classified) — i.e. the sub cost that wasn't in the plan.
    sub_labour: number;
    cost: number;
    margin_pts: number | null;
  };
}

export interface ProjectRollup {
  contract: number;
  invoiced: number;
  materials: number;
  labour: number | null;
  // SUB-4 — Σ sub-attributed vendor-bill subtotals (tax excluded). CANONICAL
  // cost: folded INTO spent/margin (unlike billed_cost). Financials-redactable.
  sub_labour: number | null;
  spent: number | null;
  margin: number | null;
  billed_pct: number | null;
  // PROJ2-4c — committed purchase-order spend (issued/partially_received/
  // received POs attributed to this project). Financials-redactable.
  po_committed: number | null;
  // FIN-5 — Σ vendor-bill subtotals attributed here (tax excluded). Sits
  // ALONGSIDE spent/po_committed, never inside them. Financials-redactable.
  billed_cost: number | null;
  // PROJ2-6b — project-level Quoted/Estimated/Actual/Variance (aggregated over
  // all the project's line items + actuals). null only post-redaction.
  variance: JobVarianceBlock | null;
}

// PROJ2-4a — per-Job rollup. PROJ2-4c completes invoiced / billed_pct /
// po_committed per Job. materials/labour/spent/margin/invoiced/billed_pct/
// po_committed are `number | null` so the action can redact the financial legs
// exactly like the project/cost-center rows.
export interface DbJobRollup {
  job_id: string;
  job_type: string; // 'main_job' | 'change_order'
  co_number: number | null;
  title: string;
  status: string;
  contract: number;
  materials: number;
  labour: number | null;
  // SUB-4 — Σ sub-attributed vendor-bill subtotals for this Job (in spent/margin).
  sub_labour: number | null;
  spent: number | null;
  margin: number | null;
  invoiced: number | null;
  billed_pct: number | null;
  po_committed: number | null;
  // FIN-5 — Σ NON-sub vendor-bill subtotals for this Job (supplier bills; tax
  // excluded). Supplementary — NOT in spent.
  billed_cost: number | null;
  // PROJ2-6b — per-Job Quoted/Estimated/Actual/Variance. null only
  // post-redaction (financials gate), mirroring the other legs.
  variance: JobVarianceBlock | null;
}

export interface ProjectCostRollup {
  perProject: ProjectRollup;
  perCostCenter: Record<string, CostCenterRollup>;
  // PROJ2-4a — one entry per Job (Main Job + Change Orders). Additive field;
  // existing callers reading perProject/perCostCenter are unaffected.
  byJob: DbJobRollup[];
}

export async function getProjectCostRollup(
  projectId: string
): Promise<ProjectCostRollup> {
  const supabase = await db();

  // Cost centers + their contract values + owning job.
  const { data: ccData, error: ccErr } = await supabase
    .from("project_cost_centers")
    .select("id, contract_value, job_id")
    .eq("project_id", projectId);
  if (ccErr) throw new Error(`getProjectCostRollup/cc: ${ccErr.message}`);
  const ccs = (ccData ?? []) as {
    id: string;
    contract_value: number | null;
    job_id: string | null;
  }[];
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

  // Invoiced (issued only: status IN sent/paid) — project total + per job.
  let invoiced = 0;
  const invoicedByJob: Record<string, number> = {};
  {
    const { data: invData, error: iErr } = await supabase
      .from("invoices")
      .select("total, status, job_id")
      .eq("project_id", projectId)
      // FIN-2 — 'partially_paid' is an issued state; count it as invoiced
      // revenue alongside sent/paid (else partly-paid invoices disappear).
      .in("status", ["sent", "partially_paid", "paid"]);
    if (iErr) throw new Error(`getProjectCostRollup/invoices: ${iErr.message}`);
    for (const r of (invData ?? []) as {
      total: number | null;
      job_id: string | null;
    }[]) {
      const amt = Number(r.total ?? 0);
      invoiced = round2(invoiced + amt);
      if (r.job_id)
        invoicedByJob[r.job_id] = round2((invoicedByJob[r.job_id] ?? 0) + amt);
    }
  }

  // PROJ2-4c — committed PO spend: POs attributed to this project with an
  // issued/partially_received/received status. POs have no stored total, so we
  // sum their line (qty × unit_cost). Historical unattributed POs (project_id
  // NULL) never count.
  let poCommittedTotal = 0;
  const poCommittedByJob: Record<string, number> = {};
  {
    const { data: poData, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, job_id, status")
      .eq("project_id", projectId)
      .in("status", ["issued", "partially_received", "received"]);
    if (poErr) throw new Error(`getProjectCostRollup/pos: ${poErr.message}`);
    const pos = (poData ?? []) as { id: string; job_id: string | null }[];
    if (pos.length > 0) {
      const { data: lineData, error: lErr } = await supabase
        .from("purchase_order_lines")
        .select("purchase_order_id, quantity, unit_cost")
        .in(
          "purchase_order_id",
          pos.map((p) => p.id)
        );
      if (lErr) throw new Error(`getProjectCostRollup/poLines: ${lErr.message}`);
      const totalByPo: Record<string, number> = {};
      for (const l of (lineData ?? []) as {
        purchase_order_id: string;
        quantity: number | null;
        unit_cost: number | null;
      }[]) {
        totalByPo[l.purchase_order_id] = round2(
          (totalByPo[l.purchase_order_id] ?? 0) +
            Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0)
        );
      }
      for (const p of pos) {
        const t = totalByPo[p.id] ?? 0;
        poCommittedTotal = round2(poCommittedTotal + t);
        if (p.job_id)
          poCommittedByJob[p.job_id] = round2(
            (poCommittedByJob[p.job_id] ?? 0) + t
          );
      }
    }
  }

  // FIN-5 + SUB-4 — vendor-bill cost, PARTITIONED by whether the bill is
  // attributed to a subcontractor. Subtotal, not total: tax is a pass-through,
  // out of cost exactly as it's out of margin. Void bills never count.
  //
  //   billed_cost := Σ subtotal WHERE subcontractor_id IS NULL   (supplier bills)
  //   sub_labour  := Σ subtotal WHERE subcontractor_id IS NOT NULL (sub bills)
  //
  // The partition is TOTAL and mutually exclusive — every non-void bill lands in
  // exactly one leg. billed_cost stays SUPPLEMENTARY (reported alongside spent,
  // never folded in — it overlaps `materials` for PO-received parts, see header).
  // sub_labour is CANONICAL: it's real outsourced-labour cost with no inventory
  // overlap, so it IS folded into spent/margin (D2). One query, split in JS.
  let billedTotal = 0;
  const billedByJob: Record<string, number> = {};
  let subLabourTotal = 0;
  const subLabourByJob: Record<string, number> = {};
  {
    const { data: billData, error: bErr } = await supabase
      .from("vendor_bills")
      .select("subtotal, job_id, status, subcontractor_id")
      .eq("project_id", projectId)
      .neq("status", "void");
    if (bErr) throw new Error(`getProjectCostRollup/bills: ${bErr.message}`);
    for (const b of (billData ?? []) as {
      subtotal: number | null;
      job_id: string | null;
      subcontractor_id?: string | null;
    }[]) {
      const amt = Number(b.subtotal ?? 0);
      if (b.subcontractor_id) {
        subLabourTotal = round2(subLabourTotal + amt);
        if (b.job_id)
          subLabourByJob[b.job_id] = round2((subLabourByJob[b.job_id] ?? 0) + amt);
      } else {
        billedTotal = round2(billedTotal + amt);
        if (b.job_id)
          billedByJob[b.job_id] = round2((billedByJob[b.job_id] ?? 0) + amt);
      }
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

  // SUB-4 — sub_labour is canonical cost, so it enters spent (and therefore
  // margin) alongside materials + labour. materials/labour are untouched; a
  // project with no sub bills has subLabourTotal 0 and is byte-identical.
  const spentTotal = round2(materialsTotal + labourTotal + subLabourTotal);

  // PROJ2-4a — per-Job rollup: group the already-computed per-cost-center
  // numbers by job_id. PROJ2-4c adds real invoiced / billed_pct / po_committed.
  const jobById = new Map<
    string,
    { contract: number; materials: number; labour: number }
  >();
  for (const cc of ccs) {
    if (!cc.job_id) continue;
    const r = perCostCenter[cc.id];
    const acc = jobById.get(cc.job_id) ?? { contract: 0, materials: 0, labour: 0 };
    acc.contract = round2(acc.contract + r.contract);
    acc.materials = round2(acc.materials + r.materials);
    acc.labour = round2(acc.labour + (r.labour ?? 0));
    jobById.set(cc.job_id, acc);
  }

  const { data: jobData, error: jErr } = await supabase
    .from("project_jobs")
    .select("id, job_type, co_number, title, status, contract_value")
    .eq("project_id", projectId);
  if (jErr) throw new Error(`getProjectCostRollup/jobs: ${jErr.message}`);
  const jobIds = ((jobData ?? []) as { id: string }[]).map((j) => j.id);

  // PROJ2-6b — the Quoted/Estimated legs come from job_line_items (quoted_*
  // snapshots + live values); one query for all the project's jobs.
  const linesByJob = new Map<string, JobLineVarianceInput[]>();
  const allLines: JobLineVarianceInput[] = [];
  if (jobIds.length > 0) {
    const { data: liData, error: liErr } = await supabase
      .from("job_line_items")
      .select(
        "job_id, line_kind, quantity, unit_cost, unit_price, discount_pct, quoted_quantity, quoted_unit_cost, quoted_unit_price, quoted_discount_pct"
      )
      .in("job_id", jobIds);
    if (liErr) throw new Error(`getProjectCostRollup/lineItems: ${liErr.message}`);
    for (const raw of (liData ?? []) as Array<
      JobLineVarianceInput & { job_id: string }
    >) {
      const list = linesByJob.get(raw.job_id) ?? [];
      list.push(raw);
      linesByJob.set(raw.job_id, list);
      allLines.push(raw);
    }
  }

  const perProject: ProjectRollup = {
    contract: contractTotal,
    invoiced,
    materials: materialsTotal,
    labour: labourTotal,
    sub_labour: subLabourTotal,
    spent: spentTotal,
    margin: round2(contractTotal - spentTotal),
    billed_pct: contractTotal > 0 ? invoiced / contractTotal : null,
    po_committed: poCommittedTotal,
    billed_cost: billedTotal,
    variance: buildVarianceBlock(allLines, {
      revenue: invoiced,
      materials: materialsTotal,
      labour: labourTotal,
      sub_labour: subLabourTotal,
    }),
  };

  const byJob: DbJobRollup[] = ((jobData ?? []) as {
    id: string;
    job_type: string;
    co_number: number | null;
    title: string;
    status: string;
    contract_value: number | null;
  }[])
    .map((j) => {
      const agg = jobById.get(j.id) ?? { contract: 0, materials: 0, labour: 0 };
      const subLabour = round2(subLabourByJob[j.id] ?? 0);
      const spent = round2(agg.materials + agg.labour + subLabour);
      const jobInvoiced = round2(invoicedByJob[j.id] ?? 0);
      return {
        job_id: j.id,
        job_type: j.job_type,
        co_number: j.co_number,
        title: j.title,
        status: j.status,
        contract: agg.contract,
        materials: agg.materials,
        labour: agg.labour,
        sub_labour: subLabour,
        spent,
        margin: round2(agg.contract - spent),
        invoiced: jobInvoiced,
        billed_pct: agg.contract > 0 ? jobInvoiced / agg.contract : null,
        po_committed: round2(poCommittedByJob[j.id] ?? 0),
        billed_cost: round2(billedByJob[j.id] ?? 0),
        variance: buildVarianceBlock(linesByJob.get(j.id) ?? [], {
          revenue: jobInvoiced,
          materials: agg.materials,
          labour: agg.labour,
          sub_labour: subLabour,
        }),
      };
    })
    .sort((a, b) => {
      if (a.job_type !== b.job_type) return a.job_type === "main_job" ? -1 : 1;
      return (a.co_number ?? 0) - (b.co_number ?? 0);
    });

  return { perProject, perCostCenter, byJob };
}

// PROJ2-6b — assemble a Quoted/Estimated/Actual/Variance block from the line
// items (Quoted + Estimated legs) and the already-computed actuals. Variance
// baselines per the locked definitions: revenue + margin vs Quoted (Estimated
// stands in when there is no quoted snapshot — a fully manual Job); the cost
// legs vs Estimated.
function buildVarianceBlock(
  lines: JobLineVarianceInput[],
  actuals: { revenue: number; materials: number; labour: number; sub_labour: number }
): JobVarianceBlock {
  const { quoted, estimated, hasQuotedBaseline } =
    computeQuotedEstimatedLegs(lines);

  const actualRevenue = round2(actuals.revenue);
  const actualMaterials = round2(actuals.materials);
  const actualLabour = round2(actuals.labour);
  // SUB-4 — actual cost gains sub_labour on the same basis (Quoted/Estimated
  // legs are unchanged — a quote's labour line may cover sub work, but we don't
  // attempt to classify quoted lines).
  const actualSubLabour = round2(actuals.sub_labour);
  const actualCost = round2(actualMaterials + actualLabour + actualSubLabour);
  const actual: VarianceLeg = {
    revenue: actualRevenue,
    materials: actualMaterials,
    labour: actualLabour,
    sub_labour: actualSubLabour,
    cost: actualCost,
    margin_pct:
      actualRevenue > 0
        ? round2(((actualRevenue - actualCost) / actualRevenue) * 100)
        : null,
  };

  const revenueBaseline = hasQuotedBaseline ? quoted : estimated;
  const marginBaseline = revenueBaseline.margin_pct;
  return {
    has_quoted_baseline: hasQuotedBaseline,
    quoted,
    estimated,
    actual,
    variance: {
      revenue: round2(actual.revenue - revenueBaseline.revenue),
      materials: round2(actual.materials - estimated.materials),
      labour: round2(actual.labour - estimated.labour),
      sub_labour: round2(actual.sub_labour - estimated.sub_labour),
      cost: round2(actual.cost - estimated.cost),
      margin_pts:
        actual.margin_pct != null && marginBaseline != null
          ? round2(actual.margin_pct - marginBaseline)
          : null,
    },
  };
}

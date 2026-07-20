import "server-only";

// PROJ2-6a — job_line_items persistence (parts + labour). Pure DB helpers; the
// actions layer owns permission gates. The quoted_* snapshot is write-once
// (§2.2): it's set only by copyQuoteSectionsToJob at conversion and is NEVER
// touched by updateLineItem (which defensively strips any quoted_* keys).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getQuoteById } from "@/lib/api/quotes";
import { round2 } from "@/lib/quote-helpers";
import { lineSellTotal } from "@/lib/jobs/totals";
import type { DbJobLineItem, JobLineKind } from "@/lib/types/database";
import type { BuilderLineItem } from "@/lib/types";

async function db() {
  return createSupabaseServerClient();
}

// ── PROJ2-6b — cost-center + job contract_value sync ─────────────────────────
//
// Line items are the source of truth: a cost center's contract_value = Σ of its
// lines' sell totals (qty × unit_price × (1 − discount_pct/100)), and a Job's
// contract_value = Σ of its cost centers' values + Σ sell totals of the job's
// UNATTRIBUTED lines (cost_center_id NULL). Runs after every line-item mutation;
// always best-effort at the call sites (§2.8) — a sync failure logs a warning
// and never fails the mutation itself.

type SellRow = {
  quantity: number | null;
  unit_price: number | null;
  discount_pct: number | null;
};

function sumSell(rows: SellRow[]): number {
  return round2(
    rows.reduce(
      (s, r) =>
        s +
        lineSellTotal(
          Number(r.quantity ?? 0),
          Number(r.unit_price ?? 0),
          Number(r.discount_pct ?? 0)
        ),
      0
    )
  );
}

export async function syncCostCenterAndJobTotals(input: {
  jobId: string;
  costCenterIds: (string | null)[]; // the CCs affected by the mutation
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  const ccIds = [
    ...new Set(input.costCenterIds.filter((id): id is string => !!id)),
  ];

  // 1. Recompute each affected cost center from its line items.
  for (const ccId of ccIds) {
    const { data, error } = await supabase
      .from("job_line_items")
      .select("quantity, unit_price, discount_pct")
      .eq("cost_center_id", ccId);
    if (error)
      throw new Error(`syncCostCenterAndJobTotals/ccLines: ${error.message}`);
    const { error: upErr } = await supabase
      .from("project_cost_centers")
      .update({ contract_value: sumSell((data ?? []) as SellRow[]) })
      .eq("id", ccId);
    if (upErr)
      throw new Error(`syncCostCenterAndJobTotals/cc: ${upErr.message}`);
  }

  // 2. Recompute the Job: Σ its CCs' contract_value + Σ unattributed line sells.
  const { data: ccRows, error: ccErr } = await supabase
    .from("project_cost_centers")
    .select("contract_value")
    .eq("job_id", input.jobId);
  if (ccErr)
    throw new Error(`syncCostCenterAndJobTotals/jobCcs: ${ccErr.message}`);
  const ccSum = round2(
    ((ccRows ?? []) as { contract_value: number | null }[]).reduce(
      (s, r) => s + Number(r.contract_value ?? 0),
      0
    )
  );

  const { data: freeRows, error: freeErr } = await supabase
    .from("job_line_items")
    .select("quantity, unit_price, discount_pct")
    .eq("job_id", input.jobId)
    .is("cost_center_id", null);
  if (freeErr)
    throw new Error(`syncCostCenterAndJobTotals/freeLines: ${freeErr.message}`);

  const patch: Record<string, unknown> = {
    contract_value: round2(ccSum + sumSell((freeRows ?? []) as SellRow[])),
  };
  if (input.actorId != null) patch.updated_by = input.actorId;
  const { error: jobErr } = await supabase
    .from("project_jobs")
    .update(patch)
    .eq("id", input.jobId);
  if (jobErr)
    throw new Error(`syncCostCenterAndJobTotals/job: ${jobErr.message}`);
}

// Best-effort wrapper (§2.8) — every mutation below calls this, never the raw
// sync, so a sync failure can never fail the line-item write that triggered it.
async function syncBestEffort(input: {
  jobId: string;
  costCenterIds: (string | null)[];
  actorId: string | null;
}): Promise<void> {
  try {
    await syncCostCenterAndJobTotals(input);
  } catch (e) {
    console.warn("[job-line-items] contract_value sync failed:", e);
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listLineItemsForJob(
  jobId: string
): Promise<DbJobLineItem[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_line_items")
    .select("*")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listLineItemsForJob: ${error.message}`);
  return (data ?? []) as DbJobLineItem[];
}

export async function listLineItemsForCostCenter(
  costCenterId: string
): Promise<DbJobLineItem[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_line_items")
    .select("*")
    .eq("cost_center_id", costCenterId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listLineItemsForCostCenter: ${error.message}`);
  return (data ?? []) as DbJobLineItem[];
}

export async function getLineItemById(
  id: string
): Promise<DbJobLineItem | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_line_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getLineItemById: ${error.message}`);
  return (data as DbJobLineItem | null) ?? null;
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof db>>,
  jobId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("job_line_items")
    .select("sort_order")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextSortOrder: ${error.message}`);
  const max = (data ?? [])[0]?.sort_order as number | undefined;
  return (max ?? -1) + 1;
}

export interface CreateLineItemInput {
  jobId: string;
  costCenterId: string | null;
  lineKind: JobLineKind;
  itemCode: string | null;
  description: string;
  category: string | null;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  discountPct: number;
  taxable: boolean;
  sortOrder?: number;
  actorId: string | null;
}

// A manual add — no quoted_* snapshot (this line didn't come from a quote).
export async function createLineItem(
  input: CreateLineItemInput
): Promise<DbJobLineItem> {
  const supabase = await db();
  const sortOrder =
    input.sortOrder ?? (await nextSortOrder(supabase, input.jobId));
  const { data, error } = await supabase
    .from("job_line_items")
    .insert({
      job_id: input.jobId,
      cost_center_id: input.costCenterId,
      line_kind: input.lineKind,
      item_code: input.itemCode,
      description: input.description,
      category: input.category,
      quantity: input.quantity,
      unit_cost: input.unitCost,
      unit_price: input.unitPrice,
      discount_pct: input.discountPct,
      taxable: input.taxable,
      // quoted_* deliberately omitted → NULL (manual line, not a snapshot).
      sort_order: sortOrder,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createLineItem: ${error.message}`);
  await syncBestEffort({
    jobId: input.jobId,
    costCenterIds: [input.costCenterId],
    actorId: input.actorId,
  });
  return data as DbJobLineItem;
}

export interface UpdateLineItemPatch {
  itemCode?: string | null;
  description?: string;
  category?: string | null;
  quantity?: number;
  unitCost?: number;
  unitPrice?: number;
  discountPct?: number;
  taxable?: boolean;
  sortOrder?: number;
  costCenterId?: string | null;
}

// Maps the camelCase patch to DB columns. quoted_* are intentionally NOT
// mappable — §2.2 immutability is enforced here at the API boundary.
const PATCH_COLUMN: Record<keyof UpdateLineItemPatch, string> = {
  itemCode: "item_code",
  description: "description",
  category: "category",
  quantity: "quantity",
  unitCost: "unit_cost",
  unitPrice: "unit_price",
  discountPct: "discount_pct",
  taxable: "taxable",
  sortOrder: "sort_order",
  costCenterId: "cost_center_id",
};

// Patch keys whose change moves a sell total — the only ones that require a
// contract_value re-sync (unit_cost never affects sell).
const SYNC_KEYS: ReadonlyArray<keyof UpdateLineItemPatch> = [
  "quantity",
  "unitPrice",
  "discountPct",
  "costCenterId",
];

export async function updateLineItem(input: {
  id: string;
  patch: UpdateLineItemPatch;
  actorId: string | null;
}): Promise<void> {
  const row: Record<string, unknown> = {};
  for (const key of Object.keys(input.patch) as (keyof UpdateLineItemPatch)[]) {
    const col = PATCH_COLUMN[key];
    if (col) row[col] = input.patch[key];
  }
  // Empty diff — no write, no updated_at bump (§2.8).
  if (Object.keys(row).length === 0) return;
  row.updated_by = input.actorId;

  // Sell-affecting change → capture the row BEFORE the write so a cost_center
  // move re-syncs the OLD cost center as well as the new one.
  const needsSync = SYNC_KEYS.some((k) => input.patch[k] !== undefined);
  const before = needsSync ? await getLineItemById(input.id) : null;

  const supabase = await db();
  const { error } = await supabase
    .from("job_line_items")
    .update(row)
    .eq("id", input.id);
  if (error) throw new Error(`updateLineItem: ${error.message}`);

  if (needsSync && before) {
    await syncBestEffort({
      jobId: before.job_id,
      costCenterIds: [
        before.cost_center_id,
        input.patch.costCenterId !== undefined
          ? input.patch.costCenterId
          : before.cost_center_id,
      ],
      actorId: input.actorId,
    });
  }
}

export async function deleteLineItem(id: string): Promise<void> {
  // Capture job + CC before the row disappears (needed for the re-sync).
  const before = await getLineItemById(id);
  const supabase = await db();
  const { error } = await supabase.from("job_line_items").delete().eq("id", id);
  if (error) throw new Error(`deleteLineItem: ${error.message}`);
  if (before) {
    await syncBestEffort({
      jobId: before.job_id,
      costCenterIds: [before.cost_center_id],
      actorId: null,
    });
  }
}

// Batch sort_order by index in orderedIds.
export async function reorderLineItems(input: {
  orderedIds: string[];
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await supabase
      .from("job_line_items")
      .update({ sort_order: i, updated_by: input.actorId })
      .eq("id", input.orderedIds[i]);
    if (error) throw new Error(`reorderLineItems: ${error.message}`);
  }
}

// Deep-copy a line item with a fresh id + timestamps. Clones are derivative, so
// they do NOT carry quoted_* (a clone is a new manual line, not a snapshot). The
// clone lands directly after the original by sort_order.
export async function cloneLineItem(
  id: string,
  actorId: string | null
): Promise<DbJobLineItem> {
  const src = await getLineItemById(id);
  if (!src) throw new Error("cloneLineItem: source not found");
  return createLineItem({
    jobId: src.job_id,
    costCenterId: src.cost_center_id,
    lineKind: src.line_kind,
    itemCode: src.item_code,
    description: src.description,
    category: src.category,
    quantity: src.quantity,
    unitCost: src.unit_cost,
    unitPrice: src.unit_price,
    discountPct: src.discount_pct,
    taxable: src.taxable,
    sortOrder: src.sort_order + 1,
    actorId,
  });
}

// ── Convert-time copy ────────────────────────────────────────────────────────

interface CostCenterRow {
  id: string;
  name: string;
  sort_order: number;
}

// Copy every quote section's part + labour lines onto the target Job as line
// items, snapshotting quoted_* == current values (§2.2). Cost centers are
// resolved per section by name (then by ordinal position) among the CCs already
// created on this job from this quote. Returns the count inserted.
export async function copyQuoteSectionsToJob(input: {
  jobId: string;
  quoteId: string;
  actorId: string | null;
}): Promise<{ inserted: number }> {
  const quote = await getQuoteById(input.quoteId);
  const sections = quote?.sections ?? [];
  if (sections.length === 0) return { inserted: 0 };

  const supabase = await db();
  // The CCs for this job that came from this quote — the section→CC candidates.
  const { data: ccData, error: ccErr } = await supabase
    .from("project_cost_centers")
    .select("id, name, sort_order")
    .eq("job_id", input.jobId)
    .eq("source_quote_id", input.quoteId)
    .order("sort_order", { ascending: true });
  if (ccErr) throw new Error(`copyQuoteSectionsToJob/ccs: ${ccErr.message}`);
  const ccs = (ccData ?? []) as CostCenterRow[];
  const byName = new Map<string, string>();
  for (const cc of ccs) if (!byName.has(cc.name)) byName.set(cc.name, cc.id);

  const rows: Record<string, unknown>[] = [];
  let sortn = 0;
  sections.forEach((section, sIdx) => {
    const ccId =
      byName.get(section.name ?? "") ?? ccs[sIdx]?.id ?? null;
    for (const li of section.items ?? []) {
      const isLabour = li.type === "labor";
      const quantity = num(li.qty, 1);
      const unitCost = num(li.unitCost, 0);
      const unitPrice = num(li.unitPrice, 0);
      rows.push({
        job_id: input.jobId,
        cost_center_id: ccId,
        line_kind: isLabour ? "labour" : "part",
        item_code: isLabour ? null : itemCodeOf(li),
        description: descriptionOf(li, isLabour),
        category: li.classification || null,
        quantity,
        unit_cost: unitCost,
        unit_price: unitPrice,
        discount_pct: 0,
        taxable: true,
        // §2.2 snapshot — Estimated starts == Quoted.
        quoted_quantity: quantity,
        quoted_unit_cost: unitCost,
        quoted_unit_price: unitPrice,
        quoted_discount_pct: 0,
        sort_order: sortn++,
        created_by: input.actorId,
        updated_by: input.actorId,
      });
    }
  });

  if (rows.length === 0) return { inserted: 0 };
  const { error } = await supabase.from("job_line_items").insert(rows);
  if (error) throw new Error(`copyQuoteSectionsToJob/insert: ${error.message}`);
  await syncBestEffort({
    jobId: input.jobId,
    costCenterIds: rows.map((r) => (r.cost_center_id as string | null) ?? null),
    actorId: input.actorId,
  });
  return { inserted: rows.length };
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function itemCodeOf(li: BuilderLineItem): string | null {
  return (li.sku || li.masterPartNumber || "").trim() || null;
}

function descriptionOf(li: BuilderLineItem, isLabour: boolean): string {
  return (
    li.name?.trim() ||
    li.description?.trim() ||
    (isLabour ? "Labour" : "Item")
  );
}

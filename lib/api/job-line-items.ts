import "server-only";

// PROJ2-6a — job_line_items persistence (parts + labour). Pure DB helpers; the
// actions layer owns permission gates. The quoted_* snapshot is write-once
// (§2.2): it's set only by copyQuoteSectionsToJob at conversion and is NEVER
// touched by updateLineItem (which defensively strips any quoted_* keys).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getQuoteById } from "@/lib/api/quotes";
import type { DbJobLineItem, JobLineKind } from "@/lib/types/database";
import type { BuilderLineItem } from "@/lib/types";

async function db() {
  return createSupabaseServerClient();
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

  const supabase = await db();
  const { error } = await supabase
    .from("job_line_items")
    .update(row)
    .eq("id", input.id);
  if (error) throw new Error(`updateLineItem: ${error.message}`);
}

export async function deleteLineItem(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("job_line_items").delete().eq("id", id);
  if (error) throw new Error(`deleteLineItem: ${error.message}`);
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

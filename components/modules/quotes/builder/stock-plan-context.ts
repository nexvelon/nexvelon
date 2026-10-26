// INV-FIX-1 — the quote builder's stock planner, shared with each line row.
// The builder owns the sections, so it is the one place that knows what the
// quote's OTHER lines already plan from each lot (so two lines of one part never
// both claim the same box).

import { createContext, useContext } from "react";
import type { StockDraw, StockSource } from "@/lib/inventory/stock-draws";
import type { BuilderLineItem } from "@/lib/types";

export interface StockPlanApi {
  /** Only roles that can see stock cost can plan (SEC-1). */
  canPlan: boolean;
  /** Re-plan a line oldest-first. "add" = a brand-new line; "hold" = keep its price. */
  replan: (line: BuilderLineItem, mode: "add" | "hold") => void;
  /** Apply a person's own choice of lots (or [] = don't use stock). */
  applyManual: (lineId: string, draws: StockDraw[], source: StockSource | null) => void;
  /** Units the quote's other uncommitted lines already plan from each lot. */
  reservedExcept: (lineId: string) => Map<string, number>;
}

export const StockPlanContext = createContext<StockPlanApi>({
  canPlan: false,
  replan: () => {},
  applyManual: () => {},
  reservedExcept: () => new Map(),
});

export const useStockPlan = () => useContext(StockPlanContext);

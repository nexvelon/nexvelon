"use client";

// REP-3 — Inventory valuation by category. As-of snapshot. inventory:view.

import { OperationalReport } from "@/components/reports/OperationalReport";

export default function InventoryValuationReportPage() {
  return (
    <OperationalReport
      reportKey="inventory-valuation"
      title="Inventory valuation"
      description="In-stock value by category, as of today."
    />
  );
}

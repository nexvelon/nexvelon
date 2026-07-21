"use client";

// FIN-5 — thin wrapper that resolves the BillsTab's data dependencies (the
// caller's financials:edit grant + the vendor/PO pickers) so BillsTab itself
// stays a pure presentation component.

import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { getBillFormOptionsAction } from "@/app/(app)/financials/actions";
import type { BillFormOptions } from "@/lib/api/vendor-bills";
import { BillsTab } from "./BillsTab";

export function BillsTabPane({
  from,
  to,
}: {
  from: string | null;
  to: string | null;
}) {
  const { role } = useRole();
  const canEdit = hasPermission(role, "financials", "edit");
  const [options, setOptions] = useState<BillFormOptions>({
    vendors: [],
    purchaseOrders: [],
  });

  useEffect(() => {
    let active = true;
    getBillFormOptionsAction().then((res) => {
      if (active && res.ok) setOptions(res.data);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <BillsTab
      from={from}
      to={to}
      canEdit={canEdit}
      vendors={options.vendors}
      purchaseOrders={options.purchaseOrders}
    />
  );
}

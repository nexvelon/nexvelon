"use client";

// UIDG-8 — the alerts band as one placeable widget (heading + AlertsWorklists),
// unchanged from what the dashboard rendered inline.

import { AlertsWorklists } from "@/components/modules/dashboard/AlertsWorklists";

export function AlertsWidget() {
  return (
    <div>
      <h2 className="text-brand-navy mb-3 font-serif text-lg">Alerts &amp; worklists</h2>
      <AlertsWorklists />
    </div>
  );
}

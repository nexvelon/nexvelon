// UIDG-8 — the dashboard is now layout-driven. This SERVER component resolves the
// caller's layout (user → org → built-in), drops widgets they can't see and
// reflows, then hands the client the resolved order — so the correct layout paints
// on first byte with no flash and no client-side reshuffle, and a hidden widget
// never reaches the browser.

import { getCurrentProfile } from "@/lib/auth/profile";
import { adaptDbRole } from "@/lib/permissions/resolve";
import { hasPermission } from "@/lib/permissions";
import { resolveDashboardLayout } from "@/lib/api/dashboard-layout";
import { WIDGET_IDS, canSeeWidget } from "@/lib/dashboard/widgets";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await getCurrentProfile();
  const role = me ? adaptDbRole(me.role) : null;

  const layout = await resolveDashboardLayout(me?.id ?? null, role);
  const visibleWidgetIds = role ? WIDGET_IDS.filter((id) => canSeeWidget(id, role)) : [];
  const canManageOrg = role ? hasPermission(role, "settings", "manage") : false;

  return (
    <DashboardClient
      initialLayout={layout.widgets}
      visibleWidgetIds={visibleWidgetIds}
      canManageOrg={canManageOrg}
    />
  );
}

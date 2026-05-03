import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth/profile";
import { listVisibleProfilesAdmin } from "@/lib/api/users";
import UsersView from "./UsersView";

// Page reads the live profiles directory; never serve a stale snapshot.
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await getCurrentProfile();

  // Defense in depth — middleware already guarantees an authenticated user
  // is present here, but we still gate the data fetch on Admin so we never
  // ship the directory in the SSR HTML for a non-admin.
  if (!me || me.role !== "Admin" || me.status !== "Active") {
    return <RestrictedCard />;
  }

  const realUsers = await listVisibleProfilesAdmin();

  return <UsersView realUsers={realUsers} />;
}

function RestrictedCard() {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
        <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The Users &amp; Permissions module is available to administrators
          only. Contact your administrator for access.
        </p>
      </Card>
    </div>
  );
}

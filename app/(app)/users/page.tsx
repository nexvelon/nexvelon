"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  UsersTab,
  RolesTab,
  PermissionsMatrixTab,
  ActivityLogTab,
  SubcontractorsTab,
  InvitationsTab,
} from "@/components/modules/users/Tabs";
import { UserDrawer } from "@/components/modules/users/UserDrawer";
import { useRole, Can } from "@/lib/role-context";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

const TABS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "matrix", label: "Permissions Matrix" },
  { key: "log", label: "Activity Log" },
  { key: "subs", label: "Subcontractors" },
  { key: "invites", label: "Invitations" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function UsersPage() {
  const { role } = useRole();
  const [tab, setTab] = useState<TabKey>("users");
  const [drawerUser, setDrawerUser] = useState<User | null>(null);

  return (
    <Can resource="users" action="view" fallback={<RestrictedCard />}>
      <div className="space-y-6">
        <header>
          <h1 className="text-brand-navy font-serif text-3xl">Users & Permissions</h1>
          <p className="text-brand-charcoal/70 mt-1 text-sm">
            Granular control over what each team member can see and do.
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Currently signed in as <span className="text-brand-navy font-semibold">{role}</span> · use the role-switcher in the top bar to demo permission boundaries live.
          </p>
        </header>

        <nav className="bg-card rounded-lg border border-[var(--border)] p-1 shadow-sm">
          <ul className="flex flex-wrap gap-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-brand-navy text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-brand-charcoal"
                    )}
                  >
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {tab === "users" && <UsersTab onPick={setDrawerUser} />}
        {tab === "roles" && <RolesTab />}
        {tab === "matrix" && <PermissionsMatrixTab />}
        {tab === "log" && <ActivityLogTab />}
        {tab === "subs" && <SubcontractorsTab />}
        {tab === "invites" && <InvitationsTab />}

        <UserDrawer user={drawerUser} onClose={() => setDrawerUser(null)} />
      </div>
    </Can>
  );
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
          The Users & Permissions module is available to administrators only.
          Contact your administrator for access.
        </p>
      </Card>
    </div>
  );
}

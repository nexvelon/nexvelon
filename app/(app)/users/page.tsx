"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
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
        <PageHeader
          eyebrow="42 employees · 6 subcontractors"
          title="Users & Permissions"
          description="Identity directory · role presets · granular permissions matrix"
          actions={
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
                style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
              >
                Audit log
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
                style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
              >
                Import SCIM
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
                style={{ background: "var(--brand-primary)" }}
              >
                + Invite user
              </button>
            </>
          }
        />
        <p className="text-muted-foreground -mt-3 text-[11px]">
          Currently signed in as{" "}
          <span className="text-brand-navy font-semibold">{role}</span> · use
          the role-switcher to demo permission boundaries live.
        </p>

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

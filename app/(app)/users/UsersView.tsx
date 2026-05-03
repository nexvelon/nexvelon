"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  UsersTab,
  RolesTab,
  PermissionsMatrixTab,
  ActivityLogTab,
  SubcontractorsTab,
  InvitationsTab,
} from "@/components/modules/users/Tabs";
import { InviteUserDrawer } from "@/components/modules/users/InviteUserDrawer";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";
import type { DbProfile } from "@/lib/types/database";

const TABS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "matrix", label: "Permissions Matrix" },
  { key: "log", label: "Activity Log" },
  { key: "subs", label: "Subcontractors" },
  { key: "invites", label: "Invitations" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface UsersViewProps {
  realUsers: DbProfile[];
}

export default function UsersView({ realUsers }: UsersViewProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("users");
  const [inviteOpen, setInviteOpen] = useState(false);

  const counts = useCounts(realUsers);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${counts.activeOrInvited} active · ${counts.invited} pending`}
        title="Users & Permissions"
        description="Identity directory · role presets · granular permissions matrix"
        actions={
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{
                borderColor: "var(--brand-border)",
                color: "var(--brand-text)",
              }}
            >
              Audit log
            </button>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              + Invite user
            </button>
          </>
        }
      />
      <p className="text-muted-foreground -mt-3 text-[11px]">
        Signed in as{" "}
        <span className="text-brand-navy font-semibold">
          {user?.name ?? "Admin"}
        </span>{" "}
        · {realUsers.length}{" "}
        {realUsers.length === 1 ? "profile" : "profiles"} in the directory.
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

      {tab === "users" && (
        <UsersTab realUsers={realUsers} onInvite={() => setInviteOpen(true)} />
      )}
      {tab === "roles" && <RolesTab />}
      {tab === "matrix" && <PermissionsMatrixTab />}
      {tab === "log" && <ActivityLogTab />}
      {tab === "subs" && <SubcontractorsTab />}
      {tab === "invites" && <InvitationsTab realUsers={realUsers} />}

      <InviteUserDrawer
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}

function useCounts(rows: DbProfile[]) {
  const active = rows.filter((r) => r.status === "Active").length;
  const invited = rows.filter((r) => r.status === "Invited").length;
  return { active, invited, activeOrInvited: active + invited };
}

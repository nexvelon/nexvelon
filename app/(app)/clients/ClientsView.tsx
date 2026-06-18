"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Download,
  Edit3,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/role-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClientFormDrawer } from "./ClientFormDrawer";
import { TIER_BADGE, initials } from "./_components/shared";
import { deleteClientAction, listClientsAction } from "./actions";
import {
  sendClientInviteAction,
  listPendingClientsAction,
  approvePendingClientAction,
  rejectPendingClientAction,
} from "./invite-actions";
import type { DbClient, DbClientWithCounts } from "@/lib/types/database";

// FIX-1: dropped imports — getCurrentUserIsAdminAction (was used only by
// the Show-archived admin gate) and restoreClientAction (no longer
// exists). The functions themselves remain in actions.ts for any future
// admin-gated UI.

interface Props {
  clients: DbClientWithCounts[];
}

export function ClientsView({ clients }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // Local source of truth, seeded from SSR props. Mutations refresh it
  // via listClientsAction. FIX-1: dropped the showArchived branch — the
  // list is always the full set (no soft-deleted rows exist).
  const [rows, setRows] = useState<DbClientWithCounts[]>(clients);
  const [confirmDelete, setConfirmDelete] = useState<DbClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = async () => {
    const r = await listClientsAction();
    if (r.ok) setRows(r.data);
    else toast.error(r.error);
  };

  // CL-9: the list owns the EDIT drawer only. Create now navigates to the
  // full-screen page at /clients/new. Per-client site / contact operations
  // live on /clients/[id]. The drawer state mirrors that narrowing — no
  // mode discriminator anymore, just an open flag + the client being edited.
  const [editDrawer, setEditDrawer] = useState<
    { open: false } | { open: true; client: DbClient }
  >({ open: false });

  // POLISH-3 — invite + pending-review (admin-gated). Pending clients are
  // fetched lazily when the tab is opened.
  const { role } = useRole();
  const isAdmin = role === "Admin";
  const [view, setView] = useState<"active" | "pending">("active");
  const [pendingRows, setPendingRows] = useState<DbClientWithCounts[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);

  const loadPending = async () => {
    setPendingLoading(true);
    const r = await listPendingClientsAction();
    if (r.ok) setPendingRows(r.data);
    else toast.error(r.error);
    setPendingLoading(false);
  };
  useEffect(() => {
    // Load the pending list/count once admin status is known (tab badge).
    if (isAdmin) loadPending();
  }, [isAdmin]);

  const sendInvite = () => {
    setInviteSending(true);
    sendClientInviteAction(inviteEmail).then((r) => {
      setInviteSending(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteOpen(false);
    });
  };

  const approve = (id: string) => {
    setActing(id);
    approvePendingClientAction(id).then((r) => {
      setActing(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Client approved");
      void loadPending();
      void reload();
    });
  };
  const reject = (id: string) => {
    if (!window.confirm("Reject and delete this pending client + its site?")) return;
    setActing(id);
    rejectPendingClientAction(id).then((r) => {
      setActing(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Pending client rejected");
      void loadPending();
    });
  };

  const InviteButton = isAdmin ? (
    <button
      type="button"
      onClick={() => setInviteOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
      style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
    >
      <UserPlus className="h-3.5 w-3.5" />
      Invite new client
    </button>
  ) : null;

  const Tabs = isAdmin ? (
    <div className="flex items-center gap-1">
      {(["active", "pending"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            view === v
              ? "bg-brand-navy text-white"
              : "text-brand-charcoal hover:bg-muted"
          )}
        >
          {v === "active" ? "Active" : `Pending Review (${pendingRows.length})`}
        </button>
      ))}
    </div>
  ) : null;

  const inviteDialog = (
    <Dialog open={inviteOpen} onOpenChange={(o) => !inviteSending && setInviteOpen(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Invite a new client</DialogTitle>
          <DialogDescription>
            We&apos;ll email a secure onboarding link (client form, site form, and
            two T&amp;Cs to sign). They can complete it across multiple sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Client email</label>
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="contact@client.com"
            onKeyDown={(e) => {
              if (e.key === "Enter" && inviteEmail.trim()) sendInvite();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteSending}>
            Cancel
          </Button>
          <Button onClick={sendInvite} disabled={inviteSending || !inviteEmail.trim()}>
            {inviteSending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const pendingBody = (
    <div className="space-y-4">
      <p className="nx-eyebrow-soft">
        Awaiting review · {pendingRows.length}
      </p>
      {pendingLoading ? (
        <Card className="bg-card p-6 text-center text-xs text-muted-foreground">
          Loading…
        </Card>
      ) : pendingRows.length === 0 ? (
        <Card className="bg-card p-6 text-center text-xs text-muted-foreground">
          No clients awaiting review. Invited clients appear here after they
          submit their onboarding.
        </Card>
      ) : (
        <ul className="space-y-2">
          {pendingRows.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border bg-card px-4 py-3"
              style={{ borderColor: "var(--brand-border)" }}
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => router.push(`/clients/${c.id}`)}
                  className="text-brand-navy truncate text-sm font-semibold hover:underline"
                >
                  {c.name}
                </button>
                <p className="text-muted-foreground truncate text-[11px]">
                  {c.portal_contact_email ?? c.legal_name ?? "—"}
                  {c.invited_at
                    ? ` · submitted ${new Date(c.invited_at).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => approve(c.id)}
                disabled={acting === c.id}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reject(c.id)}
                disabled={acting === c.id}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.legal_name?.toLowerCase().includes(q) ?? false) ||
        (c.client_code?.toLowerCase().includes(q) ?? false)
    );
  }, [rows, search]);

  // ─── Empty state ─────────────────────────────────────────────────────────
  // FIX-1: rows.length IS activeCount now (no soft-deleted rows exist).
  const activeCount = rows.length;

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="0 active clients"
          title="Clients"
          actions={InviteButton}
        />
        {Tabs}
        {view === "pending" ? (
          pendingBody
        ) : (
        <Card className="border-dashed py-16 text-center" style={{ background: "var(--brand-card)" }}>
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              border: "1px solid color-mix(in oklab, var(--brand-accent) 50%, transparent)",
            }}
          >
            <Building2 className="h-6 w-6" style={{ color: "var(--brand-accent)" }} />
          </div>
          <p className="nx-eyebrow mb-2">Clients module</p>
          <h2
            className="font-serif text-3xl tracking-tight"
            style={{ color: "var(--brand-primary)" }}
          >
            No clients yet
          </h2>
          <p className="nx-subtitle mx-auto mt-2 max-w-md text-sm">
            Add your first client to start tracking sites, contacts, and
            service history. Everything you add is stored in Supabase.
          </p>
          <button
            type="button"
            onClick={() => router.push("/clients/new")}
            className="mt-6 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-primary)",
              fontFamily: "var(--font-playfair), serif",
            }}
          >
            <Plus className="h-4 w-4" />
            Add your first client
          </button>
        </Card>
        )}

        {inviteDialog}
        {/* CL-9: empty-state has no rows → no edit drawer to render here. */}
      </div>
    );
  }

  // ─── Populated state ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${activeCount} active client${activeCount === 1 ? "" : "s"}`}
        title="Clients"
        actions={
          <>
            <button
              type="button"
              onClick={() => toast.info("Export not implemented yet.")}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{
                borderColor: "var(--brand-border)",
                color: "var(--brand-text)",
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            {InviteButton}
            <button
              type="button"
              onClick={() => router.push("/clients/new")}
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add client
            </button>
          </>
        }
      />

      {Tabs}

      {view === "pending" ? (
        pendingBody
      ) : (
      <div className="space-y-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="nx-eyebrow-soft">
            A–Z · {filtered.length} of {rows.length}
          </p>
          {/* FIX-1: dropped the admin-gated "Show archived" toggle — the
              hard-delete model has no archived state to surface. */}
        </div>

        <ul className="space-y-2">
          {filtered.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              active={false}
              onSelect={() => router.push(`/clients/${c.id}`)}
              onEdit={() => setEditDrawer({ open: true, client: c })}
              onDelete={() => setConfirmDelete(c)}
            />
          ))}
        </ul>
      </div>
      )}

      {inviteDialog}

      {editDrawer.open && (
        <ClientFormDrawer
          open
          onClose={() => setEditDrawer({ open: false })}
          mode={{ kind: "edit", client: editDrawer.client }}
        />
      )}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o && !deleting) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Delete client?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.name} will be permanently deleted, along with
              its sites and contacts. This cannot be undone. (The activity
              log entry is preserved for audit purposes.)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
              className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={performDeleteClient}
              disabled={deleting}
              className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ─── Delete handler ──────────────────────────────────────────────────────
  // FIX-1: restore handler removed (no soft-deleted state to restore from).
  function performDeleteClient() {
    if (!confirmDelete) return;
    const c = confirmDelete;
    setDeleting(true);
    deleteClientAction(c.id).then((r) => {
      setDeleting(false);
      if (r.ok) {
        setConfirmDelete(null);
        toast.success("Client deleted");
        void reload();
      } else {
        // Keep the modal open + Delete button enabled so the user can retry.
        toast.error(r.error);
      }
    });
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ClientRow({
  client,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  client: DbClientWithCounts;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tier = client.tier;
  const badge = tier ? TIER_BADGE[tier] : TIER_BADGE.Bronze;

  return (
    <li className="group">
      <div
        className={cn(
          "relative flex w-full items-center gap-3 rounded-md border bg-card p-3 transition-shadow",
          active ? "shadow-md ring-1" : "hover:shadow-sm"
        )}
        style={{
          borderColor: active
            ? "color-mix(in oklab, var(--brand-accent) 60%, transparent)"
            : "var(--brand-border)",
          ["--tw-ring-color" as string]: "var(--brand-accent)",
        }}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-sm font-mono text-[10px] font-bold tracking-widest"
            style={{
              background: active ? "var(--brand-primary)" : "var(--brand-muted)",
              color: active ? "var(--brand-bg)" : "var(--brand-primary)",
            }}
          >
            {initials(client.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="font-serif text-sm font-medium leading-tight truncate"
              style={{ color: "var(--brand-primary)" }}
            >
              {client.name}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
              {client.type ?? "—"} · {client.site_count} site
              {client.site_count === 1 ? "" : "s"} ·{" "}
              <span className="text-brand-charcoal font-medium">
                {formatCurrency(client.lifetime_value)}
              </span>
            </p>
          </div>
        </button>
        {tier && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-sm font-mono text-[10px] font-bold"
            style={{ background: badge.bg, color: badge.text }}
            title={tier}
          >
            {badge.label}
          </span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
            aria-label="Edit"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Row actions"
              className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex items-center justify-center rounded p-1"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* FIX-1: dropped the archived/Restore branch — hard-delete
                  model has no archived state. */}
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 data-highlighted:text-red-600"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete client
              </DropdownMenuItem>
              {/* Future row actions (Duplicate, …) slot in here without
                  restructuring the menu. */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

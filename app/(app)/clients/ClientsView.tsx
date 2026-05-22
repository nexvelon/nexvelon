"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Download,
  Edit3,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  deleteClientAction,
  getCurrentUserIsAdminAction,
  listClientsAction,
  restoreClientAction,
} from "./actions";
import type { DbClient, DbClientWithCounts } from "@/lib/types/database";

interface Props {
  clients: DbClientWithCounts[];
}

export function ClientsView({ clients }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // Local source of truth, seeded from SSR props. Mutations refresh it via
  // listClientsAction so the archived toggle stays coherent (router.refresh
  // would only re-fetch the default active-only set).
  const [rows, setRows] = useState<DbClientWithCounts[]>(clients);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DbClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserIsAdminAction().then((r) => {
      if (!cancelled && r.ok) setIsAdmin(r.data.isAdmin);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async (archived: boolean) => {
    const r = await listClientsAction(archived);
    if (r.ok) setRows(r.data);
    else toast.error(r.error);
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    void reload(next);
  };

  // Drawer state — the list only owns the client create / edit drawer.
  // Per-client site / contact operations now live on /clients/[id].
  const [clientDrawer, setClientDrawer] = useState<
    | { open: false }
    | { open: true; mode: "create" }
    | { open: true; mode: "edit"; client: DbClient }
  >({ open: false });

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
  const activeCount = rows.filter((c) => !c.deleted_at).length;

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="0 active clients"
          title="Clients & Sites"
          description="Master directory · contracts · service history"
        />
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
            onClick={() => setClientDrawer({ open: true, mode: "create" })}
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

        {clientDrawer.open && (
          <ClientFormDrawer
            open
            onClose={() => setClientDrawer({ open: false })}
            mode={
              clientDrawer.mode === "edit"
                ? { kind: "edit", client: clientDrawer.client }
                : { kind: "create" }
            }
          />
        )}
      </div>
    );
  }

  // ─── Populated state ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${activeCount} active client${activeCount === 1 ? "" : "s"}`}
        title="Clients & Sites"
        description="Master directory · contracts · service history"
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
            <button
              type="button"
              onClick={() => setClientDrawer({ open: true, mode: "create" })}
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add client
            </button>
          </>
        }
      />

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
          {isAdmin && (
            <button
              type="button"
              onClick={toggleArchived}
              aria-pressed={showArchived}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                showArchived
                  ? "bg-muted text-brand-charcoal"
                  : "text-muted-foreground hover:bg-muted/40"
              )}
              style={{ borderColor: "var(--brand-border)" }}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          )}
        </div>

        <ul className="space-y-2">
          {filtered.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              active={false}
              archived={!!c.deleted_at}
              onSelect={() => router.push(`/clients/${c.id}`)}
              onEdit={() =>
                setClientDrawer({ open: true, mode: "edit", client: c })
              }
              onDelete={() => setConfirmDelete(c)}
              onRestore={() => handleRestoreClient(c)}
            />
          ))}
        </ul>
      </div>

      {clientDrawer.open && (
        <ClientFormDrawer
          open
          onClose={() => setClientDrawer({ open: false })}
          mode={
            clientDrawer.mode === "edit"
              ? { kind: "edit", client: clientDrawer.client }
              : { kind: "create" }
          }
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
              {confirmDelete?.name} will be hidden from the active list. An
              admin can restore it later from the archived view. This will
              not permanently remove the client&apos;s records.
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

  // ─── Delete / restore handlers ───────────────────────────────────────────
  function performDeleteClient() {
    if (!confirmDelete) return;
    const c = confirmDelete;
    setDeleting(true);
    deleteClientAction(c.id).then((r) => {
      setDeleting(false);
      if (r.ok) {
        setConfirmDelete(null);
        toast.success("Client deleted");
        void reload(showArchived);
      } else {
        // Keep the modal open + Delete button enabled so the user can retry.
        toast.error(r.error);
      }
    });
  }

  function handleRestoreClient(c: DbClient) {
    restoreClientAction(c.id).then((r) => {
      if (r.ok) {
        toast.success(`Restored ${c.name}`);
        void reload(showArchived);
      } else {
        toast.error(r.error);
      }
    });
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ClientRow({
  client,
  active,
  archived,
  onSelect,
  onEdit,
  onDelete,
  onRestore,
}: {
  client: DbClientWithCounts;
  active: boolean;
  archived: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
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
              className={cn(
                "font-serif text-sm font-medium leading-tight truncate",
                archived && "line-through opacity-60"
              )}
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
        {archived && (
          <span
            className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            title="Soft-deleted — restore from this menu"
          >
            Archived
          </span>
        )}
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
          {!archived && (
            <button
              type="button"
              onClick={onEdit}
              className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
              aria-label="Edit"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Row actions"
              className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex items-center justify-center rounded p-1"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {archived ? (
                <DropdownMenuItem onClick={onRestore}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Restore client
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-red-600 data-highlighted:text-red-600"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete client
                </DropdownMenuItem>
              )}
              {/* Future row actions (Archive, Duplicate, …) slot in here
                  without restructuring the menu. */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

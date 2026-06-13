"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Building2, Edit3, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SiteFormDrawer } from "../clients/SiteFormDrawer";
import { deleteSiteAction, listSitesAction } from "../clients/actions";
import type {
  DbClient,
  DbClientOpco,
  DbSite,
  DbSiteStatus,
  DbSiteWithClient,
} from "@/lib/types/database";

const STATUSES: DbSiteStatus[] = [
  "Active",
  "In Project",
  "Maintained",
  "Decommissioned",
];

const STATUS_STYLE: Record<DbSiteStatus, { bg: string; text: string }> = {
  Active: {
    bg: "color-mix(in oklab, var(--brand-status-green) 18%, transparent)",
    text: "var(--brand-status-green)",
  },
  "In Project": {
    bg: "color-mix(in oklab, #3b82f6 18%, transparent)",
    text: "#2563eb",
  },
  Maintained: {
    bg: "color-mix(in oklab, var(--brand-accent) 24%, transparent)",
    text: "var(--brand-primary)",
  },
  Decommissioned: {
    bg: "var(--brand-muted)",
    text: "var(--brand-text)",
  },
};

interface Props {
  initialSites: DbSiteWithClient[];
  /**
   * Full DbClient rows — used both for the filter dropdown AND passed
   * through to SiteFormDrawer so the edit drawer can render inheritance
   * (it needs the parent client's billing/payment/portal fields).
   */
  clients: DbClient[];
}

export function SitesView({ initialSites, clients }: Props) {
  const router = useRouter();
  const [sites, setSites] = useState<DbSiteWithClient[]>(initialSites);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DbSiteStatus | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  // SITES-2b: drawer state narrows to EDIT-only — create now navigates to
  // /sites/new (full-screen).
  const [editDrawer, setEditDrawer] = useState<
    { open: false } | { open: true; site: DbSite }
  >({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<DbSite | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    const r = await listSitesAction();
    if (r.ok) setSites(r.data);
    else toast.error(r.error);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (clientFilter !== "all" && s.client_id !== clientFilter) return false;
      if (q) {
        const hay = `${s.name} ${s.site_code ?? ""} ${
          s.client?.name ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sites, search, statusFilter, clientFilter]);

  function handleDelete() {
    if (!confirmDelete) return;
    const s = confirmDelete;
    setDeleting(true);
    deleteSiteAction(s.id).then((r) => {
      setDeleting(false);
      if (r.ok) {
        setConfirmDelete(null);
        toast.success(`Deleted ${s.name}`);
        void refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${sites.length} site${sites.length === 1 ? "" : "s"} · all clients`}
        title="Sites"
        description="Every operating site across all clients"
        actions={
          <button
            type="button"
            onClick={() => router.push("/sites/new")}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add site
          </button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by site, code, or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter((v ?? "all") as DbSiteStatus | "all")
          }
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={clientFilter}
          onValueChange={(v) => setClientFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table / empty states */}
      {sites.length === 0 ? (
        <EmptyState message="No sites yet. Add a site to get started." />
      ) : filtered.length === 0 ? (
        <EmptyState message="No sites match your filters." />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site Code</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Site/Project Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Service</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <SiteRow
                  key={s.id}
                  site={s}
                  onOpen={() => router.push(`/sites/${s.id}`)}
                  onEdit={() => setEditDrawer({ open: true, site: s })}
                  onDelete={() => setConfirmDelete(s)}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {editDrawer.open && (
        <SiteFormDrawer
          open
          onClose={() => {
            setEditDrawer({ open: false });
            void refresh();
          }}
          clients={clients}
          mode={{ kind: "edit", site: editDrawer.site }}
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
            <DialogTitle className="font-serif">Delete site?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.name} will be hidden from the active list. This is
              a soft-delete — an admin can restore it later.
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
              onClick={handleDelete}
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
}

function SiteRow({
  site,
  onOpen,
  onEdit,
  onDelete,
}: {
  site: DbSiteWithClient;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const location =
    [site.city, site.province].filter(Boolean).join(" · ") || "—";

  return (
    <TableRow className="group cursor-pointer" onClick={onOpen}>
      <TableCell className="font-mono text-xs">
        {site.site_code ?? "—"}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-sm">{site.client?.name ?? "—"}</span>
          {site.client?.default_opco && (
            <OpcoBadge opco={site.client.default_opco} />
          )}
        </span>
      </TableCell>
      <TableCell className="text-sm font-medium">{site.name}</TableCell>
      <TableCell className="text-muted-foreground text-xs">{location}</TableCell>
      <TableCell>
        <StatusBadge status={site.status} />
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {site.last_service_date
          ? format(parseISO(site.last_service_date), "MMM d, yyyy")
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Edit site"
            className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete site"
            className="text-muted-foreground hover:bg-muted rounded p-1 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function OpcoBadge({ opco }: { opco: DbClientOpco }) {
  return (
    <span
      className="bg-muted text-muted-foreground rounded-sm px-1 font-mono text-[9px] font-bold uppercase tracking-wider"
      title={opco === "guardian" ? "Guardian" : "Integrated Solutions"}
    >
      {opco === "guardian" ? "GD" : "IS"}
    </span>
  );
}

function StatusBadge({ status }: { status: DbSiteStatus }) {
  const st = STATUS_STYLE[status];
  return (
    <span
      className="rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
      style={{ background: st.bg, color: st.text }}
    >
      {status}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card
      className="border-dashed py-16 text-center"
      style={{ background: "var(--brand-card)" }}
    >
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          border:
            "1px solid color-mix(in oklab, var(--brand-accent) 50%, transparent)",
        }}
      >
        <Building2 className="h-5 w-5" style={{ color: "var(--brand-accent)" }} />
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
    </Card>
  );
}

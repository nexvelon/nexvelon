"use client";

// SUB-1 — subcontractor detail: header + contact/business/vendor-link/notes
// cards, plus clearly-labelled INERT placeholders for the surfaces later chunks
// bring (compliance docs SUB-2, bills SUB-4, agreements SUB-5, assignments
// SUB-6) so the page shape is right and they slot in without a redesign.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  getSubcontractorAction,
  deleteSubcontractorAction,
  linkVendorAction,
  listVendorOptionsAction,
} from "@/app/(app)/subcontractors/actions";
import { SubcontractorFormDrawer } from "./SubcontractorFormDrawer";
import type { SubcontractorDetail as SubDetail } from "@/lib/api/subcontractors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  do_not_use: "Do not use",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  inactive: "bg-muted text-muted-foreground",
  do_not_use: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

export function SubcontractorDetail({ id }: { id: string }) {
  const router = useRouter();
  const { role } = useRole();
  const canEdit = hasPermission(role, "subcontractors", "edit");
  const canDelete = hasPermission(role, "subcontractors", "delete");

  const [sub, setSub] = useState<SubDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getSubcontractorAction(id).then((res) => {
      setLoaded(true);
      if (res.ok) setSub(res.data);
    });
  };
  useEffect(load, [id]);
  useEffect(() => {
    if (canEdit) listVendorOptionsAction().then((r) => r.ok && setVendors(r.data));
  }, [canEdit]);

  const handleLinkVendor = async (vendorId: string | null) => {
    setBusy(true);
    try {
      const res = await linkVendorAction(id, vendorId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      load();
      toast.success(vendorId ? "Vendor linked" : "Vendor link cleared");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const res = await deleteSubcontractorAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Subcontractor deleted");
      router.push("/subcontractors");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;
  if (!sub) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">Subcontractor not found</h1>
        <Link href="/subcontractors" className="text-brand-gold mt-4 inline-block text-sm hover:underline">
          ← Back to Subcontractors
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <Link href="/subcontractors" className="text-muted-foreground hover:text-brand-charcoal text-xs">
        ← Back to Subcontractors
      </Link>

      {/* Header */}
      <Card className="p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-brand-navy font-serif text-2xl">{sub.name}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {sub.trade ?? "No trade set"}
              <span className={cn("ml-3 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[sub.status])}>
                {STATUS_LABEL[sub.status] ?? sub.status}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Edit3 className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {canDelete && (
              <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard title="Contact & address">
          <Row label="Contact" value={sub.contact_name} />
          <Row label="Email" value={sub.email} />
          <Row label="Phone" value={sub.phone} />
          <Row
            label="Address"
            value={[sub.address_line1, sub.address_line2, sub.city, sub.province, sub.postal_code, sub.country]
              .filter(Boolean)
              .join(", ") || null}
          />
        </InfoCard>

        <InfoCard title="Business details">
          <Row label="Legal name" value={sub.legal_name} />
          <Row label="Business number (BN)" value={sub.business_number} />
          <Row label="GST/HST number" value={sub.gst_hst_number} />
          <Row
            label="Default labour rate"
            value={sub.default_labour_rate == null ? null : formatCurrency(Number(sub.default_labour_rate))}
          />
          <Row label="Payment terms" value={sub.payment_terms} />
        </InfoCard>

        <InfoCard title="Vendor link">
          <p className="text-muted-foreground text-[11px]">
            Links this subcontractor to a vendor record so their bills flow into
            project costs.
          </p>
          {canEdit ? (
            <Select
              value={sub.vendor_id ?? "none"}
              onValueChange={(v) => handleLinkVendor(v === "none" ? null : (v ?? null))}
              disabled={busy}
            >
              <SelectTrigger className="mt-2 h-9 text-sm">
                <SelectValue placeholder="No linked vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked vendor</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-brand-charcoal mt-2 text-sm">
              {sub.vendor_name ? `Linked to ${sub.vendor_name}` : "No linked vendor"}
            </p>
          )}
        </InfoCard>

        <InfoCard title="Notes">
          <p className="text-brand-charcoal whitespace-pre-wrap text-sm">
            {sub.notes ?? <span className="text-muted-foreground">No notes.</span>}
          </p>
        </InfoCard>
      </div>

      {/* Inert placeholders — the page shape later chunks slot into. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Placeholder title="Compliance documents" chunk="SUB-2" note="WSIB, insurance and licenses with expiry tracking." />
        <Placeholder title="Bills" chunk="SUB-4" note="Vendor bills from this subcontractor, into per-job cost." />
        <Placeholder title="Agreements" chunk="SUB-5" note="Work orders / sub-agreements with scope and value." />
        <Placeholder title="Assignments" chunk="SUB-6" note="Jobs this subcontractor is assigned to." />
      </div>

      {editing && (
        <SubcontractorFormDrawer
          open={editing}
          mode={{ kind: "edit", sub }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete subcontractor?</DialogTitle>
            <DialogDescription>
              This permanently removes {sub.name}. Vendor-side bills and history
              are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={busy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2 p-4 shadow-sm">
      <h3 className="text-brand-navy font-serif text-base">{title}</h3>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-brand-charcoal text-right">{value || "—"}</span>
    </div>
  );
}

function Placeholder({ title, chunk, note }: { title: string; chunk: string; note: string }) {
  return (
    <Card className="border-dashed p-4 opacity-70 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-muted-foreground font-serif text-base">{title}</h3>
        <span className="text-muted-foreground rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
          {chunk}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-[11px]">{note}</p>
    </Card>
  );
}

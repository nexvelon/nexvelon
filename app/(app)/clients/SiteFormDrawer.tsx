"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSiteAction, updateSiteAction } from "./actions";
import type { DbSite, DbSiteStatus } from "@/lib/types/database";

const STATUSES: DbSiteStatus[] = [
  "Active",
  "In Project",
  "Maintained",
  "Decommissioned",
];

type Mode = { kind: "create"; clientId: string } | { kind: "edit"; site: DbSite };

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
}

export function SiteFormDrawer({ open, onClose, mode }: Props) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.site : null;
  const clientId = isEdit ? mode.site.client_id : mode.clientId;

  const [name, setName] = useState(existing?.name ?? "");
  const [siteCode, setSiteCode] = useState(existing?.site_code ?? "");
  const [address1, setAddress1] = useState(existing?.address_line1 ?? "");
  const [address2, setAddress2] = useState(existing?.address_line2 ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [province, setProvince] = useState(existing?.province ?? "");
  const [postal, setPostal] = useState(existing?.postal_code ?? "");
  const [panelSystem, setPanelSystem] = useState(existing?.panel_system ?? "");
  const [intrusion, setIntrusion] = useState(existing?.intrusion_system ?? "");
  const [cameras, setCameras] = useState(existing?.cameras_count.toString() ?? "0");
  const [controllers, setControllers] = useState(
    existing?.controllers_count.toString() ?? "0"
  );
  const [doors, setDoors] = useState(existing?.doors_count.toString() ?? "0");
  const [cards, setCards] = useState(existing?.cards_issued.toString() ?? "0");
  const [status, setStatus] = useState<DbSiteStatus>(existing?.status ?? "Active");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Site name is required.");
      return;
    }

    const payload = {
      client_id: clientId,
      name: name.trim(),
      site_code: siteCode.trim() || null,
      address_line1: address1.trim() || null,
      address_line2: address2.trim() || null,
      city: city.trim() || null,
      province: province.trim() || null,
      postal_code: postal.trim() || null,
      panel_system: panelSystem.trim() || null,
      intrusion_system: intrusion.trim() || null,
      cameras_count: parseInt(cameras || "0", 10) || 0,
      controllers_count: parseInt(controllers || "0", 10) || 0,
      doors_count: parseInt(doors || "0", 10) || 0,
      cards_issued: parseInt(cards || "0", 10) || 0,
      status,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = isEdit && existing
        ? await updateSiteAction(existing.id, payload)
        : await createSiteAction(payload);

      if (result.ok) {
        toast.success(isEdit ? `Updated ${payload.name}` : `Added ${payload.name}`);
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[440px] overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">
            {isEdit ? "Edit site" : "Add site"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update operating site details."
              : "Add a new operating site to this client."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
          <Field label="Site name *" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Bay 4 (Cleanroom)"
            />
          </Field>

          <Field label="Site code">
            <Input
              value={siteCode}
              onChange={(e) => setSiteCode(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>

          <Field label="Address — line 1">
            <Input
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              placeholder="1842 Industrial Pkwy"
            />
          </Field>

          <Field label="Address — line 2">
            <Input
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              placeholder="Suite / floor / unit"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="Province">
              <Input
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="ON"
              />
            </Field>
            <Field label="Postal">
              <Input value={postal} onChange={(e) => setPostal(e.target.value)} />
            </Field>
          </div>

          <Field label="Panel system">
            <Input
              value={panelSystem}
              onChange={(e) => setPanelSystem(e.target.value)}
              placeholder="Genetec Synergis 4.3"
            />
          </Field>

          <Field label="Intrusion system">
            <Input
              value={intrusion}
              onChange={(e) => setIntrusion(e.target.value)}
              placeholder="DSC PowerSeries Neo"
            />
          </Field>

          <div className="grid grid-cols-4 gap-3">
            <Field label="Cameras">
              <Input
                inputMode="numeric"
                value={cameras}
                onChange={(e) => setCameras(e.target.value.replace(/\D/g, ""))}
                className="text-right tabular-nums"
              />
            </Field>
            <Field label="Controllers">
              <Input
                inputMode="numeric"
                value={controllers}
                onChange={(e) =>
                  setControllers(e.target.value.replace(/\D/g, ""))
                }
                className="text-right tabular-nums"
              />
            </Field>
            <Field label="Doors">
              <Input
                inputMode="numeric"
                value={doors}
                onChange={(e) => setDoors(e.target.value.replace(/\D/g, ""))}
                className="text-right tabular-nums"
              />
            </Field>
            <Field label="Cards">
              <Input
                inputMode="numeric"
                value={cards}
                onChange={(e) => setCards(e.target.value.replace(/\D/g, ""))}
                className="text-right tabular-nums"
              />
            </Field>
          </div>

          <Field label="Status">
            <Select
              value={status}
              onValueChange={(v) => setStatus((v ?? "Active") as DbSiteStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
              style={{
                background: "var(--brand-accent)",
                color: "var(--brand-primary)",
              }}
            >
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add site"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="nx-eyebrow-soft text-[10px]">
        {label}
        {required && <span className="ml-1 text-red-600">·</span>}
      </Label>
      {children}
    </div>
  );
}

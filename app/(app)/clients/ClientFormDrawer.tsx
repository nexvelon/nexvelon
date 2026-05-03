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
import {
  createClientAction,
  updateClientAction,
} from "./actions";
import type {
  DbClient,
  DbClientTier,
  DbClientType,
} from "@/lib/types/database";

const TYPES: DbClientType[] = [
  "Commercial",
  "Industrial",
  "Residential",
  "Healthcare",
  "Education",
  "Government",
  "Heritage",
];

const TIERS: DbClientTier[] = ["Platinum", "Gold", "Silver", "Bronze"];

type Mode = { kind: "create" } | { kind: "edit"; client: DbClient };

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
}

export function ClientFormDrawer({ open, onClose, mode }: Props) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.client : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [legalName, setLegalName] = useState(existing?.legal_name ?? "");
  const [clientCode, setClientCode] = useState(existing?.client_code ?? "");
  const [type, setType] = useState<DbClientType | "">(existing?.type ?? "");
  const [tier, setTier] = useState<DbClientTier | "">(existing?.tier ?? "");
  const [industry, setIndustry] = useState(existing?.industry ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setName("");
    setLegalName("");
    setClientCode("");
    setType("");
    setTier("");
    setIndustry("");
    setNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Client name is required.");
      return;
    }

    const payload = {
      name: name.trim(),
      legal_name: legalName.trim() || null,
      client_code: clientCode.trim() || null,
      type: (type || null) as DbClientType | null,
      tier: (tier || null) as DbClientTier | null,
      industry: industry.trim() || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = isEdit && existing
        ? await updateClientAction(existing.id, payload)
        : await createClientAction(payload);

      if (result.ok) {
        toast.success(isEdit ? `Updated ${payload.name}` : `Added ${payload.name}`);
        if (!isEdit) reset();
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
            {isEdit ? "Edit client" : "Add client"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update client information. Changes save immediately."
              : "Create a new master client record. You can add sites and contacts after."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
          <Field label="Name *" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Meridian Capital Plaza"
            />
          </Field>

          <Field label="Legal name">
            <Input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Meridian Capital Plaza Holdings Inc."
            />
          </Field>

          <Field label="Client code">
            <Input
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value)}
              placeholder="MCP-0017"
              className="font-mono text-xs"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={type || undefined}
                onValueChange={(v) => setType((v ?? "") as DbClientType | "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tier">
              <Select
                value={tier || undefined}
                onValueChange={(v) => setTier((v ?? "") as DbClientTier | "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tier…" />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Industry">
            <Input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Pharmaceuticals · GMP"
            />
          </Field>

          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes — not shown to the client."
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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add client"}
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

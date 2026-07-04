"use client";

// PO-3 — Settings → Purchase Order Email. Two admin-gated fields: the "From"
// name + address used when emailing purchase orders to vendors (PO-4). Reads/
// writes company_settings keys po_sender_email / po_sender_name. Mirrors the
// LabourPane single-card pattern.

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  getPoSenderAction,
  updatePoSenderAction,
} from "@/app/(app)/settings/company-settings-actions";

export function PurchaseOrderEmailPane() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPoSenderAction();
    if (res.ok) {
      setEmail(res.data.email);
      setName(res.data.name);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function save() {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    start(async () => {
      const res = await updatePoSenderAction({ email, name });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEmail(res.data.email);
      setName(res.data.name);
      toast.success("Purchase order sender saved");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Purchase Order Email</h2>
        <p className="text-muted-foreground text-sm">
          The &ldquo;From&rdquo; address used when sending purchase orders to
          vendors. Must be an address on a domain verified with our email
          provider. Default: ceo@nexvelonglobal.com
        </p>
      </div>

      <Card className="bg-card max-w-md space-y-4 p-4 shadow-sm">
        <div>
          <Label htmlFor="po-sender-email">From Email</Label>
          <Input
            id="po-sender-email"
            type="email"
            value={loading ? "" : email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={loading ? "Loading…" : "ceo@nexvelonglobal.com"}
            className="mt-1.5"
            disabled={loading || pending}
          />
        </div>

        <div>
          <Label htmlFor="po-sender-name">From Name</Label>
          <Input
            id="po-sender-name"
            value={loading ? "" : name}
            onChange={(e) => setName(e.target.value)}
            placeholder={loading ? "Loading…" : "Nexvelon Integrated Solutions"}
            className="mt-1.5"
            disabled={loading || pending}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={loading || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

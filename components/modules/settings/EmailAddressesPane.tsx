"use client";

// MAIL-2 — Settings → Email Addresses. Admin-gated (server actions call
// requireAdmin). Every operational address the system sends from / copies / uses
// on documents, each editable with a plain-language label. Format is validated
// server-side on save (invalid is rejected, not stored); an address outside
// nexvelonglobal.com is warned about (not blocked) because Resend will reject an
// unverified domain. Each save is audited.

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  getEmailAddressesAction,
  updateEmailAddressAction,
} from "@/app/(app)/settings/company-settings-actions";
import {
  EMAIL_ADDRESS_LABELS,
  type EmailAddressField,
  type ResolvedEmailAddresses,
} from "@/lib/email/address-config";

// Display order + a short help line per field.
const FIELDS: { field: EmailAddressField; help: string }[] = [
  { field: "clientFrom", help: "Quotes and other client documents are sent from this address." },
  { field: "clientBcc", help: "A blind copy of every client email is sent here, so you always keep a record." },
  { field: "ordersIntegratedSolutions", help: "Purchase orders on Integrated Solutions send from — and print — this address." },
  { field: "ordersGuardian", help: "Purchase orders on Guardian send from — and print — this address." },
  { field: "inquiries", help: "General inquiries / onboarding address; also shown as the contact address in client emails." },
  { field: "clientsSitesInfo", help: "Second internal recipient of client onboarding submissions." },
  { field: "internalFrom", help: 'Sign-in codes, password resets and internal alerts. May be a plain address or "Name <address>".' },
];

export function EmailAddressesPane() {
  const [values, setValues] = useState<ResolvedEmailAddresses | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<EmailAddressField, string>>>({});
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<EmailAddressField | null>(null);
  const [, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getEmailAddressesAction();
    if (res.ok) {
      setValues(res.data);
      setDrafts(res.data);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function save(field: EmailAddressField) {
    const value = (drafts[field] ?? "").trim();
    if (!value) {
      toast.error("Enter an email address.");
      return;
    }
    setSavingField(field);
    start(async () => {
      const res = await updateEmailAddressAction({ field, value });
      setSavingField(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setValues((prev) => (prev ? { ...prev, [field]: res.data.value } : prev));
      if (res.data.warning) {
        toast.warning(res.data.warning);
      } else {
        toast.success("Email address saved");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Email Addresses</h2>
        <p className="text-muted-foreground text-sm">
          The addresses the system sends from, copies, and prints on documents. Each must be
          on a domain verified with our email provider (nexvelonglobal.com). Changes are
          recorded in the settings audit log.
        </p>
      </div>

      <Card className="bg-card max-w-2xl space-y-5 p-5 shadow-sm">
        {FIELDS.map(({ field, help }) => {
          const changed = values ? (drafts[field] ?? "") !== values[field] : false;
          return (
            <div key={field}>
              <Label htmlFor={`email-${field}`}>{EMAIL_ADDRESS_LABELS[field]}</Label>
              <p className="text-muted-foreground mt-0.5 text-xs">{help}</p>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id={`email-${field}`}
                  value={loading ? "" : drafts[field] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field]: e.target.value }))}
                  placeholder={loading ? "Loading…" : ""}
                  disabled={loading || savingField !== null}
                  className="flex-1"
                />
                <Button
                  onClick={() => save(field)}
                  disabled={loading || savingField !== null || !changed}
                >
                  {savingField === field ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// CLIENT-BILLING-DISPLAY — read-only "Billing & Portal" summary for the client
// detail page. Surfaces the payment/financial/portal fields that are editable
// only in the client edit drawer, so saved values are actually visible.
// Display only — no mutations; editing stays in the drawer.

import { Card } from "@/components/ui/card";
import type {
  DbClientPaymentMethod,
  DbClientPaymentTerms,
  DbClientWithCounts,
} from "@/lib/types/database";

// Local label maps (mirrors the drawer's; kept here so the display surface
// doesn't depend on the form). 'cheque' is dormant per §2.1 but still rendered.
const TERMS_LABEL: Record<DbClientPaymentTerms, string> = {
  due_on_receipt: "Due on receipt",
  net_7: "NET 7",
  net_15: "NET 15",
  net_30: "NET 30",
  net_60: "NET 60",
  net_90: "NET 90",
  custom: "Custom",
};

const METHOD_LABEL: Record<DbClientPaymentMethod, string> = {
  cheque: "Cheque (legacy)",
  eft: "EFT",
  credit_card: "Credit Card",
  e_transfer: "e-Transfer",
  wire: "Wire",
  cash: "Cash",
};

const DASH = "—";

function yesNo(v: boolean | null | undefined): string {
  return v ? "Yes" : "No";
}

export function BillingPortalCard({ client }: { client: DbClientWithCounts }) {
  const currency = client.preferred_currency ?? "CAD";

  // Payment terms — show the custom text when terms = custom.
  const paymentTerms =
    client.payment_terms == null
      ? DASH
      : client.payment_terms === "custom"
        ? client.payment_terms_custom?.trim() || "Custom"
        : TERMS_LABEL[client.payment_terms];

  const paymentMethod =
    client.preferred_payment_method == null
      ? DASH
      : METHOD_LABEL[client.preferred_payment_method];

  const creditLimit =
    client.credit_limit != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
        }).format(client.credit_limit)
      : DASH;

  const portalEmail = client.portal_contact_email?.trim() || DASH;

  const fields: { label: string; value: string }[] = [
    { label: "Payment terms", value: paymentTerms },
    { label: "Preferred payment method", value: paymentMethod },
    { label: "CC surcharge", value: yesNo(client.apply_cc_surcharge) },
    { label: "Credit limit", value: creditLimit },
    { label: "Credit hold", value: yesNo(client.credit_hold) },
    { label: "Preferred currency", value: currency },
    {
      label: "Portal access",
      value: client.portal_access_enabled ? "Enabled" : "Disabled",
    },
    { label: "Portal contact email", value: portalEmail },
  ];

  return (
    <Card
      className="p-5 shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <p className="nx-eyebrow-soft mb-4">Billing &amp; Portal</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        {fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <p className="nx-eyebrow-soft mb-1">{f.label}</p>
            <p
              className="text-brand-charcoal truncate text-sm"
              title={f.value}
            >
              {f.value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

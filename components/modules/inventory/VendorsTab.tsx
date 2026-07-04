"use client";

// INV-1a — real DB. Renders getVendors() (DbVendor[]) as identity cards. Per the
// INV-0 scope, v1 shows vendor identity only; the mock YTD-spend / lead-time /
// top-parts metrics + drill-in are removed until they can be derived from real
// POs (see TODO INV-1c).

import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DbVendor } from "@/lib/types/database";

export function VendorsTab({ vendors }: { vendors: DbVendor[] }) {
  const active = vendors.filter((v) => v.is_active);

  if (vendors.length === 0) {
    return (
      <Card className="bg-card p-10 text-center shadow-sm">
        <Building2 className="text-muted-foreground/50 mx-auto mb-3 h-8 w-8" />
        <p className="text-muted-foreground text-sm">
          No vendors added yet. Add one from the{" "}
          <a href="/vendors" className="text-brand-navy underline underline-offset-2">
            Vendors
          </a>{" "}
          module.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {active.map((v) => {
        const cityLine = [v.city, v.province].filter(Boolean).join(", ");
        const salesEmail = v.sales_rep_email ?? v.email;
        return (
          <Card key={v.id} className="p-5">
            <div className="flex items-start gap-3">
              <div className="bg-brand-navy/10 text-brand-navy flex h-12 w-12 items-center justify-center rounded-md font-serif text-base font-bold">
                {v.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-brand-navy font-serif text-lg leading-tight">
                  {v.name}
                </h3>
                {v.account_number ? (
                  <p className="text-muted-foreground text-[11px]">
                    {v.account_number}
                  </p>
                ) : null}
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {v.contact_name ? <Item label="Contact" value={v.contact_name} /> : null}
              {salesEmail ? <Item label="Sales email" value={salesEmail} /> : null}
              {v.payment_terms ? <Item label="Terms" value={v.payment_terms} /> : null}
              {cityLine ? <Item label="Location" value={cityLine} /> : null}
            </dl>

            {/* TODO INV-1c: YTD spend from POs, lead time, top parts */}
          </Card>
        );
      })}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-brand-charcoal truncate font-medium">{value}</dd>
    </div>
  );
}

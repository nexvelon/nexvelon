"use client";

import { useState } from "react";
import { Building2, FileText, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { products } from "@/lib/mock-data/products";
import { VENDOR_DIRECTORY } from "@/lib/inventory-data";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Vendor } from "@/lib/types";

export function VendorsTab() {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");
  const [drillIn, setDrillIn] = useState<Vendor | null>(null);

  if (drillIn) {
    return (
      <VendorDetail
        vendor={drillIn}
        showCost={showCost}
        onBack={() => setDrillIn(null)}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {VENDOR_DIRECTORY.map((v) => (
        <Card
          key={v.name}
          onClick={() => setDrillIn(v.name)}
          className="cursor-pointer p-5 transition-shadow hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <div className="bg-brand-navy/10 text-brand-navy flex h-12 w-12 items-center justify-center rounded-md font-serif text-base font-bold">
              {v.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-brand-navy font-serif text-lg leading-tight">
                {v.name}
              </h3>
              <p className="text-muted-foreground text-[11px]">{v.accountNumber}</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Item label="Sales rep" value={v.rep.name} />
            <Item label="Terms" value={v.paymentTerms} />
            {showCost && <Item label="YTD spend" value={formatCurrency(v.ytdSpend)} />}
            <Item label="POs" value={`${v.poCount}`} />
            <Item label="Avg lead time" value={`${v.avgLeadTimeDays}d`} />
          </dl>
        </Card>
      ))}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-brand-charcoal font-medium">{value}</dd>
    </div>
  );
}

function VendorDetail({
  vendor,
  showCost,
  onBack,
}: {
  vendor: Vendor;
  showCost: boolean;
  onBack: () => void;
}) {
  const info = VENDOR_DIRECTORY.find((v) => v.name === vendor)!;
  const skus = products.filter((p) => p.vendor === vendor);
  const topSkus = [...skus].sort((a, b) => b.stock * b.cost - a.stock * a.cost).slice(0, 8);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1 text-xs"
      >
        <X className="h-3 w-3" />
        Back to vendors
      </button>

      <Card className="border-t-2 border-t-[#C9A24B] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-navy/10 text-brand-navy flex h-14 w-14 items-center justify-center rounded-md font-serif text-lg font-bold">
              {vendor.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-brand-navy font-serif text-2xl">{vendor}</h2>
              <p className="text-muted-foreground font-mono text-xs">
                {info.accountNumber}
              </p>
            </div>
          </div>
          <div className="text-right">
            {showCost && (
              <>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  YTD spend
                </p>
                <p className="text-brand-navy font-serif text-2xl tabular-nums">
                  {formatCurrency(info.ytdSpend)}
                </p>
              </>
            )}
            <p className="text-muted-foreground text-[11px]">
              {info.poCount} POs · {info.avgLeadTimeDays}-day avg lead time
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Item label="Sales rep" value={info.rep.name} />
          <Item label="Email" value={info.rep.email} />
          <Item label="Phone" value={info.rep.phone} />
          <Item label="Terms" value={info.paymentTerms} />
        </dl>
      </Card>

      <Card className="p-4">
        <h3 className="text-brand-navy font-serif text-lg">
          Top SKUs purchased from {vendor}
        </h3>
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {topSkus.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 py-2 text-xs"
            >
              <div>
                <span className="text-brand-navy font-mono font-semibold">
                  {p.sku}
                </span>
                <span className="text-brand-charcoal/80 ml-2">{p.name}</span>
              </div>
              <div className="text-right">
                <p className="text-brand-charcoal font-semibold tabular-nums">
                  {formatNumber(p.stock)} on hand
                </p>
                {showCost && (
                  <p className="text-muted-foreground tabular-nums">
                    {formatCurrency(p.cost)} cost
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="text-brand-navy mb-2 inline-flex items-center gap-2 font-serif text-lg">
          <FileText className="text-brand-gold h-4 w-4" />
          Recent POs
        </h3>
        <p className="text-muted-foreground text-xs">
          POs against this vendor are visible in the <Building2 className="-mt-0.5 inline h-3 w-3" /> Purchase Orders tab — filter by vendor = {vendor}.
        </p>
      </Card>
    </div>
  );
}

"use client";

// INV-9-1 — vendor detail: a header (name / contact / terms) plus the
// Performance summary. Kept deliberately lean — vendor editing still lives in
// the drawer on the list page; this page is the read surface for metrics.

import Link from "next/link";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { VendorPerformanceCard } from "./VendorPerformanceCard";
import { ActivitySection } from "@/components/activity/ActivityTimeline";
import type { VendorMetricsView } from "@/app/(app)/vendors/actions";
import type { DbVendor } from "@/lib/types/database";

interface Props {
  vendor: DbVendor;
  initialMetrics: VendorMetricsView;
  initialCanSeeSpend: boolean;
  years: number[];
  initialYear: number;
}

export function VendorDetailView({
  vendor,
  initialMetrics,
  initialCanSeeSpend,
  years,
  initialYear,
}: Props) {
  return (
    <div className="space-y-6">
      <Link
        href="/vendors"
        className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[12px] font-medium"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All vendors
      </Link>

      <PageHeader
        eyebrow={vendor.is_active ? "Vendor" : "Vendor · inactive"}
        title={vendor.name}
        description={vendor.contact_name || "Supplier performance"}
      />

      {(vendor.email || vendor.phone || vendor.payment_terms) && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          {vendor.email && (
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {vendor.email}
            </span>
          )}
          {vendor.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {vendor.phone}
            </span>
          )}
          {vendor.payment_terms && <span>Terms · {vendor.payment_terms}</span>}
        </div>
      )}

      <VendorPerformanceCard
        vendorId={vendor.id}
        initialMetrics={initialMetrics}
        initialCanSeeSpend={initialCanSeeSpend}
        years={years}
        initialYear={initialYear}
      />

      <ActivitySection entityType="vendor" entityId={vendor.id} />
    </div>
  );
}

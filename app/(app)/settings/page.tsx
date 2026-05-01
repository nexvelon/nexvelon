"use client";

import { useState } from "react";
import {
  Bell,
  Building2,
  Code,
  CreditCard,
  Database,
  FileText,
  FolderKanban,
  Hash,
  Lock,
  Palette,
  Plug,
  Receipt,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { BrandingThemes } from "@/components/modules/settings/BrandingThemes";
import { BackupsData } from "@/components/modules/settings/BackupsData";
import {
  ApiWebhooks,
  AuditCompliance,
  BillingPlan,
  CompanyProfile,
  Integrations,
  NotificationsPane,
  NumberingSchemes,
  ProjectDefaults,
  QuoteDefaults,
  TaxCurrency,
  VendorsPane,
} from "@/components/modules/settings/SettingsPanes";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

interface Section {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SECTIONS: Section[] = [
  { key: "company", label: "Company Profile", description: "Legal name, GST/HST #, ESA, ULC, WSIB, defaults.", icon: Building2 },
  { key: "branding", label: "Branding & Themes", description: "Logo, login background, four theme presets, email signature.", icon: Palette },
  { key: "quote", label: "Quote Defaults", description: "Valid days, payment terms, markup tiers, sections.", icon: FileText },
  { key: "project", label: "Project Defaults", description: "Default phases, commissioning templates by system type.", icon: FolderKanban },
  { key: "numbering", label: "Numbering Schemes", description: "Editable patterns for quotes, projects, invoices, POs.", icon: Hash },
  { key: "tax", label: "Tax & Currency", description: "HST 13% default, regional rules, multi-currency toggle.", icon: Receipt },
  { key: "integrations", label: "Integrations", description: "QuickBooks, Xero, Stripe, Twilio, Genetec, Avigilon, ICT…", icon: Plug },
  { key: "vendors", label: "Vendors", description: "Vendor directory mirroring the inventory module.", icon: Building2 },
  { key: "backups", label: "Backups & Data", description: "Cloud, local Mac folder, NAS, S3 — schedule, history, restore.", icon: Database },
  { key: "notifications", label: "Notifications", description: "Email/SMS preferences per event type.", icon: Bell },
  { key: "audit", label: "Audit & Compliance", description: "Audit log, retention policy, GDPR/PIPEDA export.", icon: ShieldCheck },
  { key: "api", label: "API & Webhooks", description: "API keys and webhook endpoints.", icon: Code },
  { key: "billing", label: "Billing & Plan", description: "Your Nexvelon subscription, seats, invoices.", icon: CreditCard },
];

export default function SettingsPage() {
  const { role } = useRole();
  const [active, setActive] = useState<string>("branding");

  if (!hasPermission(role, "settings", "view")) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
          <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Settings are available to administrators only. Contact your administrator for access.
          </p>
        </Card>
      </div>
    );
  }

  const activeSection = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`13 sections · last edited ${new Date().toLocaleDateString()}`}
        title="Settings"
        description="Workspace, branding, integrations, and data — all configurable here."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="bg-card sticky top-32 self-start rounded-lg border border-[var(--border)] p-2 shadow-sm">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.key;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setActive(s.key)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors",
                      isActive
                        ? "bg-brand-navy text-white"
                        : "text-brand-charcoal hover:bg-muted"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        isActive ? "text-brand-gold" : "text-muted-foreground"
                      )}
                    />
                    <span className="font-medium">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div>
          <div className="mb-5">
            <h2 className="text-brand-navy font-serif text-2xl">
              {activeSection.label}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {activeSection.description}
            </p>
          </div>
          <div>
            {active === "company" && <CompanyProfile />}
            {active === "branding" && <BrandingThemes />}
            {active === "quote" && <QuoteDefaults />}
            {active === "project" && <ProjectDefaults />}
            {active === "numbering" && <NumberingSchemes />}
            {active === "tax" && <TaxCurrency />}
            {active === "integrations" && <Integrations />}
            {active === "vendors" && <VendorsPane />}
            {active === "backups" && <BackupsData />}
            {active === "notifications" && <NotificationsPane />}
            {active === "audit" && <AuditCompliance />}
            {active === "api" && <ApiWebhooks />}
            {active === "billing" && <BillingPlan />}
          </div>
        </div>
      </div>
    </div>
  );
}

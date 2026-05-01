"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Plus,
  Shield,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VENDOR_DIRECTORY } from "@/lib/inventory-data";
import { auditLog } from "@/lib/mock-data/audit-log";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Company Profile
// ─────────────────────────────────────────────────────────────

export function CompanyProfile() {
  return (
    <div className="space-y-6">
      <Card className="bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Legal name" defaultValue="Nexvelon Global Inc." />
          <Field label="Trade name" defaultValue="Nexvelon" />
          <Field label="GST/HST #" defaultValue="81245-6709 RT0001" />
          <Field label="ESA license #" defaultValue="ESA/ECRA 7012-441" />
          <Field label="ULC #" defaultValue="ULC-A-1188-CA" />
          <Field label="WSIB #" defaultValue="WSIB 8842-7710-0042" />
          <Field
            label="Headquarters address"
            defaultValue="240 Front Street West, Suite 420"
            className="md:col-span-2"
          />
          <Field label="City" defaultValue="Toronto" />
          <Field label="Province / Postal" defaultValue="ON · M5V 1A4" />
          <Field label="Phone" defaultValue="(416) 555-0100" />
          <Field label="Email" defaultValue="ops@nexvelon.com" />
          <div>
            <Label className="text-muted-foreground text-[11px]">Default tax rate</Label>
            <Input defaultValue="13.00%" />
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px]">Fiscal year start</Label>
            <Input defaultValue="January 1" />
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px]">Base currency</Label>
            <Select defaultValue="CAD">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="GBP">GBP — Pound Sterling</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
      <SaveBar />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Quote Defaults
// ─────────────────────────────────────────────────────────────

export function QuoteDefaults() {
  return (
    <div className="space-y-6">
      <Card className="bg-card grid grid-cols-1 gap-4 p-6 shadow-sm md:grid-cols-2">
        <Field label="Default valid days" defaultValue="30" />
        <div>
          <Label className="text-muted-foreground text-[11px]">Default payment terms</Label>
          <Select defaultValue="Net 30">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Net 15">Net 15</SelectItem>
              <SelectItem value="Net 30">Net 30</SelectItem>
              <SelectItem value="Net 60">Net 60</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy font-serif text-base">Markup tiers</h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          Default markup applied per category when a SKU is added to a quote.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase">Category</TableHead>
              <TableHead className="text-right text-[10px] uppercase">Tier 1</TableHead>
              <TableHead className="text-right text-[10px] uppercase">Tier 2</TableHead>
              <TableHead className="text-right text-[10px] uppercase">Tier 3</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["Access Control", 30, 25, 18],
              ["CCTV", 32, 26, 20],
              ["Intrusion", 28, 22, 16],
              ["Intercom", 30, 24, 18],
              ["Cabling & Power", 22, 18, 14],
            ].map(([cat, t1, t2, t3]) => (
              <TableRow key={cat as string}>
                <TableCell className="text-xs">{cat}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{t1}%</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{t2}%</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{t3}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy font-serif text-base">Default sections template</h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          New quotes start with these sections in this order.
        </p>
        <ul className="text-brand-charcoal space-y-1 text-xs">
          {[
            "Access Control Hardware",
            "CCTV / Video Surveillance",
            "Intrusion Detection",
            "Intercom & Audio",
            "Networking & Power",
            "Cabling & Accessories",
            "Programming & Commissioning",
            "Labor",
          ].map((s) => (
            <li key={s} className="flex items-center gap-2">
              <CheckCircle2 className="text-brand-gold h-3 w-3" />
              {s}
            </li>
          ))}
        </ul>
      </Card>

      <SaveBar />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Project Defaults
// ─────────────────────────────────────────────────────────────

export function ProjectDefaults() {
  return (
    <div className="space-y-6">
      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy font-serif text-base">Default phases</h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          Tasks on every new project follow these phases by default.
        </p>
        <ol className="text-brand-charcoal grid grid-cols-1 gap-2 text-xs sm:grid-cols-5">
          {["Pre-Install", "Install", "Programming", "Commissioning", "Closeout"].map((p, i) => (
            <li
              key={p}
              className="border-brand-gold/30 bg-brand-gold/5 rounded-md border-l-4 px-3 py-2"
            >
              <span className="text-muted-foreground text-[10px]">Phase {i + 1}</span>
              <p className="font-semibold">{p}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy font-serif text-base">
          Commissioning templates by system type
        </h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          Each system type appends its checklist when the project is created.
        </p>
        <ul className="space-y-2 text-xs">
          {[
            { type: "Access Control", count: 9 },
            { type: "CCTV", count: 9 },
            { type: "Intrusion", count: 9 },
            { type: "Intercom", count: 4 },
            { type: "Fire Monitoring (ULC)", count: 4 },
            { type: "General Closeout", count: 6 },
          ].map((t) => (
            <li
              key={t.type}
              className="flex items-center justify-between border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0"
            >
              <span className="text-brand-charcoal font-medium">{t.type}</span>
              <span className="text-muted-foreground tabular-nums">
                {t.count} default items
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <SaveBar />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Numbering Schemes
// ─────────────────────────────────────────────────────────────

export function NumberingSchemes() {
  const [patterns, setPatterns] = useState({
    quotes: "Q-{YYYY}-{####}",
    projects: "P-{YYYY}-{####}",
    invoices: "INV-{YYYY}-{####}",
    pos: "PO-{YYYY}-{####}",
  });

  const preview = (p: string) =>
    p.replace("{YYYY}", "2026").replace("{####}", "0148");

  return (
    <div className="space-y-6">
      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy mb-3 font-serif text-base">Patterns</h4>
        <div className="space-y-3">
          {(
            [
              ["quotes", "Quotes"],
              ["projects", "Projects"],
              ["invoices", "Invoices"],
              ["pos", "Purchase Orders"],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className="grid grid-cols-1 items-center gap-3 md:grid-cols-3"
            >
              <Label className="text-muted-foreground text-[11px]">{label}</Label>
              <Input
                value={patterns[key]}
                onChange={(e) =>
                  setPatterns((p) => ({ ...p, [key]: e.target.value }))
                }
                className="font-mono text-xs"
              />
              <p className="text-muted-foreground text-[11px]">
                Live preview:{" "}
                <span className="text-brand-navy font-mono font-semibold">
                  {preview(patterns[key])}
                </span>
              </p>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-muted-foreground text-[10px] leading-relaxed">
        Tokens supported: <span className="font-mono">{"{YYYY}"}</span> (4-digit
        year), <span className="font-mono">{"{YY}"}</span> (2-digit year),{" "}
        <span className="font-mono">{"{####}"}</span> (zero-padded sequence),{" "}
        <span className="font-mono">{"{MM}"}</span>,{" "}
        <span className="font-mono">{"{DD}"}</span>.
      </p>

      <SaveBar />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tax & Currency
// ─────────────────────────────────────────────────────────────

export function TaxCurrency() {
  return (
    <div className="space-y-6">
      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy mb-3 font-serif text-base">Default tax rates</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase">Region</TableHead>
              <TableHead className="text-[10px] uppercase">Tax</TableHead>
              <TableHead className="text-right text-[10px] uppercase">Rate</TableHead>
              <TableHead className="text-[10px] uppercase">Default</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { region: "Ontario", tax: "HST", rate: 13, def: true },
              { region: "Quebec", tax: "GST + QST", rate: 14.975, def: false },
              { region: "BC", tax: "GST + PST", rate: 12, def: false },
              { region: "Alberta", tax: "GST", rate: 5, def: false },
            ].map((r) => (
              <TableRow key={r.region}>
                <TableCell className="text-xs">{r.region}</TableCell>
                <TableCell className="text-xs">{r.tax}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {r.rate.toFixed(3)}%
                </TableCell>
                <TableCell>
                  {r.def && (
                    <span className="bg-brand-gold/15 text-amber-800 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      Default
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy mb-1 font-serif text-base">Multi-currency</h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          Toggle to allow quotes and invoices in non-CAD currencies. FX rates are
          fetched daily from Bank of Canada.
        </p>
        <Toggle defaultOn={false} label="Enable multi-currency" />
      </Card>

      <SaveBar />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Integrations
// ─────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { id: "qbo", name: "QuickBooks Online", category: "Accounting", connected: true, lastSync: "2h ago" },
  { id: "xero", name: "Xero", category: "Accounting", connected: false },
  { id: "stripe", name: "Stripe", category: "Payments", connected: true, lastSync: "12m ago" },
  { id: "twilio", name: "Twilio", category: "SMS", connected: true, lastSync: "Yesterday" },
  { id: "sendgrid", name: "SendGrid", category: "Email", connected: true, lastSync: "Yesterday" },
  { id: "gcal", name: "Google Calendar", category: "Calendar", connected: false },
  { id: "ms365", name: "Microsoft 365", category: "Calendar / Identity", connected: true, lastSync: "5m ago" },
  { id: "genetec", name: "Genetec Security Center", category: "Security", connected: true, lastSync: "1h ago" },
  { id: "avigilon", name: "Avigilon ACC", category: "Security", connected: true, lastSync: "1h ago" },
  { id: "kantech", name: "Kantech EntraPass", category: "Access Control", connected: false },
  { id: "ict", name: "ICT Protege", category: "Access Control", connected: true, lastSync: "3h ago" },
] as const;

export function Integrations() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((i) => (
          <Card
            key={i.id}
            className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="bg-brand-navy/10 text-brand-navy flex h-10 w-10 items-center justify-center rounded-md font-mono text-xs font-bold">
                {i.name.slice(0, 2).toUpperCase()}
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  i.connected
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {i.connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="text-brand-navy mt-3 font-serif text-base">{i.name}</p>
            <p className="text-muted-foreground text-[11px]">{i.category}</p>
            {i.connected && (
              <p className="text-muted-foreground mt-1 text-[10px]">
                Last sync · {i.lastSync}
              </p>
            )}
            <Button
              variant={i.connected ? "outline" : "default"}
              size="xs"
              className="mt-3 w-full"
              onClick={() =>
                toast.success(
                  i.connected ? `${i.name} disconnected` : `${i.name} connected`
                )
              }
            >
              {i.connected ? "Manage" : "Connect"}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Vendors (mirror of inventory directory)
// ─────────────────────────────────────────────────────────────

export function VendorsPane() {
  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px] uppercase">Vendor</TableHead>
            <TableHead className="text-[10px] uppercase">Account #</TableHead>
            <TableHead className="text-[10px] uppercase">Sales Rep</TableHead>
            <TableHead className="text-[10px] uppercase">Terms</TableHead>
            <TableHead className="text-right text-[10px] uppercase">YTD Spend</TableHead>
            <TableHead className="text-right text-[10px] uppercase">Lead Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {VENDOR_DIRECTORY.map((v) => (
            <TableRow key={v.name}>
              <TableCell className="text-brand-charcoal text-xs font-semibold">
                {v.name}
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-[11px]">
                {v.accountNumber}
              </TableCell>
              <TableCell className="text-xs">
                <div>{v.rep.name}</div>
                <div className="text-muted-foreground text-[10px]">{v.rep.email}</div>
              </TableCell>
              <TableCell className="text-xs">{v.paymentTerms}</TableCell>
              <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                {formatCurrency(v.ytdSpend)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {v.avgLeadTimeDays}d
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────

const NOTIF_EVENTS = [
  "Quote sent to client",
  "Quote approved",
  "Quote converted to project",
  "Project status changed",
  "Project commissioned",
  "Invoice sent",
  "Invoice paid",
  "Invoice overdue (24h)",
  "Low stock alert",
  "PO received",
  "Subcontractor insurance expiring",
  "User suspended",
];

export function NotificationsPane() {
  const [prefs, setPrefs] = useState<Record<string, { email: boolean; sms: boolean }>>(
    Object.fromEntries(
      NOTIF_EVENTS.map((e) => [e, { email: true, sms: e.includes("overdue") }])
    )
  );

  const toggle = (event: string, channel: "email" | "sms") =>
    setPrefs((p) => ({
      ...p,
      [event]: { ...p[event], [channel]: !p[event][channel] },
    }));

  return (
    <div className="space-y-4">
      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase">Event</TableHead>
              <TableHead className="w-24 text-center text-[10px] uppercase">Email</TableHead>
              <TableHead className="w-24 text-center text-[10px] uppercase">SMS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {NOTIF_EVENTS.map((e) => (
              <TableRow key={e}>
                <TableCell className="text-brand-charcoal text-xs">{e}</TableCell>
                <TableCell className="text-center">
                  <Toggle
                    defaultOn={prefs[e].email}
                    onChange={() => toggle(e, "email")}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Toggle
                    defaultOn={prefs[e].sms}
                    onChange={() => toggle(e, "sms")}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <SaveBar />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Audit & Compliance
// ─────────────────────────────────────────────────────────────

export function AuditCompliance() {
  return (
    <div className="space-y-6">
      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy mb-1 font-serif text-base">Audit log</h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          Every privileged action is logged with user, IP, timestamp, and result.
          Currently <span className="text-brand-charcoal font-semibold">{auditLog.length}</span>{" "}
          entries on file.
        </p>
        <a
          href="/users?tab=log"
          className="border-brand-navy/15 bg-card text-brand-charcoal hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <Shield className="h-3.5 w-3.5" />
          Open full audit log
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </a>
      </Card>

      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy mb-1 font-serif text-base">Data retention</h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          How long the system keeps records once they&apos;re soft-deleted.
          Hard deletion happens at the end of the retention window.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Quotes" defaultValue="7 years" />
          <Field label="Projects" defaultValue="10 years" />
          <Field label="Invoices" defaultValue="7 years (CRA-compliant)" />
        </div>
      </Card>

      <Card className="bg-card p-6 shadow-sm">
        <h4 className="text-brand-navy mb-1 font-serif text-base">
          GDPR / PIPEDA export
        </h4>
        <p className="text-muted-foreground mb-3 text-[11px]">
          Generate a portable export of all data tied to a single client or user
          on request. The export is a signed ZIP of CSV/PDF/JSON.
        </p>
        <Button onClick={() => toast.success("PIPEDA export queued")}>
          <Database className="mr-1.5 h-3.5 w-3.5" />
          Generate PIPEDA export
        </Button>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// API & Webhooks
// ─────────────────────────────────────────────────────────────

const SAMPLE_KEYS = [
  { id: "k-1", name: "Production · CI", prefix: "nxv_live_84a9", created: "2025-11-12" },
  { id: "k-2", name: "QuickBooks middleware", prefix: "nxv_live_77f2", created: "2026-02-04" },
];

const WEBHOOKS = [
  { id: "w-1", url: "https://hooks.nexvelon.com/quickbooks", events: 6, status: "Healthy" },
  { id: "w-2", url: "https://hooks.nexvelon.com/twilio-sms", events: 3, status: "Healthy" },
  { id: "w-3", url: "https://hooks.nexvelon.com/slack-ops", events: 12, status: "Failing" },
];

export function ApiWebhooks() {
  return (
    <div className="space-y-6">
      <Card className="bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-brand-navy font-serif text-base">API keys</h4>
          <Button
            size="sm"
            onClick={() =>
              toast.success("New API key generated", {
                description: "Copied to clipboard. Stored securely.",
              })
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Generate key
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase">Name</TableHead>
              <TableHead className="text-[10px] uppercase">Prefix</TableHead>
              <TableHead className="text-[10px] uppercase">Created</TableHead>
              <TableHead className="text-right text-[10px] uppercase">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_KEYS.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="text-xs">{k.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-[11px]">
                  <span className="text-brand-navy">{k.prefix}</span>•••••••
                </TableCell>
                <TableCell className="text-muted-foreground text-xs tabular-nums">
                  {k.created}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="xs" variant="ghost" className="text-red-600">
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-brand-navy font-serif text-base">Webhook endpoints</h4>
          <Button size="sm" variant="outline">
            <Webhook className="mr-1.5 h-3.5 w-3.5" />
            Add endpoint
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase">URL</TableHead>
              <TableHead className="text-right text-[10px] uppercase">Events</TableHead>
              <TableHead className="text-[10px] uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WEBHOOKS.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-mono text-[11px]">{w.url}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {w.events}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      w.status === "Healthy"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    )}
                  >
                    {w.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Billing & Plan
// ─────────────────────────────────────────────────────────────

export function BillingPlan() {
  return (
    <div className="space-y-6">
      <Card className="border-t-2 border-t-[#C9A24B] p-6 shadow-sm">
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
          Current plan
        </p>
        <div className="mt-1 flex items-end justify-between">
          <div>
            <h2 className="text-brand-navy font-serif text-3xl">Enterprise</h2>
            <p className="text-muted-foreground text-xs">
              10 seats · Annual · Renews Jan 1, 2027
            </p>
          </div>
          <div className="text-right">
            <p className="text-brand-navy font-serif text-2xl tabular-nums">
              $19,200
            </p>
            <p className="text-muted-foreground text-[10px]">CAD / year</p>
          </div>
        </div>
        <ul className="text-brand-charcoal mt-4 space-y-1 text-xs">
          {[
            "Unlimited quotes, projects, and invoices",
            "10 included seats — additional seats $79/mo",
            "Branded PDFs, full audit log, MFA enforcement",
            "QuickBooks / Xero / Stripe integrations",
            "Data residency: ca-central-1",
            "Priority support · 4-hour SLA",
          ].map((p) => (
            <li key={p} className="flex items-center gap-2">
              <CheckCircle2 className="text-brand-gold h-3 w-3" />
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center gap-2">
          <Button variant="outline" size="sm">
            Manage seats
          </Button>
          <Button variant="ghost" size="sm">
            Download invoice
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────

function Field({
  label,
  defaultValue,
  className,
}: {
  label: string;
  defaultValue: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground text-[11px]">{label}</Label>
      <Input defaultValue={defaultValue} />
    </div>
  );
}

function Toggle({
  defaultOn,
  label,
  onChange,
}: {
  defaultOn: boolean;
  label?: string;
  onChange?: () => void;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <label className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setOn((o) => !o);
          onChange?.();
        }}
        className={cn(
          "inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-brand-gold" : "bg-muted"
        )}
        aria-pressed={on}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            on ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
      {label && <span className="text-brand-charcoal text-xs">{label}</span>}
    </label>
  );
}

export function SaveBar() {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
      <Button variant="ghost" size="sm">
        Cancel
      </Button>
      <Button
        size="sm"
        className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90"
        onClick={() => toast.success("Settings saved")}
      >
        Save Changes
      </Button>
    </div>
  );
}

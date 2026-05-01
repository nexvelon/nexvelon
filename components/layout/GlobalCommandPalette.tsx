"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { clients } from "@/lib/mock-data/clients";
import { sites } from "@/lib/mock-data/sites";
import { projects } from "@/lib/mock-data/projects";
import { products } from "@/lib/mock-data/products";
import { invoices } from "@/lib/mock-data/invoices";
import { quotes } from "@/lib/mock-data/quotes";
import { users } from "@/lib/mock-data/users";

interface Entry {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
}

interface Bucket {
  heading: string;
  items: Entry[];
}

const NAV_ENTRIES: Entry[] = [
  { id: "go-dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, hint: "Executive overview" },
  { id: "go-quotes", label: "Quotes", href: "/quotes", icon: FileText },
  { id: "go-projects", label: "Projects", href: "/projects", icon: FolderKanban },
  { id: "go-clients", label: "Clients", href: "/clients", icon: Users },
  { id: "go-inventory", label: "Inventory", href: "/inventory", icon: Boxes },
  { id: "go-scheduling", label: "Scheduling", href: "/scheduling", icon: Calendar },
  { id: "go-financials", label: "Financials", href: "/financials", icon: Receipt },
  { id: "go-users", label: "Users & Permissions", href: "/users", icon: UserCog },
  { id: "go-settings", label: "Settings", href: "/settings", icon: Settings },
];

export function GlobalCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const buckets: Bucket[] = [
    { heading: "Navigation", items: NAV_ENTRIES },
    {
      heading: "Clients",
      items: clients.map((c) => ({
        id: `c-${c.id}`,
        label: c.name,
        hint: `${c.type} · ${c.city}, ${c.state}`,
        href: `/clients`,
        icon: Building2,
      })),
    },
    {
      heading: "Sites",
      items: sites.slice(0, 30).map((s) => ({
        id: `s-${s.id}`,
        label: s.name,
        hint: `${s.address} · ${s.city}`,
        href: `/clients`,
        icon: Building2,
      })),
    },
    {
      heading: "Projects",
      items: projects.map((p) => ({
        id: `p-${p.id}`,
        label: p.name,
        hint: `${p.code} · ${p.status}`,
        href: `/projects/${p.id}`,
        icon: FolderKanban,
      })),
    },
    {
      heading: "Quotes",
      items: quotes.map((q) => {
        const client = clients.find((c) => c.id === q.clientId);
        return {
          id: `q-${q.id}`,
          label: q.number,
          hint: `${client?.name ?? "—"} · ${q.status}`,
          href: `/quotes/${q.id}`,
          icon: FileText,
        };
      }),
    },
    {
      heading: "Invoices",
      items: invoices.map((i) => {
        const client = clients.find((c) => c.id === i.clientId);
        return {
          id: `i-${i.id}`,
          label: i.number,
          hint: `${client?.name ?? "—"} · ${i.status}`,
          href: `/financials`,
          icon: Receipt,
        };
      }),
    },
    {
      heading: "Products & SKUs",
      items: products.map((p) => ({
        id: `pr-${p.id}`,
        label: p.sku,
        hint: `${p.name} · ${p.vendor}`,
        href: `/inventory`,
        icon: Wrench,
      })),
    },
    {
      heading: "Users",
      items: users.map((u) => ({
        id: `u-${u.id}`,
        label: u.name,
        hint: `${u.email} · ${u.role}`,
        href: `/users`,
        icon: ShieldCheck,
      })),
    },
  ];

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search Nexvelon"
      description="Jump to any client, site, project, quote, invoice, product, user, or setting. Press Enter to navigate."
    >
      <CommandInput placeholder="Search clients, projects, SKUs, invoices…" />
      <CommandList>
        <CommandEmpty>
          <span className="font-serif">No matches.</span>{" "}
          <span className="text-muted-foreground">
            Try a SKU, client name, or quote number.
          </span>
        </CommandEmpty>
        {buckets.map((bucket, idx) => (
          <CmdGroup key={bucket.heading} bucket={bucket} go={go} showSep={idx < buckets.length - 1} />
        ))}
        <ClipboardList className="hidden" />
      </CommandList>
    </CommandDialog>
  );
}

function CmdGroup({
  bucket,
  go,
  showSep,
}: {
  bucket: Bucket;
  go: (href: string) => void;
  showSep: boolean;
}) {
  return (
    <>
      <CommandGroup heading={bucket.heading}>
        {bucket.items.map((it) => {
          const Icon = it.icon;
          return (
            <CommandItem
              key={it.id}
              value={`${it.label} ${it.hint ?? ""}`}
              onSelect={() => go(it.href)}
            >
              <Icon className="text-brand-gold mr-2 h-3.5 w-3.5" />
              <span className="text-brand-charcoal flex-1 truncate font-medium">
                {it.label}
              </span>
              {it.hint && (
                <span className="text-muted-foreground ml-3 truncate text-[11px]">
                  {it.hint}
                </span>
              )}
            </CommandItem>
          );
        })}
      </CommandGroup>
      {showSep && <CommandSeparator />}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Calendar,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  ScanBarcode,
  Settings,
  UserCog,
  Users,
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
import { useQuotes } from "@/lib/quote-store";
import {
  searchClientsAction,
  type SearchResult,
} from "@/app/(app)/global-search-actions";
import { lookupBySerialAction } from "@/app/(app)/inventory/actions";
import type { SerialLookupResult } from "@/lib/api/inventory-serial-lookup";
import type { DbClientWithCounts } from "@/lib/types/database";

// A query worth a serial lookup: no spaces, ≥6 alphanumerics (serials commonly
// carry -, ., _). Keeps the DB call off ordinary word searches like "clients".
const SERIAL_RE = /^[A-Za-z0-9._-]{6,}$/;

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Mirrors the 9 nav-config entries (no Projects/Inventory/etc. data search —
// those modules are unwired; navigation links are still useful).
const NAVIGATION_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Scheduling", href: "/scheduling", icon: Calendar },
  { label: "Financials", href: "/financials", icon: Receipt },
  { label: "Users", href: "/users", icon: UserCog },
  { label: "Settings", href: "/settings", icon: Settings },
];

interface Props {
  /** Controlled open state (optional). If omitted, the component self-manages. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: Props) {
  const router = useRouter();
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = isControlled ? open : internalOpen;

  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  const [query, setQuery] = useState("");
  const [clientResults, setClientResults] = useState<DbClientWithCounts[]>([]);
  const [serialResults, setSerialResults] = useState<SerialLookupResult[]>([]);
  const [, setIsSearching] = useState(false);

  // Local quotes (localStorage + seed). Sync — filter client-side.
  const allQuotes = useQuotes();
  const q = query.trim().toLowerCase();
  const filteredQuotes = q
    ? allQuotes.filter(
        (qt) =>
          (qt.number ?? "").toLowerCase().includes(q) ||
          (qt.name ?? "").toLowerCase().includes(q)
      )
    : [];

  // Cmd+K / Ctrl+K — same known-good pattern as the quote-builder palette
  // (post-CMDK-FIX). Toggles whichever open state is active.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!actualOpen);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // setOpen is stable enough for this listener; actualOpen kept fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualOpen]);

  // Debounced (200ms) DB-backed client search.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!trimmed) {
      setClientResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const res: SearchResult<DbClientWithCounts[]> =
        await searchClientsAction(trimmed);
      setClientResults(res.ok ? res.data : []);
      setIsSearching(false);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // INV-2: serial-number lookup. Only fires for serial-shaped input (≥6 chars,
  // no spaces) and is debounced 300ms independently of the client search.
  const serialDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const trimmed = query.trim();
    if (serialDebounceRef.current) clearTimeout(serialDebounceRef.current);
    if (!SERIAL_RE.test(trimmed)) {
      setSerialResults([]);
      return;
    }
    serialDebounceRef.current = setTimeout(async () => {
      const res = await lookupBySerialAction(trimmed);
      setSerialResults(res.ok ? res.data : []);
    }, 300);
    return () => {
      if (serialDebounceRef.current) clearTimeout(serialDebounceRef.current);
    };
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <CommandDialog
      open={actualOpen}
      onOpenChange={setOpen}
      title="Search Nexvelon"
      description="Search clients, quotes, and navigation"
    >
      <CommandInput
        placeholder="Search clients, quotes, navigation…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={`nav ${item.label}`}
                onSelect={() => go(item.href)}
              >
                <Icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {serialResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Serial Numbers">
              {serialResults.map((s) => (
                <CommandItem
                  key={s.stockId}
                  value={`serial ${s.serial} ${s.productSku} ${s.productName}`}
                  onSelect={() =>
                    go(`/inventory/${s.productId}?highlight=${s.stockId}`)
                  }
                >
                  <ScanBarcode className="mr-2 h-4 w-4" />
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{s.serial}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {s.productName}
                      </span>
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <span>{s.currentLocation.label}</span>
                      {s.custodyStatus && s.custodyStatus !== "in_stock" ? (
                        <span className="bg-muted text-foreground/70 rounded px-1 py-px text-[10px] uppercase tracking-wide">
                          {s.custodyStatus}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {query.trim() && clientResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {clientResults.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`client ${c.name} ${c.client_code ?? ""}`}
                  onSelect={() => go("/clients")}
                >
                  <Users className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {c.client_code ?? "—"}
                      {c.default_opco
                        ? ` · ${c.default_opco === "integrated_solutions" ? "IS" : "GD"}`
                        : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {query.trim() && filteredQuotes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Quotes">
              {filteredQuotes.slice(0, 8).map((qt) => (
                <CommandItem
                  key={qt.id}
                  value={`quote ${qt.number ?? ""} ${qt.name ?? ""}`}
                  onSelect={() => go(`/quotes/${qt.id}`)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>
                      {qt.number || qt.name || `Quote ${qt.id.slice(0, 8)}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

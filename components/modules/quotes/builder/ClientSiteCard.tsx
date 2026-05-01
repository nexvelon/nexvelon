"use client";

import { Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sitesForClient } from "@/lib/mock-data/sites";
import type { Client } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  clients: Client[];
  clientId: string;
  siteId: string;
  onClientChange: (id: string) => void;
  onSiteChange: (id: string) => void;
  disabled?: boolean;
}

export function ClientSiteCard({
  clients,
  clientId,
  siteId,
  onClientChange,
  onSiteChange,
  disabled,
}: Props) {
  const client = clients.find((c) => c.id === clientId);
  const sites = clientId ? sitesForClient(clientId) : [];
  const site = sites.find((s) => s.id === siteId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-serif text-lg">Client & Site</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          onClick={() =>
            toast.info("New Client", {
              description:
                "The Clients module isn't built yet — this would open an inline create form.",
            })
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          New Client
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Client</Label>
            <Select
              value={clientId || undefined}
              onValueChange={(v) => onClientChange(v ?? "")}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Site</Label>
            <Select
              value={siteId || undefined}
              onValueChange={(v) => onSiteChange(v ?? "")}
              disabled={disabled || !clientId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    clientId ? "Select a site…" : "Pick a client first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="bg-muted/40 rounded-md border border-[var(--border)] p-3">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
              Bill to
            </p>
            {client ? (
              <div className="mt-1 space-y-0.5 text-xs">
                <p className="text-brand-charcoal font-semibold">
                  {client.name}
                </p>
                <p className="text-muted-foreground">{client.contactName}</p>
                <p className="text-brand-charcoal">{client.address}</p>
                <p className="text-brand-charcoal">
                  {client.city}, {client.state}
                </p>
                <p className="text-muted-foreground">{client.email}</p>
              </div>
            ) : (
              <p className="text-muted-foreground/70 mt-1 text-xs">
                Pick a client to populate billing details.
              </p>
            )}
          </div>

          <div className="bg-muted/40 rounded-md border border-[var(--border)] p-3">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
              Service site
            </p>
            {site ? (
              <div className="mt-1 space-y-0.5 text-xs">
                <p className="text-brand-charcoal font-semibold">{site.name}</p>
                <p className="text-brand-charcoal">{site.address}</p>
                <p className="text-brand-charcoal">
                  {site.city}, {site.state}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground/70 mt-1 text-xs">
                Pick a site to populate service address.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

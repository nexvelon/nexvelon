"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PaymentTerms,
  QuoteProjectType,
  User,
} from "@/lib/types";

const PAYMENT_TERMS: PaymentTerms[] = ["Net 15", "Net 30", "Net 60"];
const PROJECT_TYPES: QuoteProjectType[] = [
  "New Install",
  "Service",
  "Upgrade",
  "Maintenance Contract",
];

interface Props {
  name: string;
  validUntil: string;
  paymentTerms: PaymentTerms;
  taxRatePct: number;
  ownerId: string;
  projectType: QuoteProjectType;
  owners: User[];
  onChange: (patch: {
    name?: string;
    validUntil?: string;
    paymentTerms?: PaymentTerms;
    taxRatePct?: number;
    ownerId?: string;
    projectType?: QuoteProjectType;
  }) => void;
  disabled?: boolean;
}

export function QuoteDetailsCard({
  name,
  validUntil,
  paymentTerms,
  taxRatePct,
  ownerId,
  projectType,
  owners,
  onChange,
  disabled,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">Quote Details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="space-y-1.5 md:col-span-3">
          <Label className="text-muted-foreground text-xs">Quote name</Label>
          <Input
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Lobby & Garage Access Refresh"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5 md:col-span-3">
          <Label className="text-muted-foreground text-xs">Project type</Label>
          <Select
            value={projectType}
            onValueChange={(v) =>
              onChange({ projectType: (v ?? "New Install") as QuoteProjectType })
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-muted-foreground text-xs">Valid until</Label>
          <Input
            type="date"
            value={validUntil}
            onChange={(e) => onChange({ validUntil: e.target.value })}
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-muted-foreground text-xs">
            Payment terms
          </Label>
          <Select
            value={paymentTerms}
            onValueChange={(v) =>
              onChange({ paymentTerms: (v ?? "Net 30") as PaymentTerms })
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-muted-foreground text-xs">Tax rate (%)</Label>
          <Input
            inputMode="decimal"
            value={taxRatePct.toString()}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              onChange({ taxRatePct: isNaN(parsed) ? 0 : parsed });
            }}
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5 md:col-span-6">
          <Label className="text-muted-foreground text-xs">
            Assigned sales rep
          </Label>
          <Select
            value={ownerId}
            onValueChange={(v) => onChange({ ownerId: v ?? "" })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select owner…" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} · {u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

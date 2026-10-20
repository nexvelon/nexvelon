"use client";

// RECUR-2 — the agreement terms a service-contract quote must carry (2a). Shown
// in the builder when "This quote is for" = a service contract. Captures cadence
// (required, no default), billing timing, initial term, intended start, and the
// opt-in late-fee terms the client will sign. The recurring PRICES live in the
// Guardian "Monitoring Services" schedule; this card summarises both components
// so the operator sees exactly what the client will see.

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import {
  CADENCE_PERIOD_NOUN,
  QUOTE_CONTRACT_CADENCES,
  monthlyTotal,
  periodAmount,
  recurringServices,
  recurringSetup,
  serviceContractQuoteIssues,
  type QuoteContractCadence,
  type QuoteServiceContractTerms,
} from "@/lib/recurring/quote-terms";
import { annualEquivalentPct, describeLateFeeTerms, type LateFeeMode } from "@/lib/recurring/late-fees";
import type { Quote } from "@/lib/types";

const SELECT_CLS =
  "border-input bg-background h-8 w-full rounded-md border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60";
const LABEL_CLS = "text-muted-foreground mb-1 block text-[11px] font-medium";

const CADENCE_LABEL: Record<QuoteContractCadence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly (every 3 months)",
  semiannual: "Semi-annual (every 6 months)",
  annual: "Annual (every 12 months)",
};

export function ServiceContractTermsCard({
  terms,
  onChange,
  quote,
  oneTimeTotal,
  disabled,
}: {
  terms: QuoteServiceContractTerms;
  onChange: (next: QuoteServiceContractTerms) => void;
  /** The live builder state the summary + validation read. */
  quote: Pick<Quote, "intendedTargetKind" | "templateSlug" | "schedules" | "serviceContract">;
  /** The one-time (sections) total incl. tax, for the summary. */
  oneTimeTotal: number;
  disabled?: boolean;
}) {
  const issues = serviceContractQuoteIssues({ ...quote, serviceContract: terms });
  const services = recurringServices(quote);
  const monthly = monthlyTotal(services);
  const setup = recurringSetup(quote);
  const lateFee = terms.lateFee ?? { mode: "none" as LateFeeMode };
  const set = (patch: Partial<QuoteServiceContractTerms>) => onChange({ ...terms, ...patch });
  const setLateFee = (patch: Partial<NonNullable<QuoteServiceContractTerms["lateFee"]>>) =>
    set({ lateFee: { ...lateFee, ...patch } });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">Service agreement terms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {issues.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Not ready to send for signature
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-[var(--brand-status-green)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete — ready to send for signature.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS} htmlFor="sc-cadence">
              Billing cadence <span className="text-destructive">*</span>
            </label>
            <select
              id="sc-cadence"
              className={SELECT_CLS}
              value={terms.cadence ?? ""}
              disabled={disabled}
              onChange={(e) => set({ cadence: (e.target.value || null) as QuoteContractCadence | null })}
            >
              <option value="">Choose…</option>
              {QUOTE_CONTRACT_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS} htmlFor="sc-timing">
              Billed
            </label>
            <select
              id="sc-timing"
              className={SELECT_CLS}
              value={terms.billingTiming ?? "advance"}
              disabled={disabled}
              onChange={(e) => set({ billingTiming: e.target.value as "advance" | "arrears" })}
            >
              <option value="advance">In advance (start of each period)</option>
              <option value="arrears">In arrears (end of each period)</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS} htmlFor="sc-term">
              Initial term (months)
            </label>
            <Input
              id="sc-term"
              type="number"
              min={0}
              step={1}
              className="h-8 text-xs"
              placeholder="Blank = open-ended"
              value={terms.termMonths ?? ""}
              disabled={disabled}
              onChange={(e) => set({ termMonths: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={LABEL_CLS} htmlFor="sc-start">
              Intended start date
            </label>
            <Input
              id="sc-start"
              type="date"
              className="h-8 text-xs"
              value={terms.proposedStartDate ?? ""}
              disabled={disabled}
              onChange={(e) => set({ proposedStartDate: e.target.value || null })}
            />
          </div>
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Late-payment charge</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <label className={LABEL_CLS} htmlFor="sc-lf-mode">
                Type
              </label>
              <select
                id="sc-lf-mode"
                className={SELECT_CLS}
                value={lateFee.mode}
                disabled={disabled}
                onChange={(e) => setLateFee({ mode: e.target.value as LateFeeMode })}
              >
                <option value="none">None</option>
                <option value="percent_monthly">Interest — % per month</option>
                <option value="flat">Flat fee, once per invoice</option>
              </select>
            </div>
            {lateFee.mode === "percent_monthly" && (
              <div>
                <label className={LABEL_CLS} htmlFor="sc-lf-pct">
                  % per month
                </label>
                <Input
                  id="sc-lf-pct"
                  type="number"
                  min={0}
                  step={0.01}
                  className="h-8 text-xs"
                  value={lateFee.monthlyPct ?? ""}
                  disabled={disabled}
                  onChange={(e) => setLateFee({ monthlyPct: e.target.value === "" ? null : Number(e.target.value) })}
                />
                {lateFee.monthlyPct ? (
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    = {annualEquivalentPct(Number(lateFee.monthlyPct))}% per year (shown to the client)
                  </p>
                ) : null}
              </div>
            )}
            {lateFee.mode === "flat" && (
              <div>
                <label className={LABEL_CLS} htmlFor="sc-lf-flat">
                  Fee ($)
                </label>
                <Input
                  id="sc-lf-flat"
                  type="number"
                  min={0}
                  step={0.01}
                  className="h-8 text-xs"
                  value={lateFee.flatAmount ?? ""}
                  disabled={disabled}
                  onChange={(e) => setLateFee({ flatAmount: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            )}
            {lateFee.mode !== "none" && (
              <div>
                <label className={LABEL_CLS} htmlFor="sc-lf-grace">
                  Grace days
                </label>
                <Input
                  id="sc-lf-grace"
                  type="number"
                  min={0}
                  step={1}
                  className="h-8 text-xs"
                  value={lateFee.graceDays ?? 0}
                  disabled={disabled}
                  onChange={(e) => setLateFee({ graceDays: e.target.value === "" ? 0 : Number(e.target.value) })}
                />
              </div>
            )}
          </div>
          <p className="text-muted-foreground text-[11px]">{describeLateFeeTerms(lateFee)}</p>
          {lateFee.mode !== "none" && (
            <p className="text-muted-foreground text-[10px]">
              Late fees are proposed by the system and only charged once someone approves them on the contract.
              Confirm rates and wording with your accountant before quoting them.
            </p>
          )}
        </div>

        <div className="bg-muted/40 space-y-1 rounded-md px-3 py-2 text-xs">
          <p className="font-medium">What the client signs</p>
          <div className="flex justify-between">
            <span>One-time items — installation, equipment (incl. HST)</span>
            <span className="tabular-nums">{formatCurrency(oneTimeTotal)}</span>
          </div>
          {setup && (
            <div className="flex justify-between">
              <span>{setup.label} (one-time)</span>
              <span className="tabular-nums">{formatCurrency(setup.amount)} + HST</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Recurring monitoring ({services.length} service{services.length === 1 ? "" : "s"})</span>
            <span className="tabular-nums">{formatCurrency(monthly)} / month + HST</span>
          </div>
          {terms.cadence && monthly > 0 && (
            <div className="flex justify-between font-medium">
              <span>Each invoice ({terms.billingTiming === "arrears" ? "in arrears" : "in advance"})</span>
              <span className="tabular-nums">
                {formatCurrency(periodAmount(monthly, terms.cadence))} per {CADENCE_PERIOD_NOUN[terms.cadence]} + HST
              </span>
            </div>
          )}
          <p className="text-muted-foreground pt-1 text-[10px]">
            Monthly prices come from the Monitoring Services schedule. Only the recurring part becomes the
            contract; one-time items are invoiced once.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

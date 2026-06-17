"use client";

// QUOTE-LABOUR — Settings → Labour. A single admin-gated field: the default
// labour sell rate that prefills new labour lines in the quote builder. Reads/
// writes app_settings.value_numeric where key='default_labour_sell_rate'.

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  getNumericSettingAction,
  setNumericSettingAction,
} from "@/app/(app)/settings/app-settings-actions";
import { DEFAULT_LABOUR_SELL_RATE_KEY } from "@/lib/app-settings-keys";

export function LabourPane() {
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getNumericSettingAction(DEFAULT_LABOUR_SELL_RATE_KEY);
    if (res.ok) setRate(res.data == null ? "" : String(res.data));
    else toast.error(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function save() {
    const n = Number(rate);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a non-negative number.");
      return;
    }
    start(async () => {
      const res = await setNumericSettingAction(DEFAULT_LABOUR_SELL_RATE_KEY, n);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRate(String(res.data));
      toast.success("Default labour sell rate saved");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Labour</h2>
        <p className="text-muted-foreground text-sm">
          The default sell rate that prefills a new labour line on a quote. It is
          editable per line; changing it here only affects lines added later.
        </p>
      </div>

      <Card className="bg-card max-w-md p-4 shadow-sm">
        <Label htmlFor="default-labour-sell-rate">Default labour sell rate</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm">
              $
            </span>
            <Input
              id="default-labour-sell-rate"
              value={loading ? "" : rate}
              onChange={(e) => setRate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              inputMode="decimal"
              placeholder={loading ? "Loading…" : "125"}
              className="pl-6 tabular-nums"
              disabled={loading || pending}
            />
          </div>
          <span className="text-muted-foreground text-xs">/ hour</span>
          <Button onClick={save} disabled={loading || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

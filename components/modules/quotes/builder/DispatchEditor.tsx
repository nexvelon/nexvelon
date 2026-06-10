"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DispatchScheduleInstance } from "@/lib/quote-schedules";

// GF-2 — editor for a Guardian "dispatch" schedule. Mirrors the MonitoringEditor
// pattern: local controls emit a partial via onChange, which SchedulesCard
// writes back with patchAt. No pricing.
interface Props {
  election: DispatchScheduleInstance["election"];
  authorizePolice: boolean;
  authorizeFire: boolean;
  authorizeAmbulance: boolean;
  regionalFeeNote?: string;
  privateResponseNote?: string;
  onChange: (patch: Partial<DispatchScheduleInstance>) => void;
  disabled?: boolean;
}

const AUTHORITIES: {
  key: "authorizePolice" | "authorizeFire" | "authorizeAmbulance";
  label: string;
}[] = [
  { key: "authorizePolice", label: "Police" },
  { key: "authorizeFire", label: "Fire" },
  { key: "authorizeAmbulance", label: "Ambulance" },
];

export function DispatchEditor({
  election,
  authorizePolice,
  authorizeFire,
  authorizeAmbulance,
  regionalFeeNote,
  privateResponseNote,
  onChange,
  disabled,
}: Props) {
  const authValues = {
    authorizePolice,
    authorizeFire,
    authorizeAmbulance,
  };

  return (
    <div className="space-y-3 pt-1">
      {/* Election */}
      <div className="space-y-1">
        <Label className="text-[11px]">Dispatch election</Label>
        <Select
          value={election}
          onValueChange={(v) =>
            onChange({
              election:
                (v as DispatchScheduleInstance["election"]) || "accept_regional",
            })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="accept_regional">
              Accept regional police-dispatch fees
            </SelectItem>
            <SelectItem value="decline_police">
              Decline police dispatch (keyholder / private guard)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Authorized services */}
      <div className="space-y-1.5">
        <Label className="text-[11px]">Authorized services</Label>
        <div className="flex flex-wrap gap-2">
          {AUTHORITIES.map((a) => {
            const on = authValues[a.key];
            return (
              <Button
                key={a.key}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onChange({ [a.key]: !on })}
                aria-pressed={on}
                className="min-w-[5rem]"
              >
                {a.label}: {on ? "On" : "Off"}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Regional fee note */}
      <div className="space-y-1">
        <Label className="text-[11px]">Regional false-alarm fee note</Label>
        <Textarea
          value={regionalFeeNote ?? ""}
          onChange={(e) => onChange({ regionalFeeNote: e.target.value })}
          disabled={disabled}
          rows={4}
          className="text-xs leading-relaxed"
          aria-label="Regional fee note"
        />
      </div>

      {/* Private response note (relevant when declining police dispatch) */}
      <div className="space-y-1">
        <Label className="text-[11px]">
          Private-response note
          {election === "decline_police" ? "" : " (shown when police declined)"}
        </Label>
        <Textarea
          value={privateResponseNote ?? ""}
          onChange={(e) => onChange({ privateResponseNote: e.target.value })}
          disabled={disabled}
          rows={3}
          className="text-xs leading-relaxed"
          aria-label="Private response note"
        />
      </div>
    </div>
  );
}

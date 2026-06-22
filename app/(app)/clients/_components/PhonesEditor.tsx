"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sanitizePhoneInput } from "@/lib/phone";
import type { ContactPhone } from "@/lib/types/database";

// CL-5c — locked label set offered by the phone-type dropdown.
const PHONE_LABELS = [
  "Office",
  // POLISH-27 (CHANGE 3) — "Work" inserted after "Office".
  "Work",
  "Personal",
  "Mobile",
  "Emergency",
  "Fax",
  "Other",
];

interface PhonesEditorProps {
  phones: ContactPhone[];
  onChange: (phones: ContactPhone[]) => void;
}

/**
 * CL-5c — shared dynamic phone-list editor. Used by both ClientFormDrawer's
 * Contact Information section and the standalone ContactFormDrawer.
 */
export function PhonesEditor({ phones, onChange }: PhonesEditorProps) {
  const updatePhone = (idx: number, updates: Partial<ContactPhone>) => {
    onChange(phones.map((p, i) => (i === idx ? { ...p, ...updates } : p)));
  };

  const addPhone = () => {
    onChange([...phones, { label: "Office", number: "" }]);
  };

  const removePhone = (idx: number) => {
    onChange(phones.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {phones.map((p, idx) => {
        // Backfilled phones (migration 0013) carry the label "Phone", which
        // isn't in the standard set — surface it so the select still shows it.
        const labelOptions = PHONE_LABELS.includes(p.label)
          ? PHONE_LABELS
          : [...PHONE_LABELS, p.label];
        return (
          <div
            key={idx}
            className="grid grid-cols-[110px_1fr_auto] items-center gap-2"
          >
            <select
              aria-label="Phone type"
              value={p.label}
              onChange={(e) => updatePhone(idx, { label: e.target.value })}
              className="bg-card rounded-md border border-[var(--border)] px-2 py-1.5 text-xs"
            >
              {labelOptions.map((lbl) => (
                <option key={lbl} value={lbl}>
                  {lbl}
                </option>
              ))}
            </select>
            <Input
              type="text"
              inputMode="tel"
              value={p.number}
              onChange={(e) =>
                updatePhone(idx, {
                  number: sanitizePhoneInput(e.target.value),
                })
              }
              placeholder="(416) 555-0100"
            />
            {phones.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                aria-label="Remove phone"
                onClick={() => removePhone(idx)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs"
        onClick={addPhone}
      >
        <Plus className="h-3 w-3" />
        Add phone
      </Button>
    </div>
  );
}

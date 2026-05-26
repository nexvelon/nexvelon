"use client";

// ADDR-1 — Shared address section used by ClientForm (Billing,
// Mailing) and SiteForm (Site Address, Billing, Mailing) — 5
// invocations total.
//
// Renders, in order: Country (5-option dropdown) → Province / State
// (dropdown dependent on country) → Street → Unit/Suite → City →
// Postal. Province auto-clears whenever country changes to a value
// that doesn't include the current province (e.g. Canada→USA leaves
// "ON" orphaned).
//
// Optional `disabled` prop carries the read-only state for SiteForm's
// inheritance-aware billing/mailing display (caller passes parent
// client values + disabled=true when the inherit toggle is ON).
//
// Optional `onStreetAutocomplete` prop, when provided, swaps the
// Street <Input> for <AddressAutocomplete> and forwards the geocoder's
// parsed payload back to the caller (which normalizes the country
// string via its own helper — see ClientForm.normalizeAutocompleteCountry).

import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import {
  COUNTRIES,
  PROVINCES_BY_COUNTRY,
  type Country,
} from "@/lib/countries";

export interface AddressAutocompletePayload {
  street: string;
  city: string;
  province: string;
  postal: string;
  country: string;
}

interface AddressSectionProps {
  country: string;
  province: string;
  street: string;
  unit: string;
  city: string;
  postal: string;

  onCountryChange: (v: string) => void;
  onProvinceChange: (v: string) => void;
  onStreetChange: (v: string) => void;
  onUnitChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onPostalChange: (v: string) => void;

  /** When true, all inputs render disabled (read-only display). Used by
   *  SiteForm when inheritance is ON. */
  disabled?: boolean;

  /** Label prefix for visual disambiguation between sections (e.g.
   *  "Billing", "Mailing"). Leave empty for un-prefixed labels. */
  sectionPrefix?: string;

  /** When provided, the Street field renders as <AddressAutocomplete>
   *  instead of <Input>. The geocoder's full parsed payload is passed
   *  to this callback; the caller is responsible for updating all
   *  relevant state including country normalization. */
  onStreetAutocomplete?: (data: AddressAutocompletePayload) => void;

  /** Street placeholder (mostly cosmetic). Defaults to a Toronto example. */
  streetPlaceholder?: string;
}

export function AddressSection({
  country,
  province,
  street,
  unit,
  city,
  postal,
  onCountryChange,
  onProvinceChange,
  onStreetChange,
  onUnitChange,
  onCityChange,
  onPostalChange,
  disabled = false,
  sectionPrefix = "",
  onStreetAutocomplete,
  streetPlaceholder = "350 Bay Street",
}: AddressSectionProps) {
  // Auto-clear province if country changes to one that doesn't include
  // it. Intentionally only on country change — including `province` or
  // `onProvinceChange` in deps would either loop (province → clear →
  // effect re-runs → no-op) or refire on every parent render.
  useEffect(() => {
    if (!country || !province) return;
    const validProvinces = PROVINCES_BY_COUNTRY[country as Country];
    if (!validProvinces) return;
    if (!validProvinces.includes(province)) {
      onProvinceChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const provinces = country
    ? (PROVINCES_BY_COUNTRY[country as Country] ?? [])
    : [];

  const prefix = sectionPrefix ? `${sectionPrefix} ` : "";

  return (
    <>
      {/* Country first — drives the Province dropdown options. */}
      <Field label={`${prefix}Country *`}>
        <Select
          value={country || undefined}
          onValueChange={(v) => onCountryChange(v ?? "")}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select country…" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Province / State — dependent on country. */}
      <Field label={`${prefix}Province / State *`}>
        <Select
          value={province || undefined}
          onValueChange={(v) => onProvinceChange(v ?? "")}
          disabled={disabled || !country}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={country ? "Select…" : "Pick country first"}
            />
          </SelectTrigger>
          <SelectContent>
            {provinces.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Street — optionally swapped for AddressAutocomplete. */}
      <Field label={`${prefix}Street *`}>
        {onStreetAutocomplete ? (
          <AddressAutocomplete
            value={street}
            onChange={onStreetChange}
            onPlaceSelected={onStreetAutocomplete}
            placeholder={streetPlaceholder}
            disabled={disabled}
          />
        ) : (
          <Input
            value={street}
            onChange={(e) => onStreetChange(e.target.value)}
            placeholder={streetPlaceholder}
            disabled={disabled}
          />
        )}
      </Field>

      <Field label={`${prefix}Unit / Suite`}>
        <Input
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          placeholder="Suite 1200"
          disabled={disabled}
        />
      </Field>

      <Field label={`${prefix}City *`}>
        <Input
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder="Toronto"
          disabled={disabled}
        />
      </Field>

      <Field label={`${prefix}Postal Code *`}>
        <Input
          value={postal}
          onChange={(e) => onPostalChange(e.target.value)}
          placeholder="M5H 2S6"
          disabled={disabled}
        />
      </Field>
    </>
  );
}

// Local Field helper — mirrors the styling used by ClientForm /
// SiteForm's per-component Field helpers so this component drops into
// either form without visual drift. Extracted here so we don't have to
// import either form's local helper.
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="nx-eyebrow-soft text-[10px]">{label}</Label>
      {children}
    </div>
  );
}

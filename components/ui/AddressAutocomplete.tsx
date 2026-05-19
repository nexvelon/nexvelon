"use client";

import { useEffect, useRef, useState } from "react";
import usePlacesAutocomplete, { getDetails } from "use-places-autocomplete";
import { Input } from "@/components/ui/input";

export interface AddressAutocompleteProps {
  value: string;
  onChange: (street: string) => void;
  onPlaceSelected: (parsed: {
    street: string;
    city: string;
    province: string; // short_name, e.g. "ON"
    postal: string;
    country: string;
  }) => void;
  disabled?: boolean;
  placeholder?: string;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
const SCRIPT_ID = "nx-gmaps-places-sdk";

// Module-scoped, idempotent loader. The <script> is injected at most once
// per page life; concurrent callers share the same promise. Never runs
// without a key and never at module load — only when invoked on first focus.
let mapsLoadPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      SCRIPT_ID
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Google Maps script failed to load"))
      );
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(apiKey) +
      "&libraries=places&loading=async";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

function pick(
  components: google.maps.GeocoderAddressComponent[],
  type: string,
  useShort = false
): string {
  const c = components.find((x) => x.types.includes(type));
  if (!c) return "";
  return useShort ? c.short_name : c.long_name;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  disabled,
  placeholder,
}: AddressAutocompleteProps) {
  const hasKey = Boolean(API_KEY && API_KEY.trim());

  // Hooks must be called unconditionally. With initOnMount:false the hook is
  // inert (no Google calls, no script) until init() is invoked — so when
  // there's no key we simply never init it.
  const {
    ready,
    suggestions: { data },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    initOnMount: false,
    debounce: 250,
    requestOptions: {
      componentRestrictions: { country: "ca" },
    },
  });

  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  // ---- No-key path: plain input, zero side effects ----
  if (!hasKey) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    );
  }

  const handleFocus = () => {
    if (loaded) return;
    loadGoogleMaps(API_KEY as string)
      .then(() => {
        init();
        setLoaded(true);
      })
      .catch(() => {
        // Soft-fail: the field keeps working as a plain controlled input.
        // No console noise per the graceful-degradation requirement.
      });
  };

  const handleSelect = async (placeId: string, description: string) => {
    setOpen(false);
    setActiveIdx(-1);
    clearSuggestions();
    try {
      const result = await getDetails({
        placeId,
        fields: ["address_components", "formatted_address"],
      });
      if (typeof result === "string" || !result || !result.address_components) {
        // Couldn't resolve details — still set the typed street text.
        onChange(description);
        return;
      }
      const comps = result.address_components;
      const streetNumber = pick(comps, "street_number");
      const route = pick(comps, "route");
      const street = [streetNumber, route].filter(Boolean).join(" ").trim();
      const city =
        pick(comps, "locality") ||
        pick(comps, "sublocality_level_1") ||
        pick(comps, "postal_town");
      const province = pick(comps, "administrative_area_level_1", true);
      const postal = pick(comps, "postal_code");
      const country = pick(comps, "country");

      const streetLine = street || description;
      onChange(streetLine);
      onPlaceSelected({ street: streetLine, city, province, postal, country });
    } catch {
      onChange(description);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || data.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % data.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? data.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && activeIdx < data.length) {
        e.preventDefault();
        const s = data[activeIdx];
        handleSelect(s.place_id, s.description);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div className="relative">
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={handleFocus}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          if (ready) {
            setValue(v);
            setOpen(true);
            setActiveIdx(-1);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delay so an onMouseDown selection still registers.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && data.length > 0 && (
        <ul
          className="bg-card absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--border)] shadow-md"
          role="listbox"
        >
          {data.map((s, i) => (
            <li
              key={s.place_id}
              role="option"
              aria-selected={i === activeIdx}
              className={
                "cursor-pointer px-3 py-2 text-xs " +
                (i === activeIdx ? "bg-muted" : "hover:bg-muted/60")
              }
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s.place_id, s.description);
              }}
            >
              {s.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

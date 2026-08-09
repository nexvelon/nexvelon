// AUDIT-FIX-2 — how a before/after value is RENDERED in an activity diff.
//
// The activity_log stores the REAL value (computeChanges keeps the actual
// before/after — see lib/api/activity-log.ts), so this is a pure READ-time
// formatter: it must surface the real content, never a summary like "[1 item]".
// §5 requires the log to answer "who changed WHAT" — a bare count doesn't.
//
// Rules:
//   • arrays        → comma-joined values ("VIP, Priority"), content before any
//                     "+N more" overflow — never a bare count.
//   • objects       → a meaningful label ("Office: 416-555-1234"), never a JSON
//                     dump and never "[object Object]".
//   • dates         → the app display format, not raw ISO.
//   • booleans      → Yes / No.
//   • null/undefined→ "(empty)"; empty string → "(blank)"; empty list/object →
//                     "(none)" — empties stay explicit and distinguishable.
//   • uuids / other → the real string verbatim (a FK uuid is shown, not hidden;
//                     human-label resolution needs a server-side registry and is
//                     a separate follow-up).
//   • never renders undefined / null / [object Object] to a user.

import { format, parseISO, isValid } from "date-fns";

const MAX_ARRAY_ITEMS = 6;
const MAX_STRING = 200;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** snake_case → Title Case. "billing_postal" → "Billing Postal". */
export function humanizeField(field: string): string {
  return field
    .split("_")
    .map((w) => (w.length === 0 ? "" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function truncateString(s: string): string {
  return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING).trimEnd()}…` : s;
}

/** Format an ISO date/datetime string in the app's display format, or null if
 *  the string isn't a recognisable date. */
function formatDateString(s: string): string | null {
  if (DATE_ONLY.test(s)) {
    const d = parseISO(s);
    return isValid(d) ? format(d, "MMM d, yyyy") : null;
  }
  if (DATE_TIME.test(s)) {
    const d = parseISO(s);
    return isValid(d) ? format(d, "MMM d, yyyy 'at' h:mm a") : null;
  }
  return null;
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function formatScalar(v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "(empty)";
  if (v === "") return "(blank)";
  return formatDateString(v) ?? v;
}

const OBJECT_LABEL_KEYS = [
  "name",
  "title",
  "label",
  "display_name",
  "email",
  "number",
  "value",
  "key",
];

/** A meaningful one-line label for an object — never a JSON dump. */
function labelObject(o: Record<string, unknown>): string {
  const keys = Object.keys(o);
  if (keys.length === 0) return "(none)";

  // A label + value/number pair (e.g. ContactPhone { label, number }).
  if ("label" in o && isScalar(o.label)) {
    const partnerKey = ["number", "value", "email"].find(
      (k) => k in o && isScalar(o[k])
    );
    if (partnerKey) return `${formatScalar(o.label)}: ${formatScalar(o[partnerKey] as string)}`;
  }

  // A single obvious label key.
  for (const k of OBJECT_LABEL_KEYS) {
    if (k in o && isScalar(o[k])) return formatScalar(o[k] as string | number | boolean);
  }

  // Fallback: compact "Key: value" of the object's own scalar fields.
  const pairs = keys
    .filter((k) => isScalar(o[k]))
    .slice(0, 4)
    .map((k) => `${humanizeField(k)}: ${formatScalar(o[k] as string | number | boolean)}`);
  return pairs.length > 0 ? pairs.join(", ") : "(none)";
}

/** One array element, rendered inline (no per-item truncation — the caller caps
 *  the joined result). */
function formatItem(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (isScalar(v)) return formatScalar(v);
  if (Array.isArray(v)) return v.map(formatItem).join(", ");
  if (typeof v === "object") return labelObject(v as Record<string, unknown>);
  return "(empty)";
}

/** Render an activity_log before/after value for display. */
export function formatActivityValue(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (isScalar(v)) return truncateString(formatScalar(v));

  if (Array.isArray(v)) {
    if (v.length === 0) return "(none)";
    const parts = v.map(formatItem);
    const shown = parts.slice(0, MAX_ARRAY_ITEMS);
    const extra = parts.length - shown.length;
    const content = truncateString(shown.join(", ")); // content first…
    return extra > 0 ? `${content} +${extra} more` : content; // …then the overflow count
  }

  if (typeof v === "object") return truncateString(labelObject(v as Record<string, unknown>));

  return "(empty)";
}

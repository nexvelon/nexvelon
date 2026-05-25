// FIX-2 — Phone input sanitization.
//
// Strips characters that aren't valid in a phone number AS THE USER
// TYPES, so the input state can never hold letters or junk. Used by
// every phone-input UI surface (PhonesEditor for the JSONB phones
// array on contacts; the single-string `phone` field on
// InviteUserDrawer).
//
// Allowed characters:
//   * digits 0-9
//   * leading + (international prefix)
//   * dash, dot, parentheses, whitespace (common separators)
//
// Blocked: letters, all other punctuation (e.g. commas, slashes,
// underscores). This matches the operator's brief — "it must only
// take in numbers" — while staying permissive enough that common
// formats like "+1 (416) 555-0100" and "416.555.0100" pass through
// unchanged.
//
// Extensions: operators encode these via the phone LABEL (e.g.
// label="Work ext 123", number="4165550100"). The label field stays
// unrestricted text.
//
// NOT applied retroactively — existing DB values with letters render
// as-is; sanitization only kicks in when the operator edits the cell.

/**
 * Strip non-phone characters from input text. Use in onChange:
 *
 *   onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
 *
 * Pasting works too — paste fires onChange with the pasted value,
 * which gets sanitized the same way as typed input.
 */
export function sanitizePhoneInput(value: string): string {
  return value.replace(/[^0-9+\-.\s()]/g, "");
}

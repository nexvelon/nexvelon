// POLISH-17 — client-safe mirror of the two locked legal-document setting keys
// and their display names. The canonical key constants live in the server-only
// lib/api/company-settings.ts (DEFAULT_TERMS_KEY / DEFAULT_TERMS_GUARDIAN_KEY);
// these literals MUST stay in sync with them. Pure module (no "server-only") so
// client components (the editor + audit log) can import it.

export const LEGAL_DOC_KEY_INTEGRATED = "default_quote_terms";
export const LEGAL_DOC_KEY_GUARDIAN = "default_quote_terms_guardian";

/** setting_key → company display name, for the audit log + dialogs. */
export const LEGAL_DOC_NAMES: Record<string, string> = {
  [LEGAL_DOC_KEY_INTEGRATED]: "Nexvelon Integrated Solutions Inc.",
  [LEGAL_DOC_KEY_GUARDIAN]: "Nexvelon Guardian Inc.",
};

/** Short label for compact UI (table chips). */
export const LEGAL_DOC_SHORT: Record<string, string> = {
  [LEGAL_DOC_KEY_INTEGRATED]: "Integrated",
  [LEGAL_DOC_KEY_GUARDIAN]: "Guardian",
};

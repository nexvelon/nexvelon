// PO-3 — the configurable "From" address for purchase-order emails. Backed by
// the company_settings key-value store (getSetting/setSetting).
//
// MAIL-2: this module is NO LONGER wired to sending. Purchase orders now send
// from the per-opco order address (lib/email/addresses.ts → NISorders@ /
// NGorders@), and the "Purchase Order Email" Settings control that edited these
// keys has been removed (it did nothing after MAIL-1 centralised sending — §2.8
// forbids a control that reports success while having no effect). Per §1 the
// stored po_sender_email / po_sender_name rows are NOT dropped; this module and
// its unit tests remain so the values are preserved and inspectable.
//
// These live in their own module (rather than company-settings.ts) so they can
// be unit-tested by mocking @/lib/api/company-settings — see
// __tests__/settings/po-sender.test.tsx.

import { getSetting, setSetting } from "@/lib/api/company-settings";

export const PO_SENDER_EMAIL_KEY = "po_sender_email";
export const PO_SENDER_NAME_KEY = "po_sender_name";

export const PO_SENDER_EMAIL_DEFAULT = "ceo@nexvelonglobal.com";
export const PO_SENDER_NAME_DEFAULT = "Nexvelon Integrated Solutions";

export async function getPoSenderEmail(): Promise<string> {
  const stored = await getSetting(PO_SENDER_EMAIL_KEY);
  return stored ?? PO_SENDER_EMAIL_DEFAULT;
}

export async function getPoSenderName(): Promise<string> {
  const stored = await getSetting(PO_SENDER_NAME_KEY);
  return stored ?? PO_SENDER_NAME_DEFAULT;
}

/** The composed "Name <email>" header used as the Resend `from`. */
export async function getPoSenderFrom(): Promise<string> {
  const [email, name] = await Promise.all([getPoSenderEmail(), getPoSenderName()]);
  return `${name} <${email}>`;
}

export async function setPoSenderEmail(email: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) {
    throw new Error("Invalid email address");
  }
  await setSetting(PO_SENDER_EMAIL_KEY, trimmed);
}

export async function setPoSenderName(name: string): Promise<void> {
  await setSetting(PO_SENDER_NAME_KEY, name.trim());
}

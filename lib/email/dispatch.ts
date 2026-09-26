import "server-only";

// MAIL-1 — THE single outbound-email chokepoint. Every email the app sends
// routes through dispatchEmail(), so the sending identity (from / display name /
// reply-to / BCC), the message hygiene that affects spam scoring (plain-text
// alternative, absolute URLs), and the audit log are enforced in ONE place and
// cannot be bypassed by an individual send site.
//
// Sending identity (Jay's decision — MAIL-1):
//   • client-facing mail sends FROM one authenticated address (quotes@, config),
//     with the sending REP's name as the display name and the rep's own email as
//     REPLY-TO, and always BCCs a standing copy address (quotes@, config);
//   • internal/auth mail (OTP, low-stock, the ops submission notice) keeps the
//     transport default and is never BCC'd to the client copy address.

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Configuration (all overridable via env; no secret is a from/bcc address) ──
export const INTERNAL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "Nexvelon <noreply@nexvelonglobal.com>";
/** The single authenticated address all client-facing mail sends from. */
export const CLIENT_FROM_EMAIL =
  process.env.RESEND_CLIENT_FROM_EMAIL ?? "quotes@nexvelonglobal.com";
/** Standing BCC on every client-facing send — Jay keeps a copy of everything. */
export const CLIENT_BCC =
  process.env.RESEND_CLIENT_BCC ?? "quotes@nexvelonglobal.com";
/** Org suffix on the display name: "<Rep> via Nexvelon". */
export const CLIENT_FROM_ORG = process.env.RESEND_CLIENT_FROM_NAME ?? "Nexvelon";

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "Missing RESEND_API_KEY. Paste the same Resend API key used in " +
        "Supabase → Authentication → Emails → SMTP Settings."
    );
  }
  return new Resend(key);
}

export interface EmailSender {
  name?: string | null;
  email?: string | null;
}

export interface DispatchEmailInput {
  /** A short caller name for error messages + the log (e.g. "sendQuotePortalEmail"). */
  label: string;
  kind: "client" | "internal";
  to: string | string[];
  subject: string;
  html: string;
  /** REQUIRED plain-text alternative — its absence hurts spam scoring, so we refuse. */
  text: string;
  /** Client mail only: the rep's identity → display name + reply-to. */
  sender?: EmailSender | null;
  /** Explicit reply-to; for client mail defaults to sender.email when omitted. */
  replyTo?: string | null;
  /** Internal mail may set its own from (e.g. OTP from noreply@). Ignored for client mail. */
  fromOverride?: string | null;
  /** Extra BCC(s). Client mail ALWAYS also BCCs CLIENT_BCC — it cannot be dropped. */
  bcc?: string | string[] | null;
  attachments?: { filename: string; content: Buffer }[];
  headers?: Record<string, string>;
  /** Loose link to the originating record, recorded in email_log. */
  log?: { entityType?: string | null; entityId?: string | null; sentBy?: string | null };
}

export interface DispatchResult {
  ok: boolean;
  id: string | null;
  error: string | null;
}

/** Compose the client-facing display name: "Jane Rep via Nexvelon" (or just the
 *  org when no rep is known). Kept pure + exported for tests. */
export function clientDisplayName(sender?: EmailSender | null): string {
  const name = sender?.name?.trim();
  return name ? `${name} via ${CLIENT_FROM_ORG}` : CLIENT_FROM_ORG;
}

/** The composed From header for a send. */
export function resolveFrom(input: Pick<DispatchEmailInput, "kind" | "sender" | "fromOverride">): string {
  if (input.kind === "client") {
    return `${clientDisplayName(input.sender)} <${CLIENT_FROM_EMAIL}>`;
  }
  return input.fromOverride?.trim() || INTERNAL_FROM;
}

/** Client mail always carries CLIENT_BCC; extras are merged and de-duped. */
export function resolveBcc(input: Pick<DispatchEmailInput, "kind" | "bcc">): string[] {
  const extra = input.bcc == null ? [] : Array.isArray(input.bcc) ? input.bcc : [input.bcc];
  const all = input.kind === "client" ? [CLIENT_BCC, ...extra] : [...extra];
  return Array.from(new Set(all.map((a) => a.trim()).filter(Boolean)));
}

/** Guard against the two content mistakes the code controls that most hurt
 *  deliverability: a missing plain-text part, and root-relative / shortener
 *  links instead of absolute URLs on the real domain. Throws so a bad send is
 *  caught in dev/test, not delivered. */
const SHORTENER_DENYLIST = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly", "is.gd", "rebrand.ly",
];
export function assertMessageHygiene(input: { label: string; html: string; text: string }): void {
  if (!input.text || !input.text.trim()) {
    throw new Error(`${input.label}: a plain-text alternative is required (spam-scoring).`);
  }
  if (/href\s*=\s*["']\/(?!\/)/i.test(input.html)) {
    throw new Error(`${input.label}: root-relative href found — links must be absolute (NEXT_PUBLIC_APP_URL).`);
  }
  const lower = input.html.toLowerCase();
  for (const s of SHORTENER_DENYLIST) {
    if (lower.includes(`//${s}/`) || lower.includes(`//www.${s}/`)) {
      throw new Error(`${input.label}: link shortener (${s}) found — use absolute URLs on the real domain.`);
    }
  }
}

async function writeEmailLog(row: {
  kind: string;
  to_email: string;
  from_email: string;
  reply_to: string | null;
  bcc: string | null;
  subject: string;
  entity_type: string | null;
  entity_id: string | null;
  sent_by: string | null;
  provider_message_id: string | null;
  status: "sent" | "failed";
  error: string | null;
}): Promise<void> {
  // Best-effort: a logging failure must NEVER break (or mask) a real send.
  try {
    await createAdminClient().from("email_log").insert(row);
  } catch (e) {
    console.error("[email] email_log insert failed (send itself unaffected):", e);
  }
}

/**
 * Send one email through the central path. Returns the outcome (never throws on
 * a provider error — the caller decides whether that is fatal), but ALWAYS
 * records a row in email_log first, so a failure is visible in the app.
 */
export async function dispatchEmail(input: DispatchEmailInput): Promise<DispatchResult> {
  assertMessageHygiene(input);

  const from = resolveFrom(input);
  const replyTo =
    input.replyTo?.trim() ||
    (input.kind === "client" ? input.sender?.email?.trim() || undefined : undefined);
  const bccList = resolveBcc(input);
  const toList = Array.isArray(input.to) ? input.to : [input.to];

  let id: string | null = null;
  let error: string | null = null;
  try {
    const result = await client().emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(replyTo ? { replyTo } : {}),
      ...(bccList.length ? { bcc: bccList } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    });
    if (result.error) error = result.error.message;
    else id = result.data?.id ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await writeEmailLog({
    kind: input.kind,
    to_email: toList.join(", "),
    from_email: from,
    reply_to: replyTo ?? null,
    bcc: bccList.length ? bccList.join(", ") : null,
    subject: input.subject,
    entity_type: input.log?.entityType ?? null,
    entity_id: input.log?.entityId ?? null,
    sent_by: input.log?.sentBy ?? null,
    provider_message_id: id,
    status: error ? "failed" : "sent",
    error,
  });

  return { ok: !error, id, error };
}

/** Resolve the current signed-in operator as an email sender (display name +
 *  reply-to). Call from a server action with a user context; returns null when
 *  there is no user (cron/system), and the dispatcher falls back to the org name. */
export async function resolveCurrentSender(): Promise<(EmailSender & { id: string | null }) | null> {
  const { getCurrentProfile } = await import("@/lib/auth/profile");
  const p = await getCurrentProfile();
  if (!p) return null;
  const name =
    p.display_name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    null;
  return { id: p.id ?? null, name, email: p.email ?? null };
}

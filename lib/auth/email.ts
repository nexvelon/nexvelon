import "server-only";

import { Resend } from "resend";
import { parseTierText } from "@/lib/tier-text-parser";

/**
 * Resend client.
 *
 * RESEND_API_KEY is set at the project level in Vercel and locally in
 * .env.local. The same key is also used by Supabase's Custom SMTP integration
 * (Phase 2 setup) — Resend rate-limits per-key, not per-channel, so we share.
 */
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

const FROM =
  process.env.RESEND_FROM_EMAIL ?? "Nexvelon <noreply@nexvelonglobal.com>";

// ----------------------------------------------------------------------------
// OTP email · sent on every successful password sign-in (step 1 of 2FA).
// ----------------------------------------------------------------------------

export async function sendOtpEmail(opts: {
  to: string;
  code: string;
  /** First name for greeting; falls back to "there". */
  firstName?: string | null;
  /** Approximate minutes until the code expires — for display only. */
  expiresInMinutes?: number;
}): Promise<void> {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  const minutes = opts.expiresInMinutes ?? 10;

  const html = renderOtpHtml({ greeting, code: opts.code, minutes });
  const text = renderOtpText({ greeting, code: opts.code, minutes });

  const resend = client();
  const result = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `Your Nexvelon sign-in code: ${opts.code}`,
    html,
    text,
    headers: {
      // Helpful for downstream filters / threading.
      "X-Entity-Ref-ID": `nexvelon-otp-${Date.now()}`,
    },
  });

  if (result.error) {
    throw new Error(`sendOtpEmail: ${result.error.message}`);
  }
}

// ----------------------------------------------------------------------------
// Templates — match the navy + gold private-bank tone from Phase 2 invite.
// Inline styles only (no <style> blocks) so Outlook + Gmail render correctly.
// ----------------------------------------------------------------------------

function renderOtpHtml(args: {
  greeting: string;
  code: string;
  minutes: number;
}): string {
  // Keep the OTP very large + monospace so it copies cleanly on mobile.
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F5F1E8;font-family:Georgia,'Times New Roman',serif;color:#0A1226;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E8;padding:48px 16px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #E5DFD0;">
            <tr>
              <td style="padding:40px 48px 24px;border-bottom:1px solid #E5DFD0;">
                <div style="font-size:11px;letter-spacing:0.18em;color:#B8924B;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:600;">Nexvelon · Sign-in verification</div>
                <div style="margin-top:18px;font-size:30px;line-height:1.1;color:#0A1226;font-weight:normal;">Confirm it's you.</div>
                <div style="margin-top:10px;font-style:italic;color:#5C5240;font-size:15px;">A second factor for every sign-in.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 48px 8px;font-size:15px;line-height:1.6;color:#2A2418;">
                ${escapeHtml(args.greeting)} use this code to finish signing in.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 48px 32px;" align="left">
                <div style="font-family:'Courier New',monospace;font-size:34px;letter-spacing:0.4em;color:#0A1226;background:#F5F1E8;padding:18px 24px;border:1px solid #B8924B;display:inline-block;">${escapeHtml(
                  args.code
                )}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 48px 32px;font-size:13px;color:#5C5240;line-height:1.6;">
                Expires in ${args.minutes} minutes. If you didn't try to sign in, you can ignore this email — your account remains secure.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 48px;background:#0A1226;color:#B8924B;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
                &copy; 2026 Nexvelon Global
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderOtpText(args: {
  greeting: string;
  code: string;
  minutes: number;
}): string {
  return [
    `Nexvelon · Sign-in verification`,
    ``,
    args.greeting,
    ``,
    `Your sign-in code: ${args.code}`,
    `It expires in ${args.minutes} minutes.`,
    ``,
    `If you didn't try to sign in, you can ignore this email.`,
    ``,
    `— Nexvelon Global`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ----------------------------------------------------------------------------
// INV-5 · Low-stock report · on-demand email of items at/under reorder point.
// Reuses the shared Resend client() + FROM + navy/gold tone from the OTP mail.
// ----------------------------------------------------------------------------

export interface LowStockItem {
  sku: string;
  name: string;
  stock: number;
  reorderPoint: number;
}

export async function sendLowStockAlert(
  to: string,
  items: LowStockItem[]
): Promise<void> {
  const count = items.length;
  const subject = `Nexvelon — ${count} item${count === 1 ? "" : "s"} at or below the low-stock threshold`;

  // POLISH-13 — the low-stock report now rides the shared reference shell; the
  // item list renders as a hairline table inside the cream card's letter body.
  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-family:${MONO};font-size:13px;color:#0A1226;">${escapeHtml(
          it.sku
        )}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-family:${SERIF};font-size:14px;color:#2A2418;">${escapeHtml(
          it.name
        )}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-family:${SANS};font-size:13px;color:#0A1226;text-align:right;">${it.stock}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-family:${SANS};font-size:13px;color:#5C5240;text-align:right;">${it.reorderPoint}</td>
      </tr>`
    )
    .join("");

  const th =
    "padding:8px 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;border-bottom:1px solid #E5DFD0;";
  const bodyHtml = `
    ${letterParagraphs([
      `${count} item${count === 1 ? "" : "s"} at or below the low-stock threshold. Review and reorder as needed.`,
    ])}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border:1px solid #E5DFD0;border-collapse:collapse;">
      <thead>
        <tr style="background:#F2EDDF;">
          <th style="text-align:left;${th}">Part #</th>
          <th style="text-align:left;${th}">Name</th>
          <th style="text-align:right;${th}">On hand</th>
          <th style="text-align:right;${th}">Low-stock at</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  const html = emailShell({
    eyebrow: "INVENTORY ALERT",
    headline: "Stock running low.",
    bodyHtml,
    statusLine: "INVENTORY ALERT · ATTENTION REQUIRED",
    signatureItalic: "Review and reorder the items above in Inventory.",
    signatureGroup: "Nexvelon Global · Operations",
    signatureSubline: "INVENTORY · INTERNAL ALERT",
  });
  const text = renderLowStockText(items);

  const resend = client();
  const result = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": `nexvelon-lowstock-${Date.now()}`,
    },
  });

  if (result.error) {
    throw new Error(`sendLowStockAlert: ${result.error.message}`);
  }
}

function renderLowStockText(items: LowStockItem[]): string {
  const lines = items.map(
    (it) =>
      `  ${it.sku} · ${it.name} — on hand ${it.stock}, low-stock at ${it.reorderPoint}`
  );
  return [
    `Nexvelon · Inventory — Low-stock report`,
    ``,
    `${items.length} item(s) at or below the low-stock threshold:`,
    ``,
    ...lines,
    ``,
    `— Nexvelon Global`,
  ].join("\n");
}

// ----------------------------------------------------------------------------
// POLISH-3 · Client onboarding invitations.
// Invites are sent FROM inquiries@ and the bundled submission notification is
// sent TO inquiries@. Falls back to the same Resend-verified domain.
// ----------------------------------------------------------------------------

const INQUIRIES_FROM =
  process.env.RESEND_INQUIRIES_EMAIL ?? "Nexvelon <inquiries@nexvelonglobal.com>";
const INQUIRIES_TO =
  process.env.RESEND_INQUIRIES_TO ?? "inquiries@nexvelonglobal.com";
// POLISH-38 — second internal recipient of the bundled submission email. Ensure
// this alias exists in M365 before relying on it. Overridable via env.
const CLIENTS_SITES_INFO_TO =
  process.env.RESEND_CLIENTS_SITES_INFO_TO ??
  "ClientsAndSitesInfo@NexvelonGlobal.com";

/** An email attachment (filename + raw buffer), for Resend. */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

// POLISH-13 — font + colour tokens for the shared shell. Cormorant Garamond is
// loaded via a Google Fonts <link> for clients that support it; Georgia / Times
// New Roman are the fallback for Outlook desktop + corporate filters.
const SERIF = "'Cormorant Garamond', Garamond, Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Arial, sans-serif";
const MONO = "'SF Mono', 'Courier New', monospace";

export type EmailShellProps = {
  eyebrow: string; // "CLIENT ONBOARDING"
  // POLISH-16 (CHANGE 2) — one uniform headline string (no italic-emphasis split).
  headline: string; // "Welcome to Nexvelon's Client Application Portal."
  bodyHtml: string; // already-styled <p>s for the letter body
  statusLine?: string; // "APPLICATION PORTAL · READY" — omitted = no status row
  ctaHref?: string; // if absent, no button + no fallback-URL block
  ctaLabel?: string; // "OPEN ONBOARDING PORTAL"
  ctaSubline?: string; // "EXPLORE THE PORTAL"
  afterCtaItalic?: string; // "Explore the full Prestige Tier..."
  signatureItalic: string; // "Once all forms are complete..."
  signatureGroup: string; // "The Nexvelon Global Group"
  signatureSubline: string; // "CLIENT APPLICATION · PRIVATE INVITATION"
  outerNote?: string; // HTML — "This invitation was prepared for <email>"
};

// POLISH-13 — the shared house shell, rebuilt to the supplied reference
// aesthetic: a deep-navy radial-gradient canvas, a cream gold-bordered card with
// a layered box-shadow (gold glow + navy depth), a wordmark flanked by gold
// rules, an italic-emphasis Cormorant Garamond headline, a navy/gold CTA, a mono
// fallback-URL block, a two-tier signature, and a dark gradient footer. All five
// transactional email types plug their content into this one template. Table-
// based + inline CSS + fallback fonts so Outlook degrades to a clean solid-colour
// version (the gradients/shadows are simply ignored there).
function emailShell(p: EmailShellProps): string {
  const hasCta = !!(p.ctaHref && p.ctaLabel);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet" />
    <style>
      body { margin:0; padding:0; }
      /* CHANGE 4 — premium CTA hover (clients that support it): brighter gold rim + deeper shadow. */
      .nx-cta-td:hover { border-color:#D4B66B !important; box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 6px 18px rgba(10,18,38,0.6),0 0 0 1px rgba(201,163,92,0.35) !important; }
      @media only screen and (max-width:640px) {
        /* POLISH-26 — keep the card centered on mobile (some clients drop the
           outer td's align=center once .nx-card goes full-width). */
        .nx-card { width:100% !important; margin:0 auto !important; padding-left:0 !important; padding-right:0 !important; }
        .nx-hero { padding:56px 28px 36px !important; }
        .nx-wordmark { font-size:32px !important; }
        .nx-headline { font-size:20px !important; }
        .nx-flank { width:24px !important; }
        .nx-body { padding:16px 28px 0 !important; font-size:14px !important; }
        .nx-p { font-size:14px !important; }
        .nx-inc { font-size:13px !important; }
        .nx-pad { padding-left:28px !important; padding-right:28px !important; }
        .nx-ctabtn { padding:18px 40px !important; }
        .nx-outer { padding:24px 24px 48px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#070C1C;font-family:${SERIF};color:#0A1226;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#070C1C;background-image:radial-gradient(ellipse 90% 60% at 50% 0%, #1E2A5A 0%, #101840 28%, #0A1226 55%, #050912 100%),radial-gradient(ellipse 80% 50% at 50% 100%, #1A2350 0%, #0D1530 35%, #050912 100%);padding:40px 12px;">
      <tr>
        <td align="center">
          <table class="nx-card" width="640" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;max-width:640px;background-color:#FBF8F1;border:1px solid #8A6A2E;box-shadow:0 0 0 1px rgba(138,106,46,0.5),0 0 18px rgba(184,146,75,0.45),0 30px 80px -20px rgba(20,30,80,0.65),0 60px 140px -30px rgba(30,42,90,0.55);">

            <!-- Hero -->
            <tr>
              <td class="nx-hero" style="padding:52px 56px 32px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td class="nx-flank" style="width:48px;border-bottom:1px solid #B8924B;font-size:0;line-height:0;">&nbsp;</td>
                    <td style="padding:0 18px;white-space:nowrap;">
                      <span class="nx-wordmark" style="font-family:${SERIF};font-size:42px;color:#B8924B;font-weight:500;letter-spacing:0.06em;">NEXVELON GLOBAL</span>
                    </td>
                    <td class="nx-flank" style="width:48px;border-bottom:1px solid #B8924B;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>
                <div style="margin-top:24px;font-family:${SANS};font-size:10px;letter-spacing:0.42em;color:#B8924B;font-weight:600;text-transform:uppercase;">${escapeHtml(
                  p.eyebrow
                )}</div>
                <div class="nx-headline" style="margin-top:18px;font-family:${SERIF};font-size:20px;line-height:1.15;letter-spacing:-0.4px;color:#0A1226;font-weight:400;">${escapeHtml(
                  p.headline
                )}</div>
              </td>
            </tr>

            <!-- Letter body -->
            <tr>
              <td class="nx-body" style="padding:16px 72px 0;font-family:${SERIF};font-size:15px;line-height:1.6;color:#2A2418;">
                ${p.bodyHtml}
              </td>
            </tr>

${
  p.statusLine
    ? `
            <!-- Status line -->
            <tr>
              <td class="nx-pad" style="padding:48px 72px 0;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                  <tr><td style="border-top:1px solid #E5DFD0;padding-top:28px;text-align:center;">
                    <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#B8924B;vertical-align:middle;">&nbsp;</span>
                    <span style="font-family:${SANS};font-size:10px;letter-spacing:0.28em;color:#5C5240;font-weight:500;text-transform:uppercase;vertical-align:middle;">&nbsp;${escapeHtml(
                      p.statusLine
                    )}</span>
                  </td></tr>
                </table>
              </td>
            </tr>`
    : ""
}
${
  hasCta
    ? `
            <!-- CTA. POLISH-21 — extra breathing room above the button
                 (closing → CTA gap 16px → 32px); compensated by a tighter
                 sign-off → footer gap below so overall height is ~unchanged. -->
            <tr>
              <td class="nx-pad" style="padding:32px 72px 8px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                  <tr><td class="nx-cta-td" style="background-color:#0A1226;background-image:linear-gradient(180deg,#0A1226 0%,#15203F 100%);border:1.5px solid #C9A35C;border-radius:3px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05),0 4px 12px rgba(10,18,38,0.5),0 0 0 1px rgba(201,163,92,0.2);">
                    <a class="nx-ctabtn" href="${escapeHtml(
                      p.ctaHref as string
                    )}" style="display:inline-block;padding:18px 48px;font-family:${SERIF};font-style:italic;font-size:14px;letter-spacing:1.5px;color:#FBF8F1;text-decoration:none;">${escapeHtml(
                      p.ctaLabel as string
                    )}</a>
                  </td></tr>
                </table>
                ${
                  p.ctaSubline
                    ? `<div style="margin-top:14px;font-family:${SANS};font-size:10px;letter-spacing:0.3em;color:#B8924B;font-weight:600;text-transform:uppercase;">${escapeHtml(
                        p.ctaSubline
                      )}</div>`
                    : ""
                }
              </td>
            </tr>`
    : ""
}
${
  p.afterCtaItalic
    ? `
            <!-- After-CTA italic -->
            <tr>
              <td class="nx-pad" style="padding:8px 72px 0;text-align:center;">
                <div style="font-family:${SERIF};font-style:italic;font-size:13px;color:#5C5240;line-height:1.6;">${escapeHtml(
                  p.afterCtaItalic
                )}</div>
              </td>
            </tr>`
    : ""
}

            <!-- POLISH-15 (CHANGE 11) — the fallback-URL block was removed; the
                 CTA button is the single path forward, saving vertical space. -->

            <!-- Signature. CHANGE 5 — the sign-off line is normalized to body
                 style (serif, 15px, normal, #2A2418) and the whole block is
                 centered for a clean, cohesive close. -->
            <tr>
              <td class="nx-pad" style="padding:8px 72px 18px;text-align:center;">
                <div class="nx-p" style="font-family:${SERIF};font-size:15px;font-weight:400;color:#2A2418;line-height:1.5;margin:20px 0 24px;">${escapeHtml(
                  p.signatureItalic
                )}</div>
                <div style="font-family:${SERIF};font-size:22px;color:#0A1226;font-weight:500;letter-spacing:-0.2px;">${escapeHtml(
                  p.signatureGroup
                )}</div>
                <div style="margin-top:10px;font-family:${SANS};font-size:10px;letter-spacing:0.3em;color:#B8924B;font-weight:600;text-transform:uppercase;">${escapeHtml(
                  p.signatureSubline
                )}</div>
              </td>
            </tr>

            <!-- Dark footer band -->
            <tr>
              <td style="background-color:#0A1226;background-image:linear-gradient(180deg,#16204A 0%,#0F1838 35%,#0A1226 100%);">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                  <tr><td style="padding:28px 40px 20px;">
                    <!-- Three operating entities, stacked. POLISH-16 (CHANGE 6) —
                         reduced to a tasteful 14px corporate identifier (was 22px),
                         tighter 4px gaps, slightly more tracking. -->
                    <div class="nx-inc" style="font-family:${SERIF};font-size:14px;color:#FBF8F1;font-weight:500;letter-spacing:0.05em;line-height:1.4;">Nexvelon Inc.</div>
                    <div class="nx-inc" style="margin-top:4px;font-family:${SERIF};font-size:14px;color:#FBF8F1;font-weight:500;letter-spacing:0.05em;line-height:1.4;">Nexvelon Guardian Inc.</div>
                    <div class="nx-inc" style="margin-top:4px;font-family:${SERIF};font-size:14px;color:#FBF8F1;font-weight:500;letter-spacing:0.05em;line-height:1.4;">Nexvelon Integrated Solutions Inc.</div>
                  </td></tr>
                  <tr><td style="padding:0 40px;"><div style="border-top:1px solid #1A2340;font-size:0;line-height:0;">&nbsp;</div></td></tr>
                  <tr><td style="padding:16px 40px 24px;text-align:center;">
                    <span style="font-family:${SANS};font-size:9px;letter-spacing:0.22em;color:#6B7390;font-weight:500;text-transform:uppercase;">CONFIDENTIAL · DO NOT FORWARD</span>
                  </td></tr>
                </table>
              </td>
            </tr>
          </table>
${
  p.outerNote
    ? `
          <table class="nx-card" width="640" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;max-width:640px;">
            <tr><td class="nx-outer" style="padding:28px 64px 56px;text-align:center;">
              <div style="font-family:${SANS};font-size:11px;color:#6B7390;line-height:1.7;letter-spacing:0.04em;">${p.outerNote}</div>
            </td></tr>
          </table>`
    : ""
}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// POLISH-13 — letter-body paragraphs styled for the new shell's Cormorant
// Garamond body. Inline font on each <p> (not inherited) so Outlook renders it.
function letterParagraphs(parts: string[]): string {
  return parts
    .filter((s) => s.trim() !== "")
    .map(
      (s) =>
        `<p class="nx-p" style="margin:0 0 20px;font-family:${SERIF};font-size:15px;line-height:1.6;color:#2A2418;">${s}</p>`
    )
    .join("");
}

// POLISH-13 — recipient eyebrow rendered on the dark canvas below the card.
function outerNoteFor(prefix: string, email: string): string {
  return `${escapeHtml(prefix)} <span style="color:#FBF8F1;letter-spacing:0.08em;">${escapeHtml(
    email
  )}</span>`;
}

/**
 * POLISH-4 — send the ONE-LINK onboarding invitation. The email carries a single
 * primary link to the hub/status page (not four separate links). Type A
 * (full) = new client onboarding; Type B (site_only) = add a site to an
 * existing client.
 *
 * POLISH-11 — the email is now slim: the Prestige Tier cards + disclaimers moved
 * to the portal hub (the page the CTA opens), so the email is just brand header,
 * a short intro that names the tiers, the CTA, a one-line pointer to the portal,
 * and the closing.
 */

export async function sendClientInviteEmail(opts: {
  to: string;
  token: string;
  baseUrl: string;
  inviteType?: "full" | "site_only";
}): Promise<void> {
  const base = `${opts.baseUrl.replace(/\/$/, "")}/invite/${opts.token}`;
  const siteOnly = opts.inviteType === "site_only";

  // POLISH-14 (CHANGE 2) — invite-specific flow: the Prestige-Tier explore line
  // and the operational closing now sit in the BODY, above the CTA, so the reader
  // sees them before clicking. The status line is dropped for invites. Other
  // emails are untouched (they still pass their statusLine).
  const intro = siteOnly
    ? "You've been invited to add a new site to your Nexvelon Global account. <br style='line-height:12px;' />Please review, fill, sign and submit the site setup forms in the link below for review and approval."
    : "Please review, fill, sign and submit the forms in the link below. Once approved, you will receive a confirmation email along with your assigned Prestige Tiers from: (Bronze / Silver / Gold / Platinum / Diamond).";
  // POLISH-16 (CHANGE 3) — intro, explore, and closing all read as the same
  // normal body paragraph (no italic / no muted styling); explicit per-line
  // margins give CHANGE 1's breathing room (intro→explore 14px, explore→closing 12px).
  // POLISH-31 (CHANGE 1) — the three middle paragraphs read cleaner in a sans-
  // serif body than in Garamond (which is dense when stacked three deep). The
  // headline, sign-off, CTA, and footer keep Garamond for the luxury accent.
  // POLISH-63 — hanging indent: the ✦ sits at the left edge (text-indent pulls
  // the first line back), and wrapped lines align UNDER THE TEXT (padding-left),
  // not under the bullet. 24px ≈ the ✦ glyph (11px) + its 10px right margin.
  const para = `font-family:'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;font-size:14px;font-weight:400;color:#2A2418;line-height:1.65;padding-left:24px;text-indent:-24px;`;
  // POLISH-31 (CHANGE 3) — smaller, softer warm-gold bullet (was 13px #B8924B).
  const bullet = `<span style="color:#C9A35C;font-size:11px;margin-right:10px;vertical-align:middle;">&#10022;</span>`;
  // CHANGE 2 — more breathing between paragraphs (24px), with extra space before
  // the CTA after the closing line (28px).
  const introLine = `<p class="nx-p" style="${para}margin:0 0 24px;">${bullet}${intro}</p>`;
  const exploreLine = siteOnly
    ? ""
    : `<p class="nx-p" style="${para}margin:0 0 24px;">${bullet}Explore all Prestige Tier benefits &amp; conditions under the client form.</p>`;
  const closingLine = `<p class="nx-p" style="${para}margin:0 0 28px;">${bullet}Once all forms are complete, please return to the status page and press Submit. For any questions, please reply to this email.</p>`;
  const bodyHtml = `${introLine}${exploreLine}${closingLine}`;

  const html = emailShell({
    eyebrow: siteOnly ? "SITE ONBOARDING" : "CLIENT ONBOARDING",
    // CHANGE 2 — single uniform headline.
    headline: siteOnly
      ? "Welcome to Nexvelon Global's Site Application Portal."
      : "Welcome to Nexvelon Global's Client Application Portal.",
    bodyHtml,
    // CHANGE 2 — no status line on invites.
    ctaHref: base,
    // CHANGE 4 — elegant Title Case inscription for the italic-serif CTA.
    ctaLabel: "Open Onboarding Portal",
    ctaSubline: "EXPLORE THE PORTAL",
    // explore + closing moved into bodyHtml above; signature carries a brief
    // sign-off since the operational closing is now above the CTA.
    signatureItalic: "We look forward to welcoming you to Nexvelon Global.",
    signatureGroup: "The Nexvelon Global Group",
    signatureSubline: "CLIENT APPLICATION · PRIVATE INVITATION",
    outerNote: outerNoteFor("This invitation was prepared for", opts.to),
  });

  const text = [
    siteOnly
      ? "Nexvelon Global · Site Onboarding"
      : "Nexvelon Global · Client Onboarding",
    "",
    siteOnly
      ? "You've been invited to add a new site to your Nexvelon Global account.\nPlease review, fill, sign and submit the site setup forms at the link below for review and approval."
      : "Please review, fill, sign and submit the forms in the link below. Once approved, you will receive a confirmation email along with your assigned Prestige Tiers from: (Bronze / Silver / Gold / Platinum / Diamond).",
    "",
    `Open Onboarding Portal: ${base}`,
    ...(siteOnly
      ? []
      : [
          "",
          "Explore all Prestige Tier benefits & conditions under the client form.",
        ]),
    "",
    "Once all forms are complete, please return to the status page and press Submit. For any questions, please reply to this email.",
    "",
    "— Nexvelon Global",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: INQUIRIES_FROM,
    to: opts.to,
    subject: siteOnly
      ? "Your Nexvelon Global site onboarding"
      : "Your Nexvelon Global onboarding",
    html,
    text,
    headers: { "X-Entity-Ref-ID": `nexvelon-invite-${Date.now()}` },
  });
  if (result.error) throw new Error(`sendClientInviteEmail: ${result.error.message}`);
}

/** Notify inquiries@ that a client completed + submitted their onboarding. */
export async function sendClientSubmissionEmail(opts: {
  email: string;
  clientForm: Record<string, unknown>;
  siteForm: Record<string, unknown>;
  tc1: { name: string | null; at: string | null };
  tc2: { name: string | null; at: string | null };
  // POLISH-38 — the four generated PDFs (T&Cs + form PDFs) attached to the
  // internal bundle. Best-effort: any may be absent.
  attachments?: EmailAttachment[];
}): Promise<void> {
  const kv = (label: string, value: unknown) => {
    const v = String(value ?? "").trim();
    if (!v) return "";
    return `<tr><td style="padding:4px 12px 4px 0;color:#5C5240;font-size:13px;white-space:nowrap;">${escapeHtml(
      label
    )}</td><td style="padding:4px 0;color:#0A1226;font-size:13px;">${escapeHtml(v)}</td></tr>`;
  };
  const section = (title: string, rows: string) =>
    `<div style="margin-top:20px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#B8924B;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(
      title
    )}</div><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">${rows}</table>`;

  const cf = opts.clientForm;
  const sf = opts.siteForm;
  const contact = (d: Record<string, unknown>) =>
    [d.c0First, d.c0Last].filter(Boolean).join(" ");
  const clientRows =
    kv("Legal name", cf.legalName) +
    kv("Trade name", cf.tradeName) +
    kv("HST/GST #", cf.hstNumber) +
    kv("Billing", [cf.billingStreet, cf.billingCity, cf.billingProvince, cf.billingPostal, cf.billingCountry].filter(Boolean).join(", ")) +
    kv("Payment", [cf.paymentTerms, cf.paymentMethod, cf.currency].filter(Boolean).join(" · ")) +
    kv("Primary contact", contact(cf)) +
    kv("Contact email", cf.c0Email) +
    kv("Contact phone", cf.c0Phone);
  const siteRows =
    kv("Site name", sf.siteName) +
    kv("Address", [sf.siteStreet, sf.siteUnit, sf.siteCity, sf.siteProvince, sf.sitePostal, sf.siteCountry].filter(Boolean).join(", ")) +
    kv("Site contact", contact(sf)) +
    kv("Site phone", sf.c0Phone);
  const tcRows =
    kv("Integrated Solutions Inc. T&C", `${opts.tc1.name ?? "—"} · ${opts.tc1.at ? new Date(opts.tc1.at).toLocaleString() : "—"}`) +
    kv("Guardian Inc. T&C", `${opts.tc2.name ?? "—"} · ${opts.tc2.at ? new Date(opts.tc2.at).toLocaleString() : "—"}`);

  const bodyHtml = `
    <p style="margin:0;">A prospective client (${escapeHtml(
      opts.email
    )}) completed onboarding. It's waiting in <strong>Clients → Pending Review</strong>.</p>
    ${section("Client information", clientRows || kv("—", "No data"))}
    ${section("Site information", siteRows || kv("—", "No data"))}
    ${section("Signed agreements", tcRows)}`;
  const html = emailShell({
    eyebrow: "ONBOARDING SUBMITTED",
    headline: "New client pending review.",
    bodyHtml,
    statusLine: "PENDING REVIEW · ACTION REQUIRED",
    signatureItalic: "Review the submission in Clients → Pending Review.",
    signatureGroup: "Nexvelon Global · Operations",
    signatureSubline: "INTERNAL NOTIFICATION",
    outerNote: outerNoteFor("Submitted by", opts.email),
  });
  const text = [
    "Nexvelon · Onboarding submitted",
    `Client: ${opts.email}`,
    "",
    `Legal name: ${cf.legalName ?? "—"}`,
    `Contact: ${cf.contactName ?? "—"} ${cf.contactEmail ?? ""} ${cf.contactPhone ?? ""}`,
    `Site: ${sf.siteName ?? "—"} — ${[sf.addressLine1, sf.city, sf.province].filter(Boolean).join(", ")}`,
    `T&C 1: ${opts.tc1.name ?? "—"} @ ${opts.tc1.at ?? "—"}`,
    `T&C 2: ${opts.tc2.name ?? "—"} @ ${opts.tc2.at ?? "—"}`,
    "",
    "Review in Clients → Pending Review.",
    "— Nexvelon Global",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: INQUIRIES_FROM,
    // POLISH-38 — both internal recipients receive the same bundle + attachments.
    to: [INQUIRIES_TO, CLIENTS_SITES_INFO_TO],
    subject: `New client onboarding submitted — ${cf.legalName ?? opts.email}`,
    html,
    text,
    ...(opts.attachments && opts.attachments.length
      ? { attachments: opts.attachments }
      : {}),
    headers: { "X-Entity-Ref-ID": `nexvelon-onboarding-${Date.now()}` },
  });
  if (result.error) throw new Error(`sendClientSubmissionEmail: ${result.error.message}`);
}

/**
 * CHANGE 4 — confirmation to the CLIENT once they submit, with both signed
 * T&C PDFs attached. A clean royal-style summary of what they sent in.
 */
export async function sendClientConfirmationEmail(opts: {
  to: string;
  clientForm: Record<string, unknown>;
  siteForm: Record<string, unknown>;
  tc1At: string | null;
  tc2At: string | null;
  // POLISH-38 — all available PDFs (signed T&Cs + form PDFs) attached for the
  // client's records. Best-effort: any may be absent.
  attachments?: EmailAttachment[];
}): Promise<void> {
  // POLISH-40 — the "Your Submission" summary table (and its gold divider) were
  // removed; the client doesn't need their submitted data echoed back in-inbox.
  // Body is now just the intro paragraph; the PDFs remain attached.
  // POLISH-63 — closing copy simplified: the factual "attached for your records"
  // line sits in the body; the reply-to line is the sign-off, giving a clean
  // blank-line separation (body paragraph → signature block).
  const bodyHtml = `
    ${letterParagraphs([
      "Thank you for completing your Nexvelon Global application. We have received your submission and our team will be in touch with the outcome shortly.",
      "Your signed agreements and submitted forms are attached to this email for your records.",
    ])}`;

  const html = emailShell({
    eyebrow: "APPLICATION RECEIVED",
    headline: "Thank you for your application.",
    bodyHtml,
    signatureItalic: "If you have any questions, please reply to this email.",
    signatureGroup: "The Nexvelon Global Group",
    signatureSubline: "CLIENT APPLICATION · CONFIRMATION",
    outerNote: outerNoteFor("This confirmation was sent to", opts.to),
  });

  const text = [
    "Nexvelon Global · Application Received",
    "",
    "Thank you for completing your Nexvelon Global application. We have received your submission and our team will be in touch with the outcome shortly.",
    "",
    "Your signed agreements and submitted forms are attached to this email for your records.",
    "",
    "If you have any questions, please reply to this email.",
    "",
    "— Nexvelon Global",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: INQUIRIES_FROM,
    to: opts.to,
    subject:
      "Your Nexvelon Global application — confirmation and signed agreements",
    html,
    text,
    ...(opts.attachments && opts.attachments.length
      ? { attachments: opts.attachments }
      : {}),
    headers: { "X-Entity-Ref-ID": `nexvelon-confirmation-${Date.now()}` },
  });
  if (result.error)
    throw new Error(`sendClientConfirmationEmail: ${result.error.message}`);
}

// ----------------------------------------------------------------------------
// POLISH-5 · Application-outcome + tier-change emails. Tier description text is
// passed in by the caller (read live from Settings → Client Tiers at send time)
// so edits there flow into subsequent emails. All use the same house shell.
// ----------------------------------------------------------------------------

/** Approved — with an assigned tier name + its description, or neither. */
export async function sendApplicationApprovedEmail(opts: {
  to: string;
  tierName?: string | null; // display label e.g. "Silver"
  tierText?: string | null; // description from Settings
  requestedTierName?: string | null; // tier the applicant asked for (CHANGE 6)
}): Promise<void> {
  const hasTier = !!(opts.tierName && opts.tierText);
  // CHANGE 6 — acknowledge when we approved at a different tier than requested
  // (including approving with no tier when one was requested).
  const assignedLabel = opts.tierName ?? "No Tier";
  const requested = opts.requestedTierName?.trim() || null;
  const showRequestedLine = !!requested && requested !== assignedLabel;
  const requestedLineText = showRequestedLine
    ? `You applied for ${requested}. After review, we've approved you at ${assignedLabel} Tier.`
    : "";
  // POLISH-41 — the tier description (a single Settings text block) is parsed
  // into headline + bullets + body paragraphs and rendered as warm-gold ✦
  // bullet lines instead of one run-on escaped paragraph. Bullet styling matches
  // the invite email (POLISH-31): Inter sans body, 11px #C9A35C ✦, 24px spacing.
  const parsed = hasTier ? parseTierText(opts.tierText) : null;
  const tierPara =
    "font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;color:#2A2418;line-height:1.65;";
  const tierBullet =
    '<span style="color:#C9A35C;font-size:11px;margin-right:10px;vertical-align:middle;">&#10022;</span>';
  const tierBlockHtml = parsed
    ? [
        parsed.headline
          ? `<p class="nx-p" style="${tierPara}margin:0 0 16px;">${escapeHtml(parsed.headline)}</p>`
          : "",
        ...parsed.bullets.map(
          (b) =>
            `<p class="nx-p" style="${tierPara}margin:0 0 4px;">${tierBullet}${escapeHtml(b)}</p>`
        ),
        ...parsed.bodyParas.map(
          (p) => `<p class="nx-p" style="${tierPara}margin:0 0 16px;">${escapeHtml(p)}</p>`
        ),
      ].join("")
    : "";
  const bodyHtml =
    letterParagraphs([
      "Welcome to Nexvelon Global. We are pleased to confirm that your application has been approved and your account is now active.",
      showRequestedLine
        ? `You applied for <strong>${escapeHtml(
            requested as string
          )}</strong>. After review, we've approved you at <strong>${escapeHtml(
            assignedLabel
          )}</strong> Tier.`
        : "",
      hasTier
        ? `<strong>Your Prestige Tier: ${escapeHtml(opts.tierName as string)}</strong>`
        : "",
    ]) + tierBlockHtml;
  const html = emailShell({
    eyebrow: "APPLICATION APPROVED",
    headline: "Welcome to Nexvelon Global.",
    bodyHtml,
    statusLine: "APPROVED · TIER ASSIGNED",
    signatureItalic:
      "Our team will be in touch shortly with next steps. If you have any immediate questions, please reply to this email or contact us at inquiries@NexvelonGlobal.com.",
    signatureGroup: "The Nexvelon Global Group",
    signatureSubline: "CLIENT ACCOUNT · ACTIVE",
    outerNote: outerNoteFor("This message was sent to", opts.to),
  });
  // POLISH-41 — plain-text mirror of the bulleted tier description: headline,
  // then "- " markers (one bullet per line), then any body paragraphs.
  const tierTextBlock = parsed
    ? [
        parsed.headline,
        ...parsed.bullets.map((b) => `- ${b}`),
        ...parsed.bodyParas,
      ]
        .filter((l) => l && l.trim() !== "")
        .join("\n")
    : "";
  const text = [
    "Welcome to Nexvelon Global. We are pleased to confirm that your application has been approved and your account is now active.",
    showRequestedLine ? `\n${requestedLineText}\n` : "",
    hasTier ? `\nYour Prestige Tier: ${opts.tierName}\n\n${tierTextBlock}\n` : "",
    "Our team will be in touch shortly with next steps. If you have any immediate questions, please reply to this email or contact us at inquiries@NexvelonGlobal.com.",
    "",
    "— Nexvelon Global",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: INQUIRIES_FROM,
    to: opts.to,
    subject: "Welcome to Nexvelon Global — your application is approved",
    html,
    text,
    headers: { "X-Entity-Ref-ID": `nexvelon-approved-${Date.now()}` },
  });
  if (result.error)
    throw new Error(`sendApplicationApprovedEmail: ${result.error.message}`);
}

/** Declined — with an optional reason. */
export async function sendApplicationDeclinedEmail(opts: {
  to: string;
  reason?: string | null;
}): Promise<void> {
  const hasReason = !!opts.reason && opts.reason.trim() !== "";
  const bodyHtml = letterParagraphs([
    hasReason
      ? "Thank you for your interest in Nexvelon Global. After review, we will not be able to move forward with your application at this time."
      : "Thank you for your interest in Nexvelon Global. After careful review, we will not be able to move forward with your application at this time.",
    hasReason ? `<strong>Reason:</strong> ${escapeHtml(opts.reason as string)}` : "",
  ]);
  const html = emailShell({
    eyebrow: "APPLICATION UPDATE",
    headline: "An update regarding your application.",
    bodyHtml,
    statusLine: "UPDATE FROM OUR REVIEW",
    signatureItalic: "We appreciate the time you took to apply and wish you the best.",
    signatureGroup: "The Nexvelon Global Group",
    signatureSubline: "APPLICATION · UPDATE",
    outerNote: outerNoteFor("This message was sent to", opts.to),
  });
  const text = [
    hasReason
      ? "Thank you for your interest in Nexvelon Global. After review, we will not be able to move forward with your application at this time."
      : "Thank you for your interest in Nexvelon Global. After careful review, we will not be able to move forward with your application at this time.",
    hasReason ? `\nReason: ${opts.reason}\n` : "",
    "We appreciate the time you took to apply and wish you the best.",
    "",
    "— Nexvelon Global",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: INQUIRIES_FROM,
    to: opts.to,
    subject: "Update on your Nexvelon Global application",
    html,
    text,
    headers: { "X-Entity-Ref-ID": `nexvelon-declined-${Date.now()}` },
  });
  if (result.error)
    throw new Error(`sendApplicationDeclinedEmail: ${result.error.message}`);
}

/** Tier changed on an existing client. */
export async function sendTierChangedEmail(opts: {
  to: string;
  oldTierLabel: string; // e.g. "Silver" or "No Tier"
  newTierName: string; // e.g. "Gold"
  tierText: string; // description from Settings
}): Promise<void> {
  // POLISH-41 (follow-up) — parse the tier description into headline + bullets +
  // body paragraphs and render warm-gold ✦ bullet lines (was one run-on escaped
  // paragraph). Bullet styling matches the invite + approval emails (POLISH-31).
  const parsed = parseTierText(opts.tierText);
  const tierPara =
    "font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;color:#2A2418;line-height:1.65;";
  const tierBullet =
    '<span style="color:#C9A35C;font-size:11px;margin-right:10px;vertical-align:middle;">&#10022;</span>';
  const tierBlockHtml = [
    parsed.headline
      ? `<p class="nx-p" style="${tierPara}margin:0 0 16px;">${escapeHtml(parsed.headline)}</p>`
      : "",
    ...parsed.bullets.map(
      (b) =>
        `<p class="nx-p" style="${tierPara}margin:0 0 4px;">${tierBullet}${escapeHtml(b)}</p>`
    ),
    ...parsed.bodyParas.map(
      (p) => `<p class="nx-p" style="${tierPara}margin:0 0 16px;">${escapeHtml(p)}</p>`
    ),
  ].join("");
  const bodyHtml =
    letterParagraphs([
      `Your Prestige Tier with Nexvelon Global has been updated from <strong>${escapeHtml(
        opts.oldTierLabel
      )}</strong> to <strong>${escapeHtml(opts.newTierName)}</strong>.`,
    ]) + tierBlockHtml;
  const html = emailShell({
    eyebrow: "TIER UPDATE",
    headline: "Your Tier has been updated.",
    bodyHtml,
    statusLine: "PRESTIGE TIER · UPDATED",
    signatureItalic:
      "Thank you for your continued partnership. If you have any questions, please reply to this email or contact us at inquiries@NexvelonGlobal.com.",
    signatureGroup: "The Nexvelon Global Group",
    signatureSubline: "PRESTIGE TIER · NOTIFICATION",
    outerNote: outerNoteFor("This message was sent to", opts.to),
  });
  // POLISH-41 (follow-up) — plain-text mirror: headline, then "- " bullets (one
  // per line), then body paragraphs.
  const tierTextBlock = [
    parsed.headline,
    ...parsed.bullets.map((b) => `- ${b}`),
    ...parsed.bodyParas,
  ]
    .filter((l) => l && l.trim() !== "")
    .join("\n");
  const text = [
    `Your Prestige Tier with Nexvelon Global has been updated from ${opts.oldTierLabel} to ${opts.newTierName}.`,
    "",
    tierTextBlock,
    "",
    "Thank you for your continued partnership. If you have any questions, please reply to this email or contact us at inquiries@NexvelonGlobal.com.",
    "",
    "— Nexvelon Global",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: INQUIRIES_FROM,
    to: opts.to,
    subject: "Your Nexvelon Global Prestige Tier has been updated",
    html,
    text,
    headers: { "X-Entity-Ref-ID": `nexvelon-tier-${Date.now()}` },
  });
  if (result.error)
    throw new Error(`sendTierChangedEmail: ${result.error.message}`);
}

// PO-4 — email an issued purchase order (PDF attached) to the vendor's sales
// rep. `from` is resolved by the caller from the configurable po_sender setting
// (getPoSenderFrom); the branded shell matches the other Nexvelon mail.
export async function sendPurchaseOrderEmail(params: {
  to: string;
  from: string;
  poNumber: string;
  vendorName: string;
  salesRepName: string | null;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): Promise<{ id: string | null }> {
  const greetName = params.salesRepName ?? params.vendorName;
  const subject = `Purchase Order ${params.poNumber} from Nexvelon Integrated Solutions`;

  const bodyHtml = letterParagraphs([
    `Hello ${greetName},`,
    `Please find attached Purchase Order ${params.poNumber} from Nexvelon Integrated Solutions Inc.`,
    "If you have any questions, please reply to this email.",
  ]);

  const html = emailShell({
    eyebrow: "PURCHASE ORDER",
    headline: `Purchase Order ${params.poNumber}`,
    bodyHtml,
    signatureItalic: "If you have any questions, please reply to this email.",
    signatureGroup: "Nexvelon Integrated Solutions",
    signatureSubline: "PURCHASE ORDER",
    outerNote: outerNoteFor("This purchase order was sent to", params.to),
  });

  const text = [
    `Purchase Order ${params.poNumber}`,
    "",
    `Hello ${greetName},`,
    "",
    `Please find attached Purchase Order ${params.poNumber} from Nexvelon Integrated Solutions Inc.`,
    "",
    "If you have any questions, please reply to this email.",
    "",
    "— Nexvelon Integrated Solutions",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject,
    html,
    text,
    attachments: [{ filename: params.pdfFilename, content: params.pdfBuffer }],
  });
  if (result.error)
    throw new Error(`sendPurchaseOrderEmail: ${result.error.message}`);
  return { id: result.data?.id ?? null };
}

// SUB-5 — email an issued work order (PDF attached) to the subcontractor,
// mirroring sendPurchaseOrderEmail (same shell/sender contract). Best-effort:
// the caller treats a throw here as a warning, never a rollback.
export async function sendWorkOrderEmail(params: {
  to: string;
  from: string;
  agreementNumber: string;
  subcontractorName: string;
  contactName: string | null;
  opcoLegalName: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): Promise<{ id: string | null }> {
  const greetName = params.contactName ?? params.subcontractorName;
  const subject = `Work Order ${params.agreementNumber} from ${params.opcoLegalName}`;

  const bodyHtml = letterParagraphs([
    `Hello ${greetName},`,
    `Please find attached Work Order ${params.agreementNumber} from ${params.opcoLegalName}. It sets out the scope, agreed value and schedule for the work.`,
    "Please maintain current WSIB clearance and liability insurance for the duration of the work. If you have any questions, reply to this email.",
  ]);

  const html = emailShell({
    eyebrow: "WORK ORDER",
    headline: `Work Order ${params.agreementNumber}`,
    bodyHtml,
    signatureItalic: "If you have any questions, please reply to this email.",
    signatureGroup: params.opcoLegalName,
    signatureSubline: "WORK ORDER",
    outerNote: outerNoteFor("This work order was sent to", params.to),
  });

  const text = [
    `Work Order ${params.agreementNumber}`,
    "",
    `Hello ${greetName},`,
    "",
    `Please find attached Work Order ${params.agreementNumber} from ${params.opcoLegalName}.`,
    "",
    "Please maintain current WSIB clearance and liability insurance for the duration of the work.",
    "",
    `— ${params.opcoLegalName}`,
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject,
    html,
    text,
    attachments: [{ filename: params.pdfFilename, content: params.pdfBuffer }],
  });
  if (result.error) throw new Error(`sendWorkOrderEmail: ${result.error.message}`);
  return { id: result.data?.id ?? null };
}

// INV-4 — email a return authorization (RMA) PDF to the vendor sales rep,
// mirroring sendPurchaseOrderEmail (same shell/sender contract).
export async function sendRmaEmail(params: {
  to: string;
  from: string;
  rmaNumber: string;
  vendorName: string;
  salesRepName: string | null;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): Promise<{ id: string | null }> {
  const greetName = params.salesRepName ?? params.vendorName;
  const subject = `RMA ${params.rmaNumber} — Return Authorization from Nexvelon`;

  const bodyHtml = letterParagraphs([
    `Hello ${greetName},`,
    `Please find attached Return Merchandise Authorization ${params.rmaNumber} from Nexvelon Integrated Solutions Inc.`,
    `Kindly issue credit or a replacement for the listed items, and reference RMA ${params.rmaNumber} on all correspondence.`,
    "If you have any questions, please reply to this email.",
  ]);

  const html = emailShell({
    eyebrow: "RETURN AUTHORIZATION",
    headline: `RMA ${params.rmaNumber}`,
    bodyHtml,
    signatureItalic: "If you have any questions, please reply to this email.",
    signatureGroup: "Nexvelon Integrated Solutions",
    signatureSubline: "RETURN AUTHORIZATION",
    outerNote: outerNoteFor("This return authorization was sent to", params.to),
  });

  const text = [
    `Return Merchandise Authorization ${params.rmaNumber}`,
    "",
    `Hello ${greetName},`,
    "",
    `Please find attached Return Merchandise Authorization ${params.rmaNumber} from Nexvelon Integrated Solutions Inc.`,
    `Kindly issue credit or a replacement for the listed items, and reference RMA ${params.rmaNumber} on all correspondence.`,
    "",
    "If you have any questions, please reply to this email.",
    "",
    "— Nexvelon Integrated Solutions",
  ].join("\n");

  const resend = client();
  const result = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject,
    html,
    text,
    attachments: [{ filename: params.pdfFilename, content: params.pdfBuffer }],
  });
  if (result.error) throw new Error(`sendRmaEmail: ${result.error.message}`);
  return { id: result.data?.id ?? null };
}

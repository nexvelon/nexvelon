import "server-only";

import { Resend } from "resend";

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

  const html = renderLowStockHtml(items);
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

function renderLowStockHtml(items: LowStockItem[]): string {
  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-family:'Courier New',monospace;font-size:13px;color:#0A1226;">${escapeHtml(
          it.sku
        )}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-size:13px;color:#2A2418;">${escapeHtml(
          it.name
        )}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-size:13px;color:#0A1226;text-align:right;">${it.stock}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-size:13px;color:#5C5240;text-align:right;">${it.reorderPoint}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F5F1E8;font-family:Georgia,'Times New Roman',serif;color:#0A1226;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E8;padding:48px 16px;">
      <tr>
        <td align="center">
          <table width="640" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #E5DFD0;">
            <tr>
              <td style="padding:40px 48px 24px;border-bottom:1px solid #E5DFD0;">
                <div style="font-size:11px;letter-spacing:0.18em;color:#B8924B;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:600;">Nexvelon · Inventory</div>
                <div style="margin-top:18px;font-size:30px;line-height:1.1;color:#0A1226;font-weight:normal;">Low-stock report</div>
                <div style="margin-top:10px;font-style:italic;color:#5C5240;font-size:15px;">${
                  items.length
                } item${items.length === 1 ? "" : "s"} at or below the low-stock threshold.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 48px 40px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E5DFD0;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#F5F1E8;">
                      <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">Part #</th>
                      <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">Name</th>
                      <th style="padding:8px 12px;text-align:right;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">On hand</th>
                      <th style="padding:8px 12px;text-align:right;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">Low-stock at</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
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

// Shared house shell (navy + gold) so every transactional email reads the same.
function emailShell(args: {
  eyebrow: string;
  heading: string;
  subtitle: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F5F1E8;font-family:Georgia,'Times New Roman',serif;color:#0A1226;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E8;padding:48px 16px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #E5DFD0;">
            <tr>
              <td style="padding:40px 48px 24px;border-bottom:1px solid #E5DFD0;">
                <div style="font-size:11px;letter-spacing:0.18em;color:#B8924B;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:600;">${escapeHtml(
                  args.eyebrow
                )}</div>
                <div style="margin-top:18px;font-size:30px;line-height:1.1;color:#0A1226;font-weight:normal;">${escapeHtml(
                  args.heading
                )}</div>
                ${
                  args.subtitle
                    ? `<div style="margin-top:10px;font-style:italic;color:#5C5240;font-size:15px;">${escapeHtml(
                        args.subtitle
                      )}</div>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:28px 48px;font-size:15px;line-height:1.7;color:#2A2418;">
                ${args.bodyHtml}
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

function primaryButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;"><tr>
    <td style="background:#0A1226;border-radius:4px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.04em;">${escapeHtml(
        label
      )}</a>
    </td>
  </tr></table>`;
}

/**
 * POLISH-4 — send the ONE-LINK onboarding invitation. The email carries a single
 * primary link to the hub/status page (not four separate links). Type A
 * (full) = new client onboarding; Type B (site_only) = add a site to an
 * existing client.
 */
export async function sendClientInviteEmail(opts: {
  to: string;
  token: string;
  baseUrl: string;
  inviteType?: "full" | "site_only";
}): Promise<void> {
  const base = `${opts.baseUrl.replace(/\/$/, "")}/invite/${opts.token}`;
  const siteOnly = opts.inviteType === "site_only";

  const lead = siteOnly
    ? `<p style="margin:0 0 18px;">You've been invited to add a new site to your Nexvelon Global account. Kindly complete, sign and submit the site setup forms in the link below for review and approval.</p>`
    : `<p style="margin:0 0 18px;">Kindly complete, sign and submit the forms in the link below for review and approval. If your application is approved, you will receive a confirmation email along with your Prestige Level Tier assigned from Bronze / Silver / Gold / Platinum.</p>`;

  const bodyHtml = `
    ${lead}
    ${primaryButton(base, "Open onboarding portal")}
    <p style="margin:18px 0 0;font-size:13px;color:#5C5240;">Once all forms are complete, please return to the status page and press Submit. For any questions, please reply to this email.</p>`;

  const html = emailShell({
    eyebrow: siteOnly
      ? "Nexvelon Global · Site Onboarding"
      : "Nexvelon Global · Client Onboarding",
    heading: siteOnly
      ? "Welcome to Nexvelon Global Site Onboarding."
      : "Welcome to Nexvelon Global Onboarding.",
    subtitle: "",
    bodyHtml,
  });

  const text = [
    siteOnly
      ? "Nexvelon Global · Site Onboarding"
      : "Nexvelon Global · Client Onboarding",
    "",
    siteOnly
      ? "You've been invited to add a new site to your Nexvelon Global account. Kindly complete, sign and submit the site setup forms at the link below for review and approval."
      : "Kindly complete, sign and submit the forms at the link below for review and approval. If your application is approved, you will receive a confirmation email along with your Prestige Level Tier assigned from Bronze / Silver / Gold / Platinum.",
    "",
    `Onboarding portal: ${base}`,
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
}): Promise<void> {
  const kv = (label: string, value: unknown) => {
    const v = String(value ?? "").trim();
    if (!v) return "";
    return `<tr><td style="padding:4px 12px 4px 0;color:#5C5240;font-size:13px;white-space:nowrap;">${escapeHtml(
      label
    )}</td><td style="padding:4px 0;color:#0A1226;font-size:13px;">${escapeHtml(v)}</td></tr>`;
  };
  const section = (title: string, rows: string) =>
    `<div style="margin-top:20px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#B8924B;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(
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
    eyebrow: "Nexvelon · Onboarding submitted",
    heading: "New client pending review.",
    subtitle: opts.email,
    bodyHtml,
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
    to: INQUIRIES_TO,
    subject: `New client onboarding submitted — ${cf.legalName ?? opts.email}`,
    html,
    text,
    headers: { "X-Entity-Ref-ID": `nexvelon-onboarding-${Date.now()}` },
  });
  if (result.error) throw new Error(`sendClientSubmissionEmail: ${result.error.message}`);
}

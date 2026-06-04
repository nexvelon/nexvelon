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
                &copy; 2026 Nexvelon Global Inc.
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
    `— Nexvelon Global Inc.`,
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
  reorderQty?: number;
}

export async function sendLowStockAlert(
  to: string,
  items: LowStockItem[]
): Promise<void> {
  const count = items.length;
  const subject = `Nexvelon — ${count} item${count === 1 ? "" : "s"} below reorder point`;

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
        <td style="padding:8px 12px;border-bottom:1px solid #E5DFD0;font-size:13px;color:#5C5240;text-align:right;">${
          it.reorderQty ?? "—"
        }</td>
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
                } item${items.length === 1 ? "" : "s"} at or below the reorder point.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 48px 40px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E5DFD0;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#F5F1E8;">
                      <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">SKU</th>
                      <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">Name</th>
                      <th style="padding:8px 12px;text-align:right;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">On hand</th>
                      <th style="padding:8px 12px;text-align:right;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">Reorder pt</th>
                      <th style="padding:8px 12px;text-align:right;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5C5240;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #E5DFD0;">Suggested qty</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 48px;background:#0A1226;color:#B8924B;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
                &copy; 2026 Nexvelon Global Inc.
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
      `  ${it.sku} · ${it.name} — on hand ${it.stock}, reorder pt ${it.reorderPoint}, suggested ${
        it.reorderQty ?? "—"
      }`
  );
  return [
    `Nexvelon · Inventory — Low-stock report`,
    ``,
    `${items.length} item(s) at or below the reorder point:`,
    ``,
    ...lines,
    ``,
    `— Nexvelon Global Inc.`,
  ].join("\n");
}

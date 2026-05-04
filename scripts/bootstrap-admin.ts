/**
 * scripts/bootstrap-admin.ts
 * ---------------------------------------------------------------------------
 * Creates (or re-invites) the very first Admin user.
 *
 *   npx tsx scripts/bootstrap-admin.ts
 *   npx tsx scripts/bootstrap-admin.ts --email someone@example.com --first Jane --last Doe
 *
 * Flow (same code path for new + existing users):
 *
 *   1. Try `auth.admin.generateLink({ type: 'invite', ... })`.
 *      - On success: we have a fresh hashed_token for a brand-new user.
 *      - On "user already exists": fall back to
 *        `generateLink({ type: 'magiclink' })` for the same user.
 *
 *   2. Build a hardened confirmation URL:
 *        ${SITE_URL}/auth/confirm?token_hash=${hashed_token}
 *                                 &type=${invite|magiclink}
 *                                 &next=/auth/set-password
 *
 *      Why not the action_link Supabase returns? That URL is the legacy
 *      one-time GET-and-consume `/auth/v1/verify?token=…`, which Gmail's
 *      link scanner pre-fetches and burns before the human clicks. The
 *      token_hash flow requires an interactive cookie session at
 *      /auth/confirm to redeem, which scanners can't synthesize.
 *
 *   3. POST the email to Resend's REST API directly.
 *      `generateLink` does NOT trigger SMTP — it only mints + returns
 *      the link object. Earlier versions of this script assumed otherwise
 *      and silently dropped the existing-user resend path on the floor.
 *
 *   4. Print "Email queued to Resend, message ID: <id>" on success.
 *      Throw + exit non-zero on any Resend failure.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + RESEND_API_KEY from
 * .env.local. The service-role key + Resend key never leave this script.
 * ---------------------------------------------------------------------------
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ----------------------------------------------------------------------------
// Args + env

interface CliArgs {
  email: string;
  first: string;
  last: string;
  appUrl: string;
}

const DEFAULTS: CliArgs = {
  email: "jayshah.x@gmail.com",
  first: "Jay",
  last: "Shah",
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nexvelonglobal.com",
};

function parseArgs(argv: string[]): CliArgs {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (!next) continue;
    if (flag === "--email") out.email = next;
    if (flag === "--first") out.first = next;
    if (flag === "--last") out.last = next;
    if (flag === "--app-url") out.appUrl = next;
  }
  return out;
}

interface Env {
  supabaseUrl: string;
  supabaseServiceKey: string;
  resendKey: string;
  fromEmail: string;
}

function loadEnv(): Env {
  const path = resolve(process.cwd(), ".env.local");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Missing .env.local at ${path}. Copy .env.example and fill in real values first.`
    );
  }

  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }

  const supabaseUrl =
    map.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey =
    map.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = map.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const fromEmail =
    map.RESEND_FROM_EMAIL ??
    process.env.RESEND_FROM_EMAIL ??
    "Nexvelon <noreply@nexvelonglobal.com>";

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!supabaseServiceKey || supabaseServiceKey === "PASTE_SECRET_KEY_HERE") {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }
  if (!resendKey) {
    throw new Error(
      "Missing RESEND_API_KEY in .env.local. Same key you pasted into Supabase's Custom SMTP."
    );
  }

  return { supabaseUrl, supabaseServiceKey, resendKey, fromEmail };
}

// ----------------------------------------------------------------------------
// Token generation

type LinkType = "invite" | "magiclink";

interface LinkResult {
  type: LinkType;
  tokenHash: string;
}

async function generateAuthLink(
  sb: SupabaseClient,
  args: CliArgs
): Promise<LinkResult> {
  // Try invite first — works only for brand-new users.
  const inv = await sb.auth.admin.generateLink({
    type: "invite",
    email: args.email,
    options: {
      data: {
        first_name: args.first,
        last_name: args.last,
        role: "Admin",
      },
    },
  });

  const inviteHash = inv.data?.properties?.hashed_token;
  if (!inv.error && inviteHash) {
    return { type: "invite", tokenHash: inviteHash };
  }

  // Existing user? Fall back to magic link for the same address.
  if (
    inv.error &&
    /already (registered|exists|been)/i.test(inv.error.message)
  ) {
    console.log("  ⚠  User already exists — generating magic link instead.");
    const magic = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: args.email,
    });
    const magicHash = magic.data?.properties?.hashed_token;
    if (magic.error || !magicHash) {
      throw new Error(
        `generateLink magiclink failed: ${magic.error?.message ?? "no hashed_token"}`
      );
    }
    return { type: "magiclink", tokenHash: magicHash };
  }

  throw new Error(
    `generateLink invite failed: ${inv.error?.message ?? "no hashed_token"}`
  );
}

// ----------------------------------------------------------------------------
// URL build

function buildConfirmUrl(args: CliArgs, link: LinkResult): string {
  const params = new URLSearchParams({
    token_hash: link.tokenHash,
    type: link.type,
    next: "/auth/set-password",
  });
  return `${args.appUrl.replace(/\/$/, "")}/auth/confirm?${params.toString()}`;
}

// ----------------------------------------------------------------------------
// Resend send

async function sendInviteEmail(
  env: Env,
  args: CliArgs,
  link: LinkResult,
  confirmUrl: string
): Promise<string> {
  const isResend = link.type === "magiclink";
  const subject = isResend
    ? "Your sign-in link to Nexvelon"
    : "Your seat at the Nexvelon Enterprise Suite is ready";

  const html = renderInviteHtml({
    email: args.email,
    confirmUrl,
    isResend,
    subject,
  });
  const text = renderInviteText({
    email: args.email,
    confirmUrl,
    isResend,
  });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.fromEmail,
      to: args.email,
      subject,
      html,
      text,
      headers: {
        "X-Entity-Ref-ID": `nexvelon-invite-${Date.now()}`,
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Resend send failed: HTTP ${resp.status} — ${body.slice(0, 400)}`
    );
  }

  let data: { id?: string };
  try {
    data = (await resp.json()) as { id?: string };
  } catch (e) {
    throw new Error(
      `Resend response was not JSON: ${e instanceof Error ? e.message : "unknown"}`
    );
  }

  if (!data.id) {
    throw new Error(
      `Resend response missing id: ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  return data.id;
}

// ----------------------------------------------------------------------------
// HTML template — Phase 2 "Welcome to the Nexvelon Enterprise Suite" design,
// inlined here so the script is self-contained.
//
// MSO-safe table-based layout. Mobile-responsive via @media. Includes
// preheader, Apple disable-message-reformatting, color-scheme light.
//
// Brand tokens:
//   parchment #F5F1E8 · card #FFFFFF · card border #E5DFD0
//   navy #0A1226 · gold #B8924B · body #2A2418
//   taupe #5C5240 · muted #8C8273
//   Georgia / Times for body, Arial for labels.

function renderInviteHtml(opts: {
  email: string;
  confirmUrl: string;
  isResend: boolean;
  subject: string;
}): string {
  const isInvite = !opts.isResend;
  const headline = isInvite
    ? "Welcome to the<br/>Nexvelon Enterprise Suite."
    : "Sign in to the<br/>Nexvelon Enterprise Suite.";
  const subtitle = "Complete operating system in one place.";
  const preheader = isInvite
    ? "Your seat is ready. Tap once to set your password and join."
    : "Tap once to sign in to your workspace. The link is single-use.";
  const cta = isInvite ? "Accept your invitation" : "Sign in";
  const bottomNote = isInvite
    ? `This invitation was sent to ${escape(opts.email)}. If you weren&rsquo;t expecting it, you can safely ignore this email.`
    : `This sign-in link was requested for ${escape(opts.email)}. If you didn&rsquo;t request it, you can safely ignore this email.`;

  // Body paragraphs — invite vs sign-in.
  const para1 = isInvite
    ? "You&rsquo;ve been selected to join the Nexvelon Enterprise Suite &mdash; the operating system built with care and crafted with precision for the elite."
    : "Use the button below to access your Nexvelon workspace. The link is single-use and expires within the hour.";
  const para2 = isInvite
    ? "Inside, you&rsquo;ll find the workspace your administrator built for you: leads, quotes, projects, schedules, inventory, reporting &mdash; whatever your role requires. A custom-designed elite tool to ensure nothing falls through the cracks."
    : "If you didn&rsquo;t request a sign-in, you can ignore this email &mdash; your account remains secure.";

  // The "Full access configuration ✓" line + the italic "Kindly set your
  // password" only render on the first-time invite path.
  const accessLine = isInvite
    ? `<tr>
              <td align="center" class="nx-pad" style="padding:8px 48px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.04em;color:#5C5240;">
                <span style="display:inline-block;color:#8C8273;">Full access configuration for your role is complete.</span>
                <span style="display:inline-block;margin-left:6px;color:#8C8273;">&#10003;</span>
              </td>
            </tr>`
    : "";
  const ctaSubline = isInvite
    ? `<tr>
              <td align="center" class="nx-pad" style="padding:0 48px 36px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:13px;line-height:1.5;color:#5C5240;">
                Kindly set your password after accepting the invite.
              </td>
            </tr>`
    : `<tr><td style="padding:0 48px 24px;"></td></tr>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escape(opts.subject)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style type="text/css">
    table, td, th { mso-line-height-rule: exactly; border-collapse: collapse; }
    body, table, td, p, a { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
  </style>
  <![endif]-->
  <style>
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: #0A1226; text-decoration: none; }
    @media screen and (max-width: 620px) {
      .nx-card { width: 100% !important; max-width: 100% !important; }
      .nx-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .nx-headline { font-size: 26px !important; line-height: 1.18 !important; }
      .nx-cta { display: block !important; width: auto !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F5F1E8;color:#0A1226;font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;">${escape(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E8;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" class="nx-card" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5DFD0;max-width:560px;">
          <tr>
            <td class="nx-pad" style="padding:40px 48px 24px;border-bottom:1px solid #E5DFD0;">
              <div style="font-size:11px;letter-spacing:0.18em;color:#B8924B;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:600;">Nexvelon Enterprise Suite</div>
              <div class="nx-headline" style="margin-top:18px;font-size:30px;line-height:1.12;color:#0A1226;font-weight:normal;font-family:Georgia,'Times New Roman',serif;">${headline}</div>
              <div style="margin-top:12px;font-style:italic;color:#5C5240;font-size:15px;font-family:Georgia,'Times New Roman',serif;">${escape(subtitle)}</div>
            </td>
          </tr>
          <tr>
            <td class="nx-pad" style="padding:32px 48px 16px;font-size:15px;line-height:1.6;color:#2A2418;font-family:Georgia,'Times New Roman',serif;">
              ${para1}
            </td>
          </tr>
          <tr>
            <td class="nx-pad" style="padding:0 48px 28px;font-size:15px;line-height:1.6;color:#2A2418;font-family:Georgia,'Times New Roman',serif;">
              ${para2}
            </td>
          </tr>
          ${accessLine}
          <tr>
            <td align="center" class="nx-pad" style="padding:0 48px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#0A1226" style="background:#0A1226;border:1px solid #B8924B;">
                    <a href="${escape(opts.confirmUrl)}" class="nx-cta" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.06em;color:#F5F1E8;text-decoration:none;mso-padding-alt:0;">${cta}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${ctaSubline}
          <tr>
            <td class="nx-pad" style="padding:0 48px 32px;font-size:13px;color:#5C5240;line-height:1.6;font-family:Georgia,'Times New Roman',serif;">
              If the button doesn&rsquo;t work, copy and paste this link into your browser:<br>
              <span style="color:#0A1226;word-break:break-all;font-family:'Courier New',monospace;font-size:12px;">${escape(opts.confirmUrl)}</span>
            </td>
          </tr>
          <tr>
            <td class="nx-pad" style="padding:24px 48px;background:#0A1226;color:#B8924B;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
              &copy; 2026 Nexvelon Global Inc.
            </td>
          </tr>
        </table>
        <div style="margin-top:20px;max-width:560px;font-size:11px;color:#8C8273;line-height:1.6;font-family:Arial,Helvetica,sans-serif;padding:0 8px;">
          ${bottomNote}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderInviteText(opts: {
  email: string;
  confirmUrl: string;
  isResend: boolean;
}): string {
  const isInvite = !opts.isResend;
  const lines = isInvite
    ? [
        "Welcome to the Nexvelon Enterprise Suite.",
        "Complete operating system in one place.",
        "",
        "You've been selected to join the Nexvelon Enterprise Suite — the operating system built with care and crafted with precision for the elite.",
        "",
        "Inside, you'll find the workspace your administrator built for you: leads, quotes, projects, schedules, inventory, reporting — whatever your role requires.",
        "",
        "Full access configuration for your role is complete.",
        "",
        "Accept your invitation:",
        opts.confirmUrl,
        "",
        "Kindly set your password after accepting the invite.",
        "",
        `This invitation was sent to ${opts.email}. If you weren't expecting it, you can safely ignore this email.`,
        "",
        "© 2026 Nexvelon Global Inc.",
      ]
    : [
        "Sign in to the Nexvelon Enterprise Suite.",
        "Complete operating system in one place.",
        "",
        "Use the link below to access your Nexvelon workspace. The link is single-use and expires within the hour.",
        "",
        opts.confirmUrl,
        "",
        `This sign-in link was requested for ${opts.email}. If you didn't request it, you can safely ignore this email.`,
        "",
        "© 2026 Nexvelon Global Inc.",
      ];
  return lines.join("\n");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ----------------------------------------------------------------------------
// Main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();

  console.log(
    [
      "",
      "  Nexvelon · bootstrap-admin",
      "  ─────────────────────────────────────────────",
      `  Email     : ${args.email}`,
      `  Name      : ${args.first} ${args.last}`,
      `  Role      : Admin`,
      `  Site URL  : ${args.appUrl}`,
      "",
    ].join("\n")
  );

  const sb = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const link = await generateAuthLink(sb, args);
  console.log(`  ✓ Generated ${link.type} token (hashed)`);

  const confirmUrl = buildConfirmUrl(args, link);
  // Don't log the full URL — it contains the hashed token. Log a marker.
  console.log(
    `    Link: ${args.appUrl}/auth/confirm?token_hash=…&type=${link.type}&next=/auth/set-password`
  );

  const messageId = await sendInviteEmail(env, args, link, confirmUrl);
  console.log(`  ✓ Email queued to Resend, message ID: ${messageId}`);
  console.log("");
  console.log(`  Open the email at ${args.email} and click the button.`);
  console.log("  The link is single-use and expires within the hour.");
  console.log("");
}

main().catch((err) => {
  console.error("\nbootstrap-admin failed:");
  console.error("  " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

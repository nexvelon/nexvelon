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

  // Copy varies by branch; layout/structure is identical.
  const headline = isInvite
    ? "Welcome to the<br/>Nexvelon Enterprise Suite."
    : "Sign in to the<br/>Nexvelon Enterprise Suite.";
  const subtitle = "Operating System For The Elite";
  const preheader = isInvite
    ? "You've been invited to the Nexvelon Enterprise Suite. Your workspace is ready."
    : "Your sign-in link to the Nexvelon Enterprise Suite. Single-use and expires within the hour.";
  const cta = isInvite ? "Accept your invitation" : "Sign in";

  const para1 = isInvite
    ? "You&rsquo;ve been selected to join the Nexvelon Enterprise Suite &mdash; An operating system built with precision and polished with care for the elite."
    : "Use the button below to access your Nexvelon workspace.";
  const para2 = isInvite
    ? "Inside, you&rsquo;ll find the workspace your administrator built for you: leads, quotes, projects, schedules, inventory, reporting &mdash; whatever your role requires. A custom-designed  tool ready to ensure nothing falls through the cracks."
    : "For your security the link is single-use and expires within the hour. If you didn&rsquo;t request a sign-in, you can safely ignore this email &mdash; your account remains secure.";

  // Invite-only rows: "Full access configuration ✓" + italic CTA subline.
  // Magic-link path skips both, replaced with a single neutral spacer so
  // the navy footer doesn't crowd the button.
  const accessLine = isInvite
    ? `<tr>
          <td class="px-pad" align="center" style="padding:8px 48px 28px;font-size:15px;line-height:1.5;color:#2A2418;font-family:Georgia,'Times New Roman',serif;">
            Full access configuration for your role is complete. <span style="color:#8C8273;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#10003;</span>
          </td>
        </tr>`
    : "";
  const ctaSubline = isInvite
    ? `<tr>
          <td class="px-pad" align="center" style="padding:0 48px 32px;font-size:13px;color:#8C8273;line-height:1.6;font-style:italic;font-family:Georgia,'Times New Roman',serif;">
            Kindly set your password after accepting the invite.
          </td>
        </tr>`
    : `<tr><td style="padding:0 48px 24px;line-height:1px;font-size:1px;">&nbsp;</td></tr>`;

  const bottomNote = isInvite
    ? `This invitation was sent to <span style="color:#0A1226;">${escape(opts.email)}</span>. If you weren&rsquo;t expecting it, you can safely ignore this email.`
    : `This sign-in link was requested for <span style="color:#0A1226;">${escape(opts.email)}</span>. If you didn&rsquo;t request it, you can safely ignore this email.`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escape(opts.subject)}</title>
<!--[if mso]>
<style type="text/css">
table, td, div, p, a { font-family: Georgia, 'Times New Roman', serif !important; }
</style>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<style type="text/css">
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { text-decoration:none; }

  @media screen and (max-width: 620px) {
    .container { width:100% !important; max-width:100% !important; }
    .px-pad { padding-left:24px !important; padding-right:24px !important; }
    .px-pad-lg { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:30px !important; line-height:1.15 !important; }
    .sub { font-size:15px !important; }
    .body-text { font-size:15px !important; }
    .btn { padding:16px 32px !important; font-size:12px !important; }
    .pad-top { padding-top:48px !important; }
    .pad-bot { padding-bottom:28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F5F1E8;">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#F5F1E8;">
${escape(preheader)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F1E8;">
  <tr>
    <td align="center" style="padding:48px 12px;">

      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #E5DFD0;">

        <tr>
          <td class="px-pad-lg pad-top pad-bot" align="center" style="padding:64px 40px 36px;border-bottom:1px solid #E5DFD0;">
            <div style="font-size:11px;letter-spacing:0.32em;color:#B8924B;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:700;mso-line-height-rule:exactly;line-height:1.4;">&mdash; Nexvelon &mdash;</div>
            <div class="h1" style="margin-top:32px;font-size:40px;line-height:1.1;color:#0A1226;font-weight:normal;letter-spacing:-0.5px;font-family:Georgia,'Times New Roman',serif;mso-line-height-rule:exactly;">${headline}</div>
            <div class="sub" style="margin-top:20px;font-style:italic;color:#5C5240;font-size:17px;line-height:1.5;font-family:Georgia,'Times New Roman',serif;">${escape(subtitle)}</div>
          </td>
        </tr>

        <tr>
          <td class="px-pad body-text" style="padding:40px 48px 8px;font-size:16px;line-height:1.7;color:#2A2418;font-family:Georgia,'Times New Roman',serif;">
            ${para1}
          </td>
        </tr>

        <tr>
          <td class="px-pad body-text" style="padding:8px 48px 24px;font-size:16px;line-height:1.7;color:#2A2418;font-family:Georgia,'Times New Roman',serif;">
            ${para2}
          </td>
        </tr>

        ${accessLine}

        <tr>
          <td class="px-pad" align="center" style="padding:0 48px 10px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background-color:#0A1226;border:1px solid #B8924B;">
                  <a href="${escape(opts.confirmUrl)}" target="_blank" class="btn" style="display:inline-block;padding:18px 44px;color:#F5F1E8;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;text-decoration:none;mso-padding-alt:0;">${cta}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${ctaSubline}

        <tr>
          <td class="px-pad" style="padding:24px 48px 32px;font-size:12px;color:#8C8273;line-height:1.6;border-top:1px solid #E5DFD0;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#B8924B;font-weight:600;">If the button doesn&rsquo;t work</div>
            <div style="margin-top:8px;color:#0A1226;word-break:break-all;font-family:'Courier New',Courier,monospace;font-size:12px;">${escape(opts.confirmUrl)}</div>
          </td>
        </tr>

        <tr>
          <td class="px-pad" align="center" style="padding:28px 48px;background-color:#0A1226;color:#B8924B;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
            Nexvelon Global Inc.
          </td>
        </tr>

      </table>

      <table role="presentation" class="container" width="540" cellpadding="0" cellspacing="0" border="0" style="width:540px;max-width:540px;">
        <tr>
          <td class="px-pad" align="center" style="padding:24px 24px 0;font-size:11px;color:#8C8273;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
            ${bottomNote}
          </td>
        </tr>
      </table>

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
        "— Nexvelon —",
        "Welcome to the Nexvelon Enterprise Suite.",
        "Operating System For The Elite.",
        "",
        "You've been selected to join the Nexvelon Enterprise Suite — an operating system built with precision and polished with care for the elite.",
        "",
        "Inside, you'll find the workspace your administrator built for you: leads, quotes, projects, schedules, inventory, reporting — whatever your role requires. A custom-designed tool ready to ensure nothing falls through the cracks.",
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
        "Nexvelon Global Inc.",
      ]
    : [
        "— Nexvelon —",
        "Sign in to the Nexvelon Enterprise Suite.",
        "Operating System For The Elite.",
        "",
        "Use the link below to access your Nexvelon workspace.",
        "",
        opts.confirmUrl,
        "",
        "For your security the link is single-use and expires within the hour. If you didn't request a sign-in, you can safely ignore this email — your account remains secure.",
        "",
        `This sign-in link was requested for ${opts.email}. If you didn't request it, you can safely ignore this email.`,
        "",
        "Nexvelon Global Inc.",
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

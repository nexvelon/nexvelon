/**
 * scripts/bootstrap-admin.ts
 * ---------------------------------------------------------------------------
 * Creates (or re-invites) the very first Admin user.
 *
 *   npx tsx scripts/bootstrap-admin.ts
 *   npx tsx scripts/bootstrap-admin.ts --email someone@example.com --first Jane --last Doe
 *
 * Branching logic
 * ---------------
 *   1. List auth.users via supabase.auth.admin.listUsers and check whether
 *      the target email already has a row.
 *   2. If NOT registered → invite path:
 *        generateLink({ type: 'invite', email, options: { data: ... } })
 *        creates the user in auth.users, fires the on_auth_user_created
 *        trigger to seed the profiles row with role='Admin' /
 *        status='Invited', and returns a hashed_token.
 *        We send the parchment "Welcome to the Nexvelon Enterprise Suite"
 *        template.
 *   3. If ALREADY registered → magic-link path:
 *        generateLink({ type: 'magiclink', email }) returns a hashed_token
 *        for an existing user. We send the dark-canvas "An entry,
 *        prepared in your name" template.
 *
 * Earlier revisions of this script branched on a regex-match against the
 * "already registered" error text from generateLink — that was unreliable
 * (Supabase's exact wording can shift) and could send the WRONG template
 * for a brand-new user. The explicit listUsers check is deterministic.
 *
 * Email transport
 * ---------------
 *   * Both paths POST to https://api.resend.com/emails directly. We do
 *     not rely on Supabase's Custom-SMTP integration here so the script
 *     stays self-contained.
 *   * Both URLs use the hardened token_hash flow:
 *       ${SITE_URL}/auth/confirm?token_hash=<...>&type=<...>&next=/auth/set-password
 *     verifyOtp redeems the hash interactively, defeating Gmail's
 *     link-prefetch consumption of one-time tokens.
 *   * Throws + exits non-zero on any Resend HTTP failure or missing
 *     message id — no silent successes.
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
// Logger — single newline-prefixed tagged record per step.

function log(event: string, extra?: Record<string, unknown>): void {
  if (extra && Object.keys(extra).length > 0) {
    console.info(`[bootstrap] ${event}`, JSON.stringify(extra));
  } else {
    console.info(`[bootstrap] ${event}`);
  }
}

// ----------------------------------------------------------------------------
// Existence check
//
// Iterates every page (1000-per-page, sane for our scale) and matches on
// case-insensitive email. Returns true iff a row exists in auth.users.
// We deliberately avoid a regex over generateLink's error message — that
// heuristic was the bug we're fixing.

async function userExists(
  sb: SupabaseClient,
  email: string
): Promise<boolean> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  let page = 1;
  // Hard cap so a runaway loop doesn't burn quota.
  const MAX_PAGES = 50;

  while (page <= MAX_PAGES) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);

    const users = data?.users ?? [];
    if (users.some((u) => (u.email ?? "").toLowerCase() === target)) {
      return true;
    }

    // listUsers returns up to perPage records; if fewer came back we've
    // reached the last page.
    if (users.length < perPage) return false;
    page += 1;
  }

  // 50 pages × 1000 = 50K users. If we hit this, something is off — warn
  // and assume the user does NOT exist so we send the invite (worst case
  // Supabase returns "already registered" and we surface a real error).
  console.warn(
    "[bootstrap] userExists scanned 50 pages without exhausting; assuming false"
  );
  return false;
}

// ----------------------------------------------------------------------------
// Token + URL builders

type LinkType = "invite" | "magiclink";

function tokenPreview(hash: string): string {
  return hash.slice(0, 8) + "…";
}

function buildConfirmUrl(
  appUrl: string,
  tokenHash: string,
  type: LinkType
): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    next: "/auth/set-password",
  });
  return `${appUrl.replace(/\/$/, "")}/auth/confirm?${params.toString()}`;
}

async function generateInviteToken(
  sb: SupabaseClient,
  args: CliArgs
): Promise<string> {
  const { data, error } = await sb.auth.admin.generateLink({
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
  const hash = data?.properties?.hashed_token;
  if (error || !hash) {
    throw new Error(
      `generateLink invite failed: ${error?.message ?? "no hashed_token"}`
    );
  }
  return hash;
}

async function generateMagicLinkToken(
  sb: SupabaseClient,
  email: string
): Promise<string> {
  const { data, error } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) {
    throw new Error(
      `generateLink magiclink failed: ${error?.message ?? "no hashed_token"}`
    );
  }
  return hash;
}

// ----------------------------------------------------------------------------
// Resend send

async function postToResend(
  env: Env,
  to: string,
  subject: string,
  html: string,
  text: string,
  refTag: string
): Promise<string> {
  log("resend_send_starting", { subject, refTag });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.fromEmail,
      to,
      subject,
      html,
      text,
      headers: { "X-Entity-Ref-ID": refTag },
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

  log("resend_send_complete", { messageId: data.id });
  return data.id;
}

// ----------------------------------------------------------------------------
// Helpers

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================================
// INVITE TEMPLATE — parchment design.
//
// Light parchment outer canvas + cream card with a thin gold border. The
// wordmark is "Nexvelon Enterprise Suite" in Cormorant Garamond, flanked
// by gold ◆ diamond accents and short gold rules. Headline copy:
// "Welcome to the / Nexvelon Enterprise Suite." Subtitle: italic
// "Complete operating system in one place."
//
// Visually distinct from the dark-canvas magic-link template — the
// invite is a one-time event ("welcome aboard"), the magic-link is a
// recurring sign-in artifact ("here, walk through the door again").
// ============================================================================

function renderInviteHtml(args: {
  email: string;
  confirmUrl: string;
}): string {
  const urlEsc = escape(args.confirmUrl);
  const emailEsc = escape(args.email);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>Nexvelon Enterprise Suite — Invitation</title>
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
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background-color:#F5F1E8; }
  table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  a { text-decoration:none; }

  .serif { font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif; }
  .sans  { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  .mono  { font-family: 'SF Mono', 'Courier New', Courier, monospace; }

  @media screen and (max-width: 620px) {
    .container { width:100% !important; max-width:100% !important; }
    .px-pad    { padding-left:24px !important; padding-right:24px !important; }
    .px-pad-lg { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:30px !important; line-height:1.2 !important; }
    .sub { font-size:15px !important; }
    .body-text { font-size:15px !important; }
    .btn { padding:16px 36px !important; font-size:11px !important; }
    .crest { font-size:30px !important; }
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#F5F1E8;">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#F5F1E8;">
You've been invited to the Nexvelon Enterprise Suite. Your workspace is ready.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F1E8;">
  <tr>
    <td align="center" style="padding:48px 12px;">

      <!-- Top spacer -->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td style="padding:8px 0 0;">&nbsp;</td>
        </tr>
      </table>

      <!-- Main card -->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#FBF8F1;border:1px solid #E5DFD0;">

        <!-- Hero: gold rule + diamond accents around the wordmark -->
        <tr>
          <td class="px-pad-lg" align="center" style="padding:56px 48px 36px;background-color:#FBF8F1;">

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td valign="middle" style="padding:0 14px 0 0;">
                  <div style="width:36px;height:1px;background-color:#B8924B;font-size:0;line-height:0;">&nbsp;</div>
                </td>
                <td valign="middle" style="font-family:Georgia,serif;font-size:14px;line-height:1;color:#B8924B;padding:0 6px;">&#9670;</td>
                <td valign="middle" class="serif crest" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;line-height:1.1;color:#B8924B;font-weight:500;letter-spacing:0.05em;white-space:nowrap;padding:0 6px;">
                  Nexvelon Enterprise Suite
                </td>
                <td valign="middle" style="font-family:Georgia,serif;font-size:14px;line-height:1;color:#B8924B;padding:0 6px;">&#9670;</td>
                <td valign="middle" style="padding:0 0 0 14px;">
                  <div style="width:36px;height:1px;background-color:#B8924B;font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>
            </table>

            <div class="sans" style="margin-top:28px;font-size:10px;letter-spacing:0.42em;color:#B8924B;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;">
              By Invitation Only
            </div>

            <div class="h1 serif" style="margin-top:36px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:40px;line-height:1.1;color:#0A1226;font-weight:400;letter-spacing:-0.5px;mso-line-height-rule:exactly;">
              Welcome to the<br/>Nexvelon Enterprise Suite.
            </div>

            <div class="sub serif" style="margin-top:20px;font-style:italic;color:#5C5240;font-size:17px;line-height:1.5;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;">
              Complete operating system in one place.
            </div>
          </td>
        </tr>

        <!-- Letter body -->
        <tr>
          <td class="px-pad body-text serif" style="padding:8px 64px 8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:17px;line-height:1.7;color:#2A2418;font-weight:400;">
            <p style="margin:0 0 16px;">
              You&rsquo;ve been selected to join the Nexvelon Enterprise Suite &mdash; an operating system built with care and crafted with precision for the elite.
            </p>
            <p style="margin:0 0 16px;">
              Inside, you&rsquo;ll find the workspace your administrator built for you: leads, quotes, projects, schedules, inventory, reporting &mdash; whatever your role requires. A custom-designed tool to ensure nothing falls through the cracks.
            </p>
          </td>
        </tr>

        <!-- Status line: "Full access configuration is complete." -->
        <tr>
          <td class="px-pad" style="padding:32px 64px 0;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E5DFD0;">
              <tr>
                <td align="center" class="sans" style="padding:14px 0 0;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#5C5240;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:500;">
                  <span style="display:inline-block;width:5px;height:5px;background-color:#B8924B;border-radius:50%;vertical-align:middle;margin-right:8px;">&nbsp;</span>
                  Full Access Configuration Complete
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="px-pad" align="center" style="padding:24px 64px 8px;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td align="center" style="background-color:#0A1226;border:1px solid #B8924B;mso-padding-alt:15px 40px;">
                  <a href="${urlEsc}" target="_blank" class="btn sans" style="display:inline-block;padding:15px 40px;color:#FBF8F1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-weight:600;text-decoration:none;">
                    Accept Your Invitation
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-top:14px;">
                  <div class="sans" style="font-size:10px;letter-spacing:0.28em;color:#8C8273;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:500;">
                    Single-use link
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Italic instruction below CTA -->
        <tr>
          <td class="px-pad serif" align="center" style="padding:6px 64px 36px;font-size:13px;color:#5C5240;line-height:1.6;font-style:italic;font-family:'Cormorant Garamond',Georgia,serif;">
            Kindly set your password after accepting the invite.
          </td>
        </tr>

        <!-- Fallback URL -->
        <tr>
          <td class="px-pad" style="padding:8px 56px 36px;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E5DFD0;">
              <tr>
                <td style="padding:24px 0 0;">
                  <div class="sans" align="center" style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#B8924B;font-weight:600;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;text-align:center;">
                    If the button does not respond, <a href="${urlEsc}" style="color:#B8924B;text-decoration:none;letter-spacing:0.3em;font-weight:600;">click below</a>.
                  </div>
                  <div class="mono" style="margin-top:10px;color:#0A1226;word-break:break-all;font-family:'SF Mono','Courier New',Courier,monospace;font-size:12px;line-height:1.6;background-color:#F2EDDF;padding:14px 16px;border:1px solid #E5DFD0;">${urlEsc}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td class="px-pad" style="padding:8px 64px 48px;background-color:#FBF8F1;">
            <div class="serif" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#2A2418;line-height:1.5;font-style:italic;">With regards from,</div>
            <div class="serif" style="margin-top:8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#0A1226;font-weight:500;letter-spacing:-0.2px;">The Nexvelon Global Group.</div>
            <div class="sans" style="margin-top:6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#B8924B;font-weight:600;">Enterprise Suite &middot; Private Issue</div>
          </td>
        </tr>

        <!-- Light parchment footer with diamond accent -->
        <tr>
          <td align="center" style="padding:0;border-top:1px solid #E5DFD0;background-color:#F5F1E8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" class="sans" style="padding:18px 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#5C5240;font-weight:500;">
                  <span style="color:#B8924B;font-family:Georgia,serif;font-size:11px;">&#9670;</span>
                  &nbsp;&nbsp; &copy; 2026 Nexvelon Global Inc. &nbsp;&nbsp;
                  <span style="color:#B8924B;font-family:Georgia,serif;font-size:11px;">&#9670;</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

      <!-- Outer note -->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td class="px-pad" align="center" style="padding:24px 24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#8C8273;line-height:1.7;letter-spacing:0.04em;">
            This invitation was prepared for <span style="color:#0A1226;letter-spacing:0.06em;">${emailEsc}</span>.
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

function renderInviteText(args: {
  email: string;
  confirmUrl: string;
}): string {
  return [
    "◆ Nexvelon Enterprise Suite ◆",
    "By Invitation Only",
    "",
    "Welcome to the Nexvelon Enterprise Suite.",
    "Complete operating system in one place.",
    "",
    "You've been selected to join the Nexvelon Enterprise Suite — an operating system built with care and crafted with precision for the elite.",
    "",
    "Inside, you'll find the workspace your administrator built for you: leads, quotes, projects, schedules, inventory, reporting — whatever your role requires. A custom-designed tool to ensure nothing falls through the cracks.",
    "",
    "  • Full access configuration is complete",
    "",
    "Accept your invitation (single-use link):",
    args.confirmUrl,
    "",
    "Kindly set your password after accepting the invite.",
    "",
    "With regards from,",
    "The Nexvelon Global Group.",
    "Enterprise Suite · Private Issue",
    "",
    `This invitation was prepared for ${args.email}.`,
    "",
    "© 2026 Nexvelon Global Inc.",
  ].join("\n");
}

// ============================================================================
// MAGIC-LINK TEMPLATE — dark canvas "private issue" design.
//
// Reserved for re-issuing access to an EXISTING user (script run twice
// for the same email). Distinct visual identity from the invite — the
// dark gradient canvas + parchment card with gold border + drop-shadow
// communicates "you've been here before; your seat awaits."
// ============================================================================

function renderMagicLinkHtml(args: {
  email: string;
  confirmUrl: string;
}): string {
  const urlEsc = escape(args.confirmUrl);
  const emailEsc = escape(args.email);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>Nexvelon Enterprise Suite — Sign In</title>
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
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background-color:#070C1C; }
  table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  a { text-decoration:none; }

  .serif { font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif; }
  .sans  { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  .mono  { font-family: 'SF Mono', 'Courier New', Courier, monospace; }

  @media screen and (max-width: 620px) {
    .container { width:100% !important; max-width:100% !important; }
    .px-pad    { padding-left:28px !important; padding-right:28px !important; }
    .px-pad-lg { padding-left:28px !important; padding-right:28px !important; }
    .h1 { font-size:24px !important; line-height:1.2 !important; letter-spacing:-0.3px !important; white-space:normal !important; }
    .sub { font-size:14px !important; }
    .body-text { font-size:15px !important; }
    .btn { padding:18px 36px !important; font-size:11px !important; }
    .crest { font-size:32px !important; }
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#070C1C;background-image:radial-gradient(ellipse 90% 60% at 50% 0%, #1E2A5A 0%, #101840 28%, #0A1226 55%, #050912 100%), radial-gradient(ellipse 80% 50% at 50% 100%, #1A2350 0%, #0D1530 35%, #050912 100%);background-repeat:no-repeat;">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#0A1226;">
Your entry to the Nexvelon suite is ready. Single-use, expires within the hour.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#070C1C;background-image:radial-gradient(ellipse 90% 60% at 50% 0%, #1E2A5A 0%, #101840 28%, #0A1226 55%, #050912 100%), radial-gradient(ellipse 80% 50% at 50% 100%, #1A2350 0%, #0D1530 35%, #050912 100%);background-repeat:no-repeat;">
  <tr>
    <td align="center" style="padding:0;">

      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;">
        <tr>
          <td class="px-pad-lg" style="padding:48px 56px 24px;">&nbsp;</td>
        </tr>
      </table>

      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#FBF8F1;border:1px solid #8A6A2E;box-shadow:0 0 0 1px rgba(138,106,46,0.5), 0 0 18px rgba(184,146,75,0.45), 0 30px 80px -20px rgba(20,30,80,0.65), 0 60px 140px -30px rgba(30,42,90,0.55);">

        <tr>
          <td class="px-pad-lg" align="center" style="padding:64px 64px 40px;background-color:#FBF8F1;">

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td valign="middle" style="padding:0 18px 0 0;">
                  <div style="width:48px;height:1px;background-color:#B8924B;font-size:0;line-height:0;">&nbsp;</div>
                </td>
                <td valign="middle" class="serif crest" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;line-height:1.1;color:#B8924B;font-weight:500;letter-spacing:0.06em;white-space:nowrap;">
                  Nexvelon Enterprise Suite
                </td>
                <td valign="middle" style="padding:0 0 0 18px;">
                  <div style="width:48px;height:1px;background-color:#B8924B;font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>
            </table>

            <div class="sans" style="margin-top:28px;font-size:10px;letter-spacing:0.42em;color:#B8924B;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;">
              Single-Use Entry
            </div>

            <div class="h1 serif" style="margin-top:44px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#0A1226;font-weight:400;letter-spacing:-0.4px;mso-line-height-rule:exactly;white-space:nowrap;">
              An entry, <em style="font-style:italic;color:#3A3220;">prepared</em> in your name.
            </div>

          </td>
        </tr>

        <tr>
          <td class="px-pad body-text serif" style="padding:8px 72px 8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:17px;line-height:1.7;color:#2A2418;font-weight:400;">
            <p style="margin:0 0 16px;">
              Use the entry below to return to your Nexvelon workspace.
            </p>
            <p style="margin:0 0 16px;">
              For your security, the link is single-use and expires within the hour. If you didn&rsquo;t request this sign-in, you may safely ignore this email &mdash; your account remains secure.
            </p>
          </td>
        </tr>

        <tr>
          <td class="px-pad" style="padding:48px 72px 0;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E5DFD0;">
              <tr>
                <td align="center" class="sans" style="padding:14px 0 0;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#5C5240;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:500;">
                  <span style="display:inline-block;width:5px;height:5px;background-color:#B8924B;border-radius:50%;vertical-align:middle;margin-right:8px;">&nbsp;</span>
                  Sign-In Link Active
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px-pad" align="center" style="padding:24px 72px 8px;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td align="center" style="background-color:#0A1226;mso-padding-alt:14px 40px;">
                  <a href="${urlEsc}" target="_blank" class="btn sans" style="display:inline-block;padding:15px 40px;color:#FBF8F1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-weight:600;text-decoration:none;border:1px solid #B8924B;">
                    Sign In
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-top:14px;">
                  <div class="sans" style="font-size:10px;letter-spacing:0.28em;color:#8C8273;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:500;">
                    Single-use link
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px-pad serif" align="center" style="padding:6px 72px 36px;font-size:13px;color:#5C5240;line-height:1.6;font-style:italic;font-family:'Cormorant Garamond',Georgia,serif;">
            The link expires within the hour.
          </td>
        </tr>

        <tr>
          <td class="px-pad" style="padding:8px 64px 36px;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E5DFD0;">
              <tr>
                <td style="padding:24px 0 0;">
                  <div class="sans" align="center" style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#B8924B;font-weight:600;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;text-align:center;">If the button does not respond, <a href="${urlEsc}" style="color:#B8924B;text-decoration:none;letter-spacing:0.3em;font-weight:600;">click below</a>.</div>
                  <div class="mono" style="margin-top:10px;color:#0A1226;word-break:break-all;font-family:'SF Mono','Courier New',Courier,monospace;font-size:12px;line-height:1.6;background-color:#F2EDDF;padding:14px 16px;border:1px solid #E5DFD0;">${urlEsc}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px-pad" style="padding:8px 72px 56px;background-color:#FBF8F1;">
            <div class="serif" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#2A2418;line-height:1.5;font-style:italic;">With regards from,</div>
            <div class="serif" style="margin-top:10px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#0A1226;font-weight:500;letter-spacing:-0.2px;">The Nexvelon Global Group.</div>
            <div class="sans" style="margin-top:6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#B8924B;font-weight:600;">Enterprise Suite &middot; Private Issue</div>
          </td>
        </tr>

        <tr>
          <td style="background-color:#0A1226;background-image:linear-gradient(180deg, #16204A 0%, #0F1838 35%, #0A1226 100%);padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="px-pad-lg" style="padding:40px 24px 32px 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="middle" align="left">
                        <div class="serif" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#FBF8F1;font-weight:500;letter-spacing:0.04em;white-space:nowrap;">Nexvelon</div>
                      </td>
                      <td valign="middle" align="right" class="sans" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#6B7390;font-weight:500;line-height:1.6;white-space:nowrap;">
                        Nexvelon Global Inc.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#1A2340;font-size:0;line-height:0;">&nbsp;</div></td></tr>
              <tr>
                <td class="px-pad-lg sans" style="padding:16px 40px 32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#6B7390;font-weight:500;" align="center">
                  <span style="white-space:nowrap;">Confidential &middot; Do not forward</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;">
        <tr>
          <td class="px-pad-lg" align="center" style="padding:28px 64px 56px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#6B7390;line-height:1.7;letter-spacing:0.04em;">
            This sign-in link was prepared for <span style="color:#FBF8F1;letter-spacing:0.08em;">${emailEsc}</span>.
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

function renderMagicLinkText(args: {
  email: string;
  confirmUrl: string;
}): string {
  return [
    "— Nexvelon Enterprise Suite —",
    "Single-Use Entry",
    "",
    "An entry, prepared in your name.",
    "",
    "Use the entry below to return to your Nexvelon workspace.",
    "",
    args.confirmUrl,
    "",
    "For your security, the link is single-use and expires within the hour. If you didn't request this sign-in, you may safely ignore this email — your account remains secure.",
    "",
    "With regards from,",
    "The Nexvelon Global Group.",
    "Enterprise Suite · Private Issue",
    "",
    `This sign-in link was prepared for ${args.email}.`,
    "Confidential · Do not forward",
    "",
    "Nexvelon Global Inc.",
  ].join("\n");
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

  // Step 1: deterministic existence check.
  log("checking_user_exists", { email: args.email });
  const exists = await userExists(sb, args.email);
  log("user_exists", { exists });

  // Step 2: branch.
  let type: LinkType;
  let tokenHash: string;
  let subject: string;
  let html: string;
  let text: string;

  if (!exists) {
    log("taking_path", { path: "invite" });
    type = "invite";
    tokenHash = await generateInviteToken(sb, args);
    log("generated_link", {
      type,
      tokenHashPreview: tokenPreview(tokenHash),
    });
    subject = "Your seat at the Nexvelon Enterprise Suite is ready";
    const confirmUrl = buildConfirmUrl(args.appUrl, tokenHash, type);
    html = renderInviteHtml({ email: args.email, confirmUrl });
    text = renderInviteText({ email: args.email, confirmUrl });
  } else {
    log("taking_path", { path: "magiclink" });
    type = "magiclink";
    tokenHash = await generateMagicLinkToken(sb, args.email);
    log("generated_link", {
      type,
      tokenHashPreview: tokenPreview(tokenHash),
    });
    subject = "Your sign-in link to Nexvelon";
    const confirmUrl = buildConfirmUrl(args.appUrl, tokenHash, type);
    html = renderMagicLinkHtml({ email: args.email, confirmUrl });
    text = renderMagicLinkText({ email: args.email, confirmUrl });
  }

  // Step 3: send via Resend.
  const messageId = await postToResend(
    env,
    args.email,
    subject,
    html,
    text,
    `nexvelon-${type}-${Date.now()}`
  );

  console.log("");
  console.log(
    `  ✓ ${type === "invite" ? "Invite" : "Magic-link"} email sent to ${args.email}`
  );
  console.log(`    Resend message ID: ${messageId}`);
  console.log(`    Click the email button within the hour.`);
  console.log("");
}

main().catch((err) => {
  console.error("\nbootstrap-admin failed:");
  console.error("  " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

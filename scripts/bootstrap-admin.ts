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
// HTML template — v3 "private issue" design.
//
// Dark-canvas (radial-gradient navy) + parchment card (#FBF8F1) with a
// burnished-gold border + dropped glow. Cormorant Garamond for the
// wordmark, headline, body and signature; Helvetica for caps and meta;
// SF Mono / Courier for the fallback URL block.
//
// Brand tokens:
//   bg radial-gradient navy ramp · card #FBF8F1 · card border #8A6A2E
//   parchment monospace bg #F2EDDF · navy ink #0A1226
//   burnished gold #B8924B · body ink #2A2418
//   taupe #5C5240 · muted #8C8273 · footer dim #6B7390
//
// Layout/structure is identical across the invite + magic-link branches;
// only copy and a couple of conditional rows differ.

function renderInviteHtml(opts: {
  email: string;
  confirmUrl: string;
  isResend: boolean;
  subject: string;
}): string {
  const isInvite = !opts.isResend;

  // Copy varies by branch.
  const eyebrowCap = isInvite ? "By Invitation Only" : "Single-Use Entry";
  // Headline keeps an inline italic <em> for the parallel emphasis word.
  const headlineHtml = isInvite
    ? `A workspace <em style="font-style:italic;color:#3A3220;">prepared</em> in your name.`
    : `An entry, <em style="font-style:italic;color:#3A3220;">prepared</em> in your name.`;
  const preheader = isInvite
    ? "A private workspace has been prepared in your name. Welcome to Nexvelon."
    : "Your entry to the Nexvelon suite is ready. Single-use, expires within the hour.";
  const cta = isInvite ? "Accept Your Invitation" : "Sign In";
  const statusLine = isInvite
    ? "Workspace Provisioned &amp; Ready"
    : "Sign-In Link Active";

  // Two-paragraph letter body.
  const para1 = isInvite
    ? "You have been selected to join the Nexvelon Enterprise Suite &mdash; an operating system built for the elite."
    : "Use the entry below to return to your Nexvelon workspace.";
  const para2 = isInvite
    ? `Your administrator has shaped a workspace to your role: leads, quotes, projects, schedules, inventory, reporting &mdash; arranged so nothing of consequence falls through the cracks.<br/>We are honored to have you.`
    : "For your security, the link is single-use and expires within the hour. If you didn&rsquo;t request this sign-in, you may safely ignore this email &mdash; your account remains secure.";

  // Below-CTA italic line — invite-specific. Magic-link uses its own line.
  const ctaSubline = isInvite
    ? "You will be asked to set a password upon entry."
    : "The link expires within the hour.";

  // Outer note under the dark footer.
  const bottomNoteVerb = isInvite ? "invitation" : "sign-in link";

  // The confirmUrl will be substituted into three places (CTA href, inline
  // "click below" link, monospace fallback block). escape() converts raw
  // & into &amp; — both forms are valid in href, the encoded form is
  // strictly correct.
  const urlEsc = escape(opts.confirmUrl);
  const emailEsc = escape(opts.email);
  const subjectEsc = escape(opts.subject);
  const preheaderEsc = escape(preheader);
  const eyebrowCapEsc = escape(eyebrowCap);
  const ctaSublineEsc = escape(ctaSubline);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${subjectEsc}</title>
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
    .px-pad { padding-left:28px !important; padding-right:28px !important; }
    .px-pad-lg { padding-left:28px !important; padding-right:28px !important; }
    .h1 { font-size:24px !important; line-height:1.2 !important; letter-spacing:-0.3px !important; white-space:normal !important; }
    .sub { font-size:14px !important; }
    .body-text { font-size:15px !important; }
    .btn { padding:18px 36px !important; font-size:11px !important; }
    .pad-top { padding-top:56px !important; }
    .pad-bot { padding-bottom:32px !important; }
    .crest { font-size:32px !important; }
    .stack { display:block !important; width:100% !important; }
    .stack-pad { padding:14px 0 !important; }
    .divider-v { display:none !important; }
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#070C1C;background-image:radial-gradient(ellipse 90% 60% at 50% 0%, #1E2A5A 0%, #101840 28%, #0A1226 55%, #050912 100%), radial-gradient(ellipse 80% 50% at 50% 100%, #1A2350 0%, #0D1530 35%, #050912 100%);background-repeat:no-repeat;">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#0A1226;">
${preheaderEsc}
</div>

<!-- Outer dark canvas -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#070C1C;background-image:radial-gradient(ellipse 90% 60% at 50% 0%, #1E2A5A 0%, #101840 28%, #0A1226 55%, #050912 100%), radial-gradient(ellipse 80% 50% at 50% 100%, #1A2350 0%, #0D1530 35%, #050912 100%);background-repeat:no-repeat;">
  <tr>
    <td align="center" style="padding:0;">

      <!-- Top spacer -->
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;">
        <tr>
          <td class="px-pad-lg" style="padding:48px 56px 24px;">&nbsp;</td>
        </tr>
      </table>

      <!-- Main card -->
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#FBF8F1;border:1px solid #8A6A2E;box-shadow:0 0 0 1px rgba(138,106,46,0.5), 0 0 18px rgba(184,146,75,0.45), 0 30px 80px -20px rgba(20,30,80,0.65), 0 60px 140px -30px rgba(30,42,90,0.55);">

        <!-- Hero -->
        <tr>
          <td class="px-pad-lg pad-top pad-bot" align="center" style="padding:64px 64px 40px;background-color:#FBF8F1;">

            <!-- Wordmark -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td align="center" valign="middle" style="padding:0 18px 0 0;">
                  <div style="width:48px;height:1px;background-color:#B8924B;font-size:0;line-height:0;">&nbsp;</div>
                </td>
                <td align="center" valign="middle" class="serif crest" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;line-height:1.1;color:#B8924B;font-weight:500;letter-spacing:0.06em;white-space:nowrap;">
                  Nexvelon Enterprise Suite
                </td>
                <td align="center" valign="middle" style="padding:0 0 0 18px;">
                  <div style="width:48px;height:1px;background-color:#B8924B;font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>
            </table>

            <div class="sans" style="margin-top:28px;font-size:10px;letter-spacing:0.42em;color:#B8924B;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;">
              ${eyebrowCapEsc}
            </div>

            <div class="h1 serif" style="margin-top:44px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#0A1226;font-weight:400;letter-spacing:-0.4px;mso-line-height-rule:exactly;white-space:nowrap;">
              ${headlineHtml}
            </div>

          </td>
        </tr>

        <!-- Letter body -->
        <tr>
          <td class="px-pad body-text serif" style="padding:8px 72px 8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:17px;line-height:1.7;color:#2A2418;font-weight:400;">
            <p style="margin:0 0 16px;">
              ${para1}
            </p>
            <p style="margin:0 0 16px;">
              ${para2}
            </p>
          </td>
        </tr>

        <!-- Status line -->
        <tr>
          <td class="px-pad" style="padding:48px 72px 0;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E5DFD0;">
              <tr>
                <td align="center" class="sans" style="padding:14px 0 0;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#5C5240;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:500;">
                  <span style="display:inline-block;width:5px;height:5px;background-color:#B8924B;border-radius:50%;vertical-align:middle;margin-right:8px;">&nbsp;</span>
                  ${statusLine}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="px-pad" align="center" style="padding:24px 72px 8px;background-color:#FBF8F1;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td align="center" style="background-color:#0A1226;mso-padding-alt:14px 40px;">
                  <a href="${urlEsc}" target="_blank" class="btn sans" style="display:inline-block;padding:15px 40px;color:#FBF8F1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-weight:600;text-decoration:none;border:1px solid #B8924B;">
                    ${cta}
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
            ${ctaSublineEsc}
          </td>
        </tr>

        <!-- Fallback URL -->
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

        <!-- Signature -->
        <tr>
          <td class="px-pad" style="padding:8px 72px 56px;background-color:#FBF8F1;">
            <div class="serif" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#2A2418;line-height:1.5;font-style:italic;">With regards from,</div>
            <div class="serif" style="margin-top:10px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#0A1226;font-weight:500;letter-spacing:-0.2px;">The Nexvelon Global Group.</div>
            <div class="sans" style="margin-top:6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#B8924B;font-weight:600;">Enterprise Suite &middot; Private Issue</div>
          </td>
        </tr>

        <!-- Dark footer -->
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
              <tr>
                <td style="padding:0 40px;">
                  <div style="height:1px;background-color:#1A2340;font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>
              <tr>
                <td class="px-pad-lg sans" style="padding:16px 40px 32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#6B7390;font-weight:500;" align="center">
                  <span style="white-space:nowrap;">Confidential &middot; Do not forward</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

      <!-- Outer note -->
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;">
        <tr>
          <td class="px-pad-lg" align="center" style="padding:28px 64px 56px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#6B7390;line-height:1.7;letter-spacing:0.04em;">
            This ${bottomNoteVerb} was prepared for <span style="color:#FBF8F1;letter-spacing:0.08em;">${emailEsc}</span>.
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
        "— Nexvelon Enterprise Suite —",
        "By Invitation Only",
        "",
        "A workspace prepared in your name.",
        "",
        "You have been selected to join the Nexvelon Enterprise Suite — an operating system built for the elite.",
        "",
        "Your administrator has shaped a workspace to your role: leads, quotes, projects, schedules, inventory, reporting — arranged so nothing of consequence falls through the cracks. We are honored to have you.",
        "",
        "  • Workspace provisioned & ready",
        "",
        "Accept your invitation (single-use link):",
        opts.confirmUrl,
        "",
        "You will be asked to set a password upon entry.",
        "",
        "With regards from,",
        "The Nexvelon Global Group.",
        "Enterprise Suite · Private Issue",
        "",
        `This invitation was prepared for ${opts.email}.`,
        "Confidential · Do not forward",
        "",
        "— Nexvelon Global Inc.",
      ]
    : [
        "— Nexvelon Enterprise Suite —",
        "Single-Use Entry",
        "",
        "An entry, prepared in your name.",
        "",
        "Use the entry below to return to your Nexvelon workspace.",
        "",
        "For your security, the link is single-use and expires within the hour. If you didn't request this sign-in, you may safely ignore this email — your account remains secure.",
        "",
        "  • Sign-in link active",
        "",
        "Sign in (single-use link):",
        opts.confirmUrl,
        "",
        "The link expires within the hour.",
        "",
        "With regards from,",
        "The Nexvelon Global Group.",
        "Enterprise Suite · Private Issue",
        "",
        `This sign-in link was prepared for ${opts.email}.`,
        "Confidential · Do not forward",
        "",
        "— Nexvelon Global Inc.",
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

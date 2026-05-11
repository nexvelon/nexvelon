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
 *   3. If ALREADY registered → magic-link path:
 *        generateLink({ type: 'magiclink', email }) returns a hashed_token
 *        for an existing user.
 *
 * Both paths render through the SAME parchment HTML template
 * (`buildEmailHtml`); only six copy slots differ via the COPY config —
 * subject, body paragraphs, status line, CTA text, italic subline, and
 * the outer-note prefix. Visual chrome (parchment background, Cormorant
 * Garamond, ◆ accents, gold rules, fallback URL block, signature, footer,
 * MSO + mobile compatibility) is locked together; any future design
 * change touches one function and the two emails stay siblings.
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
// Email templates — single shared "royal black + gold + ivory letter" design.
//
// Both the new-user invite path and the existing-user magic-link path
// render through `buildEmailHtml({ kind, confirmUrl, recipientEmail })`
// (and `buildEmailText` for the plain-text fallback). Per explicit user
// direction, both kinds render the IDENTICAL HTML — only the URL inside
// the button differs (injected via confirmUrl upstream).
//
// The two semantic differences kept in COPY[kind]:
//   - subject          (Resend send subject; inbox display only)
//   - outerNotePrefix  (small line outside the card: "This <invitation|
//                       sign-in link> was prepared for {email}")
//
// Everything else (headline, body paragraphs, button text, italic subline,
// signature, footer) is locked identical across both kinds. Do not
// re-introduce per-kind body copy without explicit user approval — past
// iterations diverged the visuals and the user has been explicit that
// they should look the same.
// ============================================================================

type EmailKind = "invite" | "magiclink";

interface EmailCopy {
  subject: string;
  preheader: string;
  outerNotePrefix: string;
  titleTag: string;
}

/** Body copy is shared between invite and magiclink. Single source of truth. */
const SHARED_BODY = {
  bodyPara1:
    "You&rsquo;ve been selected and invited to join The Nexvelon Global Group&rsquo;s :<br/>Security Systems Business : Enterprise Suite Operating System.",
  bodyPara2:
    "Upon entering, you will discover your elite workspace. The Nexvelon Ecosystem crafts a meticulously artisanal environment tailored to each unique profile rather than assigning identical spaces by title or role. Indulge in your personalized software suite and immerse yourself in a workspace designed for the exclusive.",
  buttonText: "Accept Your Invitation",
  italicSubline: "Kindly set your password after accepting the invite.",
} as const;

const COPY: Record<EmailKind, EmailCopy> = {
  invite: {
    subject: "Your seat at the Nexvelon Enterprise Suite is ready",
    preheader:
      "You've been invited to the Nexvelon Enterprise Suite. Your workspace is ready.",
    outerNotePrefix: "This invitation was prepared for",
    titleTag: "Nexvelon Enterprise Suite — Invitation",
  },
  magiclink: {
    subject: "Your password reset link for Nexvelon Enterprise Suite is ready",
    preheader:
      "Your password reset link for Nexvelon Enterprise Suite. Single-use, expires within the hour.",
    outerNotePrefix: "This password reset link was prepared for",
    titleTag: "Nexvelon Enterprise Suite — Password Reset",
  },
};

interface BuildEmailArgs {
  kind: EmailKind;
  confirmUrl: string;
  recipientEmail: string;
}

function buildEmailHtml(args: BuildEmailArgs): string {
  const c = COPY[args.kind];
  const urlEsc = escape(args.confirmUrl);
  const emailEsc = escape(args.recipientEmail);
  const titleEsc = escape(c.titleTag);
  const preheaderEsc = escape(c.preheader);
  const buttonTextEsc = escape(SHARED_BODY.buttonText);
  const italicSublineEsc = escape(SHARED_BODY.italicSubline);
  const outerNotePrefixEsc = escape(c.outerNotePrefix);

  // The gold gradient used for the outer frame and the button surround.
  // Inlined as both `background-color` (Outlook fallback to mid-gold) and
  // `background-image` (modern clients render the gradient).
  const GOLD_GRADIENT =
    "background-color:#D4AF37;background-image:linear-gradient(135deg, #8B6F2A 0%, #D4AF37 25%, #F4D77E 50%, #D4AF37 75%, #8B6F2A 100%);";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${titleEsc}</title>
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
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background-color:#000000; }
  table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  a { text-decoration:none; }

  .serif { font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif; }
  .sans  { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }

  @media screen and (max-width: 620px) {
    .container     { width:100% !important; max-width:100% !important; }
    .px-pad        { padding-left:24px !important; padding-right:24px !important; }
    .h1            { font-size:28px !important; line-height:1.2 !important; }
    .body-text     { font-size:15px !important; }
    .btn           { padding:14px 32px !important; font-size:10px !important; }
    .wordmark      { font-size:26px !important; }
    .flank         { width:32px !important; }
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#000000;">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#000000;">
${preheaderEsc}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;">
  <tr>
    <td align="center" style="padding:48px 12px;background-color:#000000;">

      <!-- Outer gold gradient frame (2px) wrapping ivory card -->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td style="${GOLD_GRADIENT}padding:2px;">

            <!-- Inner ivory card -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FBFAF5;">

              <!-- 6px top spacer, then thin gold hairline -->
              <tr>
                <td style="padding:6px 0 0;background-color:#FBFAF5;">
                  <div style="height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, #8B6F2A 0%, #D4AF37 50%, #8B6F2A 100%);font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>

              <!-- Wordmark flanked by fading gold hairlines -->
              <tr>
                <td align="center" style="padding:24px 24px 0;background-color:#FBFAF5;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                    <tr>
                      <td valign="middle" class="flank" style="width:54px;font-size:0;line-height:0;">
                        <div style="width:54px;height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, rgba(212,175,55,0) 0%, #D4AF37 100%);font-size:0;line-height:0;">&nbsp;</div>
                      </td>
                      <td valign="middle" class="wordmark serif" style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;color:#A8843F;font-weight:500;letter-spacing:0.02em;white-space:nowrap;padding:0 18px;">
                        Nexvelon Enterprise Suite
                      </td>
                      <td valign="middle" class="flank" style="width:54px;font-size:0;line-height:0;">
                        <div style="width:54px;height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, #D4AF37 0%, rgba(212,175,55,0) 100%);font-size:0;line-height:0;">&nbsp;</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Headline -->
              <tr>
                <td align="center" class="px-pad" style="padding:30px 56px 0;background-color:#FBFAF5;">
                  <div class="h1 serif" style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;color:#0A0A0A;font-weight:400;letter-spacing:-0.3px;mso-line-height-rule:exactly;">
                    Welcome to the<br/>Nexvelon Enterprise Suite.
                  </div>
                </td>
              </tr>

              <!-- Letter body -->
              <tr>
                <td class="px-pad body-text serif" style="padding:30px 56px 0;background-color:#FBFAF5;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#2A1F0F;font-weight:400;text-align:left;">
                  <p style="margin:0 0 18px;">${SHARED_BODY.bodyPara1}</p>
                  <p style="margin:0;">${SHARED_BODY.bodyPara2}</p>
                </td>
              </tr>

              <!-- CTA — outer gold gradient frame wrapping dark inner button -->
              <tr>
                <td align="center" class="px-pad" style="padding:32px 56px 0;background-color:#FBFAF5;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                    <tr>
                      <td style="${GOLD_GRADIENT}padding:1px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="background-color:#0A0A0A;background-image:linear-gradient(180deg, #1A1A1A 0%, #0A0A0A 100%);mso-padding-alt:15px 42px;">
                              <a href="${urlEsc}" target="_blank" class="btn sans" style="display:inline-block;padding:15px 42px;color:#F4D77E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;font-weight:700;text-decoration:none;">
                                ${buttonTextEsc}
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- "Single-use link" caption -->
              <tr>
                <td align="center" class="px-pad" style="padding:14px 56px 0;background-color:#FBFAF5;">
                  <div class="sans" style="font-size:9px;letter-spacing:0.3em;color:#8C7846;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;">
                    Single-use link
                  </div>
                </td>
              </tr>

              <!-- Italic instruction below CTA -->
              <tr>
                <td align="center" class="px-pad serif" style="padding:14px 56px 36px;background-color:#FBFAF5;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#6B5A40;line-height:1.6;">
                  ${italicSublineEsc}
                </td>
              </tr>

              <!-- Gold gradient hairline before signature -->
              <tr>
                <td class="px-pad" style="padding:0 56px;background-color:#FBFAF5;">
                  <div style="height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, rgba(212,175,55,0) 0%, #D4AF37 50%, rgba(212,175,55,0) 100%);font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>

              <!-- Signature -->
              <tr>
                <td class="px-pad" style="padding:32px 56px 36px;background-color:#FBFAF5;">
                  <div class="serif" style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;color:#6B5A40;line-height:1.4;">With regards from,</div>
                  <div class="serif" style="margin-top:8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:20px;color:#0A0A0A;font-weight:500;letter-spacing:0;">The Nexvelon Global Group.</div>
                  <div class="sans" style="margin-top:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#A8843F;font-weight:600;">Enterprise Suite &middot; Private Issue</div>
                </td>
              </tr>

              <!-- Footer band (slightly warmer ivory) -->
              <tr>
                <td align="center" style="background-color:#F5F1E4;padding:18px 24px;">
                  <div class="sans" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#6B5A40;font-weight:500;">
                    <span style="color:#A8843F;font-family:Georgia,serif;">&#9670;</span>
                    &nbsp;&nbsp;&copy; 2026 Nexvelon Global Inc.&nbsp;&nbsp;
                    <span style="color:#A8843F;font-family:Georgia,serif;">&#9670;</span>
                  </div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>

      <!-- Outer note on black canvas, below the framed card -->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td align="center" class="px-pad" style="padding:24px 24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#6B5E40;line-height:1.7;letter-spacing:0.04em;">
            ${outerNotePrefixEsc} <span style="color:#D4AF37;letter-spacing:0.06em;">${emailEsc}</span>.
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

function buildEmailText(args: BuildEmailArgs): string {
  const c = COPY[args.kind];
  // Decode the inline HTML entities used in SHARED_BODY so the plain-text
  // fallback reads naturally in clients that strip HTML. <br/> tags become
  // a real newline.
  const decode = (s: string) =>
    s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/&rsquo;/g, "’")
      .replace(/&lsquo;/g, "‘")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&amp;/g, "&")
      .replace(/&hellip;/g, "…")
      .replace(/&nbsp;/g, " ");
  return [
    "Nexvelon Enterprise Suite",
    "",
    "Welcome to the Nexvelon Enterprise Suite.",
    "",
    decode(SHARED_BODY.bodyPara1),
    "",
    decode(SHARED_BODY.bodyPara2),
    "",
    `${SHARED_BODY.buttonText} (single-use link):`,
    args.confirmUrl,
    "",
    SHARED_BODY.italicSubline,
    "",
    "—",
    "",
    "With regards from,",
    "The Nexvelon Global Group.",
    "Enterprise Suite · Private Issue",
    "",
    `${c.outerNotePrefix} ${args.recipientEmail}.`,
    "",
    "© 2026 Nexvelon Global Inc.",
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

  // Step 2: deterministic branch on existence. The `kind` value is the
  // single discriminant — it indexes into COPY for all per-path copy
  // and gets passed through to buildConfirmUrl + buildEmailHtml/Text +
  // postToResend. Adding new copy variants in the future means adding a
  // key to COPY; the chrome stays a single function.
  const kind: EmailKind = exists ? "magiclink" : "invite";
  log("taking_path", { path: kind });

  const tokenHash = exists
    ? await generateMagicLinkToken(sb, args.email)
    : await generateInviteToken(sb, args);
  log("generated_link", {
    type: kind,
    tokenHashPreview: tokenPreview(tokenHash),
  });

  const confirmUrl = buildConfirmUrl(args.appUrl, tokenHash, kind);
  const subject = COPY[kind].subject;
  const html = buildEmailHtml({
    kind,
    confirmUrl,
    recipientEmail: args.email,
  });
  const text = buildEmailText({
    kind,
    confirmUrl,
    recipientEmail: args.email,
  });

  // Step 3: send via Resend.
  const messageId = await postToResend(
    env,
    args.email,
    subject,
    html,
    text,
    `nexvelon-${kind}-${Date.now()}`
  );

  console.log("");
  console.log(
    `  ✓ ${kind === "invite" ? "Invite" : "Magic-link"} email sent to ${args.email}`
  );
  console.log(`    Resend message ID: ${messageId}`);
  console.log(`    Click the email button within the hour.`);
  console.log("");
}

// Smoke-render mode — print the rendered HTML for one EmailKind and exit.
// Used by reviewers to eyeball the template without firing a real Resend
// send. Usage:
//   npx tsx scripts/bootstrap-admin.ts --render-smoke
//   npx tsx scripts/bootstrap-admin.ts --render-smoke --kind=magiclink
if (process.argv.includes("--render-smoke")) {
  const kindArg = process.argv.find((a) => a.startsWith("--kind="));
  const kind: EmailKind =
    kindArg?.split("=")[1] === "magiclink" ? "magiclink" : "invite";
  const html = buildEmailHtml({
    kind,
    confirmUrl:
      "https://app.nexvelonglobal.com/auth/confirm?token_hash=SMOKE_TOKEN_HASH_PLACEHOLDER&type=" +
      kind +
      "&next=/auth/set-password",
    recipientEmail: "jayshah.x@gmail.com",
  });
  process.stdout.write(html + "\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nbootstrap-admin failed:");
  console.error("  " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

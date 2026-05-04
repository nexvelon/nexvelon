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
    ? "Your Nexvelon sign-in link"
    : "You've been invited to Nexvelon";

  const html = renderInviteHtml({
    firstName: args.first,
    confirmUrl,
    isResend,
  });
  const text = renderInviteText({
    firstName: args.first,
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
// HTML template — same brand as the Phase 2 Supabase invite template, kept
// inline here so the script is self-contained.

function renderInviteHtml(opts: {
  firstName: string;
  confirmUrl: string;
  isResend: boolean;
}): string {
  const heading = opts.isResend
    ? "Sign in to Nexvelon."
    : "You&rsquo;ve been invited.";
  const subtitle = opts.isResend
    ? "Tap once to access your workspace."
    : "A workspace for security-systems integrators.";
  const body = opts.isResend
    ? `${escape(opts.firstName) ? `Hi ${escape(opts.firstName)}, ` : ""}use the button below to sign in. The link is single-use and expires shortly.`
    : "An administrator has invited you to join the Nexvelon workspace. Click the button below to set your password and complete enrollment.";
  const cta = opts.isResend ? "Sign in" : "Accept invitation";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F5F1E8;font-family:Georgia,'Times New Roman',serif;color:#0A1226;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E8;padding:48px 16px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #E5DFD0;">
            <tr>
              <td style="padding:40px 48px 24px;border-bottom:1px solid #E5DFD0;">
                <div style="font-size:11px;letter-spacing:0.18em;color:#B8924B;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:600;">Nexvelon · Holloway Security Integration Group</div>
                <div style="margin-top:18px;font-size:30px;line-height:1.1;color:#0A1226;font-weight:normal;">${heading}</div>
                <div style="margin-top:10px;font-style:italic;color:#5C5240;font-size:15px;">${subtitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 48px 16px;font-size:15px;line-height:1.6;color:#2A2418;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 48px 32px;" align="left">
                <a href="${escape(opts.confirmUrl)}" style="display:inline-block;background:#0A1226;color:#F5F1E8;padding:14px 28px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;border:1px solid #B8924B;">${cta}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 48px 32px;font-size:13px;color:#5C5240;line-height:1.6;">
                If the button doesn&rsquo;t work, copy and paste this link into your browser:<br>
                <span style="color:#0A1226;word-break:break-all;">${escape(opts.confirmUrl)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 48px;background:#0A1226;color:#B8924B;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
                Nexvelon Global Inc. · ULC Listed · ESA Licensed
              </td>
            </tr>
          </table>
          <div style="margin-top:24px;font-size:11px;color:#8C8273;font-family:Arial,Helvetica,sans-serif;">
            If you weren&rsquo;t expecting this email, you can ignore it.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderInviteText(opts: {
  firstName: string;
  confirmUrl: string;
  isResend: boolean;
}): string {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  return [
    "Nexvelon · Holloway Security Integration Group",
    "",
    greeting,
    "",
    opts.isResend
      ? "Use this link to sign in to your Nexvelon workspace:"
      : "You've been invited to join Nexvelon. Open this link to set your password and complete enrollment:",
    "",
    opts.confirmUrl,
    "",
    "If you weren't expecting this email, you can ignore it.",
    "",
    "— Nexvelon Global Inc.",
  ].join("\n");
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

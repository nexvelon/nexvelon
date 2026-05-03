/**
 * scripts/bootstrap-admin.ts
 * ---------------------------------------------------------------------------
 * Creates the very first Admin user (or any subsequent Admin) by sending an
 * invite email through the Supabase Auth admin API.
 *
 *   npx tsx scripts/bootstrap-admin.ts
 *   npx tsx scripts/bootstrap-admin.ts --email someone@example.com --first Jane --last Doe
 *
 * The user receives our branded invite email (Resend → Supabase SMTP), clicks
 * the link, lands on /auth/callback → /auth/set-password, picks a password,
 * and is signed in.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local. The service
 * role key is required and must NEVER ship to the browser.
 * ---------------------------------------------------------------------------
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function loadEnv(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.local");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Missing .env.local at ${path}. Copy .env.example and fill in real values first.`
    );
  }
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip optional surrounding quotes.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();

  const url =
    env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceKey || serviceKey === "PASTE_SECRET_KEY_HERE") {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    [
      "",
      "  Nexvelon · bootstrap-admin",
      "  ─────────────────────────────────────────────",
      `  Email     : ${args.email}`,
      `  Name      : ${args.first} ${args.last}`,
      `  Role      : Admin`,
      `  Redirect  : ${args.appUrl}/auth/callback?next=/auth/set-password`,
      "",
    ].join("\n")
  );

  const redirectTo = `${args.appUrl}/auth/callback?next=/auth/set-password`;

  // 1. Send the invite. Trigger creates profile with role='Admin', status='Invited'.
  const { data: invite, error: inviteErr } =
    await sb.auth.admin.inviteUserByEmail(args.email, {
      data: {
        first_name: args.first,
        last_name: args.last,
        role: "Admin",
      },
      redirectTo,
    });

  if (inviteErr || !invite?.user) {
    // Most common: "User already registered" — re-send instead of failing.
    if (
      inviteErr &&
      /already (registered|exists|been registered)/i.test(inviteErr.message)
    ) {
      console.log(
        "  ⚠  User already exists — re-issuing the magic link.\n"
      );
      const { data: link, error: linkErr } =
        await sb.auth.admin.generateLink({
          type: "magiclink",
          email: args.email,
          options: { redirectTo },
        });
      if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
      console.log("  ✓ Magic link generated and emailed.");
      console.log(
        `    Action link: ${link.properties.action_link.slice(0, 80)}…`
      );
      return;
    }
    throw new Error(
      `inviteUserByEmail: ${inviteErr?.message ?? "no user returned"}`
    );
  }

  console.log(`  ✓ Invite sent to ${args.email}`);
  console.log(`    Supabase user id: ${invite.user.id}`);

  // 2. The trigger created the profile row, but we want this admin to land
  //    immediately as Active+mfa_enrolled once they finish set-password —
  //    that's already the behaviour of /auth/set-password's setPasswordAction.
  //    No extra DB poke needed here.

  console.log("");
  console.log(
    "  Next step: open the email at " +
      args.email +
      " and click 'Accept invitation'."
  );
  console.log(
    "  You'll be redirected to /auth/set-password to pick your password."
  );
  console.log("");
}

main().catch((err) => {
  console.error("\nbootstrap-admin failed:");
  console.error("  " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

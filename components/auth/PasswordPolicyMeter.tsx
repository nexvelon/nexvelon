"use client";

import { Check, X } from "lucide-react";
import type { PasswordCheckResult } from "@/lib/auth/password-policy";

// ============================================================================
// PasswordStrengthMeter + PasswordPolicyChecklist — shared across the three
// surfaces that take a new password from the user:
//
//   /auth/set-password         (invite → set initial password)
//   /auth/reset-password       (forgot-password recovery flow)
//   /settings/security/change-password (signed-in self-service change)
//
// Identical visual chrome + identical rules (lib/auth/password-policy.ts).
// Extracted here to keep them in lockstep and avoid divergent UI drift
// when password policy changes in future.
// ============================================================================

export function PasswordStrengthMeter({
  check,
}: {
  check: PasswordCheckResult;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--brand-primary)_8%,transparent)]">
        {[0, 1, 2, 3].map((seg) => (
          <div
            key={seg}
            className="h-full flex-1 transition-colors"
            style={{
              background:
                check.score > seg
                  ? check.score >= 3
                    ? "var(--brand-status-green, #2F7A4D)"
                    : check.score === 2
                      ? "var(--brand-accent)"
                      : "var(--brand-status-red)"
                  : "transparent",
              borderRight:
                seg < 3
                  ? "1px solid color-mix(in oklab, var(--brand-primary) 8%, transparent)"
                  : undefined,
            }}
            aria-hidden
          />
        ))}
      </div>
      <p className="text-muted-foreground text-[11px]">{check.label}</p>
    </div>
  );
}

export function PasswordPolicyChecklist({
  check,
  id,
}: {
  check: PasswordCheckResult;
  /** Pass to align with the `aria-describedby` on the password input. */
  id?: string;
}) {
  return (
    <ul id={id} className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      <PolicyItem ok={check.rules.length} label="At least 12 characters" />
      <PolicyItem ok={check.rules.lower} label="Lowercase letter" />
      <PolicyItem ok={check.rules.upper} label="Uppercase letter" />
      <PolicyItem ok={check.rules.digit} label="Digit (0–9)" />
      <PolicyItem ok={check.rules.symbol} label="Symbol" />
    </ul>
  );
}

function PolicyItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className="flex items-center gap-1.5 text-[11px]"
      style={{
        color: ok
          ? "var(--brand-primary)"
          : "var(--muted-foreground, #8C8273)",
      }}
    >
      {ok ? (
        <Check className="h-3 w-3" style={{ color: "var(--brand-accent)" }} />
      ) : (
        <X className="h-3 w-3 opacity-50" />
      )}
      <span>{label}</span>
    </li>
  );
}

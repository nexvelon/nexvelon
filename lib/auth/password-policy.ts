/**
 * Password policy for Nexvelon — matches the Supabase Auth project setting
 * (min 12 chars, lower + upper + digit + symbol).
 *
 * Used both by the set-password page (live strength meter) and by server
 * actions before calling supabase.auth.updateUser({ password }).
 */

export interface PasswordCheckResult {
  ok: boolean;
  /** Score 0..4 — for the strength meter UI. */
  score: 0 | 1 | 2 | 3 | 4;
  /** Human-readable summary, e.g. "Weak — add a symbol". */
  label: string;
  /** Per-rule pass/fail for inline checklist UI. */
  rules: {
    length: boolean;
    lower: boolean;
    upper: boolean;
    digit: boolean;
    symbol: boolean;
  };
}

const MIN_LENGTH = 12;

const RE_LOWER = /[a-z]/;
const RE_UPPER = /[A-Z]/;
const RE_DIGIT = /[0-9]/;
// "Symbol" is anything that's not alphanumeric — keep the definition broad
// so unicode punctuation counts.
const RE_SYMBOL = /[^A-Za-z0-9]/;

export function checkPassword(password: string): PasswordCheckResult {
  const rules = {
    length: password.length >= MIN_LENGTH,
    lower: RE_LOWER.test(password),
    upper: RE_UPPER.test(password),
    digit: RE_DIGIT.test(password),
    symbol: RE_SYMBOL.test(password),
  };

  const passed = Object.values(rules).filter(Boolean).length;
  const ok = Object.values(rules).every(Boolean);

  // Score: 0 (empty) → 4 (all rules + reasonable length bonus)
  let score: 0 | 1 | 2 | 3 | 4;
  if (password.length === 0) score = 0;
  else if (passed <= 2) score = 1;
  else if (passed === 3) score = 2;
  else if (passed === 4) score = 3;
  else score = 4;
  // Light bonus: 16+ chars caps it to 4 even if a rule slips, but only if
  // length passed. Don't promote a score that hasn't earned it.
  if (ok && password.length >= 16) score = 4;

  const label =
    !rules.length
      ? `Too short — at least ${MIN_LENGTH} characters`
      : !ok
      ? "Add the missing requirements"
      : score === 3
      ? "Good"
      : "Strong";

  return { ok, score, label, rules };
}

/** Server-side hard validation. Throws a user-readable error on failure. */
export function assertValidPassword(password: string): void {
  const result = checkPassword(password);
  if (!result.ok) {
    throw new Error(
      "Password must be at least 12 characters and include a lowercase letter, " +
        "an uppercase letter, a digit, and a symbol."
    );
  }
}

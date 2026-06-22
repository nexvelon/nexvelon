// POLISH-17 — a small dependency-free word-level diff for the T&C audit viewer.
// (We avoid pulling in the `diff` npm package, which is only present transitively
// via a dev tool.) Tokenises on whitespace boundaries, runs a classic LCS, and
// returns inline chunks the viewer renders green (added) / red (removed) / plain.
//
// Pure module (no "server-only") so the client diff viewer can import it.

export type DiffOp = "equal" | "add" | "del";
export interface DiffChunk {
  type: DiffOp;
  value: string;
}

/** Split into tokens, keeping whitespace runs as their own tokens so the text
 *  can be reconstructed exactly. */
function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t !== "");
}

/**
 * Word-level diff of `before` → `after`. O(n·m) LCS table; fine for legal docs
 * (a few KB). Returns merged runs of equal / added / removed text.
 */
export function wordDiff(before: string, after: string): DiffChunk[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffChunk[] = [];
  const push = (type: DiffOp, value: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.value += value;
    else out.push({ type, value });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i++;
    } else {
      push("add", b[j]);
      j++;
    }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return out;
}

/** A short human summary of an edit, e.g. "Added 142 chars, removed 23 chars". */
export function changeSummary(before: string, after: string): string {
  const b = (before ?? "").length;
  const a = (after ?? "").length;
  if (before === after) return "No textual change";
  const added = Math.max(0, a - b);
  const removed = Math.max(0, b - a);
  const parts: string[] = [];
  if (added) parts.push(`added ${added} char${added === 1 ? "" : "s"}`);
  if (removed) parts.push(`removed ${removed} char${removed === 1 ? "" : "s"}`);
  if (parts.length === 0) {
    // Same length but different content — count changed tokens.
    const chunks = wordDiff(before ?? "", after ?? "");
    const changed = chunks.filter((c) => c.type !== "equal").length;
    return `Revised ${changed} section${changed === 1 ? "" : "s"}`;
  }
  const summary = parts.join(", ");
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

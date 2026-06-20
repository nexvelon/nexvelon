// POLISH-8 — single source of truth for parsing a tier's description text into a
// headline + bullet list + plain body. Used by the invite email, the web form's
// tier opt-in cards, and the admin Submission Detail page so all three render
// the same structure.
//
// Contract (per tier text block):
//   - First non-empty line = the headline sentence.
//   - Lines starting with "- " (dash + space) = bullet points.
//   - Any other non-empty line = plain body paragraph.
// Freeform text with no bullets simply yields a headline + body paragraphs, so
// existing/edited tier text never breaks.
//
// Pure module (no "server-only") so client components can import it too.

export interface ParsedTierText {
  headline: string;
  bullets: string[];
  bodyParas: string[];
}

export function parseTierText(raw: string | null | undefined): ParsedTierText {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) {
    return { headline: "", bullets: [], bodyParas: [] };
  }
  const headline = lines[0];
  const bullets: string[] = [];
  const bodyParas: string[] = [];
  for (const line of lines.slice(1)) {
    if (line === "-" || line === "•") continue; // empty bullet marker
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2).trim());
    } else if (line.startsWith("• ")) {
      bullets.push(line.slice(2).trim());
    } else {
      bodyParas.push(line);
    }
  }
  return { headline, bullets, bodyParas };
}

// QUOTE-PORTAL-1 — the client-facing chrome. Deliberately self-contained inline
// styling (navy + gold) so it never inherits the operator's app theme or any
// internal chrome. Mobile-first: a single centered column that reads well on a
// phone in a parking lot.

import type { ReactNode } from "react";

const NAVY = "#0A1224";
const GOLD = "#C9A35C";
const INK = "#2A2418";

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: NAVY,
        margin: 0,
        padding: "24px 16px",
        fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        color: INK,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "8px 0 20px" }}>
          <span
            style={{
              color: GOLD,
              fontSize: 13,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Nexvelon Global
          </span>
        </div>
        <div
          style={{
            background: "#FBFAF5",
            border: `1px solid ${GOLD}`,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          }}
        >
          {children}
        </div>
        <p
          style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.45)",
            fontSize: 11,
            marginTop: 16,
          }}
        >
          © {new Date().getFullYear()} Nexvelon Global Inc.
        </p>
      </div>
    </div>
  );
}

export function PortalMessage({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "40px 28px", textAlign: "center" }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: NAVY, margin: "0 0 12px" }}>
        {title}
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: INK, margin: 0 }}>{body}</p>
    </div>
  );
}

export const PORTAL_COLORS = { NAVY, GOLD, INK };

"use client";

// QUOTE-PORTAL-1 — the client-facing quote view + e-acceptance. Renders the
// immutable SNAPSHOT only. Accept = typed name (the signature of record) + a
// required attestation + an optional drawn signature; Decline = optional reason.
// Mobile-first, large tap targets, self-contained styling.

import { useRef, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import { acceptQuoteAction, declineQuoteAction } from "./actions";
import { PORTAL_COLORS } from "./PortalShell";
import type { QuoteSnapshot } from "@/lib/api/quote-portal";

const { NAVY, GOLD, INK } = PORTAL_COLORS;

export function QuotePortalView({ token, snapshot }: { token: string; snapshot: QuoteSnapshot }) {
  const [mode, setMode] = useState<"view" | "accept" | "decline">("view");
  const [done, setDone] = useState<null | "accepted" | "declined">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Accept form
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [attest, setAttest] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  // Decline form
  const [reason, setReason] = useState("");

  const submitAccept = () => {
    if (!name.trim()) return setError("Please type your full name to sign.");
    if (!attest) return setError("Please confirm you're authorised to accept this quote.");
    setError(null);
    start(async () => {
      const res = await acceptQuoteAction({
        token,
        signerName: name.trim(),
        signerTitle: title.trim() || undefined,
        signerEmail: email.trim() || undefined,
        signatureImage: sigRef.current?.toDataURL() ?? null,
      });
      if (res.ok) setDone("accepted");
      else setError(res.error);
    });
  };

  const submitDecline = () => {
    setError(null);
    start(async () => {
      const res = await declineQuoteAction({ token, reason: reason.trim() || undefined });
      if (res.ok) setDone("declined");
      else setError(res.error);
    });
  };

  if (done === "accepted") {
    return (
      <Pad>
        <h1 style={h1}>Thank you — quote accepted</h1>
        <p style={p}>
          Your acceptance of quote <strong>{snapshot.number}</strong> has been recorded. Our team
          will be in touch about next steps. You can close this page.
        </p>
      </Pad>
    );
  }
  if (done === "declined") {
    return (
      <Pad>
        <h1 style={h1}>Quote declined</h1>
        <p style={p}>Thank you for letting us know. You can close this page.</p>
      </Pad>
    );
  }

  return (
    <div>
      {/* Letterhead */}
      <div style={{ padding: "28px 24px 16px", borderBottom: `1px solid #e7e0cf` }}>
        <div style={{ color: GOLD, fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 600 }}>
          {snapshot.companyLegalName ?? "Nexvelon Global"}
        </div>
        <h1 style={{ ...h1, marginTop: 6 }}>Quote {snapshot.number}</h1>
        <div style={{ fontSize: 13, color: "#6b6350", marginTop: 4 }}>
          {snapshot.clientName}
          {snapshot.siteName ? ` · ${snapshot.siteName}` : ""}
        </div>
        <div style={{ fontSize: 12, color: "#8a8168", marginTop: 6 }}>
          {snapshot.quoteDate ? `Dated ${snapshot.quoteDate}` : ""}
          {snapshot.expiresAt ? ` · Valid until ${snapshot.expiresAt.slice(0, 10)}` : ""}
          {snapshot.preparedBy ? ` · Prepared by ${snapshot.preparedBy}` : ""}
        </div>
      </div>

      {/* Line items */}
      <div style={{ padding: "16px 24px" }}>
        {snapshot.sections.map((sec, si) => (
          <div key={si} style={{ marginBottom: 18 }}>
            {sec.name && (
              <div style={{ fontWeight: 600, color: NAVY, fontSize: 14, margin: "6px 0" }}>{sec.name}</div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#8a8168", textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ padding: "4px 0" }}>Item</th>
                  <th style={{ padding: "4px 0", textAlign: "right", width: 44 }}>Qty</th>
                  {snapshot.show.unitPrice && <th style={{ padding: "4px 0", textAlign: "right", width: 90 }}>Unit</th>}
                  {snapshot.show.unitPrice && <th style={{ padding: "4px 0", textAlign: "right", width: 100 }}>Amount</th>}
                </tr>
              </thead>
              <tbody>
                {sec.items.map((it, ii) => (
                  <tr key={ii} style={{ borderTop: "1px solid #efe9da", verticalAlign: "top" }}>
                    <td style={{ padding: "8px 0", color: INK }}>
                      <div>{snapshot.show.name && it.name ? it.name : it.description}</div>
                      {snapshot.show.name && it.name && snapshot.show.description && it.description && (
                        <div style={{ color: "#8a8168", fontSize: 12 }}>{it.description}</div>
                      )}
                      <div style={{ color: "#a49a80", fontSize: 11 }}>
                        {[
                          snapshot.show.masterPart && it.masterPartNumber ? it.masterPartNumber : "",
                          snapshot.show.sku && it.sku ? it.sku : "",
                          snapshot.show.vendor && it.vendor ? it.vendor : "",
                          snapshot.show.upc && it.upc ? it.upc : "",
                          it.serialNumber ? `SN ${it.serialNumber}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td style={{ padding: "8px 0", textAlign: "right", color: INK }}>{it.qty}</td>
                    {snapshot.show.unitPrice && (
                      <td style={{ padding: "8px 0", textAlign: "right", color: INK }}>{formatCurrency(it.unitPrice)}</td>
                    )}
                    {snapshot.show.unitPrice && (
                      <td style={{ padding: "8px 0", textAlign: "right", color: INK }}>{formatCurrency(it.qty * it.unitPrice)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Totals */}
        <div style={{ marginTop: 8, borderTop: `2px solid ${GOLD}`, paddingTop: 10 }}>
          <TotalRow label="Subtotal" value={formatCurrency(snapshot.subtotal)} />
          {snapshot.discount ? (
            <TotalRow
              label={`Discount${snapshot.discountType === "pct" ? ` (${snapshot.discount}%)` : ""}`}
              value={`− ${formatCurrency(snapshot.discountType === "pct" ? (snapshot.subtotal * snapshot.discount) / 100 : snapshot.discount)}`}
            />
          ) : null}
          <TotalRow label={`HST${snapshot.taxRate ? ` (${snapshot.taxRate}%)` : ""}`} value={formatCurrency(snapshot.tax)} />
          <TotalRow label="Total" value={formatCurrency(snapshot.total)} strong />
        </div>

        {snapshot.terms && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: NAVY, fontSize: 13, fontWeight: 600 }}>Terms &amp; conditions</summary>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#6b6350", marginTop: 8, lineHeight: 1.55 }}>
              {snapshot.terms}
            </div>
          </details>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "8px 24px 28px", borderTop: "1px solid #efe9da" }}>
        {error && <p style={{ color: "#b3261e", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}

        {mode === "view" && (
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button style={btnPrimary} onClick={() => setMode("accept")}>Accept &amp; sign</button>
            <button style={btnGhost} onClick={() => setMode("decline")}>Decline</button>
          </div>
        )}

        {mode === "accept" && (
          <div style={{ marginTop: 14 }}>
            <h2 style={{ ...h2 }}>Accept &amp; sign</h2>
            <label style={lbl}>Full name (your signature)</label>
            <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Title (optional)</label>
                <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Facilities Manager" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Email (optional)</label>
                <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
            </div>
            <label style={lbl}>Draw your signature (optional)</label>
            <SignaturePad ref={sigRef} />
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "12px 0", fontSize: 13, color: INK }}>
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                I am authorised to accept this quote on behalf of {snapshot.clientName ?? "the client"}, and I agree to the
                pricing and terms shown above.
              </span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={btnPrimary} onClick={submitAccept} disabled={pending}>
                {pending ? "Submitting…" : "Accept quote"}
              </button>
              <button style={btnGhost} onClick={() => setMode("view")} disabled={pending}>Back</button>
            </div>
          </div>
        )}

        {mode === "decline" && (
          <div style={{ marginTop: 14 }}>
            <h2 style={{ ...h2 }}>Decline quote</h2>
            <label style={lbl}>Reason (optional)</label>
            <textarea style={{ ...inp, minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Let us know what you'd like changed…" />
            <div style={{ display: "flex", gap: 10 }}>
              <button style={btnPrimary} onClick={submitDecline} disabled={pending}>
                {pending ? "Submitting…" : "Decline quote"}
              </button>
              <button style={btnGhost} onClick={() => setMode("view")} disabled={pending}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: strong ? 16 : 13, fontWeight: strong ? 700 : 400, color: strong ? NAVY : INK }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── Minimal pointer-drawn signature pad ──────────────────────────────────────
import { forwardRef, useImperativeHandle } from "react";
interface SignaturePadHandle { toDataURL: () => string | null }
const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useImperativeHandle(ref, () => ({
    toDataURL: () => (dirty.current && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null),
  }));

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    dirty.current = true;
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{ width: "100%", height: 120, border: "1px dashed #c9bfa6", borderRadius: 6, touchAction: "none", background: "#fff" }}
      />
      <button style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, marginTop: 4 }} onClick={clear} type="button">
        Clear
      </button>
    </div>
  );
});

// ── inline style tokens ──────────────────────────────────────────────────────
const h1 = { fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 26, color: NAVY, margin: 0 } as const;
const h2 = { fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, color: NAVY, margin: "0 0 10px" } as const;
const p = { fontSize: 15, lineHeight: 1.6, color: INK } as const;
const lbl = { display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8a8168", margin: "10px 0 4px" } as const;
const inp = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #c9bfa6", borderRadius: 6, fontSize: 15, background: "#fff", color: INK } as const;
const btnPrimary = { background: NAVY, color: "#fff", border: `1px solid ${NAVY}`, borderRadius: 6, padding: "12px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer" } as const;
const btnGhost = { background: "transparent", color: NAVY, border: `1px solid ${GOLD}`, borderRadius: 6, padding: "12px 20px", fontSize: 15, cursor: "pointer" } as const;

function Pad({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "40px 28px", textAlign: "center" }}>{children}</div>;
}

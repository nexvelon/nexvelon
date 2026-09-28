"use client";

// QUOTE-PORTAL-3 item 2/3 — the in-portal quote viewer. Native browser PDF
// embedding (<iframe>/<embed>) sizes unpredictably and is unreliable on iOS
// Safari (a client may well open this on an iPhone), which is why QP-2's iframe
// showed a cropped sliver. Instead we rasterize the PDF to page images with
// pdf.js (the same tested rasterizer the quote drawings use) and lay them out in
// a scroll container where ONE COMPLETE page is fitted to the viewer at a time,
// with a visible scrollbar so more pages are obviously scrollable. This renders
// identically on desktop Chrome/Safari and mobile Safari (it's <img>, not native
// PDF). If rasterization fails, we fall back to the open-in-new-tab link.

import { useEffect, useRef, useState } from "react";
import { renderPdfToImages } from "@/lib/quote-drawings-render";
import { PORTAL_COLORS } from "./PortalShell";

const { NAVY, GOLD } = PORTAL_COLORS;

export function PortalPdfViewer({ url }: { url: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;
    renderPdfToImages(url)
      .then((imgs) => {
        if (!active) return;
        if (imgs.length === 0) setFailed(true);
        else setPages(imgs);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [url]);

  // The viewer fits ~one full page: its height is bounded to the window
  // (min of 72vh and a letter-page-ish cap) and each page occupies one full
  // "screenful" slot, centered + contained, so a whole page shows and you scroll
  // to the next. overflow-y:auto guarantees a visible scrollbar when there's more.
  return (
    <div>
      <div
        style={{
          height: "min(74vh, 860px)",
          overflowY: "auto",
          background: "#e9e4d6",
          border: "1px solid #d8cfb8",
          borderRadius: 6,
          scrollSnapType: "y proximity",
        }}
        aria-label="Quote document"
      >
        {failed ? (
          <div style={{ padding: 24, textAlign: "center", color: NAVY }}>
            <p style={{ fontSize: 14 }}>
              The quote preview couldn&apos;t load here.{" "}
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, textDecoration: "underline" }}>
                Open the full quote PDF
              </a>
              .
            </p>
          </div>
        ) : !pages ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b6350", fontSize: 14 }}>Loading quote…</div>
        ) : (
          pages.map((src, i) => (
            <div
              key={i}
              style={{
                height: "min(74vh, 860px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 12,
                boxSizing: "border-box",
                scrollSnapAlign: "start",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Quote page ${i + 1}`}
                style={{
                  maxHeight: "100%",
                  maxWidth: "100%",
                  objectFit: "contain",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
                  background: "#fff",
                }}
              />
            </div>
          ))
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontSize: 12 }}>
          Open the full quote PDF in a new tab
        </a>
      </div>
    </div>
  );
}

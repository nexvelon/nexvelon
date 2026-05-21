"use client";

// QD-2 Phase 5c — client-side PDF page rasterizer.
// Renders each page of an uploaded drawings PDF to a PNG data URL via
// pdfjs-dist. Browser-only (touches DOMMatrix / <canvas>). Imported lazily
// (dynamic import) so pdfjs only loads when a quote actually has drawings.

const WORKER_SRC = "/pdf.worker.min.mjs";
const RENDER_SCALE = 2.0; // 2× DPI for a sharp embed
const PAGE_CAP = 12;      // soft cap to protect memory; render first 12 pages

let pdfjsModule: typeof import("pdfjs-dist") | null = null;

async function loadPdfjs() {
  if (pdfjsModule) return pdfjsModule;
  pdfjsModule = await import("pdfjs-dist");
  pdfjsModule.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  return pdfjsModule;
}

/**
 * Render each page of the PDF at the signed URL to a PNG data URL.
 * Capped at PAGE_CAP pages (soft cap for memory safety).
 * Throws on network / parse error.
 */
export async function renderPdfToImages(signedUrl: string): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument(signedUrl);
  const pdf = await loadingTask.promise;

  try {
    const pageCount = Math.min(pdf.numPages, PAGE_CAP);
    const results: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // pdfjs v5: pass the canvas directly (canvasContext is legacy/back-compat).
      await page.render({ canvas, viewport }).promise;
      results.push(canvas.toDataURL("image/png"));

      // Free memory between pages.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }

    return results;
  } finally {
    // Release the document's worker-side resources.
    await pdf.destroy();
  }
}

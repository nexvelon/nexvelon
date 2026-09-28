// QUOTE-PORTAL-2 — serve the unsigned quote PDF for a portal token. Public but
// token-validated (the token IS the auth); fail-closed. The client sees exactly
// the stored "Proposals" PDF that was sent — the frozen snapshot artifact.

import { NextResponse } from "next/server";
import { getPortalByToken } from "@/lib/api/quote-portal";
import { downloadQuoteDocument } from "@/lib/api/quote-documents";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await getPortalByToken(token);

  // A PDF is available for any status that still shows the document (valid,
  // responded, superseded). Everything else reveals nothing.
  const pdfPath =
    result.status === "valid" || result.status === "responded" || result.status === "superseded"
      ? result.pdfPath
      : null;
  if (!pdfPath) {
    return new NextResponse("Not available", { status: 404 });
  }

  try {
    const pdf = await downloadQuoteDocument(pdfPath);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=quote.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse("Not available", { status: 404 });
  }
}

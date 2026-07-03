"use client";

// PO-2 — purchase-order PDF preview + download, mirroring InvoicePdfPane. POs
// don't change per-keystroke, so this renders on open with no debounce. It is a
// dumb renderer: it receives fully-assembled props (built server-side by
// buildPurchaseOrderPdfProps) and hands them to PurchaseOrderDocument.

import { memo } from "react";
import dynamic from "next/dynamic";
import { Download, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  PurchaseOrderDocument,
  type PurchaseOrderDocumentProps,
} from "./PurchaseOrderDocument";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <PreviewLoader /> }
);

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false }
);

export const PurchaseOrderPdfPane = memo(function PurchaseOrderPdfPane({
  props,
}: {
  props: PurchaseOrderDocumentProps;
}) {
  const doc = <PurchaseOrderDocument {...props} />;
  const fileName = `PO-${props.po.po_number}.pdf`;

  return (
    <Card className="bg-muted/30 flex h-[70vh] flex-col overflow-hidden p-0">
      <div className="bg-card flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="text-brand-gold h-4 w-4" />
          <span className="font-serif text-sm font-medium tracking-wide">
            Purchase Order PDF
          </span>
        </div>
        <PDFDownloadLink
          document={doc}
          fileName={fileName}
          className="bg-brand-navy hover:bg-brand-navy/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
        >
          {({ loading }: { loading: boolean }) => (
            <>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Download PDF</span>
            </>
          )}
        </PDFDownloadLink>
      </div>
      <div className="min-h-0 flex-1">
        <PDFViewer width="100%" height="100%" showToolbar={false} style={{ border: "none" }}>
          {doc}
        </PDFViewer>
      </div>
    </Card>
  );
});

function PreviewLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Rendering purchase order PDF…
      </div>
    </div>
  );
}

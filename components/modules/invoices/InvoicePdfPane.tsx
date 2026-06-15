"use client";

// INVOICE-1b — invoice PDF preview + download, mirroring the quote builder's
// PdfPreviewPane. Invoices don't change per-keystroke, so this renders on open
// with no debounce machinery. The issuing entity (legal name + HST) is resolved
// by invoice.opco from QUOTE_TEMPLATES — the same source the quote PDF uses.

import { memo } from "react";
import dynamic from "next/dynamic";
import { Download, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { InvoiceDocument } from "./InvoiceDocument";
import { getQuoteTheme } from "@/lib/quote-themes";
import {
  getQuoteTemplate,
  isValidQuoteTemplateSlug,
  DEFAULT_QUOTE_TEMPLATE_SLUG,
} from "@/lib/company-profile";
import type { InvoiceDetail } from "@/lib/api/invoices";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <PreviewLoader /> }
);

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false }
);

// A clean, light, antique-gold-on-cream house look for the printable invoice.
const INVOICE_THEME_SLUG = "solid_white" as const;

export const InvoicePdfPane = memo(function InvoicePdfPane({
  detail,
}: {
  detail: InvoiceDetail;
}) {
  const { invoice, lines, billTo, serviceLocation, project_number, project_title } =
    detail;

  const templateSlug = isValidQuoteTemplateSlug(invoice.opco)
    ? invoice.opco
    : DEFAULT_QUOTE_TEMPLATE_SLUG;
  const template = getQuoteTemplate(templateSlug);
  const theme = getQuoteTheme(INVOICE_THEME_SLUG);

  const doc = (
    <InvoiceDocument
      invoice={invoice}
      lines={lines}
      billTo={billTo}
      serviceLocation={serviceLocation}
      projectNumber={project_number}
      projectTitle={project_title}
      template={template}
      theme={theme}
    />
  );

  const fileName = `${invoice.invoice_number ?? "invoice-draft"}.pdf`;

  return (
    <Card className="bg-muted/30 flex h-[70vh] flex-col overflow-hidden p-0">
      <div className="bg-card flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="text-brand-gold h-4 w-4" />
          <span className="font-serif text-sm font-medium tracking-wide">
            Invoice PDF
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
        <PDFViewer
          width="100%"
          height="100%"
          showToolbar={false}
          style={{ border: "none" }}
        >
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
        Rendering invoice PDF…
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { Download, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QuoteDocument } from "./QuoteDocument";
import {
  DEFAULT_QUOTE_THEME_SLUG,
  getQuoteTheme,
} from "@/lib/quote-themes";
import {
  DEFAULT_QUOTE_TEMPLATE_SLUG,
  getQuoteTemplate,
} from "@/lib/company-profile";
import type { Client, QuoteSection, Site, User } from "@/lib/types";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  {
    ssr: false,
    loading: () => <PreviewLoader />,
  }
);

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false }
);

interface Props {
  number: string;
  name?: string;
  createdAt: string;
  validUntil: string;
  paymentTerms: string;
  projectType: string;
  client?: Client;
  site?: Site;
  owner?: User;
  sections: QuoteSection[];
  taxRatePct: number;
  discount: number;
  discountType: "pct" | "amount";
  terms: string;
}

export function PdfPreviewPane(props: Props) {
  // No `quote` object in scope here (this component receives flattened
  // builder state, not a Quote record). Per Chunk D spec, resolve to the
  // default theme + default template. Chunk E's picker UI will accept the
  // operator's choices and thread them through.
  const theme = getQuoteTheme(DEFAULT_QUOTE_THEME_SLUG);
  const template = getQuoteTemplate(DEFAULT_QUOTE_TEMPLATE_SLUG);
  const doc = <QuoteDocument {...props} theme={theme} template={template} />;

  return (
    <Card className="bg-muted/30 flex h-full flex-col overflow-hidden p-0">
      <div className="bg-card flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="text-brand-gold h-4 w-4" />
          <span className="font-serif text-sm font-medium tracking-wide">
            Live PDF preview
          </span>
        </div>
        <PDFDownloadLink
          document={doc}
          fileName={`${props.number}.pdf`}
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
}

function PreviewLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Rendering PDF preview…
      </div>
    </div>
  );
}

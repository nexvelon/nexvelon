// QUOTE-PORTAL-1 — the public, UNAUTHENTICATED client quote portal at /q/<token>.
// Reads through the service-role client scoped by the token (no anon grant); records
// the view; renders the immutable SNAPSHOT (never the live quote). Fails closed: an
// invalid / expired / revoked token shows a clear message and reveals nothing about
// whether a quote exists.

import { getPortalByToken } from "@/lib/api/quote-portal";
import { QuotePortalView } from "./QuotePortalView";
import { PortalShell, PortalMessage } from "./PortalShell";

export const dynamic = "force-dynamic";

export default async function QuotePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getPortalByToken(token);

  if (result.status === "valid") {
    return (
      <PortalShell>
        <QuotePortalView token={token} snapshot={result.snapshot} pdfUrl={`/q/${token}/pdf`} />
      </PortalShell>
    );
  }

  if (result.status === "responded") {
    return (
      <PortalShell>
        <PortalMessage
          title={result.decision === "accepted" ? "Quote accepted" : "Quote declined"}
          body={
            result.decision === "accepted"
              ? "Thank you — this quote has been accepted and a signed copy has been emailed to you. Our team will be in touch about next steps."
              : "This quote has been declined. If that wasn't intended, please reply to the email you received and we'll help."
          }
        />
      </PortalShell>
    );
  }

  // QP-2 — another recipient of the same quote already responded; this link is
  // now read-only, not broken (item 2c).
  if (result.status === "superseded") {
    return (
      <PortalShell>
        <PortalMessage
          title="This quote has already been responded to"
          body="Someone else on this quote has already accepted or declined it, so it can no longer be signed from this link. If you have questions, please reply to the email you received."
        />
      </PortalShell>
    );
  }

  if (result.status === "expired") {
    return (
      <PortalShell>
        <PortalMessage
          title="This link has expired"
          body="For your security this quote link is no longer active. Please reply to the email you received and we'll send you a fresh one."
        />
      </PortalShell>
    );
  }

  // revoked OR not_found → the SAME generic message, revealing nothing about
  // whether a quote exists (fail closed).
  return (
    <PortalShell>
      <PortalMessage
        title="This link isn't available"
        body="This quote link isn't valid. It may have been replaced by a newer version. Please reply to the email you received and we'll help."
      />
    </PortalShell>
  );
}

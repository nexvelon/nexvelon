// FIN-3 — printable statement of account for one client. Server component:
// loads via the financials:view-gated action, then renders a plain document.
// Print uses the existing `@media print` rules in globals.css (chrome carries
// data-print-hide), so there's no PDF engine here — a real PDF statement is
// FIN-3b if the print sheet proves insufficient.

import Link from "next/link";
import { getClientStatementAction } from "@/app/(app)/financials/actions";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AGING_BUCKET_LABEL } from "@/lib/api/ar-aging";
import { STATUS_LABEL } from "@/components/modules/invoices/shared";
import { formatCurrency } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

function NotFoundCard({ message }: { message: string }) {
  return (
    <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
      <h1 className="text-brand-navy font-serif text-2xl">Statement unavailable</h1>
      <p className="text-muted-foreground mt-2 text-sm">{message}</p>
      <Link
        href="/financials"
        className="text-brand-gold mt-4 inline-block text-sm hover:underline"
      >
        ← Back to Financials
      </Link>
    </div>
  );
}

export default async function ClientStatementPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const res = await getClientStatementAction(clientId);

  if (!res.ok) return <NotFoundCard message={res.error} />;
  if (!res.data) return <NotFoundCard message="That client no longer exists." />;

  const stmt = res.data;
  const overdueLines = stmt.lines.filter(
    (l) => l.balance > 0 && l.bucket !== "current"
  );

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between" data-print-hide>
        <Link
          href="/financials"
          className="text-muted-foreground hover:text-brand-charcoal text-xs"
        >
          ← Back to Financials
        </Link>
        <PrintButton />
      </div>

      <Card className="space-y-6 p-6 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <p className="text-muted-foreground font-serif text-[11px] uppercase tracking-widest">
              Statement of account
            </p>
            <h1 className="text-brand-navy font-serif text-2xl">
              {stmt.client_name}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[11px]">As of</p>
            <p className="text-brand-charcoal text-sm tabular-nums">{stmt.asOf}</p>
          </div>
        </header>

        {stmt.lines.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No issued invoices for this client.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase">Invoice</TableHead>
                    <TableHead className="text-[11px] uppercase">Issued</TableHead>
                    <TableHead className="text-[11px] uppercase">Due</TableHead>
                    <TableHead className="text-[11px] uppercase">Status</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Holdback</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Paid</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Balance</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stmt.lines.map((l) => (
                    <TableRow key={l.invoice_id}>
                      <TableCell className="font-mono text-xs">
                        {l.invoice_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {l.issue_date ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {l.due_date ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {STATUS_LABEL[l.status] ?? l.status}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(l.total)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                        {l.holdback ? `− ${formatCurrency(l.holdback)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {l.paid ? formatCurrency(l.paid) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums">
                        {formatCurrency(l.balance)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {l.balance > 0 && l.bucket !== "current"
                          ? AGING_BUCKET_LABEL[l.bucket]
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals. invoiced − holdback − paid = balance; holdback is broken
                out because it is retained, not owed. */}
            <div className="ml-auto w-full max-w-xs space-y-1.5 border-t border-[var(--border)] pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoiced</span>
                <span className="tabular-nums">
                  {formatCurrency(stmt.totals.invoiced)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Holdback retained</span>
                <span className="tabular-nums">
                  − {formatCurrency(stmt.totals.holdback)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payments received</span>
                <span className="tabular-nums">
                  − {formatCurrency(stmt.totals.paid)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-sm font-semibold">
                <span>Balance due</span>
                <span className="text-brand-navy tabular-nums">
                  {formatCurrency(stmt.totals.balance)}
                </span>
              </div>
            </div>

            {overdueLines.length > 0 && (
              <p className="text-[11px] text-red-600">
                {overdueLines.length} invoice
                {overdueLines.length === 1 ? " is" : "s are"} past due.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// FIN-6 — printable statement of what we owe one vendor. The payables mirror of
// FIN-3's client statement, reusing the same @media print rules in globals.css
// (chrome carries data-print-hide). PDF is FIN-6b, mirroring FIN-3b.

import Link from "next/link";
import { getVendorStatementAction } from "@/app/(app)/financials/actions";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AGING_BUCKET_LABEL } from "@/lib/aging-buckets";
import { formatCurrency } from "@/lib/format";
import { PrintButton } from "@/app/(app)/financials/statement/[clientId]/PrintButton";

export const dynamic = "force-dynamic";

const BILL_STATUS_LABEL: Record<string, string> = {
  received: "Received",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

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

export default async function VendorStatementPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  const res = await getVendorStatementAction(vendorId);

  if (!res.ok) return <NotFoundCard message={res.error} />;
  if (!res.data) return <NotFoundCard message="That vendor no longer exists." />;

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
              Vendor statement — payables
            </p>
            <h1 className="text-brand-navy font-serif text-2xl">
              {stmt.vendor_name}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[11px]">As of</p>
            <p className="text-brand-charcoal text-sm tabular-nums">{stmt.asOf}</p>
          </div>
        </header>

        {stmt.lines.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No bills recorded for this vendor.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase">Bill</TableHead>
                    <TableHead className="text-[11px] uppercase">PO</TableHead>
                    <TableHead className="text-[11px] uppercase">Bill date</TableHead>
                    <TableHead className="text-[11px] uppercase">Due</TableHead>
                    <TableHead className="text-[11px] uppercase">Status</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Paid</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Balance</TableHead>
                    <TableHead className="text-right text-[11px] uppercase">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stmt.lines.map((l) => (
                    <TableRow key={l.bill_id}>
                      <TableCell className="font-mono text-xs">{l.bill_number}</TableCell>
                      <TableCell className="text-xs">{l.po_number ?? "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{l.bill_date}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {l.due_date ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {BILL_STATUS_LABEL[l.status] ?? l.status}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(l.total)}
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

            {/* No holdback on the AP side, so this reconciles directly. */}
            <div className="ml-auto w-full max-w-xs space-y-1.5 border-t border-[var(--border)] pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billed</span>
                <span className="tabular-nums">
                  {formatCurrency(stmt.totals.billed)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payments made</span>
                <span className="tabular-nums">
                  − {formatCurrency(stmt.totals.paid)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-sm font-semibold">
                <span>Balance owing</span>
                <span className="text-brand-navy tabular-nums">
                  {formatCurrency(stmt.totals.balance)}
                </span>
              </div>
            </div>

            {overdueLines.length > 0 && (
              <p className="text-[11px] text-red-600">
                {overdueLines.length} bill
                {overdueLines.length === 1 ? " is" : "s are"} past due.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

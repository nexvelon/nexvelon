// FIN-1 — the Financials range vocabulary. Client-safe (no server imports):
// the page header's range selector builds { from, to } ISO date bounds that the
// financials server actions filter invoices.issue_date against. "custom" returns
// nulls — the page supplies its own date-input values.

export type FinRange = "month" | "qtd" | "ytd" | "lastYear" | "custom";

export const FIN_RANGE_LABEL: Record<FinRange, string> = {
  month: "This Month",
  qtd: "QTD",
  ytd: "YTD",
  lastYear: "Last Year",
  custom: "Custom",
};

export interface FinRangeBounds {
  from: string | null;
  to: string | null;
}

// Plain local-date ISO (yyyy-mm-dd). invoices.issue_date is a DATE column, so
// string comparison against these bounds is exact — no timezone conversion.
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function rangeBounds(range: FinRange, today: Date = new Date()): FinRangeBounds {
  switch (range) {
    case "month":
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    case "qtd": {
      const qStartMonth = Math.floor(today.getMonth() / 3) * 3;
      return { from: iso(new Date(today.getFullYear(), qStartMonth, 1)), to: iso(today) };
    }
    case "ytd":
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
    case "lastYear":
      return {
        from: iso(new Date(today.getFullYear() - 1, 0, 1)),
        to: iso(new Date(today.getFullYear() - 1, 11, 31)),
      };
    case "custom":
      return { from: null, to: null };
  }
}

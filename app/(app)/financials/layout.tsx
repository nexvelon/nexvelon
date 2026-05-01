import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financials",
  description:
    "Profitability, cash flow, receivables, and tax reporting — with QuickBooks and Xero sync.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

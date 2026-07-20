import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financials",
  description:
    "Revenue, receivables, project financials, and HST — from live operational data.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

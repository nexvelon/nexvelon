import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoices",
  description:
    "Per-entity invoices with flexible cost-center draws, HST, and holdback.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

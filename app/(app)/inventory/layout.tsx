import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory & Warehouse",
  description:
    "Stock levels, allocations, transfers, and purchasing across all warehouse locations.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

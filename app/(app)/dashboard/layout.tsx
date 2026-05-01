import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Operational pulse — pipeline, project status, technician utilization, and inventory health.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

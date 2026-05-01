import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scheduling & Dispatch",
  description:
    "Technician assignments, service calls, installation crews, and the unassigned-jobs queue.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

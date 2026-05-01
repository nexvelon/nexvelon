import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Active installations, service contracts, commissioning, and closeout across all clients.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

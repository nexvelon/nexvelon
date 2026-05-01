import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Workspace settings, branding, integrations, backups, audit, and billing.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users & Permissions",
  description:
    "Granular control over what each team member can see and do — role presets, per-user overrides, and the audit log.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

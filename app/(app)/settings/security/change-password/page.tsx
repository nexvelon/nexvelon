import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChangePasswordForm } from "./change-password-form";

// ============================================================================
// /settings/security/change-password — self-service password change.
//
// Server component. No auth check here — the (app) route group layout
// already validated the session server-side and pre-seeded
// AuthProvider, so any caller reaching this page is signed in. The
// form is a client component handling the three-field UI; the server
// action lives in ./actions.ts.
// ============================================================================

export const metadata: Metadata = {
  title: "Change password",
  description: "Update your Nexvelon account password.",
};

export default function ChangePasswordPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings · Security"
        title="Change password"
        description="Replace the password on your Nexvelon account."
      />

      <Link
        href="/settings"
        className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[11px] tracking-[0.04em] transition"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to settings
      </Link>

      <div className="max-w-xl">
        <ChangePasswordForm />
      </div>
    </div>
  );
}

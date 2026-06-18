// POLISH-3 — PUBLIC onboarding chrome. Unauthenticated; rendered for clients
// completing their invitation. Deliberately minimal (no app nav / auth shell).

import type { ReactNode } from "react";

export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen w-full px-4 py-10"
      style={{ background: "#F5F1E8", color: "#0A1226" }}
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "#B8924B" }}
          >
            Nexvelon · Client Onboarding
          </p>
          <p className="mt-1 text-sm" style={{ color: "#5C5240" }}>
            Your progress saves automatically. Complete the four steps, then submit.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

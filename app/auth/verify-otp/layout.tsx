import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Verify code",
  description: "Enter the verification code emailed to you.",
};

// Auth state is per-request — never prerender this route.
export const dynamic = "force-dynamic";

export default function VerifyOtpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              "border border-[var(--border)] bg-card text-brand-charcoal shadow-md font-sans",
          },
        }}
      />
    </>
  );
}

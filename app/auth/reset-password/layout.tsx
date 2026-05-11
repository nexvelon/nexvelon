import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Set a new password for your Nexvelon workspace.",
};

export const dynamic = "force-dynamic";

export default function ResetPasswordLayout({
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

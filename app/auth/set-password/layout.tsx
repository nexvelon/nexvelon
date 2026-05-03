import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Set your password",
  description:
    "Welcome to Nexvelon — pick a password to finish setting up your account.",
};

export const dynamic = "force-dynamic";

export default function SetPasswordLayout({
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

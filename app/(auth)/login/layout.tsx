import type { Metadata } from "next";
import { Toaster } from "sonner";
import { RedirectIfAuthed } from "@/components/auth/RequireAuth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Nexvelon workspace.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <RedirectIfAuthed>
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
    </RedirectIfAuthed>
  );
}

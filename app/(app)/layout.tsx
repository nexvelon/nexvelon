import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <AppShell>
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
      </AppShell>
    </RequireAuth>
  );
}

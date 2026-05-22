"use client";

import { Card } from "@/components/ui/card";

export function PlaceholderPane({ label }: { label: string }) {
  return (
    <Card
      className="p-6 text-center shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <p className="text-muted-foreground text-xs">
        {label} will populate once the corresponding modules are wired to
        Supabase.
      </p>
    </Card>
  );
}

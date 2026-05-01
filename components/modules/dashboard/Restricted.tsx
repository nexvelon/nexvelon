import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface RestrictedProps {
  label: string;
  variant?: "kpi" | "panel";
  className?: string;
}

export function Restricted({ label, variant = "kpi", className }: RestrictedProps) {
  if (variant === "kpi") {
    return (
      <Card
        className={cn(
          "bg-muted/40 border-dashed border-t-2 border-t-[#C9A24B]/40 flex h-full flex-col gap-2 p-5",
          className
        )}
      >
        <div className="text-brand-charcoal/50 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" />
          <span className="font-serif text-sm">{label}</span>
        </div>
        <div className="text-muted-foreground/80 text-2xl font-semibold tracking-tight">
          —
        </div>
        <p className="text-muted-foreground text-xs">
          Restricted by current role.
        </p>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "bg-muted/40 border-dashed flex min-h-[280px] items-center justify-center p-8 text-center",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="bg-brand-charcoal/5 text-brand-charcoal/50 flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </div>
        <p className="text-brand-charcoal/70 font-serif text-base">{label}</p>
        <p className="text-muted-foreground max-w-xs text-xs">
          Financial detail is hidden for the current role. Switch to Admin,
          Project Manager, or Accountant to view this panel.
        </p>
      </div>
    </Card>
  );
}

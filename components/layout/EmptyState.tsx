import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <Card
      className={cn(
        "bg-card flex flex-col items-center justify-center gap-3 border-dashed px-6 py-12 text-center shadow-sm",
        className
      )}
    >
      <div className="border-brand-gold/40 bg-brand-gold/5 flex h-12 w-12 items-center justify-center rounded-full border-2">
        <Icon className="text-brand-gold h-5 w-5" />
      </div>
      <h3 className="text-brand-navy font-serif text-lg">{title}</h3>
      {description && (
        <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </Card>
  );
}

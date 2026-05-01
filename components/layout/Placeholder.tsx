import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface PlaceholderProps {
  icon: ReactNode;
  message?: string;
}

export function Placeholder({ icon, message = "This module is scaffolded — content arrives in the next iteration." }: PlaceholderProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="bg-brand-gold/10 text-brand-gold flex h-14 w-14 items-center justify-center rounded-full">
          {icon}
        </div>
        <p className="text-muted-foreground max-w-md text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

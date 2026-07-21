"use client";

// FIN-3 — the statement's only interactive bit. Kept as its own client
// component so the statement page itself stays a server component.

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
      <Printer className="mr-1 h-3.5 w-3.5" />
      Print
    </Button>
  );
}

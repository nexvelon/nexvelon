"use client";

import { Shield, ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRole } from "@/lib/role-context";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const ROLES: Role[] = [
  "Admin",
  "SalesRep",
  "ProjectManager",
  "Technician",
  "Subcontractor",
  "Accountant",
  "ViewOnly",
];

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className:
            "border-brand-gold/40 text-brand-charcoal hover:bg-brand-gold/10 gap-2",
        })}
      >
        <Shield className="text-brand-gold h-3.5 w-3.5" />
        <span className="font-medium">Role:</span>
        <span>{ROLE_LABELS[role]}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-serif">
          Switch demo role
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLES.map((r) => (
          <DropdownMenuItem
            key={r}
            onClick={() => setRole(r)}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-medium">{ROLE_LABELS[r]}</span>
              {r === role && (
                <span className="text-brand-gold text-xs font-semibold">
                  ACTIVE
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-xs">
              {ROLE_DESCRIPTIONS[r]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

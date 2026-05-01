"use client";

import { useRouter } from "next/navigation";
import {
  CircleHelp,
  LogOut,
  RefreshCcw,
  Settings,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRole } from "@/lib/role-context";
import { ROLE_LABELS } from "@/lib/permissions";
import { currentUser } from "@/lib/mock-data/users";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AvatarMenu() {
  const router = useRouter();
  const { role } = useRole();

  const signOut = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("nexvelon:role");
    }
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:ring-brand-gold/40 inline-flex items-center gap-3 rounded-full transition hover:ring-2">
        <div className="hidden text-right md:block">
          <p className="text-brand-charcoal text-sm font-medium leading-tight">
            {currentUser.name}
          </p>
          <p className="text-muted-foreground text-[10px] leading-tight">
            {ROLE_LABELS[role]}
          </p>
        </div>
        <Avatar className="ring-brand-gold/40 h-9 w-9 ring-2">
          <AvatarFallback
            style={{ backgroundColor: currentUser.avatarColor }}
            className="text-xs font-semibold text-white"
          >
            {initials(currentUser.name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="text-brand-charcoal text-xs font-semibold leading-tight">
            {currentUser.name}
          </p>
          <p className="text-muted-foreground text-[10px] leading-tight">
            {currentUser.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/users")}>
          <UserRound className="mr-2 h-3.5 w-3.5" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings className="mr-2 h-3.5 w-3.5" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/dashboard")}>
          <RefreshCcw className="mr-2 h-3.5 w-3.5" />
          Switch Workspace
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CircleHelp className="mr-2 h-3.5 w-3.5" />
          Help & Documentation
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-red-600">
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

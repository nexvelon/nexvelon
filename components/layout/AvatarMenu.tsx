"use client";

import { useRouter } from "next/navigation";
import {
  CircleHelp,
  LogOut,
  RefreshCcw,
  Settings,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/AuthProvider";

export function AvatarMenu({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = () => {
    signOut();
    toast.success("Signed out successfully.");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:ring-brand-gold/40 inline-flex items-center rounded-full transition hover:ring-2">
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="text-brand-charcoal text-xs font-semibold leading-tight">
            {user?.name ?? "Signed in"}
          </p>
          <p className="text-muted-foreground text-[10px] leading-tight">
            {user?.email ?? ""}
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
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { GlobalCommandPalette } from "./GlobalCommandPalette";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <Sidebar />
      <div className="pl-64">
        <TopBar />
        <main className="px-8 py-8">{children}</main>
      </div>
      <GlobalCommandPalette />
    </div>
  );
}

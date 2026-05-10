import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

// GlobalCommandPalette is intentionally NOT mounted here. Its keydown
// listener (⌘K / Ctrl+K) and its mock-data imports were the same crash
// vector that took down the TopBar search input. The component file is
// kept on disk for a future rebuild once the modules it indexes are
// DB-wired; do not re-import without first replacing its data sources.

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <Sidebar />
      <div className="pl-64">
        <TopBar />
        <main className="px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <Sidebar />
      <div className="pl-52">
        <TopBar />
        <main className="px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

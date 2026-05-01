import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quotes",
  description:
    "Manage proposals from draft to project conversion — sectioned quote builder with live PDF preview.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

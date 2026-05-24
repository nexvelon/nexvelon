// CL-9 — Server component entry for the full-screen client-creation page.
// (app)/layout.tsx already gates the route group on an authenticated session
// + a usable profile, so we don't re-check here. This file exists mainly to
// follow the /quotes/new precedent (RSC wrapper → "use client" view) and to
// give us a server boundary for any future server-fetched data the create
// form might need (e.g., account-manager picker pre-load).

import { NewClientPageClient } from "./NewClientPageClient";

export const dynamic = "force-dynamic";

export default function NewClientPage() {
  return <NewClientPageClient />;
}

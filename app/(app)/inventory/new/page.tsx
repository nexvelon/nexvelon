// INV-2b — server component entry for the full-screen product-creation page.
// (app)/layout.tsx already gates the route group on an authenticated session,
// so we don't re-check here. Follows the /clients/new precedent: RSC wrapper →
// "use client" view → shared ProductForm.

import { NewProductPageClient } from "./NewProductPageClient";

export const dynamic = "force-dynamic";

export default function NewProductPage() {
  return <NewProductPageClient />;
}

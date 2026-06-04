"use client";

// INV-2b — full-screen product-creation page. Renders the shared <ProductForm>
// in a max-w-4xl container (mirrors NewClientPageClient). Submit success →
// router.push to /inventory/${newId} so the operator lands on the new product's
// detail page. Cancel → /inventory.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductForm } from "@/components/modules/inventory/ProductForm";

export function NewProductPageClient() {
  const router = useRouter();
  return (
    <div className="space-y-5">
      <Link
        href="/inventory"
        className="text-muted-foreground hover:text-foreground inline-block text-sm"
      >
        ← Back to Inventory
      </Link>
      <PageHeader
        eyebrow="New product"
        title="Add a product"
        description="Create a catalog product. Stock units are received separately once the product exists."
      />
      <div className="max-w-4xl">
        <ProductForm
          mode={{ kind: "create" }}
          onSubmitSuccess={(id) => router.push(`/inventory/${id}`)}
          onCancel={() => router.push("/inventory")}
        />
      </div>
    </div>
  );
}

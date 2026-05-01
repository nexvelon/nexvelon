"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { BuilderHeader } from "./BuilderHeader";
import { ClientSiteCard } from "./ClientSiteCard";
import { QuoteDetailsCard } from "./QuoteDetailsCard";
import { SectionCard } from "./SectionCard";
import { CommandPalette } from "./CommandPalette";
import { TotalsBar } from "./TotalsBar";
import { NotesCard, InternalNotesCard } from "./NotesCards";
import { ReadOnlyBanner } from "./ReadOnlyBanner";
import { PdfPreviewPane } from "./PdfPreviewPane";

import {
  DEFAULT_TAX_RATE,
  DEFAULT_TERMS,
  SECTION_PRESETS,
  emptyLineItem,
  newId,
  quoteTotals,
  recalcLineItem,
} from "@/lib/quote-helpers";
import { upsertQuote, useQuotes } from "@/lib/quote-store";
import { useReadOnly } from "@/lib/use-read-only";
import { clients } from "@/lib/mock-data/clients";
import { sites as ALL_SITES, sitesForClient } from "@/lib/mock-data/sites";
import { users } from "@/lib/mock-data/users";
import { projects } from "@/lib/mock-data/projects";
import type {
  BuilderLineItem,
  PaymentTerms,
  Product,
  Quote,
  QuoteProjectType,
  QuoteSection,
  QuoteStatus,
} from "@/lib/types";

interface Props {
  initial: Quote;
  isNew: boolean;
}

export function QuoteBuilder({ initial, isNew }: Props) {
  const router = useRouter();
  useQuotes(); // subscribe to store updates so the builder re-renders if state changes elsewhere
  const [saving, setSaving] = useState(false);

  const [number] = useState(initial.number);
  const [status, setStatus] = useState<QuoteStatus>(initial.status);
  const [name, setName] = useState(initial.name ?? "");
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [siteId, setSiteId] = useState(initial.siteId ?? "");
  const [validUntil, setValidUntil] = useState(initial.expiresAt);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(
    initial.paymentTerms ?? "Net 30"
  );
  const [taxRatePct, setTaxRatePct] = useState<number>(
    (initial.taxRate ?? DEFAULT_TAX_RATE) * 100
  );
  const [ownerId, setOwnerId] = useState(initial.ownerId);
  const [projectType, setProjectType] = useState<QuoteProjectType>(
    initial.projectType ?? "New Install"
  );
  const [sections, setSections] = useState<QuoteSection[]>(initial.sections ?? []);
  const [terms, setTerms] = useState<string>(initial.terms ?? DEFAULT_TERMS);
  const [internalNotes, setInternalNotes] = useState<string>(
    initial.internalNotes ?? ""
  );
  const [discount, setDiscount] = useState<number>(initial.discount ?? 0);
  const [discountType, setDiscountType] = useState<"pct" | "amount">(
    initial.discountType ?? "pct"
  );
  const [presetSection, setPresetSection] = useState<string>(SECTION_PRESETS[0]);

  const ro = useReadOnly(status);

  // Auto-pick first site when client changes and current site no longer fits.
  useEffect(() => {
    if (!clientId) return;
    const valid = sitesForClient(clientId).map((s) => s.id);
    if (!valid.includes(siteId) && valid.length > 0) {
      setSiteId(valid[0]);
    }
  }, [clientId, siteId]);

  const client = clients.find((c) => c.id === clientId);
  const site = ALL_SITES.find((s) => s.id === siteId);
  const owner = users.find((u) => u.id === ownerId);

  const owners = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === "SalesRep" ||
          u.role === "ProjectManager" ||
          u.role === "Admin"
      ),
    []
  );

  const updateSection = (next: QuoteSection) =>
    setSections((prev) =>
      prev.map((s) => (s.id === next.id ? next : s))
    );

  const addSection = (suggestedName: string) => {
    const name = suggestedName.trim() || "New section";
    setSections((prev) => [
      ...prev,
      { id: newId("sec"), name, items: [emptyLineItem()] },
    ]);
  };

  const removeSection = (id: string) =>
    setSections((prev) => prev.filter((s) => s.id !== id));

  const moveSection = (id: string, dir: "up" | "down") => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const targetIdx = dir === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const moveItemToSection = (itemId: string, targetSectionId: string) => {
    setSections((prev) => {
      let moving: BuilderLineItem | undefined;
      const stripped = prev.map((s) => {
        const found = s.items.find((it) => it.id === itemId);
        if (found) {
          moving = found;
          return { ...s, items: s.items.filter((it) => it.id !== itemId) };
        }
        return s;
      });
      if (!moving) return prev;
      const item = moving;
      return stripped.map((s) =>
        s.id === targetSectionId ? { ...s, items: [...s.items, item] } : s
      );
    });
  };

  const addProductFromPalette = (sectionId: string, p: Product) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: [
                ...s.items,
                recalcLineItem({
                  id: newId("li"),
                  type: "product",
                  productId: p.id,
                  vendor: p.vendor,
                  sku: p.sku,
                  description: p.name,
                  qty: 1,
                  unitCost: p.cost,
                  markup: 30,
                  unitPrice: 0,
                }),
              ],
            }
          : s
      )
    );
    toast.success(`Added ${p.sku}`);
  };

  const persist = (nextStatus: QuoteStatus = status): Quote => {
    const totals = quoteTotals(sections, taxRatePct / 100, discount, discountType);
    const out: Quote = {
      id: initial.id,
      number,
      name,
      clientId,
      siteId,
      projectId: initial.projectId,
      projectType,
      status: nextStatus,
      createdAt: initial.createdAt,
      expiresAt: validUntil,
      ownerId,
      paymentTerms,
      taxRate: taxRatePct / 100,
      sections,
      items: sections.flatMap((s) =>
        s.items
          .filter((it) => it.type === "product" && it.productId)
          .map((it) => ({
            productId: it.productId!,
            qty: it.qty,
            unitPrice: it.unitPrice,
          }))
      ),
      terms,
      internalNotes,
      discount,
      discountType,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    };
    return out;
  };

  const handleSaveDraft = () => {
    if (ro.readOnly) return;
    setSaving(true);
    const next = persist();
    upsertQuote(next);
    setTimeout(() => {
      setSaving(false);
      toast.success(`${number} saved`, {
        description: `Status: ${next.status}. Total ${formatBrief(next.total)}.`,
      });
      if (isNew) router.push(`/quotes/${next.id}`);
    }, 250);
  };

  const handleSend = () => {
    if (ro.readOnly || status !== "Draft") return;
    const next = persist("Sent");
    upsertQuote(next);
    setStatus("Sent");
    toast.success(`${number} sent for approval`, {
      description: "Client copy queued; status moved to Sent.",
    });
  };

  const handlePreview = () => {
    const target = document.getElementById("pdf-preview-pane");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleConvert = () => {
    if (status !== "Approved") return;
    const yearProjects = projects.filter((p) =>
      p.code.includes(`-${new Date().getFullYear()}-`)
    );
    const projectCode = `NX-${new Date().getFullYear()}-${(
      yearProjects.length +
      16 +
      Math.floor(Math.random() * 100)
    )
      .toString()
      .padStart(3, "0")}`;
    const next = persist("Converted");
    next.projectId = projectCode;
    upsertQuote(next);
    setStatus("Converted");
    toast.success(`Converted to ${projectCode}`, {
      description: "Project created and linked. Quote is now read-only.",
    });
  };

  return (
    <div className="space-y-6">
      <BuilderHeader
        number={number}
        status={status}
        saving={saving}
        disabled={ro.readOnly}
        onSaveDraft={handleSaveDraft}
        onSend={handleSend}
        onPreview={handlePreview}
        onConvert={handleConvert}
      />

      <CommandPalette
        sections={sections}
        onAddProductToSection={addProductFromPalette}
      />

      <ReadOnlyBanner state={ro} quote={{ ...initial, status, projectId: initial.projectId }} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <ClientSiteCard
            clients={clients}
            clientId={clientId}
            siteId={siteId}
            onClientChange={setClientId}
            onSiteChange={setSiteId}
            disabled={ro.readOnly}
          />

          <QuoteDetailsCard
            name={name}
            validUntil={validUntil}
            paymentTerms={paymentTerms}
            taxRatePct={taxRatePct}
            ownerId={ownerId}
            projectType={projectType}
            owners={owners}
            disabled={ro.readOnly}
            onChange={(patch) => {
              if (patch.name !== undefined) setName(patch.name);
              if (patch.validUntil !== undefined) setValidUntil(patch.validUntil);
              if (patch.paymentTerms !== undefined) setPaymentTerms(patch.paymentTerms);
              if (patch.taxRatePct !== undefined) setTaxRatePct(patch.taxRatePct);
              if (patch.ownerId !== undefined) setOwnerId(patch.ownerId);
              if (patch.projectType !== undefined) setProjectType(patch.projectType);
            }}
          />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-brand-navy font-serif text-xl">
                Sections & Line Items
              </h2>
              <div className="flex items-center gap-2">
                <Select
                  value={presetSection}
                  onValueChange={(v) => setPresetSection(v ?? SECTION_PRESETS[0])}
                  disabled={ro.readOnly}
                >
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={ro.readOnly}
                  onClick={() => addSection(presetSection)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add section
                </Button>
              </div>
            </div>

            {sections.length === 0 && (
              <div className="bg-card rounded-md border border-dashed border-[var(--border)] p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Start by adding a section. The first preset is{" "}
                  <span className="text-brand-charcoal font-medium">
                    {SECTION_PRESETS[0]}
                  </span>
                  .
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => addSection(presetSection)}
                  disabled={ro.readOnly}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add first section
                </Button>
                <p className="text-muted-foreground/70 mt-2 text-[11px]">
                  Tip: press ⌘K to add a line item from the catalog.
                </p>
              </div>
            )}

            {sections.map((s, idx) => (
              <SectionCard
                key={s.id}
                section={s}
                sections={sections}
                showCost
                disabled={ro.readOnly}
                onUpdateSection={updateSection}
                onMoveItemToSection={moveItemToSection}
                onDeleteSection={() => removeSection(s.id)}
                onMoveSection={(dir) => moveSection(s.id, dir)}
                canMoveUp={idx > 0}
                canMoveDown={idx < sections.length - 1}
              />
            ))}
          </div>

          <NotesCard
            terms={terms}
            onChange={setTerms}
            disabled={ro.readOnly}
          />

          <InternalNotesCard
            notes={internalNotes}
            onChange={setInternalNotes}
            disabled={ro.readOnly}
          />

          <TotalsBar
            sections={sections}
            taxRatePct={taxRatePct}
            discount={discount}
            discountType={discountType}
            onChangeDiscount={setDiscount}
            onChangeDiscountType={setDiscountType}
            disabled={ro.readOnly}
          />

          <p className="text-muted-foreground text-center text-[11px]">
            Press <kbd className="bg-muted rounded border px-1 text-[10px]">⌘K</kbd>{" "}
            to add line items by SKU. Drag rows to reorder. Currency formats on blur.
          </p>
        </div>

        <div className="lg:col-span-2" id="pdf-preview-pane">
          <div className="sticky top-32 h-[calc(100vh-9rem)]">
            <PdfPreviewPane
              number={number}
              name={name}
              createdAt={initial.createdAt}
              validUntil={validUntil}
              paymentTerms={paymentTerms}
              projectType={projectType}
              client={client}
              site={site}
              owner={owner}
              sections={sections}
              taxRatePct={taxRatePct}
              discount={discount}
              discountType={discountType}
              terms={terms}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBrief(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

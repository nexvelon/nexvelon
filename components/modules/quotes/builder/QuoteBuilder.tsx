"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
import { DocumentStyleCard } from "./DocumentStyleCard";
import { SchedulesCard } from "./SchedulesCard";
import { SectionCard } from "./SectionCard";
import { CommandPalette } from "./CommandPalette";
import { TotalsBar } from "./TotalsBar";
import { NotesCard, InternalNotesCard } from "./NotesCards";
import { ReadOnlyBanner } from "./ReadOnlyBanner";
import { PdfPreviewPane } from "./PdfPreviewPane";

import {
  DEFAULT_TAX_RATE,
  DEFAULT_TERMS,
  DEFAULT_TERMS_GUARDIAN,
  DEFAULT_TERMS_BY_TEMPLATE,
  SECTION_PRESETS,
  emptyLineItem,
  newId,
  quoteTotals,
  readLastUsedThemeSlug,
  recalcLineItem,
  writeLastUsedThemeSlug,
} from "@/lib/quote-helpers";
import {
  DEFAULT_QUOTE_THEME_SLUG,
  type QuoteThemeSlug,
} from "@/lib/quote-themes";
import {
  DEFAULT_QUOTE_TEMPLATE_SLUG,
  type QuoteTemplateSlug,
} from "@/lib/company-profile";
import {
  createDefaultSchedules,
  createGuardianDefaultSchedules,
  GUARDIAN_ONLY_KINDS,
  type DrawingsScheduleInstance,
  type QuoteScheduleInstance,
} from "@/lib/quote-schedules";
import { upsertQuote, useQuotes } from "@/lib/quote-store";
import { AttachmentsSection } from "@/components/modules/attachments/AttachmentsSection";
import { useReadOnly } from "@/lib/use-read-only";
import { useRole } from "@/lib/role-context";
import { clients as MOCK_CLIENTS } from "@/lib/mock-data/clients";
import {
  sites as MOCK_SITES,
  sitesForClient as mockSitesForClient,
} from "@/lib/mock-data/sites";
import { users as MOCK_USERS } from "@/lib/mock-data/users";
import { projects } from "@/lib/mock-data/projects";
import type {
  BuilderLineItem,
  Client,
  PaymentTerms,
  Product,
  Quote,
  QuoteProjectType,
  QuoteSection,
  QuoteStatus,
  Site,
  User,
} from "@/lib/types";
import type { LineItemClassification } from "@/lib/classifications";
import {
  listProductsAction,
  commitStockUnitAction,
} from "@/app/(app)/inventory/actions";
import { CatalogProductsContext } from "./catalog-context";
import { OfferAddonsContext } from "./addons-context";
import { AddonPrompt, type AddonPromptData } from "./AddonPrompt";
import { CommitStockDialog } from "./CommitStockDialog";

interface Props {
  initial: Quote;
  isNew: boolean;
  // ---------------------------------------------------------------------------
  // Override props — optional. Path-1 patch (feature/quotes-path1-real-data-
  // real-letterhead): the New Quote server page now fetches real DB clients +
  // sites + the current user and passes them in. The edit-existing route
  // `/quotes/[id]/page.tsx` does NOT pass these and falls back to mock-data,
  // preserving the existing demo behaviour on that route until Quotes v1
  // ships full DB persistence.
  // ---------------------------------------------------------------------------
  clientsOverride?: Client[];
  sitesByClientOverride?: Record<string, Site[]>;
  ownerOverride?: User;
  // QB-5b: DB-backed classifications, prop-drilled from the /quotes/new RSC.
  // Optional — the /quotes/[id] client route doesn't supply it and the
  // synchronous classificationsFor() falls back to the hardcoded seed.
  classifications?: LineItemClassification[];
  // G2: per-entity default Terms keyed by template slug. Used to seed a new
  // quote's terms and to swap terms when the entity changes (only when the
  // current terms are an unedited default). Optional — falls back to the
  // in-code DEFAULT_TERMS_BY_TEMPLATE map when not supplied (e.g. legacy paths).
  defaultTermsByTemplate?: Record<QuoteTemplateSlug, string>;
}

export function QuoteBuilder({
  initial,
  isNew,
  clientsOverride,
  sitesByClientOverride,
  ownerOverride,
  classifications,
  defaultTermsByTemplate,
}: Props) {
  const router = useRouter();
  // Effective per-entity terms map: server-resolved values when provided,
  // else the in-code defaults.
  const termsByTemplate = defaultTermsByTemplate ?? DEFAULT_TERMS_BY_TEMPLATE;
  useQuotes(); // subscribe to store updates so the builder re-renders if state changes elsewhere
  const [saving, setSaving] = useState(false);

  // INV-4: fetch the real inventory catalog once so SKU search + the command
  // palette run against live products (the mock array is empty). Best-effort —
  // on failure the catalog stays empty and the builder still works (free-text
  // SKU entry). Provided via CatalogProductsContext to the nested consumers.
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  // D-2: the add-ons prompt (null = closed).
  const [addonPrompt, setAddonPrompt] = useState<AddonPromptData | null>(null);
  // F-3b: the commit-stock dialog.
  const [commitOpen, setCommitOpen] = useState(false);
  useEffect(() => {
    let active = true;
    listProductsAction()
      .then((rows) => {
        if (active) setCatalogProducts(rows);
      })
      .catch(() => {
        // leave catalog empty; SKU autocomplete falls back to free-text entry
      });
    return () => {
      active = false;
    };
  }, []);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  // Resolve picker data sources: real DB data when provided, else mock-data
  // for the legacy /quotes/[id] edit flow.
  const clients: Client[] = clientsOverride ?? MOCK_CLIENTS;
  const allSites: Site[] = sitesByClientOverride
    ? Object.values(sitesByClientOverride).flat()
    : MOCK_SITES;
  const sitesForClient = (cid: string): Site[] =>
    sitesByClientOverride
      ? (sitesByClientOverride[cid] ?? [])
      : mockSitesForClient(cid);
  const users: User[] = ownerOverride ? [ownerOverride] : MOCK_USERS;

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
  // Prepared-by display override (falls back to the owner's name when blank).
  const [preparedBy, setPreparedBy] = useState(initial.preparedBy ?? "");
  const [projectType, setProjectType] = useState<QuoteProjectType>(
    initial.projectType ?? "New Install"
  );
  const [sections, setSections] = useState<QuoteSection[]>(initial.sections ?? []);
  // Seed from the quote's saved terms when present (existing quotes), else from
  // the selected entity's default (new quotes). NewQuotePageClient already sets
  // initial.terms to the default entity's value, so the fallback below mainly
  // guards the legacy /quotes/[id] path and any quote without terms.
  const [terms, setTerms] = useState<string>(
    initial.terms ??
      termsByTemplate[initial.templateSlug ?? DEFAULT_QUOTE_TEMPLATE_SLUG] ??
      termsByTemplate.integrated_solutions
  );
  const [internalNotes, setInternalNotes] = useState<string>(
    initial.internalNotes ?? ""
  );
  const [discount, setDiscount] = useState<number>(initial.discount ?? 0);
  const [discountType, setDiscountType] = useState<"pct" | "amount">(
    initial.discountType ?? "pct"
  );
  const [presetSection, setPresetSection] = useState<string>(SECTION_PRESETS[0]);

  // Chunk F additions — document style + schedules manager state.
  // Initial themeSlug honours the last-used theme from localStorage if the
  // quote draft doesn't already carry one (so a fresh "New Quote" reopens
  // with the operator's most-recent pick).
  const [templateSlug, setTemplateSlug] = useState<QuoteTemplateSlug>(
    initial.templateSlug ?? DEFAULT_QUOTE_TEMPLATE_SLUG
  );
  const [themeSlug, setThemeSlug] = useState<QuoteThemeSlug>(() => {
    if (initial.themeSlug) return initial.themeSlug;
    const last = readLastUsedThemeSlug();
    return last ?? DEFAULT_QUOTE_THEME_SLUG;
  });
  const [showUnitPrice, setShowUnitPrice] = useState<boolean>(
    initial.showUnitPrice ?? false
  );
  const [showVendor, setShowVendor] = useState<boolean>(
    initial.showVendor ?? false
  );
  const [showSku, setShowSku] = useState<boolean>(initial.showSku ?? false);
  const [showUpc, setShowUpc] = useState<boolean>(initial.showUpc ?? false);
  const [showMasterPart, setShowMasterPart] = useState<boolean>(
    initial.showMasterPart ?? false
  );
  const [showName, setShowName] = useState<boolean>(
    initial.showName ?? true
  );
  const [showDescription, setShowDescription] = useState<boolean>(
    initial.showDescription ?? true
  );
  const [schedules, setSchedules] = useState<QuoteScheduleInstance[]>(
    initial.schedules ?? createDefaultSchedules()
  );

  // QD-2 Phase 5c — ephemeral cache of rendered drawing-PDF pages, keyed by
  // Storage path. NOT persisted (data URLs are 1–3 MB each; would blow the
  // ~5 MB localStorage cap). Re-derived on mount from the schedule's pdfPath.
  const [drawingsImagesByPath, setDrawingsImagesByPath] = useState<
    Record<string, string[]>
  >({});
  const [drawingsLoadingPaths, setDrawingsLoadingPaths] = useState<Set<string>>(
    new Set()
  );

  const handleThemeChange = (slug: QuoteThemeSlug) => {
    setThemeSlug(slug);
    writeLastUsedThemeSlug(slug);
  };

  // G2: switching entity (template) re-seeds the Terms — but ONLY when the
  // current terms are an unedited default (or empty). If the user has
  // customized the terms, they are preserved across the switch.
  const handleTemplateChange = (next: QuoteTemplateSlug) => {
    setTemplateSlug(next);
    // G2: swap the terms when they are still an unedited default (or empty).
    const knownDefaults = new Set([
      termsByTemplate.integrated_solutions,
      termsByTemplate.guardian,
      DEFAULT_TERMS,
      DEFAULT_TERMS_GUARDIAN,
      "",
    ]);
    const current = terms ?? "";
    if (knownDefaults.has(current) || knownDefaults.has(current.trim())) {
      setTerms(termsByTemplate[next]);
    }

    // GF-5: switching TO Guardian auto-assembles its four sections — but only
    // when none are already present, so a deliberately-removed section is not
    // forced back on a later switch. Never duplicates; never removes anything
    // when switching away (QuoteDocument entity-scopes the render instead).
    if (next === "guardian") {
      const hasGuardianSection = schedules.some((s) =>
        GUARDIAN_ONLY_KINDS.includes(s.kind)
      );
      if (!hasGuardianSection) {
        let insertAt = schedules.findIndex((s) => s.kind === "agreement");
        if (insertAt === -1)
          insertAt = schedules.findIndex((s) => s.kind === "acceptance");
        if (insertAt === -1) insertAt = schedules.length;
        setSchedules([
          ...schedules.slice(0, insertAt),
          ...createGuardianDefaultSchedules(),
          ...schedules.slice(insertAt),
        ]);
      }
    }
  };

  const ro = useReadOnly(status);
  const { role } = useRole();
  const isAdmin = role === "Admin";
  const canReopen = isAdmin && (status === "Sent" || status === "Approved");

  // Auto-pick first site when client changes and current site no longer fits.
  useEffect(() => {
    if (!clientId) return;
    const valid = sitesForClient(clientId).map((s) => s.id);
    if (!valid.includes(siteId) && valid.length > 0) {
      setSiteId(valid[0]);
    }
    // sitesForClient is a stable closure over sitesByClientOverride; depending
    // on the override (not the function ref) avoids infinite re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, siteId, sitesByClientOverride]);

  // QD-2 Phase 5c — render any drawings schedule's uploaded PDF to images.
  // Watches `schedules`; renders each pdfPath once (skips cached + in-flight).
  useEffect(() => {
    const drawingsSchedules = schedules.filter(
      (s): s is DrawingsScheduleInstance => s.kind === "drawings"
    );
    const toRender = drawingsSchedules.filter(
      (s) =>
        s.pdfPath &&
        !drawingsImagesByPath[s.pdfPath] &&
        !drawingsLoadingPaths.has(s.pdfPath)
    );
    if (toRender.length === 0) return;

    toRender.forEach(async (schedule) => {
      const path = schedule.pdfPath!;
      setDrawingsLoadingPaths((prev) => new Set(prev).add(path));
      try {
        const { getSignedDrawingsUrl } = await import("@/lib/api/drawings");
        const { renderPdfToImages } = await import(
          "@/lib/quote-drawings-render"
        );
        const signedUrl = await getSignedDrawingsUrl(path);
        const images = await renderPdfToImages(signedUrl);
        setDrawingsImagesByPath((prev) => ({ ...prev, [path]: images }));
      } catch (e) {
        console.error("[Drawings] Failed to render PDF:", e);
        toast.error(
          e instanceof Error ? e.message : "Failed to load drawings"
        );
      } finally {
        setDrawingsLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    });
    // drawingsImagesByPath / drawingsLoadingPaths are read as latest-snapshot
    // guards; keying only on `schedules` is intentional (avoids re-run loops).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules]);

  const client = clients.find((c) => c.id === clientId);
  const site = allSites.find((s) => s.id === siteId);
  const owner = users.find((u) => u.id === ownerId);

  const owners = useMemo(
    () =>
      ownerOverride
        ? // Path-1 patch: server-side already resolved the current user; the
          // owner dropdown shows only them. Multi-user owner selection
          // returns with Quotes v1.
          [ownerOverride]
        : MOCK_USERS.filter(
            (u) =>
              u.role === "SalesRep" ||
              u.role === "ProjectManager" ||
              u.role === "Admin"
          ),
    [ownerOverride]
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
                  // CAT-2: snapshot part identifiers from the product at add-time.
                  upc: p.upc,
                  masterPartNumber: p.masterPartNumber,
                  name: p.name,
                  description: "",
                  classification: "Materials",
                  qty: 1,
                  unitCost: p.cost,
                  margin: 40,
                  unitPrice: 0,
                }),
              ],
            }
          : s
      )
    );
    toast.success(`Added ${p.sku}`);
  };

  // D-2: after a USER adds a part, offer its companion add-ons. Resolves
  // part-kind add-on refs (UUIDs) to catalog Products (skipping deleted/
  // unresolvable ones), collects text reminders, and opens the prompt only when
  // something remains. Never called for companion adds → no cascade/recursion.
  const maybeOfferAddons = (sectionId: string, p: Product) => {
    if (!p.notifyAddons || !p.addons || p.addons.length === 0) return;

    const byId = new Map(catalogProducts.map((cp) => [cp.id, cp]));
    const section = sections.find((s) => s.id === sectionId);
    const presentIds = new Set(
      (section?.items ?? [])
        .filter((it) => it.type === "product" && it.productId)
        .map((it) => it.productId as string)
    );

    const parts: AddonPromptData["parts"] = [];
    const texts: string[] = [];
    const seen = new Set<string>();
    for (const entry of p.addons) {
      if (entry.kind === "text") {
        if (entry.value.trim()) texts.push(entry.value);
        continue;
      }
      // part-kind: resolve UUID → catalog product, skip unresolved + dupes.
      const prod = byId.get(entry.value);
      if (!prod || seen.has(prod.id)) continue;
      seen.add(prod.id);
      parts.push({ product: prod, alreadyInSection: presentIds.has(prod.id) });
    }

    if (parts.length === 0 && texts.length === 0) return;
    setAddonPrompt({ sectionId, productName: p.name, parts, texts });
  };

  // Insert the user-selected companions into the SAME section. Routes through
  // addProductFromPalette (NOT maybeOfferAddons) so companions never re-prompt.
  const confirmAddons = (sectionId: string, products: Product[]) => {
    for (const prod of products) addProductFromPalette(sectionId, prod);
    setAddonPrompt(null);
  };

  const persist = (
    nextStatus: QuoteStatus = status,
    sectionsOverride?: QuoteSection[]
  ): Quote => {
    const secs = sectionsOverride ?? sections;
    const totals = quoteTotals(secs, taxRatePct / 100, discount, discountType);
    const out: Quote = {
      id: initial.id,
      number,
      name,
      clientId,
      siteId,
      projectId: initial.projectId,
      projectType,
      preparedBy: preparedBy.trim() || undefined,
      status: nextStatus,
      createdAt: initial.createdAt,
      expiresAt: validUntil,
      ownerId,
      paymentTerms,
      taxRate: taxRatePct / 100,
      sections: secs,
      items: secs.flatMap((s) =>
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
      // Chunk F additions — operator-controlled document style + schedules.
      themeSlug,
      templateSlug,
      showUnitPrice,
      showVendor,
      showSku,
      showUpc,
      showMasterPart,
      showName,
      showDescription,
      schedules,
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
    toast.success(`${number} submitted for approval`);
  };

  // F-3a: Sent -> Approved. Mirrors handleSend; gated in the header by the
  // quotes:approve permission. No stock changes here (decrement is F-3b).
  const handleApprove = () => {
    if (status !== "Sent") return;
    const next = persist("Approved");
    upsertQuote(next);
    setStatus("Approved");
    toast.success(`${number} approved`, {
      description: "Status moved to Approved — ready to convert.",
    });
  };

  // Chunk 3a: Admin-only reopen Sent/Approved → Draft so it's editable by all
  // roles again (must be re-approved before it's ready). Forward-only re: stock
  // — committed units are NOT returned.
  const handleReopen = () => {
    if (!canReopen) return;
    if (
      !window.confirm(
        "Move this quote back to Draft? It will be editable by all roles and must be re-approved before it's ready to send. This does not return any committed stock."
      )
    ) {
      return;
    }
    const next = persist("Draft");
    upsertQuote(next);
    setStatus("Draft");
    toast.success(`${number} reopened — back to Draft`);
  };

  const handlePreview = () => {
    const target = document.getElementById("pdf-preview-pane");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // F-3b: commit (consume) stock for pinned, not-yet-committed product lines.
  // Only lines whose id is in `lineIds` are considered. Each successful commit
  // stamps committedStockId on the line (idempotent — committed lines are
  // skipped). Re-saves the quote so the marker persists, toasts a summary, and
  // returns the updated sections so callers (handleConvert) can persist in one
  // flow. Never re-commits; never over-consumes (the API aborts a short line).
  const commitLines = async (
    lineIds: string[],
    nextStatus: QuoteStatus = status
  ): Promise<QuoteSection[]> => {
    const targets = new Set(lineIds);
    let committed = 0;
    const errors: string[] = [];
    const committedFor: Record<string, string> = {}; // lineId -> stockUnitId

    for (const sec of sections) {
      for (const it of sec.items) {
        if (!targets.has(it.id)) continue;
        if (it.type !== "product" || !it.stockUnitId || it.committedStockId)
          continue;
        const res = await commitStockUnitAction(
          it.stockUnitId,
          it.productId!,
          it.qty,
          number
        );
        if (res.ok) {
          committed++;
          committedFor[it.id] = it.stockUnitId;
        } else {
          errors.push(`${it.sku ?? it.name}: ${res.error}`);
        }
      }
    }

    // Apply committedStockId markers to the sections.
    const updated = sections.map((sec) => ({
      ...sec,
      items: sec.items.map((it) =>
        committedFor[it.id]
          ? { ...it, committedStockId: committedFor[it.id] }
          : it
      ),
    }));

    if (committed > 0) {
      setSections(updated);
      upsertQuote(persist(nextStatus, updated));
    }

    if (committed > 0 || errors.length > 0) {
      const parts: string[] = [];
      if (committed > 0) parts.push(`Committed ${committed} line${committed === 1 ? "" : "s"}`);
      if (errors.length > 0) parts.push(`${errors.length} skipped`);
      if (errors.length > 0) {
        toast.warning(parts.join("; "), { description: errors[0] });
      } else {
        toast.success(parts.join("; "));
      }
    }

    return updated;
  };

  // All pinned, not-yet-committed product line ids across the quote.
  const pinnedUncommittedLineIds = (): string[] =>
    sections.flatMap((s) =>
      s.items
        .filter(
          (it) =>
            it.type === "product" && it.stockUnitId && !it.committedStockId
        )
        .map((it) => it.id)
    );

  const handleConvert = async () => {
    if (status !== "Approved") return;
    // F-3b: auto-commit any pinned-uncommitted lines before finalizing the
    // conversion (idempotent — already-committed lines are skipped). Use the
    // returned sections so the converted quote persists with the markers.
    const committedSections = await commitLines(
      pinnedUncommittedLineIds(),
      "Converted"
    );
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
    const next = persist("Converted", committedSections);
    next.projectId = projectCode;
    upsertQuote(next);
    setStatus("Converted");
    toast.success(`Converted to ${projectCode}`, {
      description: "Project created and linked. Quote is now read-only.",
    });
  };

  return (
    <CatalogProductsContext.Provider value={catalogProducts}>
    <OfferAddonsContext.Provider value={maybeOfferAddons}>
    <div className="space-y-6">
      <BuilderHeader
        number={number}
        status={status}
        saving={saving}
        disabled={ro.readOnly}
        onSaveDraft={handleSaveDraft}
        onSend={handleSend}
        onApprove={handleApprove}
        onPreview={handlePreview}
        onConvert={handleConvert}
        onCommitStock={() => setCommitOpen(true)}
        onReopen={handleReopen}
        canReopen={canReopen}
      />

      <CommandPalette
        sections={sections}
        onAddProductToSection={(sectionId, p) => {
          addProductFromPalette(sectionId, p);
          maybeOfferAddons(sectionId, p);
        }}
      />

      <ReadOnlyBanner state={ro} quote={{ ...initial, status, projectId: initial.projectId }} />

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setPreviewCollapsed((c) => !c)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          {previewCollapsed ? (
            <>
              <ChevronLeft className="h-4 w-4" />
              Show PDF preview
            </>
          ) : (
            <>
              Hide PDF preview
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <div
        className={
          previewCollapsed ? "" : "grid grid-cols-1 gap-6 lg:grid-cols-5"
        }
      >
        <div
          className={
            previewCollapsed
              ? "flex flex-col gap-5"
              : "flex flex-col gap-5 lg:col-span-4"
          }
        >
          <ClientSiteCard
            clients={clients}
            sites={sitesForClient(clientId)}
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
            preparedBy={preparedBy}
            preparedByFallback={owner?.name ?? ""}
            disabled={ro.readOnly}
            onChange={(patch) => {
              if (patch.name !== undefined) setName(patch.name);
              if (patch.validUntil !== undefined) setValidUntil(patch.validUntil);
              if (patch.paymentTerms !== undefined) setPaymentTerms(patch.paymentTerms);
              if (patch.taxRatePct !== undefined) setTaxRatePct(patch.taxRatePct);
              if (patch.ownerId !== undefined) setOwnerId(patch.ownerId);
              if (patch.projectType !== undefined) setProjectType(patch.projectType);
              if (patch.preparedBy !== undefined) setPreparedBy(patch.preparedBy);
            }}
          />

          <DocumentStyleCard
            templateSlug={templateSlug}
            themeSlug={themeSlug}
            showUnitPrice={showUnitPrice}
            showVendor={showVendor}
            onShowVendorChange={setShowVendor}
            showSku={showSku}
            onShowSkuChange={setShowSku}
            showUpc={showUpc}
            onShowUpcChange={setShowUpc}
            showMasterPart={showMasterPart}
            onShowMasterPartChange={setShowMasterPart}
            showName={showName}
            onShowNameChange={setShowName}
            showDescription={showDescription}
            onShowDescriptionChange={setShowDescription}
            onTemplateChange={handleTemplateChange}
            onThemeChange={handleThemeChange}
            onShowUnitPriceChange={setShowUnitPrice}
            disabled={ro.readOnly}
            isAdmin={isAdmin}
          />

          <SchedulesCard
            schedules={schedules}
            onChange={setSchedules}
            disabled={ro.readOnly}
            isGuardian={templateSlug === "guardian"}
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
                classifications={classifications}
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

          {/* ATTACH-2: quote attachments — only on a saved (persisted) quote */}
          {!isNew ? (
            <AttachmentsSection
              entityType="quote"
              entityId={String(initial.id)}
              folders={["Documents"]}
              allowCustomFolders
              title="Attachments"
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-card p-5 text-center">
              <p className="text-muted-foreground text-sm">
                Save this quote first, then reopen it to attach files.
              </p>
            </div>
          )}

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
            to add line items by Part #. Drag rows to reorder. Currency formats on blur.
          </p>
        </div>

        {!previewCollapsed && (
          <div className="lg:col-span-1" id="pdf-preview-pane">
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
                preparedBy={preparedBy.trim() || undefined}
                sections={sections}
                taxRatePct={taxRatePct}
                discount={discount}
                discountType={discountType}
                terms={terms}
                themeSlug={themeSlug}
                templateSlug={templateSlug}
                schedules={schedules}
                showUnitPrice={showUnitPrice}
                showVendor={showVendor}
                showSku={showSku}
                showUpc={showUpc}
                showMasterPart={showMasterPart}
                showName={showName}
                showDescription={showDescription}
                drawingsImagesByPath={drawingsImagesByPath}
              />
            </div>
          </div>
        )}
      </div>

      <AddonPrompt
        key={addonPrompt ? `${addonPrompt.sectionId}-${addonPrompt.productName}` : "closed"}
        data={addonPrompt}
        onAdd={confirmAddons}
        onClose={() => setAddonPrompt(null)}
      />

      <CommitStockDialog
        key={commitOpen ? "commit-open" : "commit-closed"}
        sections={sections}
        open={commitOpen}
        onOpenChange={setCommitOpen}
        onCommit={(lineIds) => void commitLines(lineIds)}
      />
    </div>
    </OfferAddonsContext.Provider>
    </CatalogProductsContext.Provider>
  );
}

function formatBrief(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

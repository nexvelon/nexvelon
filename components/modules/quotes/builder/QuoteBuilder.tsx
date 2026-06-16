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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { BuilderHeader } from "./BuilderHeader";
import { ClientSiteCard } from "./ClientSiteCard";
import { QuoteDetailsCard } from "./QuoteDetailsCard";
import { DocumentStyleCard } from "./DocumentStyleCard";
import { SchedulesCard } from "./SchedulesCard";
import { SectionCard } from "./SectionCard";
import { CommandPalette } from "./CommandPalette";
import { TotalsBar } from "./TotalsBar";
import { NotesCard, InternalNotesCard } from "./NotesCards";
import { QuoteHistoryPanel } from "./QuoteHistoryPanel";
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
  round2,
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
import { useAuth } from "@/components/auth/AuthProvider";
import { clients as MOCK_CLIENTS } from "@/lib/mock-data/clients";
import {
  sites as MOCK_SITES,
  sitesForClient as mockSitesForClient,
} from "@/lib/mock-data/sites";
import { users as MOCK_USERS } from "@/lib/mock-data/users";
import {
  createProjectFromQuoteAction,
  listProjectsForClientAction,
  mergeQuoteIntoProjectAction,
} from "@/app/(app)/projects/actions";
import type { MergeCandidate } from "@/lib/api/projects";
import type {
  BuilderLineItem,
  Client,
  PaymentTerms,
  Product,
  Quote,
  QuoteProjectType,
  QuoteRejectionSource,
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

// QB-FIX-1 #6: trailing-edge debounce. Returns `value` only after it has stayed
// unchanged for `delayMs`; the reference is stable between updates so a
// React.memo'd consumer (PdfPreviewPane) doesn't re-render mid-typing.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
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

  const { user: authUser } = useAuth();
  const [number] = useState(initial.number);
  const [status, setStatus] = useState<QuoteStatus>(initial.status);
  // REJECT — committed rejection metadata (jsonb-persisted; banner-displayed
  // when status === "Rejected") + the dialog's draft fields.
  const [rejection, setRejection] = useState<{
    reason: string;
    source?: QuoteRejectionSource;
    rejectedAt?: string;
    rejectedByUser?: string;
  }>({
    reason: initial.rejectionReason ?? "",
    source: initial.rejectionSource,
    rejectedAt: initial.rejectedAt,
    rejectedByUser: initial.rejectedByUser,
  });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [rejectSourceDraft, setRejectSourceDraft] =
    useState<QuoteRejectionSource>("Client");
  // PROJ-2: convert dialog — New project vs. Add to existing (change order).
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertMode, setConvertMode] = useState<"new" | "existing">("new");
  const [mergeProjectId, setMergeProjectId] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [converting, setConverting] = useState(false);
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
  // APPROVAL-REOPEN: admin-only revert back to unapproved (Draft) from any
  // post-Draft awaiting/decided state — Sent, Approved, OR Rejected — so a
  // rejected quote can also re-enter the edit + re-request-approval loop.
  const canReopen =
    isAdmin &&
    (status === "Sent" || status === "Approved" || status === "Rejected");

  // QB-FIX-1 #5: do NOT auto-select a site. When the client changes, only
  // CLEAR a now-stale site (one that doesn't belong to the new client) so the
  // user must explicitly pick a site from the list — no pre-selected default.
  useEffect(() => {
    if (!clientId) return;
    const valid = sitesForClient(clientId).map((s) => s.id);
    if (siteId && !valid.includes(siteId)) {
      setSiteId("");
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

  // QB-FIX-1 #6: assemble the live PDF-preview inputs into one memoized object,
  // then hand a debounced copy to the (memoized) PdfPreviewPane. Form inputs
  // keep their own state and update instantly; the expensive @react-pdf
  // re-layout only runs ~350ms after the user stops typing. The SAVE path uses
  // the live state below — debouncing affects the preview only, never output.
  const previewProps = useMemo(
    () => ({
      number,
      name,
      createdAt: initial.createdAt,
      validUntil,
      paymentTerms,
      projectType,
      client,
      site,
      owner,
      preparedBy: preparedBy.trim() || undefined,
      sections,
      taxRatePct,
      discount,
      discountType,
      terms,
      themeSlug,
      templateSlug,
      schedules,
      showUnitPrice,
      showVendor,
      showSku,
      showUpc,
      showMasterPart,
      showName,
      showDescription,
      drawingsImagesByPath,
    }),
    [
      number,
      name,
      initial.createdAt,
      validUntil,
      paymentTerms,
      projectType,
      client,
      site,
      owner,
      preparedBy,
      sections,
      taxRatePct,
      discount,
      discountType,
      terms,
      themeSlug,
      templateSlug,
      schedules,
      showUnitPrice,
      showVendor,
      showSku,
      showUpc,
      showMasterPart,
      showName,
      showDescription,
      drawingsImagesByPath,
    ]
  );
  const deferredPreviewProps = useDebouncedValue(previewProps, 350);

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
    // PART-FORM-2: resolve the part's quote default — margin tier → fixed price
    // (list_price) → blank. Tier mode uses the line's margin model; fixed mode
    // sets the exact price (and back-derives the displayed margin); none starts
    // at $0 so the user prices it on the quote.
    let margin = 0;
    let unitPrice = 0;
    if (p.quoteDefaultMargin != null) {
      margin = p.quoteDefaultMargin;
      unitPrice =
        margin >= 100 ? p.cost : round2(p.cost / (1 - margin / 100));
    } else if (p.price > 0) {
      unitPrice = p.price;
      margin = p.cost > 0 ? round2((1 - p.cost / p.price) * 100) : 0;
    }

    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: [
                ...s.items,
                {
                  id: newId("li"),
                  type: "product" as const,
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
                  margin,
                  unitPrice,
                },
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
      // REJECT — preserve rejection metadata across normal saves.
      rejectionReason: rejection.reason || undefined,
      rejectionSource: rejection.source,
      rejectedAt: rejection.rejectedAt,
      rejectedByUser: rejection.rejectedByUser,
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

  // REJECT — open the reason+source dialog. Available from Sent/Approved to any
  // editor (gated in the header). Resets the draft fields each open.
  const openReject = () => {
    if (status !== "Sent" && status !== "Approved") return;
    setRejectReasonDraft("");
    setRejectSourceDraft("Client");
    setRejectOpen(true);
  };

  // REJECT — confirm: reason is REQUIRED. Stamps who/when, sets status =
  // Rejected, and persists the rejection metadata in the quote jsonb.
  const confirmReject = () => {
    const reason = rejectReasonDraft.trim();
    if (!reason) return;
    const rejectedAt = new Date().toISOString();
    const rejectedByUser = authUser?.name;
    const nextRejection = {
      reason,
      source: rejectSourceDraft,
      rejectedAt,
      rejectedByUser,
    };
    const base = persist("Rejected");
    const next: Quote = {
      ...base,
      rejectionReason: reason,
      rejectionSource: rejectSourceDraft,
      rejectedAt,
      rejectedByUser,
    };
    upsertQuote(next);
    setStatus("Rejected");
    setRejection(nextRejection);
    setRejectOpen(false);
    toast.success(`${number} marked as Rejected`, {
      description: `Source: ${rejectSourceDraft}.`,
    });
  };

  // Chunk 3a / APPROVAL-REOPEN: Admin-only reopen Sent/Approved/Rejected →
  // Draft so it's editable by all roles again (must be re-approved before it's
  // ready). Forward-only re: stock — committed units are NOT returned.
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

  // PROJ-2: Convert now opens a New-vs-Existing dialog. Open it and fetch the
  // eligible merge targets (same client + same opco) for Mode B.
  const handleConvert = async () => {
    if (status !== "Approved") return;
    setConvertMode("new");
    setMergeProjectId("");
    setMergeCandidates([]);
    setConvertOpen(true);
    if (clientId) {
      const cands = await listProjectsForClientAction(clientId, templateSlug);
      setMergeCandidates(cands);
    }
  };

  // PROJ-2: run the chosen conversion. KEEP the stock-commit; create/merge the
  // project BEFORE flipping the quote so a failure leaves it Approved.
  const confirmConvert = async () => {
    if (status !== "Approved") return;
    if (convertMode === "existing" && !mergeProjectId) return;
    setConverting(true);
    try {
      const committedSections = await commitLines(
        pinnedUncommittedLineIds(),
        "Converted"
      );
      const converted = persist("Converted", committedSections);
      const res =
        convertMode === "existing"
          ? await mergeQuoteIntoProjectAction(converted, mergeProjectId)
          : await createProjectFromQuoteAction(converted);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      converted.projectId = res.data.id;
      upsertQuote(converted);
      setStatus("Converted");
      setConvertOpen(false);
      toast.success(
        convertMode === "existing"
          ? `Added to ${res.data.project_number} as a change order`
          : `Converted to ${res.data.project_number}`,
        { description: "Quote is now read-only." }
      );
      router.push(`/projects/${res.data.id}`);
    } finally {
      setConverting(false);
    }
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
        onReject={openReject}
      />

      <CommandPalette
        sections={sections}
        onAddProductToSection={(sectionId, p) => {
          addProductFromPalette(sectionId, p);
          maybeOfferAddons(sectionId, p);
        }}
      />

      <ReadOnlyBanner state={ro} quote={{ ...initial, status, projectId: initial.projectId }} />

      {/* REJECT — rejection banner (reason + source + by/at) when Rejected. */}
      {status === "Rejected" && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm">
          <p className="font-medium">
            Rejected
            {rejection.source ? ` · ${rejection.source}` : ""}
          </p>
          {rejection.reason ? (
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
              {rejection.reason}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-red-700">
            {rejection.rejectedByUser ? `by ${rejection.rejectedByUser}` : ""}
            {rejection.rejectedByUser && rejection.rejectedAt ? " · " : ""}
            {rejection.rejectedAt
              ? new Date(rejection.rejectedAt).toLocaleString()
              : ""}
          </p>
          <p className="mt-1 text-[11px] text-red-700">
            An Admin can reopen this quote for editing and re-approval.
          </p>
        </div>
      )}

      {/* REJECT — required reason + source dialog. */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Mark as Rejected</DialogTitle>
            <DialogDescription>
              Record why this quote was declined. The reason is required and is
              stored on the quote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Reason *</Label>
              <Textarea
                rows={3}
                value={rejectReasonDraft}
                onChange={(e) => setRejectReasonDraft(e.target.value)}
                placeholder="e.g. Client chose another vendor on price."
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source</Label>
              <Select
                value={rejectSourceDraft}
                onValueChange={(v) =>
                  setRejectSourceDraft((v ?? "Client") as QuoteRejectionSource)
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Client">Client</SelectItem>
                  <SelectItem value="Approver">Approver</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!rejectReasonDraft.trim()}
              onClick={confirmReject}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Mark as Rejected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PROJ-2 — convert: New project vs. Add to existing (change order). */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Convert to project</DialogTitle>
            <DialogDescription>
              Create a new project from this quote, or add it to an existing
              project for the same client and entity as a change order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="convertMode"
                className="mt-0.5"
                checked={convertMode === "new"}
                onChange={() => setConvertMode("new")}
              />
              <span>
                <span className="font-medium">New project</span>
                <span className="text-muted-foreground block text-xs">
                  Mint a fresh P-number; this quote becomes the original.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="convertMode"
                className="mt-0.5"
                checked={convertMode === "existing"}
                disabled={mergeCandidates.length === 0}
                onChange={() => setConvertMode("existing")}
              />
              <span className="flex-1">
                <span className="font-medium">Add to existing project</span>
                <span className="text-muted-foreground block text-xs">
                  Link as a change order; sections add new cost centers.
                </span>
              </span>
            </label>
            {convertMode === "existing" && (
              <div className="pl-6">
                <Select
                  value={mergeProjectId}
                  onValueChange={(v) => setMergeProjectId(v ?? "")}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {mergeCandidates.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.project_number} — {p.title || "Untitled"} ({p.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {mergeCandidates.length === 0 && (
              <p className="text-muted-foreground pl-6 text-[11px]">
                No existing projects for this client and entity.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConvertOpen(false)}
              disabled={converting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={confirmConvert}
              disabled={
                converting ||
                (convertMode === "existing" && !mergeProjectId)
              }
            >
              {converting
                ? "Converting…"
                : convertMode === "existing"
                  ? "Add to project"
                  : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            standardTerms={termsByTemplate[templateSlug] ?? ""}
          />

          <InternalNotesCard
            notes={internalNotes}
            onChange={setInternalNotes}
            disabled={ro.readOnly}
          />

          {/* AUDIT-1: admin-only, read-only quote history (self-gates to admin).
              Only on a saved quote — a brand-new one has no audit rows yet. */}
          {!isNew && (
            <QuoteHistoryPanel quoteId={String(initial.id)} status={status} />
          )}

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
              {/* QB-FIX-1 #6: debounced props — preview catches up after a
                  pause instead of re-rendering @react-pdf on every keystroke. */}
              <PdfPreviewPane {...deferredPreviewProps} />
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

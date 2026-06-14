// Schedule registry for the NEXVELON quote PDF document.
// A quote has an ordered list of QuoteScheduleInstance values; each is one
// page (or page section) in the rendered PDF. Five kinds exist:
//   - cover        Page 1: letterhead, addressing, scope-of-works paragraph
//   - particulars  Bill of materials, auto-derived from quote.sections
//   - agreement    Terms & Conditions, auto-derived from quote.terms
//   - acceptance   Totals + signature blocks + legal footer, auto-derived
//   - custom       User-typed body (plain text in v1; rich text in Chunk F)
//
// New quotes ship with cover + particulars + agreement + acceptance by
// default; admin can add/remove/reorder/rename schedules per-quote, and
// add as many custom schedules as needed.

import { newId } from "@/lib/quote-helpers";

export type QuoteScheduleKind =
  | "cover"
  | "particulars"
  | "drawings"
  | "agreement"
  | "acceptance"
  | "custom"
  | "scope"
  | "assurance"
  | "monitoring"
  | "dispatch"
  | "keyholders"
  | "pad";

export interface AssuranceCard {
  id: string;
  tier: string;        // free text, e.g. "GOLD TIER", "PLATINUM TIER"
  ornament: string;    // single character, e.g. "⚜", "✦", "❦", "◆"
  title: string;       // e.g. "Hardware Warranty"
  description: string; // e.g. "36 months · parts & labour · OEM-backed"
}

interface BaseScheduleInstance {
  id: string;
  kind: QuoteScheduleKind;
  title: string;       // editable per-quote
  subtitle: string;    // editable per-quote
  included: boolean;   // temporary disable without removing
}

export interface CoverScheduleInstance extends BaseScheduleInstance {
  kind: "cover";
  scopeOfWorks: string;
}

export interface ParticularsScheduleInstance extends BaseScheduleInstance {
  kind: "particulars";
}

export interface DrawingsScheduleInstance extends BaseScheduleInstance {
  kind: "drawings";
  scale?: string;      // optional — defaults to "N.T.S." (Not to Scale) when rendering
  notes?: string;      // optional — defaults undefined; future polish chunk may surface a UI for this
  // Phase 5b — uploaded PDF reference
  pdfPath?: string;        // Storage path: "{user_id}/{timestamp}-{filename}.pdf"
  pdfFilename?: string;    // Original filename for display
  pdfSize?: number;        // Bytes — for UI display
  pdfUploadedAt?: string;  // ISO timestamp of upload
}

export interface AgreementScheduleInstance extends BaseScheduleInstance {
  kind: "agreement";
}

export interface AcceptanceScheduleInstance extends BaseScheduleInstance {
  kind: "acceptance";
}

export interface CustomScheduleInstance extends BaseScheduleInstance {
  kind: "custom";
  body: string;        // plain text in v1; replaced with rich-text JSON in Chunk F
}

export interface AssuranceScheduleInstance extends BaseScheduleInstance {
  kind: "assurance";
  cards: AssuranceCard[];
}

// SCOPE-1 — structured "Scope of Work" section: a title (the base `title`)
// plus an ordered list of sub-sections, each a subtitle + multi-line body
// (e.g. Inclusions / Exclusions / Theory of Operations). Not Guardian-only —
// available to all templates. Lives in the quote schedules jsonb (no migration).
export interface ScopeSubSection {
  id: string;
  subtitle: string;
  body: string; // plain text; newlines preserved when rendered to PDF
}

export interface ScopeScheduleInstance extends BaseScheduleInstance {
  kind: "scope";
  sections: ScopeSubSection[];
}

// GF-1 — Guardian-only recurring monitoring fees. Self-contained: each service
// carries a monthly fee; the page derives monthly + annual (×12, billed in
// advance) totals plus an optional one-time setup line. Independent of the
// one-time quoteTotals/TotalsBar pipeline. NEVER store bank/card numbers here.
export interface MonitoringService {
  id: string;
  label: string;
  detail?: string;
  monthlyFee: number;
}

export interface MonitoringScheduleInstance extends BaseScheduleInstance {
  kind: "monitoring";
  services: MonitoringService[];
  setupLabel?: string;
  setupAmount?: number;
  billingNote?: string;
}

// GF-2 — Guardian-only dispatch & false-alarm election. Captures the Client's
// police/fire/ambulance dispatch authorization and the accept-regional-fees vs
// decline-police election, plus editable regional-fee and private-response
// notes. Self-contained — no pricing, no totals.
export interface DispatchScheduleInstance extends BaseScheduleInstance {
  kind: "dispatch";
  election: "accept_regional" | "decline_police";
  authorizePolice: boolean;
  authorizeFire: boolean;
  authorizeAmbulance: boolean;
  regionalFeeNote?: string;
  privateResponseNote?: string;
}

// GF-3 — Guardian-only keyholder / pass-card list and per-event response
// sequence. Captures keyholder contacts only — NEVER payment or card data.
export interface Keyholder {
  id: string;
  name: string;
  priority?: string;
  homePhone?: string;
  mobilePhone?: string;
  businessPhone?: string;
  passcard?: string;
  authorizedToChange: boolean;
}

export interface KeyholdersScheduleInstance extends BaseScheduleInstance {
  kind: "keyholders";
  keyholders: Keyholder[];
  burglar?: string;
  fire?: string;
  duress?: string;
  medical?: string;
  note?: string;
}

// GF-4 — Guardian-only pre-authorized payment (PAD) authorization page. Holds
// only authorization PROSE + a notice-day count. Account/card details are
// collected on a separate secure form — DELIBERATELY no bank/card/account/CVV
// fields here.
export interface PadScheduleInstance extends BaseScheduleInstance {
  kind: "pad";
  authorizationText?: string;
  noticeDays?: number; // default 30
  collectionNote?: string;
}

export type QuoteScheduleInstance =
  | CoverScheduleInstance
  | ParticularsScheduleInstance
  | DrawingsScheduleInstance
  | AgreementScheduleInstance
  | AcceptanceScheduleInstance
  | CustomScheduleInstance
  | ScopeScheduleInstance
  | AssuranceScheduleInstance
  | MonitoringScheduleInstance
  | DispatchScheduleInstance
  | KeyholdersScheduleInstance
  | PadScheduleInstance;

export interface QuoteScheduleDefinition {
  kind: QuoteScheduleKind;
  defaultTitle: string;
  defaultSubtitle: string;
  description: string;
  autoGenerated: boolean;
  allowMultiple: boolean;
}

export const QUOTE_SCHEDULE_DEFINITIONS: Record<QuoteScheduleKind, QuoteScheduleDefinition> = {
  cover: {
    kind: "cover",
    defaultTitle: "Quotation",
    defaultSubtitle: "A Proposal of Works",
    description: "Cover page with letterhead, client and site addressing, key dates, and scope-of-works paragraph.",
    autoGenerated: false,
    allowMultiple: false,
  },
  particulars: {
    kind: "particulars",
    defaultTitle: "Particulars",
    defaultSubtitle: "Bill of Materials",
    description: "Itemised bill of materials with section subtotals, HST, and grand total. Auto-derived from the quote's line items.",
    autoGenerated: true,
    allowMultiple: false,
  },
  drawings: {
    kind: "drawings",
    defaultTitle: "Drawings & Take-off",
    defaultSubtitle: "Drawings & Take-off",
    description: "Bounded drawing area for site drawings, with an auto-generated take-off summary of line items grouped by classification.",
    autoGenerated: false,
    allowMultiple: false,
  },
  agreement: {
    kind: "agreement",
    defaultTitle: "The Agreement",
    defaultSubtitle: "Terms & Conditions",
    description: "Numbered terms and conditions clauses. Auto-derived from the quote's terms field.",
    autoGenerated: true,
    allowMultiple: false,
  },
  acceptance: {
    kind: "acceptance",
    defaultTitle: "For Acceptance",
    defaultSubtitle: "",
    description: "Total amount, signature blocks for client and Nexvelon, and HST and legal footer. Auto-derived from the quote's totals.",
    autoGenerated: true,
    allowMultiple: false,
  },
  custom: {
    kind: "custom",
    defaultTitle: "New Schedule",
    defaultSubtitle: "Custom Section",
    description: "Free-form schedule with admin-written body content. Use for narratives, addenda, project context, or anything else.",
    autoGenerated: false,
    allowMultiple: true,
  },
  scope: {
    kind: "scope",
    defaultTitle: "Scope of Work",
    defaultSubtitle: "Scope of Work",
    description: "Structured scope of work — a title plus reorderable sub-sections (subtitle + multi-line body), e.g. Inclusions, Exclusions, Theory of Operations.",
    autoGenerated: false,
    allowMultiple: false,
  },
  assurance: {
    kind: "assurance",
    defaultTitle: "The Assurance",
    defaultSubtitle: "Warranty & Service",
    description: "Warranty and service tier cards. Ships with four default cards; admin can add, remove, reorder, and edit each card per quote.",
    autoGenerated: false,
    allowMultiple: false,
  },
  monitoring: {
    kind: "monitoring",
    defaultTitle: "Monitoring Services",
    defaultSubtitle: "Recurring monitoring fees",
    description: "Recurring monitoring fees, billed annually in advance.",
    autoGenerated: false,
    allowMultiple: false,
  },
  dispatch: {
    kind: "dispatch",
    defaultTitle: "Dispatch & False-Alarm Election",
    defaultSubtitle: "Authority dispatch and regional false-alarm fees",
    description: "Client's police/fire/ambulance dispatch authorization and acknowledgment of regional false-alarm fees.",
    autoGenerated: false,
    allowMultiple: false,
  },
  keyholders: {
    kind: "keyholders",
    defaultTitle: "Keyholders & Response Protocol",
    defaultSubtitle: "Authorized keyholders and response sequence",
    description: "Client's keyholder / pass-card list and the response priority sequence for each event type.",
    autoGenerated: false,
    allowMultiple: false,
  },
  pad: {
    kind: "pad",
    defaultTitle: "Pre-Authorized Payment Authorization",
    defaultSubtitle: "Annual pre-authorized billing",
    description: "Client authorization for pre-authorized annual billing (PAD or credit card). Account details are collected separately, not stored here.",
    autoGenerated: false,
    allowMultiple: false,
  },
};

export const DEFAULT_QUOTE_SCHEDULE_KINDS: QuoteScheduleKind[] = [
  "cover",
  "particulars",
  "assurance",
  "agreement",
  "acceptance",
];

// GF-5 — canonical list of schedule kinds that exist only on Guardian quotes.
// Single source of truth: the SchedulesCard picker filter, the QuoteBuilder
// auto-assembly, and the QuoteDocument entity-scoped render all read this.
export const GUARDIAN_ONLY_KINDS: QuoteScheduleKind[] = [
  "monitoring",
  "dispatch",
  "keyholders",
  "pad",
];

export function createScopeSchedule(): ScopeScheduleInstance {
  const def = QUOTE_SCHEDULE_DEFINITIONS.scope;
  return {
    id: newId("sch"),
    kind: "scope",
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    included: true,
    sections: [{ id: newId("scope"), subtitle: "", body: "" }],
  };
}

export function createAssuranceSchedule(): AssuranceScheduleInstance {
  return {
    id: newId("sch"),
    kind: "assurance",
    title: QUOTE_SCHEDULE_DEFINITIONS.assurance.defaultTitle,
    subtitle: QUOTE_SCHEDULE_DEFINITIONS.assurance.defaultSubtitle,
    included: true,
    cards: [
      { id: newId("card"), tier: "GOLD TIER",     ornament: "⚜", title: "Hardware Warranty",    description: "36 months · parts & labour · OEM-backed" },
      { id: newId("card"), tier: "GOLD TIER",     ornament: "⚜", title: "Workmanship Warranty", description: "24 months · installation & commissioning" },
      { id: newId("card"), tier: "PLATINUM TIER", ornament: "✦", title: "Service Tier",         description: "4-hour response · 24 / 7 · dedicated technician" },
      { id: newId("card"), tier: "PLATINUM TIER", ornament: "✦", title: "System Audit",         description: "Quarterly audit · annual firmware update" },
    ],
  };
}

export function createMonitoringSchedule(): MonitoringScheduleInstance {
  const def = QUOTE_SCHEDULE_DEFINITIONS.monitoring;
  return {
    id: newId("sch"),
    kind: "monitoring",
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    included: true,
    billingNote: "Billed annually in advance.",
    services: [
      { id: newId("mon"), label: "Digital Remote Monitoring", monthlyFee: 0 },
      { id: newId("mon"), label: "Radio/GSM (90-second check-in)", monthlyFee: 0 },
      { id: newId("mon"), label: "IP Communicator", monthlyFee: 0 },
      { id: newId("mon"), label: "ULC Certificate", monthlyFee: 0 },
    ],
  };
}

// Pure totals helper for a monitoring schedule. Monthly = sum of per-service
// monthly fees; annual = monthly × 12 (billed in advance); setup = one-time.
export function monitoringTotals(s: {
  services: MonitoringService[];
  setupAmount?: number;
}): { monthly: number; annual: number; setup: number } {
  const monthly = s.services.reduce((a, x) => a + (x.monthlyFee || 0), 0);
  return { monthly, annual: monthly * 12, setup: s.setupAmount || 0 };
}

export function createDispatchSchedule(): DispatchScheduleInstance {
  const def = QUOTE_SCHEDULE_DEFINITIONS.dispatch;
  return {
    id: newId("sch"),
    kind: "dispatch",
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    included: true,
    election: "accept_regional",
    authorizePolice: true,
    authorizeFire: true,
    authorizeAmbulance: true,
    regionalFeeNote:
      "Police, fire, and emergency services in each municipality or region set their own false-alarm, cancelled-alarm, and registration fees, which vary by region and change over time. The Client is responsible for all such fees and fines. In some regions, authorities will not respond unless the applicable fees have been acknowledged or accepted.",
    privateResponseNote:
      "If police dispatch is declined, Nexvelon will instead contact the Client's keyholders and/or a private security guard service; response times may be materially longer than typical police response, and the Client is responsible for any private guard charges.",
  };
}

export function createKeyholdersSchedule(): KeyholdersScheduleInstance {
  const def = QUOTE_SCHEDULE_DEFINITIONS.keyholders;
  return {
    id: newId("sch"),
    kind: "keyholders",
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    included: true,
    keyholders: [],
    burglar: "1. Call Premises   2. Call Keyholder   3. Call Police",
    fire: "1. Call Premises   2. Call Keyholder   3. Call Fire Department",
    duress: "1. Call Premises   2. Call Keyholder   3. Call Police",
    medical: "1. Call Premises   2. Call Keyholder   3. Call 911",
    note: "Please list all individuals authorized as keyholders or pass-card holders. Additional or replacement cards, or changes after installation, may carry a service charge. The Client is responsible for keeping this list current.",
  };
}

export function createPadSchedule(): PadScheduleInstance {
  const def = QUOTE_SCHEDULE_DEFINITIONS.pad;
  return {
    id: newId("sch"),
    kind: "pad",
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    included: true,
    noticeDays: 30,
    authorizationText:
      "The Client authorizes Nexvelon to charge its recurring monitoring and service fees, plus applicable taxes and approved charges, to its pre-authorized payment method — pre-authorized debit (PAD) from a bank account, or automatic charges to a credit card — annually in advance for the full year. Nexvelon will provide written notice of the amount and the charge date at least thirty (30) days before each annual charge. The Client may cancel or change its pre-authorized payment method on written notice in accordance with the authorization terms, after which the account reverts to direct billing; the Client remains responsible for the full annual fee.",
    collectionNote:
      "Bank account or credit-card details are collected on Nexvelon's separate secure pre-authorized payment authorization form and are not stored on this proposal.",
  };
}

// GF-5 — the four Guardian sections, fresh, in canonical render order. Used to
// auto-assemble a Guardian quote on entity switch (QuoteBuilder).
export function createGuardianDefaultSchedules(): QuoteScheduleInstance[] {
  return [
    createMonitoringSchedule(),
    createDispatchSchedule(),
    createKeyholdersSchedule(),
    createPadSchedule(),
  ];
}

export function createDefaultSchedules(): QuoteScheduleInstance[] {
  return [
    {
      id: newId("sch"),
      kind: "cover",
      title: QUOTE_SCHEDULE_DEFINITIONS.cover.defaultTitle,
      subtitle: QUOTE_SCHEDULE_DEFINITIONS.cover.defaultSubtitle,
      included: true,
      scopeOfWorks: "",
    },
    {
      id: newId("sch"),
      kind: "particulars",
      title: QUOTE_SCHEDULE_DEFINITIONS.particulars.defaultTitle,
      subtitle: QUOTE_SCHEDULE_DEFINITIONS.particulars.defaultSubtitle,
      included: true,
    },
    createAssuranceSchedule(),
    {
      id: newId("sch"),
      kind: "agreement",
      title: QUOTE_SCHEDULE_DEFINITIONS.agreement.defaultTitle,
      subtitle: QUOTE_SCHEDULE_DEFINITIONS.agreement.defaultSubtitle,
      included: true,
    },
    {
      id: newId("sch"),
      kind: "acceptance",
      title: QUOTE_SCHEDULE_DEFINITIONS.acceptance.defaultTitle,
      subtitle: QUOTE_SCHEDULE_DEFINITIONS.acceptance.defaultSubtitle,
      included: true,
    },
  ];
}

export function createDrawingsSchedule(): DrawingsScheduleInstance {
  const def = QUOTE_SCHEDULE_DEFINITIONS.drawings;
  return {
    id: newId("sch"),
    kind: "drawings",
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    included: true,
    scale: undefined,
    notes: undefined,
  };
}

export function createCustomSchedule(title?: string): CustomScheduleInstance {
  return {
    id: newId("sch"),
    kind: "custom",
    title: title ?? QUOTE_SCHEDULE_DEFINITIONS.custom.defaultTitle,
    subtitle: QUOTE_SCHEDULE_DEFINITIONS.custom.defaultSubtitle,
    included: true,
    body: "",
  };
}

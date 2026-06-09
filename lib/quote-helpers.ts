import type {
  BuilderLineItem,
  Quote,
  QuoteSection,
  QuoteStatus,
} from "./types";
import { products } from "./mock-data/products";
import { defaultClassificationFor } from "./classifications";
import { businessQuoteNumber } from "./format";
import { isValidQuoteThemeSlug, type QuoteThemeSlug } from "@/lib/quote-themes";

export const DEFAULT_TAX_RATE = 0.13; // ON HST
export const DEFAULT_LABOR_RATE = 145;

export const DEFAULT_TERMS = `Nexvelon Integrated Solutions Inc. — Terms & Conditions

This Quote/Proposal and any resulting agreement are with Nexvelon Integrated Solutions Inc., carrying on business as "Nexvelon Global" (the "Company" or "Nexvelon"). The other party is the "Client" (also the "Owner" where it acts as such, or the "GC" / General Contractor where applicable). All obligations, warranties, and liabilities are those of Nexvelon Integrated Solutions Inc.

1. Nature of Services — Scope and Limitation
(a) Physical security only. Nexvelon provides physical security systems design, project management, and systems integration. Nexvelon does not provide information technology services, network security, cybersecurity consulting, or any related IT services.
(b) No consultancy relationship. Nexvelon is not a security consultant, advisor, or independent professional consultant of any kind. Nothing in this Agreement, and no drawing, design, proposal, recommendation, or communication, is to be treated as professional consultancy advice or as creating a consultancy relationship.
(c) Design representations only. Any drawings, schematics, layouts, or riser diagrams describe a proposed method of installation and configuration based on information available when prepared. They are working documents to assist installation by qualified subcontractors, not certified engineering drawings or guaranteed security solutions.
(d) Best-efforts standard. All services are provided to the best of the Company's knowledge, skill, and ability based on the information supplied by the Client and conditions known at the time. Nexvelon makes no warranty that any system will prevent, detect, or respond to every possible threat, intrusion, breach, or incident.
(e) Client responsibility for comprehensive security. A physical security system is only one part of a complete strategy. Where the Client requires a security risk assessment, professional security consulting, cybersecurity or IT/network security, independent verification of system adequacy, or compliance with specific regulatory or insurance requirements, the Client must independently engage qualified, licensed professionals. Nexvelon accepts no responsibility for any aspect of security outside the specific scope of work in the applicable proposal or work order.
(f) No guarantee of outcomes. Security systems are deterrents and detection tools; effectiveness depends on factors outside Nexvelon's control, including Client use, maintenance, network environment, and the nature of the threat. Nexvelon does not guarantee that any system will prevent loss, theft, damage, unauthorized access, or any other incident.
(g) Reliance on Client information. Designs and proposals are prepared on the basis of information, measurements, and site conditions provided by or for the Client. Nexvelon accepts no liability for errors arising from incomplete, inaccurate, or misleading Client information.

2. Pricing and Payment
2.1 Pricing adjustment. Nexvelon may increase the amount owing to reflect cost increases, or additional amounts it incurs from new or increased taxes, duties, tariffs, or governmental charges taking effect after the Client signs the applicable proposal.
2.2 Interest on late payment. Any invoice not paid within the selected payment term accrues interest at 2.5% per month (30% per annum) from the due date until paid in full.
2.3 Credit-card surcharge. A surcharge of 2.5% plus applicable taxes applies to any payment made by credit card.
2.4 Material orders. For all material orders, 70% of the total material cost is payable in advance; the remaining 30% is due immediately upon receipt. Once Nexvelon receives the ordered parts, the remaining balance is due immediately. Nexvelon will send an email with photographs of the received items, which the Client accepts as proof of receipt for collecting that balance.
2.5 Direct-to-site delivery. If the Client elects to have parts delivered directly to site, the Client must pay 100% of those parts' cost in advance and is responsible for storing them securely and maintaining a sign-in/sign-out log of all parts removed by any person. This log is the reference for accountability if any items are missing or lost on site.

3. Delivery and Materials
3.1 Receipt of deliveries. When parts or materials are out for delivery, the Client must ensure a designated contact is available to receive them in accordance with the delivery company's schedule and time window. If the assigned contact is unreachable, or a delivery is returned for any reason attributable to the Client, all costs associated with that delivery — including any re-delivery — are payable by the Client.
3.2 Parts availability and discontinuation. Timely availability of parts can be guaranteed only where 100% payment for all parts has been made in advance. If a project is delayed by days, weeks, months, or years — during or after which an ordered part becomes discontinued — no refund will be issued for parts already ordered. Where updated or replacement parts are required, the Client is responsible for the additional cost.

4. Risk of Loss and General Contractor Responsibility
4.1 Transfer of risk on installation. Upon physical installation of any device(s) or parts, all risk of loss or damage — including theft, vandalism, site accidents, or defacement (such as paint, plaster, or chemical contamination) caused by other trades, and regardless of whether the cause or responsible party is identified — passes immediately to the General Contractor (GC). The GC is responsible for maintaining the physical and aesthetic integrity of all installed equipment until final project handover. Following Nexvelon's submission of installation photos confirming a clean and functional state, any subsequent cleaning, repair, or replacement is a billable Change Order at Nexvelon's standard rates.
4.2 Deemed acceptance (four-hour window). Upon submission of installation photos to the GC by email or digital platform, the GC has four (4) business hours to inspect and dispute the condition of the equipment. In the absence of a written dispute within that window, the equipment is "Deemed Accepted" in clean and functional condition, and all risk of loss, theft, or defacement passes immediately to the GC.
4.3 Site supervision and assignment of responsibility.
(1) Immediate obligation. Upon signing the applicable proposal, the Client (Owner) assumes all responsibilities of the "General Contractor" or "Constructor" regarding site security, hardware protection, and installation sign-offs, unless a third-party GC is formally appointed.
(2) Duty to inform. The Client is strictly responsible for immediately communicating all terms of this Agreement — in particular those concerning equipment protection, photo-documentation, and the "Deemed Acceptance" protocol — to any current or future GC, Project Manager, or site supervisor before that party begins work.
(3) Continuous liability. If the Client changes the GC or appoints a new responsible party at any stage (including long-lead projects beginning more than a year later), the Client remains responsible for ensuring the successor party acknowledges and adheres to these terms.
(4) Indemnity for communication failure. If the Client fails to properly inform the GC or responsible site parties of these requirements, the Client remains solely and personally liable for any theft, vandalism, or defacement of Nexvelon's equipment, regardless of which trade caused the damage.

5. Installation and Site Conditions
Nexvelon will install equipment in a workmanlike manner, subject to: (a) the Client making the premises available without interruption during normal working hours (8:00 a.m. to 5:00 p.m., Monday to Friday, excluding holidays) or at other agreed times; (b) installation possibly requiring drilling and leaving some wiring exposed; (c) the Client providing sufficient electrical outlets for equipment requiring AC power; and (d) the Client warranting that it has requested the equipment for its own use, owns the premises or has authority to engage Nexvelon, and will comply with all applicable laws and codes. Title to the equipment remains with Nexvelon until paid for in full.

6. Equipment — Condition, Care, and Modification
The Client must keep the equipment in good working order and, for wireless or battery-operated devices, replace batteries per recommendations or allow Nexvelon to do so at the Client's expense. The Client is responsible for regularly checking the equipment's condition and reporting deficiencies. The Client must not modify, replace, or connect other equipment in any way that impairs operation, must preserve identification plates and markings, and — if it relocates — remains responsible for the equipment and for arranging and paying for reinstallation.

7. Acknowledgement of Protection
While encouraged to follow Nexvelon's recommendations on the type, quantity, and placement of protection, the Client is solely responsible for the final selection of the protection it wishes to put in place.

8. Additional Services and Equipment
Any service or equipment Nexvelon may provide beyond the obligations in the applicable proposal is optional on Nexvelon's part. The Client will pay for any services or equipment provided at its request beyond those commitments, on terms agreed in advance.

9. Loss or Damage; Reporting of Defects
The Client is liable for any loss of or damage to the equipment, for any reason, from the date of delivery to the premises, except to the extent caused by Nexvelon's deliberate acts or gross negligence. Any deficiency, or any error in delivery or installation, must be reported in writing within seven (7) days of being observed; otherwise the Client is deemed satisfied with the equipment, its delivery, and its installation.

10. Remote Monitoring
Equipment for remote monitoring includes a communication device that transmits signals to a monitoring station. The Client is responsible for telephone or connectivity charges, including installation or repair fees, for connecting the system. The Client acknowledges that replacing existing telephone service with VoIP or similar internet telephony, or sharing the line with internet or VoIP traffic, may prevent alarm signals from reaching the monitoring station — particularly during a power or modem failure — and must notify Nexvelon of any such change so an inspection or modification can be scheduled at the Client's expense. Where radio or cellular transmission is used, the Client acknowledges it is subject to CRTC and local regulation and may be impaired by atmospheric conditions, power failures, signal blockage, or other events beyond Nexvelon's control.

11. Maintenance Services
Unless a proposal states otherwise, maintenance is on-call, on a time-and-materials basis. The Client will provide access for maintenance. Replaced parts remain Nexvelon's property until paid for. Maintenance excludes, among other things: pre-existing defects not disclosed in writing and agreed in advance; defects from fire, lightning, flood, vandalism, acts of God, Client negligence, misuse, or other causes outside Nexvelon's control, or items reasonably covered by the Client's insurance; defects from Client modifications contrary to standards or recommendations; damage from paint or coatings applied to equipment; damage from electrical interruptions or spikes; and defects from alterations by persons not authorized in advance and in writing by Nexvelon.

12. Remote Surveillance Services
Remote surveillance is performed by a third-party operations centre engaged by Nexvelon. Nexvelon's sole responsibility is to engage that centre to process information from the Client's surveillance equipment and to notify the Client or designated authorities when an alarm is triggered. Surveillance runs only during the hours specified in the proposal and begins once Nexvelon confirms in writing that the system is connected (at which point the related fees begin). Regular maintenance and inspection are recommended. Nexvelon may suspend surveillance on notice if equipment is not maintained and the Client does not remedy this within a reasonable time. The Client must keep responder lists, authorized persons, monitored zones, and incident procedures current. Nexvelon may increase surveillance fees at renewal on at least thirty (30) days' written notice.

13. Warranty
Equipment is warranted solely per the original manufacturer's warranty. Nexvelon separately warrants that installation will be free from defects in labour for ninety (90) days following installation. Nexvelon provides no additional or extended warranty and is not responsible for registering equipment for warranty. Any manufacturer warranty period begins when Nexvelon receives the equipment, not when it is installed. A service charge at Nexvelon's prevailing rates applies where a service call is not covered by the labour warranty or arises after the labour-warranty period. All warranties other than those expressly stated here — whether express or implied, statutory or otherwise, including any implied warranty of merchantability or fitness for a particular purpose — are disclaimed to the fullest extent permitted by law.

14. Term, Automatic Renewal, and Cancellation
Where an agreement includes monitoring, it renews automatically year to year; where it includes remote surveillance, it renews for a term equal to the initial term; otherwise it renews month to month. The Client may prevent automatic renewal by giving written notice at least thirty (30) days before the renewal date. To cancel any service before the end of its term, the Client must give at least thirty (30) days' written notice and pay, as liquidated damages and not as a penalty, an amount equal to 100% of the remaining payments for the balance of the then-current term, and cooperate with Nexvelon's right to repossess equipment not paid for. Nexvelon may terminate on thirty (30) days' written notice, refunding prepaid fees for services not yet performed.

15. Default by Client
Any failure to pay amounts when due, or any other breach, entitles Nexvelon to terminate and, without waiving other remedies, to: (a) repossess any equipment not paid for, with or without notice and without obligation to repair the premises; (b) charge interest at the rate in Section 2.2 on overdue amounts; and (c) collect liquidated damages equal to 100% of the remaining payments for the balance of the then-current term.

16. Limitation of Liability
16.1 General. The Client releases Nexvelon from liability for losses arising, directly or indirectly, from events the equipment or services are designed to detect or avoid. Nexvelon is not an insurer; the protection provided is limited and not absolute; and the amounts payable bear no relation to the value of the premises or their contents. Nexvelon is not responsible for any loss from the failure of police, fire, ambulance, or other emergency services to respond. The Client is responsible for expenses or fines arising from false alarms. If Nexvelon is found liable, its total liability is limited, as the agreed remedy and not a penalty, to the greater of three months' monitoring fees or $1,000. No action may be brought more than one year after the cause of action arises, unless a longer period is required by law. These limitations benefit Nexvelon's parent, subsidiary, and affiliated companies.
16.2 Cyber and IT security. Nexvelon provides physical security systems design, project management, and systems integration only, and does not provide IT, network security, or cybersecurity services. The Client acknowledges that: (a) Nexvelon has no liability of any kind for loss, damage, cost, or expense arising from cyber attacks, data breaches, network intrusions, ransomware, hacking, unauthorized digital access, or any other cyber or technology-related incident affecting the Client's systems, networks, or data; (b) any system installed may connect to or interface with the Client's network, and the Client is solely responsible for the security of its own network and IT environment; (c) where cybersecurity or IT security services are required, the Client must independently engage a qualified, licensed IT contractor, and Nexvelon accepts no responsibility for that contractor's selection, performance, or work; and (d) Nexvelon's total liability for any claim under this Agreement will not exceed the total fees paid by the Client for the specific project giving rise to the claim.
16.3 Consequential damages. In no event is Nexvelon liable for lost profits, business interruption, loss of data, or any indirect, incidental, special, or consequential damages, regardless of cause and even if advised of the possibility.

17. Personal and Staff Information
The Client confirms the information it provides is true and complete and will promptly notify Nexvelon of any change. For system setup, monitoring, and administering the services (including credit approval, invoicing, and collection), the Client consents to Nexvelon's collection, use, and disclosure of its personal information among Nexvelon, its affiliates, subcontractors, and assignees, and authorizes Nexvelon to consult third parties (such as credit bureaus) regarding the Client's solvency. Such information is kept confidential and made available only to personnel who need it, unless disclosure is authorized by law. The Client has the right to access and correct its information by writing to Nexvelon, attention: Privacy Officer.

18. General
18.1 Assignment. The Client may not assign its rights without Nexvelon's prior written consent. Nexvelon may assign this Agreement or subcontract any services to another security-services provider without the Client's consent; any assignee assumes Nexvelon's obligations and benefits.
18.2 Force majeure. Nexvelon is not liable for any failure to perform caused by events outside its reasonable control, including acts of God or war, terrorism, natural disasters, power/internet/telephone outages, transmission disruption, accidents, abuse, vandalism, the Client's failure to follow operating instructions or protect monitored areas, or any malfunction of third-party equipment, software, or firmware. Nexvelon will use commercially reasonable efforts to resume performance as soon as reasonably possible.
18.3 Notice. Notices are sent to the address on the applicable proposal and are deemed delivered on hand-delivery, one day after deposit with an overnight courier, or five days after deposit by registered mail.
18.4 No waiver. Nexvelon's failure to require performance or enforce a right is not a waiver of that right.
18.5 Entire agreement. This Agreement, with the applicable proposal or work order, is the entire agreement on its subject matter and supersedes all prior communications. It may be amended only by a written instrument signed by both parties. No sales representative or consultant has authority to alter the printed terms. These printed terms prevail over any inconsistent terms in any Client purchase order or other document.
18.6 Severability. If any provision is found invalid or unenforceable, it is severed and the remaining provisions stay in full force.
18.7 Jurisdiction. This Agreement is governed by the laws of the Province of Ontario and the federal laws of Canada applicable there, and the parties attorn to the non-exclusive jurisdiction of the courts of Ontario.
18.8 Costs. The Client agrees to pay all costs Nexvelon incurs (including legal fees on a solicitor-and-client basis) to collect any amount owed, repossess equipment, or remedy any breach.`;

export const SECTION_PRESETS = [
  "Access Control Hardware",
  "CCTV / Video Surveillance",
  "Intrusion Detection",
  "Intercom & Audio",
  "Networking & Power",
  "Cabling & Accessories",
  "Programming & Commissioning",
  "Labor",
];

export function newId(prefix: string = "li"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "product",
    name: "",
    description: "",
    classification: "Materials",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
  };
}

export function miscLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "misc",
    name: "",
    description: "",
    classification: "Misc",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
    // vendor, sku, productId intentionally omitted — all optional, blank by default
  };
}

export function serviceLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "service",
    name: "",
    description: "",
    classification: "Warranty Cost",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
    // vendor, sku, productId intentionally omitted — all optional. Services
    // may have a 3rd-party provider; the user can fill vendor/SKU if so.
  };
}

export function laborLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "labor",
    name: "",
    description: "",
    classification: "Technician Labour",
    qty: 8, // hours
    unitCost: 87, // 145 × (1 − 0.40) cost rate per hour
    margin: 40,
    unitPrice: 145, // billing rate per hour
  };
}

// Parts and labour share one model now (QB-3): qty × unitPrice / unitCost.
export function lineItemTotal(li: BuilderLineItem): number {
  return li.qty * li.unitPrice;
}

export function lineItemCost(li: BuilderLineItem): number {
  return li.qty * li.unitCost;
}

export function recalcLineItem(li: BuilderLineItem): BuilderLineItem {
  const unitPrice =
    li.margin >= 100
      ? li.unitCost // guard against div-by-zero
      : round2(li.unitCost / (1 - li.margin / 100));
  return { ...li, unitPrice };
}

export function sectionSubtotal(s: QuoteSection): number {
  return s.items.reduce((sum, li) => sum + lineItemTotal(li), 0);
}

export function quoteTotals(
  sections: QuoteSection[],
  taxRate: number,
  discount = 0,
  discountType: "pct" | "amount" = "pct"
): {
  subtotal: number;
  cost: number;
  discountAmount: number;
  postDiscount: number;
  tax: number;
  total: number;
  margin: number;
} {
  const subtotal = sections.reduce((s, sec) => s + sectionSubtotal(sec), 0);
  const cost = sections.reduce(
    (s, sec) => s + sec.items.reduce((c, li) => c + lineItemCost(li), 0),
    0
  );
  const discountAmount =
    discountType === "pct" ? round2(subtotal * (discount / 100)) : round2(discount);
  const postDiscount = Math.max(0, subtotal - discountAmount);
  const tax = roundCRA(postDiscount * taxRate);
  const total = round2(postDiscount + tax);
  // Margin reflects effective revenue after discount, not list subtotal
  const margin =
    postDiscount === 0 ? 0 : (postDiscount - cost) / postDiscount;
  return { subtotal: round2(subtotal), cost, discountAmount, postDiscount, tax, total, margin };
}

/**
 * CRA-compliant rounding: look at the 3rd decimal digit only.
 * ≥5 rounds up at the 2nd decimal; ≤4 rounds down.
 * Example: 12.345 → 12.35; 12.344 → 12.34
 */
function roundCRA(n: number): number {
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const cents = Math.floor(abs * 100);
  const thirdDecimal = Math.floor(abs * 1000) % 10;
  const result = thirdDecimal >= 5 ? cents + 1 : cents;
  return (sign * result) / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Quote number is now a Toronto-time timestamp YYMMDDHHMM (self-contained — no
// sequence lookup). The previous `existing: Quote[]` argument is no longer read,
// so the param is dropped; existing callers passing an arg (nextQuoteNumber(
// allQuotes)) still work — JS ignores the extra argument, so call sites + the
// useQuotesLoaded guard stay unchanged. The internal id (newId("q")) remains
// the unique key; minute-precision number collisions are tolerated.
export function nextQuoteNumber(): string {
  return businessQuoteNumber();
}

// Convert a flat seed quote (without sections) into a single-section
// builder shape on demand.
export function ensureSections(q: Quote): QuoteSection[] {
  if (q.sections && q.sections.length > 0) return q.sections;
  const items: BuilderLineItem[] = (q.items ?? []).map((it) => {
    const product = products.find((p) => p.id === it.productId);
    return {
      id: newId("li"),
      type: "product",
      vendor: product?.vendor,
      productId: it.productId,
      sku: product?.sku ?? "",
      name: "",
      description: product?.name ?? "Item",
      classification: defaultClassificationFor("product"),
      qty: it.qty,
      unitCost: product?.cost ?? 0,
      // Derive margin% = (price − cost) / price × 100 (QB-2 margin model)
      margin:
        product && it.unitPrice > 0
          ? round2(((it.unitPrice - product.cost) / it.unitPrice) * 100)
          : 0,
      unitPrice: it.unitPrice,
    };
  });
  return [{ id: newId("sec"), name: "Equipment & Installation", items }];
}

export const QUOTE_STATUS_ORDER: QuoteStatus[] = [
  "Draft",
  "Sent",
  "Approved",
  "Rejected",
  "Expired",
  "Converted",
];

export const STATUS_PROBABILITY: Record<QuoteStatus, number> = {
  Draft: 0.25,
  Sent: 0.6,
  Approved: 1,
  Rejected: 0,
  Expired: 0,
  Converted: 1,
};

export function weightedPipelineValue(quotes: Quote[]): number {
  return quotes.reduce((sum, q) => sum + q.total * STATUS_PROBABILITY[q.status], 0);
}

export function totalValue(quotes: Quote[]): number {
  return quotes.reduce((sum, q) => sum + q.total, 0);
}

// ----------------------------------------------------------------------------
// Last-used theme persistence (Chunk F)
//
// Quotes carry their own themeSlug, but new quotes initialize from the last
// theme the operator picked across any quote. Stored under a single
// localStorage key; per-browser only (no DB persistence yet).
// ----------------------------------------------------------------------------

export const LAST_USED_THEME_KEY = "nexvelon:last-used-theme";

export function readLastUsedThemeSlug(): QuoteThemeSlug | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_USED_THEME_KEY);
    if (stored && isValidQuoteThemeSlug(stored)) return stored;
    return null;
  } catch {
    return null;
  }
}

export function writeLastUsedThemeSlug(slug: QuoteThemeSlug): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_USED_THEME_KEY, slug);
  } catch {
    // swallow — localStorage may be unavailable in private mode
  }
}

// ----------------------------------------------------------------------------
// Take-off aggregation (QD-2 Phase 5a)
//
// The Drawings & Take-off schedule page renders a summary chip per line-item
// classification. takeoffGroups() flattens every section's items and groups
// them by classification, summing quantities. Pure / SSR-safe.
// ----------------------------------------------------------------------------

export interface TakeoffGroup {
  classification: string;
  totalQty: number;
  lineCount: number;
  items: BuilderLineItem[];
}

/**
 * Aggregate all line items across all sections, grouped by classification.
 * Used by the Drawings & Take-off page to render summary chips.
 * Pure / SSR-safe. Returns groups sorted by classification name (alphabetical).
 */
export function takeoffGroups(sections: QuoteSection[]): TakeoffGroup[] {
  const map = new Map<string, TakeoffGroup>();
  for (const section of sections) {
    for (const item of section.items) {
      const key = item.classification ?? "Unclassified";
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += item.qty;
        existing.lineCount += 1;
        existing.items.push(item);
      } else {
        map.set(key, {
          classification: key,
          totalQty: item.qty,
          lineCount: 1,
          items: [item],
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.classification.localeCompare(b.classification)
  );
}

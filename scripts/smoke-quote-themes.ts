import path from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { renderToFile } from "@react-pdf/renderer";
import React from "react";
import { QuoteDocument } from "../components/modules/quotes/builder/QuoteDocument";
import { registerQuoteFonts } from "../lib/quote-fonts";
import { QUOTE_THEME_SLUGS, getQuoteTheme } from "../lib/quote-themes";
import {
  getQuoteTemplate,
  DEFAULT_QUOTE_TEMPLATE_SLUG,
} from "../lib/company-profile";
import {
  createDefaultSchedules,
  createCustomSchedule,
} from "../lib/quote-schedules";
import { serializeRichTextBody } from "../lib/quote-rich-text";

const OUTPUT_DIR = path.resolve("tmp/smoke");
const FONTS_DIR = path.resolve("public/fonts");

const SMOKE_CLIENT: any = {
  id: "smoke-client-1",
  name: "Meridian Tower Holdings Inc.",
  contactName: "Jane Doe",
  address: "145 King Street West, Suite 2200",
  city: "Toronto",
  state: "Ontario M5H 1J8",
  email: "jane.doe@example.com",
};

const SMOKE_SITE: any = {
  id: "smoke-site-1",
  name: "Meridian Tower — Phase II Build-Out",
  address: "145 King Street West",
  city: "Toronto",
  state: "Ontario M5H 1J8",
};

const SMOKE_OWNER: any = {
  id: "smoke-owner-1",
  name: "Ishani Pandya",
  email: "ishani@nexvelonglobal.com",
};

const SMOKE_SECTIONS: any[] = [
  {
    id: "sec-1",
    name: "Access Control",
    items: [
      {
        id: "li-1",
        type: "product",
        productId: "p1",
        vendor: "HID",
        sku: "HID-SIGNO-20",
        description: "HID Signo 20 Reader · Mullion-Mount · Black",
        qty: 8,
        unitCost: 360,
        markup: 30,
        unitPrice: 485,
      },
      {
        id: "li-2",
        type: "product",
        productId: "p2",
        vendor: "Mercury",
        sku: "LP4502",
        description: "Mercury LP4502 Intelligent Controller · 16-Door",
        qty: 1,
        unitCost: 3100,
        markup: 30,
        unitPrice: 4250,
      },
      {
        id: "li-3",
        type: "product",
        productId: "p3",
        vendor: "HES",
        sku: "9600",
        description: "HES 9600 Electric Strike · 12/24V · Fail-Secure",
        qty: 8,
        unitCost: 220,
        markup: 30,
        unitPrice: 295,
      },
    ],
  },
];

const SMOKE_TERMS =
  "01 · VALIDITY\nThis quotation is valid for thirty (30) days from the date issued.\n\n" +
  "02 · DEPOSIT & PAYMENT\nA deposit of fifty per-cent (50%) is due upon acceptance; balance is Net 30 from substantial completion.\n\n" +
  "03 · SITE & ACCESS\nWorks are performed during standard business hours.\n\n" +
  "04 · TRAVEL\nTravel beyond seventy-five (75) kilometres is billed at $0.65 per kilometre.\n\n" +
  "05 · INDEMNITY\nLiability is limited to the amount of this quotation.\n\n" +
  "06 · ACCEPTANCE\nAcceptance constitutes a binding agreement under the laws of the Province of Ontario.";

const SMOKE_SCOPE =
  "Turn-key access-control fit-out for the Phase II floors of Meridian Tower: eight HID Signo readers tied to a Mercury LP4502 controller backbone, electric strikes on perimeter and tenant doors, and integration with the existing building management system. Includes commissioning, credential enrolment, and a 12-month service tier.";

function makeSchedules(variant: "default" | "with-custom" | "reordered") {
  const sched = createDefaultSchedules();
  const cover = sched.find((s) => s.kind === "cover");
  if (cover && cover.kind === "cover") cover.scopeOfWorks = SMOKE_SCOPE;
  if (variant === "default") return sched;

  if (variant === "with-custom") {
    const custom = createCustomSchedule("The Plan");
    custom.subtitle = "Drawings & Take-Off";
    custom.body = serializeRichTextBody({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Site Drawings" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Floor plan attached under separate cover. Counts: 8 readers, 1 controller, 8 strikes, 8 doors.",
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Lobby — 2 readers" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Executive floor — 3 readers" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "ITS room — 1 reader" }],
                },
              ],
            },
          ],
        },
      ],
    });
    const idx = sched.findIndex((s) => s.kind === "agreement");
    sched.splice(idx, 0, custom);
    return sched;
  }

  // reordered
  const custom = createCustomSchedule("The Calendar");
  custom.subtitle = "Programme of Works";
  custom.body = serializeRichTextBody({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Week 1" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Survey & Design." }],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Weeks 2–3" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Permits & Procure." }],
      },
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Rough-in & Cabling" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Install & Commission" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Handover & Training" }],
              },
            ],
          },
        ],
      },
    ],
  });
  const idx = sched.findIndex((s) => s.kind === "agreement");
  sched.splice(idx, 0, custom);
  return sched;
}

async function renderTheme(
  themeSlug: string,
  variant: "default" | "with-custom" | "reordered",
) {
  const theme = getQuoteTheme(themeSlug as any);
  const template = getQuoteTemplate(DEFAULT_QUOTE_TEMPLATE_SLUG);
  const schedules = makeSchedules(variant);

  const filename = `Q-SMOKE_${themeSlug}_${variant}.pdf`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  const element = React.createElement(QuoteDocument as any, {
    number: "Q-2026-0001",
    name: "Meridian Tower — Phase II Build-Out",
    createdAt: "2026-05-14T00:00:00.000Z",
    validUntil: "2026-06-13T00:00:00.000Z",
    paymentTerms: "Net 30",
    projectType: "New Install",
    client: SMOKE_CLIENT,
    site: SMOKE_SITE,
    owner: SMOKE_OWNER,
    sections: SMOKE_SECTIONS,
    taxRatePct: 13,
    discount: 0,
    discountType: "pct",
    terms: SMOKE_TERMS,
    theme,
    template,
    schedules,
    showUnitPrice: false,
  });

  // The React.createElement(QuoteDocument as any, ...) above intentionally
  // loses the DocumentProps shape; cast back to the renderer's expected
  // type at the call boundary so tsc + Next.js's build typecheck pass.
  await renderToFile(element as Parameters<typeof renderToFile>[0], outputPath);
  const s = await stat(outputPath);
  return { filename, size: s.size };
}

async function main() {
  registerQuoteFonts(FONTS_DIR);
  await mkdir(OUTPUT_DIR, { recursive: true });

  const results: { file: string; ok: boolean; size?: number; error?: string }[] = [];

  for (const slug of QUOTE_THEME_SLUGS) {
    try {
      const { filename, size } = await renderTheme(slug, "default");
      results.push({ file: filename, ok: true, size });
      console.log(`✓ ${filename} (${(size / 1024).toFixed(1)} KB)`);
    } catch (e: any) {
      results.push({
        file: `Q-SMOKE_${slug}_default.pdf`,
        ok: false,
        error: e.message,
      });
      console.log(`✗ Q-SMOKE_${slug}_default.pdf — ${e.message}`);
    }
  }

  for (const variant of ["with-custom", "reordered"] as const) {
    try {
      const { filename, size } = await renderTheme("solid_white", variant);
      results.push({ file: filename, ok: true, size });
      console.log(`✓ ${filename} (${(size / 1024).toFixed(1)} KB)`);
    } catch (e: any) {
      results.push({
        file: `Q-SMOKE_solid_white_${variant}.pdf`,
        ok: false,
        error: e.message,
      });
      console.log(
        `✗ Q-SMOKE_solid_white_${variant}.pdf — ${e.message}`,
      );
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} PDFs rendered successfully.`);
  if (ok < results.length) {
    console.log("Failures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ${r.file}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

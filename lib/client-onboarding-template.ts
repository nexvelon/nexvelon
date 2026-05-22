"use client";

// CL-4 — client onboarding Excel template. This file holds the generator
// (Phase 2a) and will hold the parser (Phase 2b). exceljs is dynamic-imported
// inside each function so the ~1 MB library never lands in the main bundle.

// Phase 2b will populate this from the parser.
export interface ParsedClientTemplate {
  client: {
    legal_name: string;
    name: string; // trade name (the field's setter is setName)
    hst_gst_number: string;
    tax_exempt: boolean;
    tax_exempt_cert: string;
  };
  billing: {
    street: string;
    unit: string;
    city: string;
    province: string;
    postal: string;
    country: string;
  };
  mainContact: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
  apContact: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
  additionalContact: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
  initialSite: {
    name: string;
    address_line1: string;
    address_line2: string;
    city: string;
    province: string;
    postal_code: string;
    country: string;
  };
}

/**
 * Phase 2a: generate an empty Excel template for clients to fill out.
 * Returns a Blob that can be downloaded via URL.createObjectURL.
 * exceljs is dynamic-imported so the ~1 MB lib only loads when this is called.
 */
export async function generateClientTemplate(): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Nexvelon";
  workbook.created = new Date();

  // ─── Sheet 1: Instructions ───
  const instructions = workbook.addWorksheet("Instructions");
  instructions.getColumn(1).width = 100;

  const titleRow = instructions.addRow(["Nexvelon Client Onboarding Template"]);
  titleRow.font = { size: 16, bold: true };
  instructions.addRow([""]);
  instructions.addRow([
    "Welcome! Please fill out the following sheets to set up your account with Nexvelon.",
  ]);
  instructions.addRow([""]);
  instructions.addRow([
    "1. 'Client & Billing' — your company info and billing address",
  ]);
  instructions.addRow([
    "2. 'Contacts' — up to 3 people we can reach (Main, Accounts Payable, Additional)",
  ]);
  instructions.addRow([
    "3. 'Site' — the initial site where we'll provide services (optional)",
  ]);
  instructions.addRow([""]);
  instructions.addRow(["Fields marked * are required."]);
  instructions.addRow(["Yellow cells are where you fill in your information."]);
  instructions.addRow([""]);
  instructions.addRow([
    "Save the file once complete and send it back to your Nexvelon representative.",
  ]);
  instructions.addRow([""]);
  instructions.addRow([
    "Questions? Contact your Nexvelon representative directly.",
  ]);

  // ─── Sheet 2: Client & Billing ───
  const clientSheet = workbook.addWorksheet("Client & Billing");
  clientSheet.getColumn(1).width = 40;
  clientSheet.getColumn(2).width = 50;

  const YELLOW_FILL = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF9E6" },
  } as const;

  function addLabeledRow(
    sheet: typeof clientSheet,
    label: string,
    required = false
  ) {
    const row = sheet.addRow([label + (required ? " *" : ""), ""]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).fill = YELLOW_FILL;
    return row;
  }

  const clientHeader = clientSheet.addRow(["Client Information"]);
  clientHeader.font = { size: 14, bold: true };
  clientSheet.addRow([""]);
  addLabeledRow(clientSheet, "Legal Name", true);
  addLabeledRow(clientSheet, "Trade / Display Name");
  addLabeledRow(clientSheet, "HST/GST Number");
  addLabeledRow(clientSheet, "Tax Exempt? (yes/no)");
  addLabeledRow(clientSheet, "Tax Exempt Certificate Number (if applicable)");

  clientSheet.addRow([""]);
  const billingHeader = clientSheet.addRow(["Billing Address"]);
  billingHeader.font = { size: 14, bold: true };
  clientSheet.addRow([""]);
  addLabeledRow(clientSheet, "Street");
  addLabeledRow(clientSheet, "Unit / Suite");
  addLabeledRow(clientSheet, "City");
  addLabeledRow(clientSheet, "Province");
  addLabeledRow(clientSheet, "Postal Code");
  addLabeledRow(clientSheet, "Country");

  // ─── Sheet 3: Contacts ───
  const contactsSheet = workbook.addWorksheet("Contacts");
  contactsSheet.getColumn(1).width = 25;
  contactsSheet.getColumn(2).width = 20;
  contactsSheet.getColumn(3).width = 20;
  contactsSheet.getColumn(4).width = 20;
  contactsSheet.getColumn(5).width = 35;

  const contactsTitleRow = contactsSheet.addRow(["Contacts"]);
  contactsTitleRow.font = { size: 14, bold: true };
  contactsSheet.addRow([""]);

  const contactsHeaderRow = contactsSheet.addRow([
    "Role",
    "First Name *",
    "Last Name *",
    "Phone",
    "Email",
  ]);
  contactsHeaderRow.font = { bold: true };
  contactsHeaderRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E5E5" },
    };
  });

  function addContactRow(role: string) {
    const row = contactsSheet.addRow([role, "", "", "", ""]);
    row.getCell(1).font = { bold: true };
    // Yellow fill on the 4 fillable cells (cols 2-5).
    for (let i = 2; i <= 5; i++) {
      row.getCell(i).fill = YELLOW_FILL;
    }
  }

  addContactRow("Main Contact");
  addContactRow("Accounts Payable");
  addContactRow("Additional Contact");

  contactsSheet.addRow([""]);
  const contactsNote = contactsSheet.addRow([
    "* First and Last name are required for each contact you provide. Phone and Email are optional but recommended.",
  ]);
  contactsNote.getCell(1).font = {
    italic: true,
    color: { argb: "FF666666" },
  };

  // ─── Sheet 4: Site ───
  const siteSheet = workbook.addWorksheet("Site");
  siteSheet.getColumn(1).width = 35;
  siteSheet.getColumn(2).width = 50;

  const siteTitle = siteSheet.addRow(["Initial Site (optional)"]);
  siteTitle.font = { size: 14, bold: true };
  siteSheet.addRow([""]);
  const siteNote = siteSheet.addRow([
    "Fill out this sheet if you want us to set up the first site where we'll provide services.",
  ]);
  siteNote.getCell(1).font = { italic: true, color: { argb: "FF666666" } };
  siteSheet.addRow([""]);
  addLabeledRow(siteSheet, "Site Name", true);
  addLabeledRow(siteSheet, "Address Line 1");
  addLabeledRow(siteSheet, "Address Line 2");
  addLabeledRow(siteSheet, "City");
  addLabeledRow(siteSheet, "Province");
  addLabeledRow(siteSheet, "Postal Code");
  addLabeledRow(siteSheet, "Country");

  // ─── Output ───
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export interface Subcontractor {
  id: string;
  company: string;
  primaryContact: string;
  email: string;
  phone: string;
  trade: "Cabling" | "Fire Alarm" | "Electrical" | "General Construction" | "HVAC";
  insuranceExpiry: string;
  wsibNumber: string;
  activeProjects: number;
  paidYTD: number;
  status: "Active" | "Pending Documents" | "Suspended";
}

// Pre-Quotes cleanup (2026-05-11): mock data emptied. The Subcontractor
// interface is preserved. The subcontractors surface is unwired; will
// render an empty state until the Subcontractors module ships its
// schema + API.
export const subcontractors: Subcontractor[] = [];

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

export const subcontractors: Subcontractor[] = [
  {
    id: "sub-1",
    company: "Brennan Electric",
    primaryContact: "Cole Brennan",
    email: "cole@brennan-electric.com",
    phone: "(289) 555-0399",
    trade: "Electrical",
    insuranceExpiry: "2026-09-12",
    wsibNumber: "WSIB-7849-001",
    activeProjects: 4,
    paidYTD: 84_200,
    status: "Active",
  },
  {
    id: "sub-2",
    company: "Ramos Cabling",
    primaryContact: "Diego Ramos",
    email: "diego@ramos-cabling.com",
    phone: "(905) 555-0420",
    trade: "Cabling",
    insuranceExpiry: "2026-05-18",
    wsibNumber: "WSIB-3322-014",
    activeProjects: 6,
    paidYTD: 142_900,
    status: "Active",
  },
  {
    id: "sub-3",
    company: "Beaumont Fire Systems",
    primaryContact: "Isaac Beaumont",
    email: "isaac@beaumont-fire.com",
    phone: "(289) 555-0445",
    trade: "Fire Alarm",
    insuranceExpiry: "2026-05-09",
    wsibNumber: "WSIB-6601-220",
    activeProjects: 2,
    paidYTD: 38_600,
    status: "Active",
  },
  {
    id: "sub-4",
    company: "Kingsway Mechanical",
    primaryContact: "Shawna Kingsway",
    email: "shawna@kingsway-mech.com",
    phone: "(905) 555-0511",
    trade: "HVAC",
    insuranceExpiry: "2025-12-15",
    wsibNumber: "WSIB-2289-077",
    activeProjects: 1,
    paidYTD: 16_400,
    status: "Pending Documents",
  },
  {
    id: "sub-5",
    company: "Crown Construction Group",
    primaryContact: "Vincent Castellan",
    email: "vincent@crown-cg.com",
    phone: "(905) 555-0644",
    trade: "General Construction",
    insuranceExpiry: "2026-11-02",
    wsibNumber: "WSIB-4488-115",
    activeProjects: 0,
    paidYTD: 0,
    status: "Suspended",
  },
];

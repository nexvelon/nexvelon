import type { Role } from "./types";

export interface DemoAccount {
  email: string;
  password: string;
  role: Role;
  name: string;
  label: string;
  blurb: string;
}

// All five demo chips share P@ssw0rd so judges can either type creds
// manually or one-click a chip.
export const DEMO_PASSWORD = "P@ssw0rd";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "admin@nexvelon.com",
    password: DEMO_PASSWORD,
    role: "Admin",
    name: "Marcus Holloway",
    label: "Admin",
    blurb: "Marcus Holloway — full access across every module.",
  },
  {
    email: "pm@nexvelon.com",
    password: DEMO_PASSWORD,
    role: "ProjectManager",
    name: "Aria Vance",
    label: "Project Manager",
    blurb: "Aria Vance — owns projects, scheduling, and quote conversion.",
  },
  {
    email: "sales@nexvelon.com",
    password: DEMO_PASSWORD,
    role: "SalesRep",
    name: "Camille Beaumont",
    label: "Sales Rep",
    blurb: "Camille Beaumont — drafts quotes; no margin or financials.",
  },
  {
    email: "tech@nexvelon.com",
    password: DEMO_PASSWORD,
    role: "Technician",
    name: "Damola Okafor",
    label: "Technician",
    blurb: "Damola Okafor — own schedule only, field-facing reads.",
  },
  {
    email: "accounting@nexvelon.com",
    password: DEMO_PASSWORD,
    role: "Accountant",
    name: "Eleanor Carstairs",
    label: "Accountant",
    blurb: "Eleanor Carstairs — full financials visibility, read-only on quotes.",
  },
];

export function findDemoAccountByEmail(email: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((d) => d.email.toLowerCase() === email.toLowerCase());
}

export function authenticate(
  email: string,
  password: string
): DemoAccount | null {
  const acct = findDemoAccountByEmail(email);
  if (!acct) return null;
  if (acct.password !== password) return null;
  return acct;
}

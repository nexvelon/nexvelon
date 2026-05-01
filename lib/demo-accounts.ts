import type { Role } from "./types";

export interface DemoAccount {
  email: string;
  password: string;
  role: Role;
  label: string;
  blurb: string;
}

// Used by the login chips and the username/password autofill behaviour.
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "admin@nexvelon.com",
    password: "demo",
    role: "Admin",
    label: "Admin",
    blurb: "Marcus Reyes — full access to every module.",
  },
  {
    email: "sophie@nexvelon.com",
    password: "demo",
    role: "ProjectManager",
    label: "Project Manager",
    blurb: "Sophie Tremblay — owns projects, scheduling, and quote conversion.",
  },
  {
    email: "priya@nexvelon.com",
    password: "demo",
    role: "SalesRep",
    label: "Sales Rep",
    blurb: "Priya Shankar — drafts quotes; no margin or financials.",
  },
  {
    email: "jin@nexvelon.com",
    password: "demo",
    role: "Technician",
    label: "Technician",
    blurb: "Jin Park — own schedule only, field-facing reads.",
  },
  {
    email: "hannah@nexvelon.com",
    password: "demo",
    role: "Accountant",
    label: "Accountant",
    blurb: "Hannah Liu — full financials visibility, read-only on quotes.",
  },
];

export function findDemoAccountByEmail(email: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((d) => d.email.toLowerCase() === email.toLowerCase());
}

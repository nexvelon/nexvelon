// CLEAN-1 §4c — pure breadcrumb logic, split out of the client component so it is
// unit-testable without pulling in next/navigation or the server-action module.
// The label for a detail route (project/quote) is resolved from the live tables
// by the component and threaded in here as `resolvedLabel`.

export const TOP_LABELS: Record<string, string> = {
  dashboard: "Executive Dashboard",
  quotes: "Quotes",
  projects: "Projects",
  clients: "Clients",
  inventory: "Inventory",
  scheduling: "Scheduling",
  financials: "Financial Operations",
  users: "Users & Permissions",
  settings: "Settings",
  new: "New Quote",
};

export const PROJECT_TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  tasks: "Tasks",
  schedule: "Schedule",
  materials: "Materials",
  commissioning: "Commissioning",
  zones: "Zone List",
  documents: "Documents",
  financials: "Financials",
  time: "Time & Labor",
};

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The dynamic segment that a detail route resolves to a real name. Returns which
 * entity is referenced and its id, so the caller can fetch the label. Static
 * segments ("new") and non-detail routes return null.
 */
export function detailEntity(
  pathname: string
): { kind: "project" | "quote"; id: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  const [top, second] = segments;
  if (!second || second === "new") return null;
  if (top === "projects") return { kind: "project", id: second };
  if (top === "quotes") return { kind: "quote", id: second };
  return null;
}

/**
 * `resolvedLabel` is the real name fetched for the detail segment (null while
 * loading or when unknown — the raw uuid is the honest fallback).
 */
export function buildCrumbs(
  pathname: string,
  tab: string | null,
  resolvedLabel: string | null
): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "OPERATIONS" }, { label: "DASHBOARD" }];

  const out: Crumb[] = [{ label: "OPERATIONS" }];
  const top = segments[0];
  out.push({
    label: (TOP_LABELS[top] ?? top).toUpperCase(),
    href: `/${top}`,
  });

  if (top === "projects" && segments[1]) {
    if (segments[1] === "new") {
      out.push({ label: "NEW PROJECT" });
    } else {
      out.push({
        label: (resolvedLabel ?? segments[1]).toUpperCase(),
      });
      if (tab && PROJECT_TAB_LABELS[tab]) {
        out.push({ label: PROJECT_TAB_LABELS[tab].toUpperCase() });
      }
    }
  } else if (top === "quotes" && segments[1]) {
    if (segments[1] === "new") {
      out.push({ label: "NEW QUOTE" });
    } else {
      out.push({ label: (resolvedLabel ?? segments[1]).toUpperCase() });
    }
  }

  return out;
}

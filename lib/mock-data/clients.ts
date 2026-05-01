import type { Client } from "../types";

// Roster updated to match the Claude Design v4.18 screenshots.
// IDs preserved so all derived data (projects, quotes, invoices, sites,
// allocations, dashboard activity) keeps working without rewrite.
export const clients: Client[] = [
  { id: "c-001", name: "Meridian Capital Plaza", type: "Commercial", status: "Active", contactName: "Edward Caldwell", email: "ecaldwell@meridiancapital.com", phone: "(416) 555-1001", address: "488 King Street West", city: "Toronto", state: "ON", createdAt: "2018-06-14", totalRevenue: 1_420_000 },
  { id: "c-002", name: "Westgate Industrial", type: "Industrial", status: "Active", contactName: "Caroline Wynn", email: "cwynn@westgate-industrial.com", phone: "(905) 555-1002", address: "47 Cargo Rd", city: "Mississauga", state: "ON", createdAt: "2021-08-09", totalRevenue: 742_000 },
  { id: "c-003", name: "Hartwell Estates", type: "Residential", status: "Active", contactName: "Felix Marchetti", email: "felix@hartwell.estate", phone: "(416) 555-1003", address: "8 Queens Quay W", city: "Toronto", state: "ON", createdAt: "2020-11-22", totalRevenue: 614_000 },
  { id: "c-004", name: "Cromwell Logistics", type: "Industrial", status: "Active", contactName: "Tasha Reinhardt", email: "treinhardt@cromwell-logistics.ca", phone: "(519) 555-1004", address: "2200 Industrial Pkwy", city: "Cambridge", state: "ON", createdAt: "2023-01-30", totalRevenue: 498_000 },
  { id: "c-005", name: "Ardent Pharmaceuticals", type: "Industrial", status: "Active", contactName: "Aria Vance", email: "avance@nexvelon.io", phone: "(905) 555-1005", address: "1842 Industrial Pkwy", city: "Mississauga", state: "ON", createdAt: "2018-06-18", totalRevenue: 8_420_000 },
  { id: "c-006", name: "Bellmont Hospital Group", type: "Commercial", status: "Active", contactName: "Henry Volkov", email: "hvolkov@bellmont-hospital.org", phone: "(905) 555-1006", address: "1500 Mountain Rd", city: "Burlington", state: "ON", createdAt: "2022-05-04", totalRevenue: 412_000 },
  { id: "c-007", name: "Ironclad Distribution", type: "Industrial", status: "Active", contactName: "Marisol Vega", email: "mvega@ironcladdist.com", phone: "(289) 555-1007", address: "880 Warehouse Way", city: "Hamilton", state: "ON", createdAt: "2021-04-12", totalRevenue: 421_300 },
  { id: "c-008", name: "Bellwood Condos", type: "Residential", status: "Active", contactName: "Ravi Khanna", email: "rkhanna@bellwoodcondos.ca", phone: "(416) 555-1008", address: "300 Bellwood Ave", city: "Toronto", state: "ON", createdAt: "2023-09-21", totalRevenue: 142_000 },
  { id: "c-009", name: "Stratford Medical Center", type: "Commercial", status: "Active", contactName: "Dr. Imogen Bailey", email: "i.bailey@stratfordmed.org", phone: "(519) 555-1009", address: "75 Hospital Way", city: "Stratford", state: "ON", createdAt: "2022-12-03", totalRevenue: 387_100 },
  { id: "c-010", name: "Wexford Pharmaceuticals", type: "Industrial", status: "Active", contactName: "Owen Holcombe", email: "oholcombe@wexfordpharma.com", phone: "(905) 555-1010", address: "12 Innovation Dr", city: "Oakville", state: "ON", createdAt: "2020-07-15", totalRevenue: 728_500 },
  { id: "c-011", name: "Kempton Independent Schools", type: "Commercial", status: "Active", contactName: "Mira Andersen", email: "mira@kemptonschools.org", phone: "(416) 555-1011", address: "240 King St E", city: "Toronto", state: "ON", createdAt: "2024-02-08", totalRevenue: 298_000 },
  { id: "c-012", name: "Crestwood Private Residence", type: "Residential", status: "Active", contactName: "James Beaumont", email: "jbeaumont@private.com", phone: "(416) 555-1012", address: "18 Crestwood Crescent", city: "Toronto", state: "ON", createdAt: "2023-11-05", totalRevenue: 68_400 },
  { id: "c-013", name: "Kingsbridge Auto Group", type: "Commercial", status: "Active", contactName: "Sandra Kovacs", email: "skovacs@kingsbridgeauto.com", phone: "(905) 555-1013", address: "4400 Dundas St", city: "Etobicoke", state: "ON", createdAt: "2021-10-19", totalRevenue: 215_700 },
  { id: "c-014", name: "Halton Cold Storage", type: "Industrial", status: "Active", contactName: "Vincent Okafor", email: "vokafor@haltoncold.ca", phone: "(905) 555-1014", address: "9 Refrigeration Ln", city: "Milton", state: "ON", createdAt: "2022-08-26", totalRevenue: 296_400 },
  { id: "c-015", name: "St. Cuthbert Cathedral", type: "Commercial", status: "Active", contactName: "Lena Ostrowski", email: "lena@stcuthbert-cathedral.org", phone: "(289) 555-1015", address: "501 Riverside Dr", city: "Hamilton", state: "ON", createdAt: "2023-04-11", totalRevenue: 84_000 },
  { id: "c-016", name: "Sterling Industrial", type: "Industrial", status: "Active", contactName: "Patricia Tovar", email: "ptovar@sterling-industrial.com", phone: "(416) 555-1016", address: "200 Sterling Way", city: "Vaughan", state: "ON", createdAt: "2022-02-28", totalRevenue: 112_300 },
  { id: "c-017", name: "Beacon Energy Solutions", type: "Industrial", status: "Active", contactName: "Marcus Dietrich", email: "mdietrich@beaconenergy.com", phone: "(519) 555-1017", address: "330 Power Ave", city: "London", state: "ON", createdAt: "2021-12-14", totalRevenue: 392_600 },
  { id: "c-018", name: "Vance Capital Partners", type: "Commercial", status: "Prospect", contactName: "Eleanor Vance", email: "evance@vancecapital.com", phone: "(416) 555-1018", address: "180 Bay St", city: "Toronto", state: "ON", createdAt: "2024-03-20", totalRevenue: 0 },
  { id: "c-019", name: "Greenfield Medical Plaza", type: "Commercial", status: "Active", contactName: "Dr. Anand Mehta", email: "amehta@greenfieldmed.ca", phone: "(905) 555-1019", address: "65 Plaza Blvd", city: "Brampton", state: "ON", createdAt: "2022-09-09", totalRevenue: 248_100 },
  { id: "c-020", name: "Ashford Heritage Manor", type: "Residential", status: "Dormant", contactName: "Geoffrey Ashford", email: "g.ashford@private.com", phone: "(416) 555-1020", address: "44 Heritage Ln", city: "Toronto", state: "ON", createdAt: "2020-03-07", totalRevenue: 31_200 },
];

// Tier metadata mirrors the screenshot — Platinum / Gold / Silver / Bronze
// based on lifetime value buckets. Used by the new Clients page.
export type ClientTier = "Platinum" | "Gold" | "Silver" | "Bronze";

export function clientTier(c: Client): ClientTier {
  if (c.totalRevenue >= 1_000_000) return "Platinum";
  if (c.totalRevenue >= 400_000) return "Gold";
  if (c.totalRevenue >= 100_000) return "Silver";
  return "Bronze";
}

export const CLIENT_TIER_BADGE: Record<ClientTier, { label: string; bg: string; text: string }> = {
  Platinum: { label: "P", bg: "#0A1226", text: "#F5F1E8" },
  Gold: { label: "G", bg: "#B8924B", text: "#0A1226" },
  Silver: { label: "S", bg: "#A8B0C4", text: "#0A1226" },
  Bronze: { label: "B", bg: "#9A7B3A", text: "#F5F1E8" },
};

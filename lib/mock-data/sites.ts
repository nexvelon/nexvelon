import type { Site } from "../types";
import { clients } from "./clients";

// Most clients have one operating site (their billing address); the larger
// commercial / industrial accounts have a couple.
const EXTRA_SITES: Record<string, { name: string; address: string; city: string; state: string }[]> = {
  "c-001": [
    { name: "Meridian Capital Plaza — Lobby & Cores", address: "120 Adelaide St W", city: "Toronto", state: "ON" },
    { name: "Meridian Capital Plaza — Tenant Floors 14-22", address: "120 Adelaide St W, Floors 14-22", city: "Toronto", state: "ON" },
    { name: "Meridian — Parking P1-P3", address: "120 Adelaide St W, Garage Levels", city: "Toronto", state: "ON" },
  ],
  "c-002": [
    { name: "Northbridge — Main DC", address: "47 Cargo Rd", city: "Mississauga", state: "ON" },
    { name: "Northbridge — Yard & Gatehouse", address: "47 Cargo Rd, Yard", city: "Mississauga", state: "ON" },
  ],
  "c-003": [
    { name: "Harborfront Tower 3", address: "8 Queens Quay W", city: "Toronto", state: "ON" },
    { name: "Harborfront Promenade Retail", address: "8 Queens Quay W, Ground Level", city: "Toronto", state: "ON" },
  ],
  "c-007": [
    { name: "Ironclad — Distribution North", address: "880 Warehouse Way", city: "Hamilton", state: "ON" },
    { name: "Ironclad — Loading Bays 1-6", address: "880 Warehouse Way, Bay Doors", city: "Hamilton", state: "ON" },
  ],
  "c-010": [
    { name: "Wexford — Cleanroom Block A", address: "12 Innovation Dr", city: "Oakville", state: "ON" },
    { name: "Wexford — Admin Building", address: "12 Innovation Dr, Bldg B", city: "Oakville", state: "ON" },
  ],
  "c-017": [
    { name: "Beacon Energy — Substation 04", address: "330 Power Ave, Substation 04", city: "London", state: "ON" },
    { name: "Beacon Energy — Operations Center", address: "330 Power Ave, OC", city: "London", state: "ON" },
  ],
};

export const sites: Site[] = clients.flatMap((c) => {
  const extras = EXTRA_SITES[c.id];
  if (extras && extras.length > 0) {
    return extras.map((s, idx) => ({
      id: `s-${c.id}-${idx + 1}`,
      clientId: c.id,
      name: s.name,
      address: s.address,
      city: s.city,
      state: s.state,
    }));
  }
  return [
    {
      id: `s-${c.id}-1`,
      clientId: c.id,
      name: `${c.name} — Primary site`,
      address: c.address,
      city: c.city,
      state: c.state,
    },
  ];
});

export function sitesForClient(clientId: string): Site[] {
  return sites.filter((s) => s.clientId === clientId);
}

// DEVREG-1B — Riser Studio's device type catalog, exactly as extracted from the
// tool by Jay (2026-11-20). DO NOT rename, re-order or invent ids: the id is what
// round-trips unchanged between Riser Studio and the register. Migration 0137 seeds
// these same 62 rows into public.device_types (as data, not a CHECK: the list grows,
// §1); a test asserts the migration and this file agree row for row.
//
// mountHeightM is Riser's default mount height in metres (0 is a real value: a door
// group or a floor rack sits at floor level). cable is Riser's default cable code;
// null where the catalog lists none ("—"). The catalog carries NO pricing; mapping
// types and accessories to ERP products is DEVREG-3.
//
// kind: typA/typB/typC/typD and doorleaf are DOOR GROUPS, not single devices.
// Placing a typical in Riser Studio creates a door leaf plus its member devices, all
// sharing one door id, so they're a distinct kind here.

export type DeviceTypeKind = "device" | "door_group";

export interface RiserCatalogType {
  id: string;
  name: string;
  system: string;
  labelPrefix: string;
  mountHeightM: number;
  cable: string | null;
  kind: DeviceTypeKind;
}

export const RISER_TYPE_CATALOG: readonly RiserCatalogType[] = [
  { id: "dome", name: "Dome camera", system: "cctv", labelPrefix: "CAM", mountHeightM: 2.8, cable: "cat6", kind: "device" },
  { id: "bullet", name: "Bullet camera", system: "cctv", labelPrefix: "CAM", mountHeightM: 3, cable: "cat6", kind: "device" },
  { id: "turret", name: "Turret camera", system: "cctv", labelPrefix: "CAM", mountHeightM: 2.8, cable: "cat6", kind: "device" },
  { id: "ptz", name: "PTZ camera", system: "cctv", labelPrefix: "PTZ", mountHeightM: 4, cable: "cat6", kind: "device" },
  { id: "fish", name: "360° fisheye camera", system: "cctv", labelPrefix: "CAM", mountHeightM: 3, cable: "cat6", kind: "device" },
  { id: "multi", name: "Multi-sensor camera", system: "cctv", labelPrefix: "CAM", mountHeightM: 4, cable: "cat6", kind: "device" },
  { id: "lpr", name: "LPR camera", system: "cctv", labelPrefix: "LPR", mountHeightM: 3, cable: "cat6", kind: "device" },
  { id: "nvr", name: "NVR / recorder", system: "cctv", labelPrefix: "NVR", mountHeightM: 1.2, cable: null, kind: "device" },
  { id: "mon", name: "Monitor / video wall", system: "cctv", labelPrefix: "MON", mountHeightM: 1.6, cable: "cat6", kind: "device" },
  { id: "reader", name: "Card reader", system: "access", labelPrefix: "RDR", mountHeightM: 1.1, cable: "c226", kind: "device" },
  { id: "kpreader", name: "Keypad reader", system: "access", labelPrefix: "KPR", mountHeightM: 1.1, cable: "r224", kind: "device" },
  { id: "mobreader", name: "Mobile / BLE reader", system: "access", labelPrefix: "RDR", mountHeightM: 1.1, cable: "c226", kind: "device" },
  { id: "strike", name: "Electric strike", system: "access", labelPrefix: "STR", mountHeightM: 1.0, cable: "l182", kind: "device" },
  { id: "mag", name: "Maglock", system: "access", labelPrefix: "MAG", mountHeightM: 2.05, cable: "l182", kind: "device" },
  { id: "dc", name: "Door contact", system: "access", labelPrefix: "DC", mountHeightM: 2.05, cable: "s222", kind: "device" },
  { id: "rex", name: "REX motion sensor", system: "access", labelPrefix: "REX", mountHeightM: 2.3, cable: "s222", kind: "device" },
  { id: "pte", name: "Push-to-exit button", system: "access", labelPrefix: "PTE", mountHeightM: 1.1, cable: "s222", kind: "device" },
  { id: "ado", name: "Automatic door operator", system: "access", labelPrefix: "ADO", mountHeightM: 2.2, cable: "s222", kind: "device" },
  { id: "pb", name: "ADO push button (wave-to-open)", system: "access", labelPrefix: "PB", mountHeightM: 1.0, cable: "s222", kind: "device" },
  { id: "elevrdr", name: "Elevator cab reader", system: "access", labelPrefix: "ERD", mountHeightM: 1.2, cable: "c226", kind: "device" },
  { id: "elevio", name: "Elevator floor-select I/O board", system: "access", labelPrefix: "EIO", mountHeightM: 1.5, cable: "rs485", kind: "device" },
  { id: "rim", name: "Reader interface module", system: "access", labelPrefix: "RIM", mountHeightM: 1.6, cable: "rs485", kind: "device" },
  { id: "psu", name: "Access power supply", system: "access", labelPrefix: "PSU", mountHeightM: 1.6, cable: "p142", kind: "device" },
  { id: "gate", name: "Gate / barrier operator", system: "access", labelPrefix: "GATE", mountHeightM: 1, cable: "c226", kind: "device" },
  { id: "turnstile", name: "Turnstile / speed lane", system: "access", labelPrefix: "TRN", mountHeightM: 1, cable: "c226", kind: "device" },
  { id: "dgp", name: "Door controller (DGP)", system: "access", labelPrefix: "DGP", mountHeightM: 1.6, cable: "cat6", kind: "device" },
  { id: "typA", name: "Door typical A · strike", system: "access", labelPrefix: "D", mountHeightM: 0, cable: null, kind: "door_group" },
  { id: "typB", name: "Door typical B · maglock", system: "access", labelPrefix: "D", mountHeightM: 0, cable: null, kind: "door_group" },
  { id: "typC", name: "Door typical C · ADO", system: "access", labelPrefix: "D", mountHeightM: 0, cable: null, kind: "door_group" },
  { id: "doorleaf", name: "Door", system: "access", labelPrefix: "DR", mountHeightM: 0, cable: null, kind: "door_group" },
  { id: "entry", name: "Entryphone / lobby panel", system: "intercom", labelPrefix: "ENT", mountHeightM: 1.4, cable: "ic224", kind: "device" },
  { id: "suite", name: "Suite station", system: "intercom", labelPrefix: "STE", mountHeightM: 1.5, cable: "ic222", kind: "device" },
  { id: "ipds", name: "IP door station", system: "intercom", labelPrefix: "IPD", mountHeightM: 1.4, cable: "cat6", kind: "device" },
  { id: "guard", name: "Guard / concierge station", system: "intercom", labelPrefix: "GRD", mountHeightM: 1, cable: "cat6", kind: "device" },
  { id: "icm", name: "Intercom controller", system: "intercom", labelPrefix: "ICM", mountHeightM: 1.6, cable: "cat6", kind: "device" },
  { id: "kp", name: "Alarm keypad", system: "intrusion", labelPrefix: "KP", mountHeightM: 1.4, cable: "a224", kind: "device" },
  { id: "pir", name: "Motion detector (PIR)", system: "intrusion", labelPrefix: "PIR", mountHeightM: 2.4, cable: "a224", kind: "device" },
  { id: "gb", name: "Glass-break detector", system: "intrusion", labelPrefix: "GB", mountHeightM: 2.4, cable: "a222", kind: "device" },
  { id: "idc", name: "Intrusion door contact", system: "intrusion", labelPrefix: "CT", mountHeightM: 2.05, cable: "a222", kind: "device" },
  { id: "duress", name: "Duress / panic button", system: "intrusion", labelPrefix: "DUR", mountHeightM: 0.75, cable: "a222", kind: "device" },
  { id: "siren", name: "Siren / strobe", system: "intrusion", labelPrefix: "SRN", mountHeightM: 2.6, cable: "a222", kind: "device" },
  { id: "zexp", name: "Zone expander", system: "intrusion", labelPrefix: "ZEX", mountHeightM: 1.6, cable: "a224", kind: "device" },
  { id: "ipanel", name: "Intrusion panel", system: "intrusion", labelPrefix: "IAP", mountHeightM: 1.6, cable: null, kind: "device" },
  { id: "typD", name: "Door typical D · intrusion", system: "intrusion", labelPrefix: "D", mountHeightM: 0, cable: null, kind: "door_group" },
  { id: "facp", name: "Fire alarm control panel", system: "fire", labelPrefix: "FACP", mountHeightM: 1.6, cable: null, kind: "device" },
  { id: "stu", name: "ULC signal transmitter (STU)", system: "fire", labelPrefix: "STU", mountHeightM: 1.6, cable: "fplr18", kind: "device" },
  { id: "smoke", name: "Smoke detector", system: "fire", labelPrefix: "SD", mountHeightM: 2.9, cable: "fplr18", kind: "device" },
  { id: "heat", name: "Heat detector", system: "fire", labelPrefix: "HD", mountHeightM: 2.9, cable: "fplr18", kind: "device" },
  { id: "pull", name: "Manual pull station", system: "fire", labelPrefix: "MPS", mountHeightM: 1.2, cable: "fplr18", kind: "device" },
  { id: "hs", name: "Horn / strobe", system: "fire", labelPrefix: "HS", mountHeightM: 2.3, cable: "fplr16", kind: "device" },
  { id: "mm", name: "Monitor / control module", system: "fire", labelPrefix: "MM", mountHeightM: 2.4, cable: "fplr18", kind: "device" },
  { id: "ann", name: "Remote annunciator", system: "fire", labelPrefix: "ANN", mountHeightM: 1.5, cable: "fplr18", kind: "device" },
  { id: "rack", name: "Floor rack 42U", system: "network", labelPrefix: "RACK", mountHeightM: 0, cable: null, kind: "device" },
  { id: "wrack", name: "Wall rack 12U", system: "network", labelPrefix: "WR", mountHeightM: 1.2, cable: "fmm", kind: "device" },
  { id: "sw", name: "PoE switch", system: "network", labelPrefix: "SW", mountHeightM: 1.3, cable: "fmm", kind: "device" },
  { id: "ws", name: "Workstation / client", system: "network", labelPrefix: "WS", mountHeightM: 0.8, cable: "cat6", kind: "device" },
  { id: "ups", name: "UPS", system: "network", labelPrefix: "UPS", mountHeightM: 0.3, cable: "p122", kind: "device" },
  { id: "mc", name: "Media converter", system: "network", labelPrefix: "MC", mountHeightM: 1.4, cable: "fmm", kind: "device" },
  { id: "epanel", name: "Electrical panel", system: "electrical", labelPrefix: "EP", mountHeightM: 1.5, cable: null, kind: "device" },
  { id: "rcpt", name: "Receptacle 120 V", system: "electrical", labelPrefix: "RCP", mountHeightM: 0.45, cable: "p142", kind: "device" },
  { id: "jb", name: "Junction / pull box", system: "electrical", labelPrefix: "JB", mountHeightM: 2.8, cable: null, kind: "device" },
  { id: "xfmr", name: "Transformer 24 VAC", system: "electrical", labelPrefix: "XF", mountHeightM: 1.6, cable: "p142", kind: "device" },
] as const;

export const RISER_TYPE_IDS: ReadonlySet<string> = new Set(RISER_TYPE_CATALOG.map((t) => t.id));


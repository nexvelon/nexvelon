// DEVREG-1 — which operating company a device belongs to (decision 3e, §2.6).
//
// A device has no opco column of its own; it reaches an opco through what it's
// attached to, in this order:
//   1. its project → projects.opco (explicit, always wins);
//   2. otherwise its site's client → clients.allowed_opcos, ONLY if that list has
//      exactly one opco.
// Anything else (no project and a client allowed in several opcos, or a client
// with none) is UNRESOLVED. It is shown as "Opco not determined" and never guessed;
// in particular clients.default_opco is NOT used, because a default is a
// suggestion for new records, not evidence of where this device belongs.

export type OpcoResolution =
  | { status: "resolved"; opco: string; via: "project" | "client" }
  | { status: "unresolved"; reason: "client_multi_opco" | "client_no_opco" };

export function resolveDeviceOpco(input: {
  projectOpco: string | null | undefined;
  clientAllowedOpcos: string[] | null | undefined;
}): OpcoResolution {
  if (input.projectOpco) return { status: "resolved", opco: input.projectOpco, via: "project" };
  const allowed = [...new Set((input.clientAllowedOpcos ?? []).filter(Boolean))];
  if (allowed.length === 1) return { status: "resolved", opco: allowed[0], via: "client" };
  return { status: "unresolved", reason: allowed.length === 0 ? "client_no_opco" : "client_multi_opco" };
}

export const OPCO_UNRESOLVED_LABEL = "Opco not determined";

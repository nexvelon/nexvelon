// SERIAL-1 — single source of truth for "is this part serialized?".
//
// The is_serialized toggle (migration 0047) is the authoritative control; the
// part form keeps tracking_mode in sync ('serialized' when the toggle is on).
// Legacy / bulk-imported parts may carry tracking_mode='serialized' without
// is_serialized set, so we treat EITHER signal as serialized. Pure + isomorphic
// (importable from both server and client modules).
export function isSerializedProduct(p: {
  is_serialized?: boolean | null;
  tracking_mode?: string | null;
}): boolean {
  return Boolean(p.is_serialized) || p.tracking_mode === "serialized";
}

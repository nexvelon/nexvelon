// DEVREG-1 — device identity (decision 3g).
//
// `lab` (CAM-01, D-003) is unique within a project in Riser Studio, but not
// globally. The register's rule: a label is unique within ONE SITE + ONE BUILDING
// among live devices, case-insensitively. Two buildings on a campus may each have
// a CAM-01; they're shown as "<building> · CAM-01". The same label in the same
// building is the same physical device, so a later project at that site that
// imports CAM-01 again UPDATES it rather than creating a second one.
// The database enforces this with a partial unique index
// (devices_site_building_label_uniq); this module is the same rule in code, for
// the import planner and the UI.

export function labelKey(siteId: string, buildingKey: string | null | undefined, label: string | null | undefined): string | null {
  if (!label || !label.trim()) return null;
  return `${siteId}|${(buildingKey ?? "").trim()}|${label.trim().toLowerCase()}`;
}

/** "B1 · CAM-01" when the building is known, else just the label. */
export function displayLabel(
  label: string | null | undefined,
  buildingName: string | null | undefined
): string {
  const l = label?.trim() || "";
  const b = buildingName?.trim() || "";
  if (!l) return "";
  return b ? `${b} · ${l}` : l;
}

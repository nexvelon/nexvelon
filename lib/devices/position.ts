// DEVREG-1 — position conversion (decision 2C).
//
// Canonical = METRES on the authored floor (Riser Studio x/z). The 3D viewer's
// normalised 0–1 plan position is a different frame: u runs left→right across the
// plan image, v top→bottom. Converting needs the plan image's real-world
// placement on the floor, held on the floor row:
//
//   x_m = plan_origin_x_m + u × plan_width_m
//   z_m = plan_origin_z_m + v × plan_depth_m
//
// The plan is assumed axis-aligned with the authored floor (no rotation between
// them). A rotated plan is out of scope; it would need a rotation column first.
//
// NEVER fabricated: if the floor has no plan, or any of the four placement values
// is unknown, the conversion REFUSES with a reason. It never assumes a default
// scale or a zero origin.

export interface FloorScale {
  plan_aspect: number | null;
  plan_origin_x_m: number | null;
  plan_origin_z_m: number | null;
  plan_width_m: number | null;
  plan_depth_m: number | null;
}

export type ConversionRefusal = "no_plan" | "scale_unknown" | "no_floor";

export type ConversionResult<T> = { ok: true; value: T } | { ok: false; reason: ConversionRefusal };

export const CONVERSION_REFUSAL_LABEL: Record<ConversionRefusal, string> = {
  no_floor: "Not placed on a floor, so it can't be converted.",
  no_plan: "This floor has no plan image, so there is no plan position.",
  scale_unknown: "The plan's real-world scale isn't recorded, so it can't be converted.",
};

/** Is enough known about this floor to convert at all? */
export function floorScaleStatus(floor: FloorScale | null | undefined): ConversionResult<true> {
  if (!floor) return { ok: false, reason: "no_floor" };
  if (floor.plan_aspect == null) return { ok: false, reason: "no_plan" };
  const vals = [floor.plan_origin_x_m, floor.plan_origin_z_m, floor.plan_width_m, floor.plan_depth_m];
  if (vals.some((v) => v == null || !Number.isFinite(Number(v)))) return { ok: false, reason: "scale_unknown" };
  if (Number(floor.plan_width_m) <= 0 || Number(floor.plan_depth_m) <= 0) {
    return { ok: false, reason: "scale_unknown" };
  }
  return { ok: true, value: true };
}

/** Metres on the floor → 0–1 on the plan image. */
export function metresToNormalised(
  floor: FloorScale | null | undefined,
  xM: number,
  zM: number
): ConversionResult<{ u: number; v: number }> {
  const s = floorScaleStatus(floor);
  if (!s.ok) return s;
  const f = floor as Required<{ [K in keyof FloorScale]: number }>;
  return {
    ok: true,
    value: {
      u: (xM - Number(f.plan_origin_x_m)) / Number(f.plan_width_m),
      v: (zM - Number(f.plan_origin_z_m)) / Number(f.plan_depth_m),
    },
  };
}

/** 0–1 on the plan image → metres on the floor. */
export function normalisedToMetres(
  floor: FloorScale | null | undefined,
  u: number,
  v: number
): ConversionResult<{ x: number; z: number }> {
  const s = floorScaleStatus(floor);
  if (!s.ok) return s;
  const f = floor as Required<{ [K in keyof FloorScale]: number }>;
  return {
    ok: true,
    value: {
      x: Number(f.plan_origin_x_m) + u * Number(f.plan_width_m),
      z: Number(f.plan_origin_z_m) + v * Number(f.plan_depth_m),
    },
  };
}

/**
 * The plan's recorded real-world extent should match its image aspect. A mismatch
 * isn't fatal, but it means the scale or the image is wrong, so it's surfaced.
 */
export function aspectMismatch(floor: FloorScale, tolerance = 0.02): boolean {
  if (floor.plan_aspect == null || floor.plan_width_m == null || floor.plan_depth_m == null) return false;
  const real = Number(floor.plan_width_m) / Number(floor.plan_depth_m);
  return Math.abs(real - Number(floor.plan_aspect)) / Number(floor.plan_aspect) > tolerance;
}

/**
 * What to show for a device's position in each frame. A stored value is shown as
 * stored; the other frame is computed only when the floor's scale is known.
 */
export function describePosition(
  device: { pos_x_m: number | null; pos_z_m: number | null; pos_u: number | null; pos_v: number | null },
  floor: FloorScale | null | undefined
): {
  metres: { x: number; z: number; derived: boolean } | null;
  normalised: { u: number; v: number; derived: boolean } | null;
  refusal: ConversionRefusal | null;
} {
  const hasM = device.pos_x_m != null && device.pos_z_m != null;
  const hasN = device.pos_u != null && device.pos_v != null;
  let metres = hasM ? { x: Number(device.pos_x_m), z: Number(device.pos_z_m), derived: false } : null;
  let normalised = hasN ? { u: Number(device.pos_u), v: Number(device.pos_v), derived: false } : null;
  let refusal: ConversionRefusal | null = null;
  if (hasM && !hasN) {
    const r = metresToNormalised(floor, Number(device.pos_x_m), Number(device.pos_z_m));
    if (r.ok) normalised = { ...r.value, derived: true };
    else refusal = r.reason;
  } else if (hasN && !hasM) {
    const r = normalisedToMetres(floor, Number(device.pos_u), Number(device.pos_v));
    if (r.ok) metres = { ...r.value, derived: true };
    else refusal = r.reason;
  }
  return { metres, normalised, refusal };
}

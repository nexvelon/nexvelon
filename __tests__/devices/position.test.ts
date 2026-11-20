// DEVREG-1 — position conversion (2C): converts both ways where the floor's scale
// is known, and refuses (never fabricates) where it isn't.

import { describe, it, expect } from "vitest";
import {
  metresToNormalised,
  normalisedToMetres,
  floorScaleStatus,
  describePosition,
  aspectMismatch,
  type FloorScale,
} from "@/lib/devices/position";

const scaled: FloorScale = {
  plan_aspect: 2, // 40 m × 20 m plan
  plan_origin_x_m: -5,
  plan_origin_z_m: 10,
  plan_width_m: 40,
  plan_depth_m: 20,
};

describe("metres ↔ normalised, scale known", () => {
  it("converts metres to plan coordinates", () => {
    const r = metresToNormalised(scaled, 15, 15);
    expect(r).toEqual({ ok: true, value: { u: 0.5, v: 0.25 } });
  });

  it("converts plan coordinates to metres", () => {
    const r = normalisedToMetres(scaled, 0.5, 0.25);
    expect(r).toEqual({ ok: true, value: { x: 15, z: 15 } });
  });

  it("round-trips both ways", () => {
    const n = metresToNormalised(scaled, 7.3, 18.9);
    if (!n.ok) throw new Error("expected ok");
    const m = normalisedToMetres(scaled, n.value.u, n.value.v);
    if (!m.ok) throw new Error("expected ok");
    expect(m.value.x).toBeCloseTo(7.3, 10);
    expect(m.value.z).toBeCloseTo(18.9, 10);
  });

  it("the plan origin is honoured (top-left isn't assumed to be 0,0)", () => {
    expect(normalisedToMetres(scaled, 0, 0)).toEqual({ ok: true, value: { x: -5, z: 10 } });
  });
});

describe("refuses rather than fabricating a scale", () => {
  it("no floor → refused", () => {
    expect(metresToNormalised(null, 1, 1)).toEqual({ ok: false, reason: "no_floor" });
  });

  it("a floor with no plan image → refused as no_plan", () => {
    const noPlan: FloorScale = { ...scaled, plan_aspect: null };
    expect(metresToNormalised(noPlan, 1, 1)).toEqual({ ok: false, reason: "no_plan" });
    expect(normalisedToMetres(noPlan, 0.5, 0.5)).toEqual({ ok: false, reason: "no_plan" });
  });

  it("a plan whose real width is unknown → refused as scale_unknown", () => {
    const unknown: FloorScale = { ...scaled, plan_width_m: null };
    expect(normalisedToMetres(unknown, 0.5, 0.5)).toEqual({ ok: false, reason: "scale_unknown" });
  });

  it("a plan whose origin is unknown → refused (origin isn't defaulted to zero)", () => {
    const noOrigin: FloorScale = { ...scaled, plan_origin_x_m: null };
    expect(metresToNormalised(noOrigin, 1, 1)).toEqual({ ok: false, reason: "scale_unknown" });
  });

  it("a zero or negative extent → refused", () => {
    expect(floorScaleStatus({ ...scaled, plan_depth_m: 0 })).toEqual({ ok: false, reason: "scale_unknown" });
  });
});

describe("describePosition", () => {
  it("shows the stored frame as stored and derives the other only when the scale is known", () => {
    const p = describePosition({ pos_x_m: 15, pos_z_m: 15, pos_u: null, pos_v: null }, scaled);
    expect(p.metres).toEqual({ x: 15, z: 15, derived: false });
    expect(p.normalised).toEqual({ u: 0.5, v: 0.25, derived: true });
    expect(p.refusal).toBeNull();
  });

  it("with an unknown scale it shows only the stored frame and says why", () => {
    const p = describePosition({ pos_x_m: null, pos_z_m: null, pos_u: 0.3, pos_v: 0.6 }, { ...scaled, plan_width_m: null });
    expect(p.normalised).toEqual({ u: 0.3, v: 0.6, derived: false });
    expect(p.metres).toBeNull();
    expect(p.refusal).toBe("scale_unknown");
  });

  it("with both frames stored it never overwrites either with a computed value", () => {
    const p = describePosition({ pos_x_m: 1, pos_z_m: 2, pos_u: 0.9, pos_v: 0.9 }, scaled);
    expect(p.metres).toEqual({ x: 1, z: 2, derived: false });
    expect(p.normalised).toEqual({ u: 0.9, v: 0.9, derived: false });
  });
});

describe("aspectMismatch", () => {
  it("flags a recorded scale that disagrees with the image's aspect", () => {
    expect(aspectMismatch(scaled)).toBe(false);
    expect(aspectMismatch({ ...scaled, plan_depth_m: 30 })).toBe(true);
  });
});

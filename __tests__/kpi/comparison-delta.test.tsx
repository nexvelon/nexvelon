// UIDG-6B — the delta math edge cases (2e) and the rendered comparison: no
// infinity, no fabricated percentage, correct polarity for inverted metrics.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { computeDelta } from "@/components/kpi/comparison";
import { ComparisonDelta } from "@/components/kpi/ComparisonDelta";

describe("computeDelta — young-dataset edge cases", () => {
  it("prior > 0 → a real percentage change", () => {
    expect(computeDelta(112, 100)).toEqual({ kind: "pct", value: 0.12 });
  });

  it("prior 0, current positive → 'up from 0', NOT +100% or +∞", () => {
    const r = computeDelta(5000, 0);
    expect(r).toEqual({ kind: "fromZero", direction: 1 });
    // never an infinite/NaN percentage
    expect(JSON.stringify(r)).not.toMatch(/Infinity|null/);
  });

  it("prior 0, current negative → 'down from 0'", () => {
    expect(computeDelta(-5000, 0)).toEqual({ kind: "fromZero", direction: -1 });
  });

  it("both zero → no delta (not 0%)", () => {
    expect(computeDelta(0, 0)).toEqual({ kind: "none" });
  });

  it("prior absent (null) → no delta ('not enough data', not +100%)", () => {
    expect(computeDelta(5000, null)).toEqual({ kind: "none" });
  });
});

describe("ComparisonDelta — render + polarity + basis", () => {
  function colorOf(el: HTMLElement | null): string {
    return (el as HTMLElement).style.color;
  }

  it("normal metric up → status-green, with the basis label", () => {
    const { container } = render(
      <ComparisonDelta current={112} prior={100} polarity="normal" basis="same days last month" />
    );
    expect(colorOf(container.firstChild as HTMLElement)).toContain("brand-status-green");
    expect(screen.getByText("vs same days last month")).toBeInTheDocument();
    expect(screen.getByText("+12.0%")).toBeInTheDocument();
  });

  it("inverted metric up (a cost rose) → status-RED", () => {
    const { container } = render(
      <ComparisonDelta current={112} prior={100} polarity="inverted" basis="prev period" />
    );
    expect(colorOf(container.firstChild as HTMLElement)).toContain("brand-status-red");
  });

  it("'up from 0' shows a direction, never a percentage", () => {
    render(<ComparisonDelta current={5000} prior={0} basis="yesterday" />);
    expect(screen.getByText("up from 0")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("no comparison (prior null) renders nothing", () => {
    const { container } = render(<ComparisonDelta current={5000} prior={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("both zero renders nothing", () => {
    const { container } = render(<ComparisonDelta current={0} prior={0} />);
    expect(container.firstChild).toBeNull();
  });
});

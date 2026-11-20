// DEVREG-1 — a device reaches its opco through its project, else through a client
// that belongs to exactly one opco. Anything else is unresolved, never guessed.

import { describe, it, expect } from "vitest";
import { resolveDeviceOpco } from "@/lib/devices/opco";

describe("resolveDeviceOpco", () => {
  it("the project's opco wins", () => {
    expect(resolveDeviceOpco({ projectOpco: "guardian", clientAllowedOpcos: ["integrated_solutions", "guardian"] })).toEqual({
      status: "resolved",
      opco: "guardian",
      via: "project",
    });
  });

  it("the project's opco wins even when the client lists a different single opco", () => {
    const r = resolveDeviceOpco({ projectOpco: "guardian", clientAllowedOpcos: ["integrated_solutions"] });
    expect(r).toMatchObject({ opco: "guardian", via: "project" });
  });

  it("no project + a single-opco client → that opco, via the client", () => {
    expect(resolveDeviceOpco({ projectOpco: null, clientAllowedOpcos: ["integrated_solutions"] })).toEqual({
      status: "resolved",
      opco: "integrated_solutions",
      via: "client",
    });
  });

  it("no project + a client in two opcos → unresolved, not the first one or the default", () => {
    expect(resolveDeviceOpco({ projectOpco: null, clientAllowedOpcos: ["integrated_solutions", "guardian"] })).toEqual({
      status: "unresolved",
      reason: "client_multi_opco",
    });
  });

  it("no project + a client with no opco → unresolved", () => {
    expect(resolveDeviceOpco({ projectOpco: undefined, clientAllowedOpcos: [] })).toEqual({
      status: "unresolved",
      reason: "client_no_opco",
    });
    expect(resolveDeviceOpco({ projectOpco: null, clientAllowedOpcos: null })).toMatchObject({ status: "unresolved" });
  });

  it("duplicate entries in allowed_opcos don't make a single opco look ambiguous", () => {
    expect(resolveDeviceOpco({ projectOpco: null, clientAllowedOpcos: ["guardian", "guardian"] })).toMatchObject({
      status: "resolved",
      opco: "guardian",
    });
  });
});

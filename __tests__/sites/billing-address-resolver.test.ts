// PROJ2-5 Part 1 — resolveBillingAddress precedence. Pure function, no mocks.
//   1. billing_same_as_site  → the site's own physical address (highest)
//   2. billing_same_as_client → the parent client's billing address
//   3. neither                → the site's stored billing_* values

import { describe, it, expect } from "vitest";
import {
  resolveBillingAddress,
  type BillingResolverSite,
  type BillingResolverClient,
} from "@/lib/sites/billing-address";

function site(partial: Partial<BillingResolverSite>): BillingResolverSite {
  return {
    billing_same_as_site: false,
    billing_same_as_client: false,
    address_line1: "1 Site St",
    address_line2: "Unit S",
    city: "SiteCity",
    province: "ON",
    postal_code: "S1S 1S1",
    country: "Canada",
    billing_street: "9 Stored Rd",
    billing_unit: "Unit B",
    billing_city: "StoredCity",
    billing_province: "QC",
    billing_postal: "B2B 2B2",
    billing_country: "Canada",
    ...partial,
  };
}

const CLIENT: BillingResolverClient = {
  billing_street: "5 Client Ave",
  billing_unit: "Suite C",
  billing_city: "ClientCity",
  billing_province: "AB",
  billing_postal: "C3C 3C3",
  billing_country: "Canada",
};

describe("resolveBillingAddress", () => {
  it("billing_same_as_site → returns the site's physical address", () => {
    const r = resolveBillingAddress(site({ billing_same_as_site: true }), CLIENT);
    expect(r).toEqual({
      street: "1 Site St",
      unit: "Unit S",
      city: "SiteCity",
      province: "ON",
      postal: "S1S 1S1",
      country: "Canada",
    });
  });

  it("billing_same_as_client → returns the client's billing address", () => {
    const r = resolveBillingAddress(
      site({ billing_same_as_client: true }),
      CLIENT
    );
    expect(r).toEqual({
      street: "5 Client Ave",
      unit: "Suite C",
      city: "ClientCity",
      province: "AB",
      postal: "C3C 3C3",
      country: "Canada",
    });
  });

  it("neither flag → returns the site's stored billing_* values", () => {
    const r = resolveBillingAddress(site({}), CLIENT);
    expect(r).toEqual({
      street: "9 Stored Rd",
      unit: "Unit B",
      city: "StoredCity",
      province: "QC",
      postal: "B2B 2B2",
      country: "Canada",
    });
  });

  it("both flags true (should never happen — DB CHECK) → site wins", () => {
    const r = resolveBillingAddress(
      site({ billing_same_as_site: true, billing_same_as_client: true }),
      CLIENT
    );
    expect(r.street).toBe("1 Site St"); // site physical, not client
    expect(r.city).toBe("SiteCity");
  });

  it("same_as_client with a null client → returns nulls, not a crash", () => {
    const r = resolveBillingAddress(site({ billing_same_as_client: true }), null);
    expect(r).toEqual({
      street: null,
      unit: null,
      city: null,
      province: null,
      postal: null,
      country: null,
    });
  });
});

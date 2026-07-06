// PROJ2-5 Part 1 — canonical read-time resolver for a site's billing address.
// A site's billing address has three possible sources, in precedence order:
//
//   1. billing_same_as_site  → the site's OWN physical address
//   2. billing_same_as_client → the parent client's billing address
//   3. (neither flag)         → the site's stored billing_* values
//
// The two flags are mutually exclusive at the DB level (0085 CHECK), but this
// resolver is defensive: if both are somehow true, the site-physical source
// wins (highest precedence). Pure function — no I/O — so it's trivially testable
// and safe to call from server components, PDF generation, or invoices.
//
// NOTE: SiteForm resolves a LIVE PREVIEW from unsaved form state (not a
// persisted DbSite), so it mirrors this precedence inline rather than calling
// this function. Persisted read-time consumers should use this resolver. Today
// there is no other read-time consumer (invoices/PDF Bill-To read CLIENT
// billing), so this is the seam future consumers hang off.

export interface BillingAddress {
  street: string | null;
  unit: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
  country: string | null;
}

// Structural inputs — accept the DbSite / DbClient shapes (or any object with
// these fields) without importing the full row types, so tests can pass plain
// literals.
export interface BillingResolverSite {
  billing_same_as_site: boolean;
  billing_same_as_client: boolean;
  // physical address
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  // stored billing address
  billing_street: string | null;
  billing_unit: string | null;
  billing_city: string | null;
  billing_province: string | null;
  billing_postal: string | null;
  billing_country: string | null;
}

export interface BillingResolverClient {
  billing_street: string | null;
  billing_unit: string | null;
  billing_city: string | null;
  billing_province: string | null;
  billing_postal: string | null;
  billing_country: string | null;
}

export function resolveBillingAddress(
  site: BillingResolverSite,
  client: BillingResolverClient | null | undefined
): BillingAddress {
  // 1. Same as the site's own physical address (highest precedence — also the
  //    defensive winner if both flags are true).
  if (site.billing_same_as_site) {
    return {
      street: site.address_line1,
      unit: site.address_line2,
      city: site.city,
      province: site.province,
      postal: site.postal_code,
      country: site.country,
    };
  }

  // 2. Same as the parent client's billing address.
  if (site.billing_same_as_client) {
    return {
      street: client?.billing_street ?? null,
      unit: client?.billing_unit ?? null,
      city: client?.billing_city ?? null,
      province: client?.billing_province ?? null,
      postal: client?.billing_postal ?? null,
      country: client?.billing_country ?? null,
    };
  }

  // 3. The site's own stored billing_* values.
  return {
    street: site.billing_street,
    unit: site.billing_unit,
    city: site.billing_city,
    province: site.billing_province,
    postal: site.billing_postal,
    country: site.billing_country,
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  resolveProjectCrumbAction,
  resolveQuoteCrumbAction,
} from "@/app/(app)/breadcrumb-actions";
import { buildCrumbs, detailEntity } from "@/lib/breadcrumbs";
import { cn } from "@/lib/utils";

/** Gold uppercase tracked breadcrumbs in the top bar. */
export function GoldBreadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get("tab");
  const entity = useMemo(() => detailEntity(pathname), [pathname]);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);

  // Resolve the detail segment (project/quote id) to its real name from the
  // live tables. Cancels on route change so a stale response can't overwrite.
  useEffect(() => {
    setResolvedLabel(null);
    if (!entity) return;
    let cancelled = false;
    const resolver =
      entity.kind === "project" ? resolveProjectCrumbAction : resolveQuoteCrumbAction;
    resolver(entity.id).then((label) => {
      if (!cancelled) setResolvedLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [entity]);

  const crumbs = useMemo(
    () => buildCrumbs(pathname, tab, resolvedLabel),
    [pathname, tab, resolvedLabel]
  );

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase font-semibold", className)}
      style={{ color: "var(--brand-accent-soft)" }}
    >
      {crumbs.map((c, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={`${c.label}-${idx}`} className="inline-flex items-center gap-2">
            {idx > 0 && (
              <span className="opacity-60" aria-hidden>
                ›
              </span>
            )}
            {c.href && !isLast ? (
              <Link
                href={c.href}
                className="hover:opacity-100 underline-offset-2 hover:underline"
                style={{ opacity: 0.7 }}
              >
                {c.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? "var(--brand-accent)" : undefined }}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Backwards-compat: previous default breadcrumb used elsewhere. */
export const Breadcrumbs = GoldBreadcrumbs;

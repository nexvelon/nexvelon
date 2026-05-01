import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Tiny gold uppercase eyebrow text — e.g. "FISCAL YEAR 2026 · Q2". */
  eyebrow?: string;
  /** Large serif title in dark navy. */
  title: string;
  /** Italic serif subtitle below the title in muted color. */
  description?: string;
  /** Right-aligned action slot — typically outlined secondary buttons + 1 solid black primary. */
  actions?: ReactNode;
  /** Optional class on the outer wrapper. */
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4 pb-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="nx-eyebrow mb-2.5">{eyebrow}</p>}
          <h1
            className="font-serif tracking-tight text-[40px] leading-[1.05]"
            style={{ color: "var(--brand-primary)" }}
          >
            {title}
          </h1>
          {description && (
            <p className="nx-subtitle mt-1.5 text-[14px]">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      <div className="nx-rule" />
    </div>
  );
}

"use client";

export const TABS = [
  "Sites",
  "Contacts",
  "Contracts",
  "Service History",
  "Documents",
  "Activity",
] as const;
export type TabKey = (typeof TABS)[number];

export function TabBar({
  tab,
  onChange,
  sitesCount,
  contactsCount,
}: {
  tab: TabKey;
  onChange: (next: TabKey) => void;
  sitesCount: number;
  contactsCount: number;
}) {
  const counts: Partial<Record<TabKey, number>> = {
    Sites: sitesCount,
    Contacts: contactsCount,
  };
  return (
    <nav
      className="flex flex-wrap gap-1 border-b"
      style={{ borderColor: "var(--brand-border)" }}
    >
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className="relative px-3 py-2 text-[12px] font-medium transition-colors"
          style={{
            color:
              tab === t
                ? "var(--brand-primary)"
                : "color-mix(in oklab, var(--brand-text) 50%, transparent)",
          }}
        >
          {t}
          {counts[t] !== undefined && (
            <span
              className="ml-1 inline-block rounded-sm px-1 text-[10px] font-mono tabular-nums"
              style={{
                background:
                  tab === t ? "var(--brand-primary)" : "var(--brand-muted)",
                color: tab === t ? "var(--brand-bg)" : "var(--brand-text)",
              }}
            >
              {counts[t]}
            </span>
          )}
          {tab === t && (
            <span
              className="absolute bottom-[-1px] left-2 right-2 h-[2px]"
              style={{ background: "var(--brand-accent)" }}
            />
          )}
        </button>
      ))}
    </nav>
  );
}

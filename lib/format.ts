const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const num0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const pct1 = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatCurrency(n: number): string {
  return usd2.format(n);
}

export function formatCurrencyCompact(n: number): string {
  return usdCompact.format(n);
}

export function formatNumber(n: number): string {
  return num0.format(n);
}

export function formatPercent(ratio: number): string {
  return pct1.format(ratio);
}

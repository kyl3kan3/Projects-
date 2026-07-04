export function formatMoney(cents: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    ...options,
  }).format(cents / 100);
}

export function formatCompactMoney(cents: number): string {
  if (Math.abs(cents) >= 100_000) {
    return `$${Math.round(cents / 1000).toLocaleString("en-US")}k`;
  }
  return formatMoney(cents);
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

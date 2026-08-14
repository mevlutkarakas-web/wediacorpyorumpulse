export type DashboardRange = "today" | "week" | "month" | "all";

export const DASHBOARD_RANGES: { key: DashboardRange; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "week", label: "Bu hafta" },
  { key: "month", label: "Bu ay" },
  { key: "all", label: "Tümü" },
];

export function isDashboardRange(value?: string): value is DashboardRange {
  return !!value && DASHBOARD_RANGES.some((r) => r.key === value);
}

// completedAt lower bound for the range, or null for "all" (no filter).
export function rangeStartFor(range: DashboardRange, now = new Date()): Date | null {
  if (range === "all") return null;
  if (range === "week") return new Date(now.getTime() - 7 * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  // Türkiye 2016'dan beri sabit UTC+3 kullanıyor, DST hesaplamasına gerek yok.
  if (range === "today") return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000+03:00`);
  return new Date(`${get("year")}-${get("month")}-01T00:00:00.000+03:00`);
}

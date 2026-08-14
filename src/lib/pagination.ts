export const PAGE_SIZE = {
  TASKS: 12,
  CHANNELS: 24,
  FACEBOOK_CHANNELS: 24,
  TEAM_USERS: 10,
  COMMENTS: 20,
  ALERTS: 25,
} as const;

export function parsePage(value?: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function paginate(page: number, pageSize: number, totalCount: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  return { skip: (currentPage - 1) * pageSize, take: pageSize, page: currentPage, totalPages, totalCount };
}

export function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const window = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...window].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

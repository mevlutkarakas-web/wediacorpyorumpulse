import type { JobType } from "@prisma/client";

/**
 * Küçük değer önce alınır. Öncelik iş *sınıfını* kodlar; böylece claim sorgusu
 * `type IN (...)` yerine tek bitişik aralık taraması yapabilir
 * (`@@index([status, priority, runAfter])`).
 *
 * Şemadaki varsayılan 100 olduğu için, kod devreye girmeden önce oluşmuş
 * birikim otomatik olarak her yeni işin altında kalır.
 */
export const JOB_PRIORITY: Record<JobType, number> = {
  // Kökler: ucuz, zinciri açan ve Channel.lastSyncedAt'i ilerleten işler.
  SYNC_CHANNEL: 10,
  SYNC_FACEBOOK_CHANNEL: 10,
  // Video listeleme: kanal başına en fazla bir tane, doğası gereği sınırlı.
  SYNC_VIDEOS: 20,
  SYNC_FACEBOOK_VIDEOS: 20,
  // Analiz: kendi rezerve bandı; claim tarafında hem tabanı hem tavanı var.
  ANALYZE_COMMENTS: 40,
  // Fan-out kütlesi: kalan tüm kapasiteyi bunlar emer.
  SYNC_COMMENTS: 60,
  SYNC_FACEBOOK_COMMENTS: 60,
  BUILD_INSIGHTS: 90,
};

/** Öncelik bantları — claim varyantlarının aralıkları. */
export const PRIORITY_BAND = {
  roots: { min: 0, max: 39 },
  analysis: { min: 40, max: 49 },
  rest: { min: 50, max: 1_000_000 },
} as const;

export function priorityFor(type: JobType) {
  return JOB_PRIORITY[type] ?? 100;
}

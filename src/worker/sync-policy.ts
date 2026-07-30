const hours = (value: string | undefined, fallback: number) =>
  Math.max(1, Number(value || fallback)) * 3_600_000;

export const HOT_WINDOW_MS = hours(process.env.VIDEO_HOT_WINDOW_HOURS, 48);
export const COMMENT_RESYNC_MS = hours(process.env.COMMENT_RESYNC_HOURS, 168);

export const MAX_PENDING_BACKLOG = Math.max(
  100,
  Number(process.env.MAX_PENDING_BACKLOG || 4_000),
);
export const MAX_PENDING_COMMENT_JOBS = Math.max(
  50,
  Number(process.env.MAX_PENDING_COMMENT_JOBS || 2_000),
);

export type CommentSyncState = {
  /** YouTube'da yayın tarihi; Facebook taramasında anlamsız olduğu için createdAt geçilir. */
  ageReference: Date;
  commentsSyncedAt: Date | null;
  remoteCommentCount: number | null;
};

/**
 * Bir videonun yorumlarının yeniden çekilmesi gerekiyor mu?
 *
 * `remoteCommentCount` platformun bildirdiği toplamla karşılaştırılır — `commentCount`
 * ile DEĞİL: o alan yerel satır sayısını tutuyor ve YouTube yanıtları da saydığı için
 * ikisi yapısal olarak hiç eşit olmaz (yani onunla karşılaştırma hiçbir şey elemez).
 */
export function needsCommentSync(
  state: CommentSyncState,
  remoteCount: number | null,
  now = Date.now(),
) {
  if (!state.commentsSyncedAt) return true;
  // Sayı bilinmiyorsa (Facebook tarama yolu) karar takvime bırakılır.
  if (remoteCount !== null && remoteCount !== (state.remoteCommentCount ?? -1)) return true;
  // Sıcak pencere: eşit sayıda ekleme+silme değişikliği maskeleyebilir.
  if (now - state.ageReference.getTime() < HOT_WINDOW_MS) return true;
  // Haftalık emniyet ağı: metin/beğeni düzeltmeleri ve kaçan yorumlar için.
  if (now - state.commentsSyncedAt.getTime() > COMMENT_RESYNC_MS) return true;
  return false;
}

const DAY = 86_400_000;

/**
 * Facebook tarama yolunda uzak yorum sayısı yok, o yüzden karar tamamen yaşa
 * dayalı takvimle veriliyor. Yaş ölçütü `Video.createdAt` (ilk görülme) olmalı:
 * scrapeFacebookVideos her videoya tarama anını publishedAt olarak yazıyor.
 */
export function facebookCommentSyncDue(
  state: Pick<CommentSyncState, "ageReference" | "commentsSyncedAt">,
  now = Date.now(),
) {
  if (!state.commentsSyncedAt) return true;
  const age = now - state.ageReference.getTime();
  const sinceSync = now - state.commentsSyncedAt.getTime();
  if (age < 7 * DAY) return true;
  if (age < 30 * DAY) return sinceSync > 6 * 3_600_000;
  return sinceSync > 7 * DAY;
}

/** YouTube kotasında kanal başına tur maliyeti tahmini (artımlı listeleme + birkaç yorum sayfası). */
export const EST_UNITS_PER_CHANNEL = Math.max(
  1,
  Number(process.env.EST_UNITS_PER_CHANNEL || 8),
);

/** Günlük kotanın ne kadarını kullanmaya izin veriyoruz. */
export const QUOTA_RESERVE = Math.min(
  0.95,
  Math.max(0.1, Number(process.env.YOUTUBE_QUOTA_RESERVE || 0.85)),
);

/**
 * Kota bütçesini günün kalan turlarına böler. Sonuç: bu turda kaç YouTube
 * kanalı ziyaret edilebilir. Kanal sayısı bu değerden büyükse tazelik
 * kaçınılmaz olarak `SYNC_INTERVAL_MINUTES`'ten uzun olur — bu bir sınır, hata değil.
 */
export function quotaChannelSlots(
  usedUnits: number,
  limitUnits: number,
  cyclesRemaining: number,
  estUnitsPerChannel = EST_UNITS_PER_CHANNEL,
) {
  const remaining = Math.max(0, Math.floor(limitUnits * QUOTA_RESERVE) - usedUnits);
  const cycles = Math.max(1, cyclesRemaining);
  return Math.max(0, Math.floor(remaining / cycles / Math.max(1, estUnitsPerChannel)));
}

/**
 * Google kotayı Pasifik saatiyle gece yarısı sıfırlıyor; kod eskiden UTC gününü
 * kovalıyordu (7-8 saat kayma). Kalan tur sayısı da aynı takvime göre hesaplanır.
 */
export function cyclesRemainingToday(intervalMinutes: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const minutesLeft = Math.max(1, 24 * 60 - (hour * 60 + minute));
  return Math.max(1, Math.ceil(minutesLeft / Math.max(1, intervalMinutes)));
}

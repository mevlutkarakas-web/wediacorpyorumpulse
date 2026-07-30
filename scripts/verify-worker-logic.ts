import { Prisma } from "@prisma/client";
import {
  classifyJobError,
  retryDecision,
  ServiceHttpError,
  PermanentJobError,
} from "../src/worker/job-errors";
import {
  needsCommentSync,
  facebookCommentSyncDue,
  quotaChannelSlots,
  cyclesRemainingToday,
} from "../src/worker/sync-policy";
import { JOB_PRIORITY, PRIORITY_BAND } from "../src/worker/priorities";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : `  beklenen=${JSON.stringify(expected)} gelen=${JSON.stringify(actual)}`}`);
}

console.log("\n=== classifyJobError ===");
// Havuz zaman aşımı: 41 FAILED işin muhtemel sebebi. Eskiden KALICI sayılıyordu.
const poolError = new Prisma.PrismaClientKnownRequestError("pool timeout", {
  code: "P2024",
  clientVersion: "6",
});
check("P2024 (havuz) -> TRANSIENT", classifyJobError(poolError).kind, "TRANSIENT");
const uniqueError = new Prisma.PrismaClientKnownRequestError("unique", {
  code: "P2002",
  clientVersion: "6",
});
check("P2002 (unique) -> PERMANENT", classifyJobError(uniqueError).kind, "PERMANENT");
check(
  "403 quotaExceeded -> QUOTA",
  classifyJobError(new ServiceHttpError("youtube", 403, "quotaExceeded")).kind,
  "QUOTA",
);
check(
  "403 commentsDisabled -> BENIGN",
  classifyJobError(new ServiceHttpError("youtube", 403, "commentsDisabled")).kind,
  "BENIGN",
);
check("503 -> TRANSIENT", classifyJobError(new ServiceHttpError("youtube", 503)).kind, "TRANSIENT");
check("404 -> PERMANENT", classifyJobError(new ServiceHttpError("facebook", 404)).kind, "PERMANENT");
check("ECONNRESET -> TRANSIENT", classifyJobError(Object.assign(new Error("x"), { code: "ECONNRESET" })).kind, "TRANSIENT");
check(
  "Playwright TimeoutError -> TRANSIENT",
  classifyJobError(Object.assign(new Error("t"), { name: "TimeoutError" })).kind,
  "TRANSIENT",
);
check("PermanentJobError -> PERMANENT", classifyJobError(new PermanentJobError("x")).kind, "PERMANENT");
check("kota koruması mesajı -> QUOTA", classifyJobError(new Error("YouTube günlük API kotası güvenlik sınırına ulaştı.")).kind, "QUOTA");
// Eski regex'in yanlış sınıflandırdığı vaka: içinde 500 geçen alakasız mesaj.
check("'500 yorum işlendi' -> PERMANENT (eskiden TRANSIENT)", classifyJobError(new Error("500 yorum işlendi ama kayıt başarısız")).kind, "PERMANENT");
check("bilinmeyen hata -> PERMANENT", classifyJobError(new Error("bir şey patladı")).kind, "PERMANENT");

console.log("\n=== retryDecision ===");
const fixedRandom = () => 0.5; // jitter çarpanı 1.0
check("maxAttempts asla yükseltilmez: kalıcı, 3/3 -> dur", retryDecision(3, 3, { kind: "PERMANENT" }, fixedRandom).retry, false);
check("geçici, 3/3 -> devam (limit 8'e yükselir)", retryDecision(3, 3, { kind: "TRANSIENT" }, fixedRandom).retry, true);
check("geçici, 8/3 -> dur", retryDecision(8, 3, { kind: "TRANSIENT" }, fixedRandom).retry, false);
// Tavan: eskiden 2^attempts*30s tavansızdı (9. denemede ~4.3 saat).
const bigDelay = retryDecision(20, 30, { kind: "TRANSIENT" }, fixedRandom).delayMs;
check("geçici gecikme tavanı 15 dk", bigDelay <= 15 * 60_000, true);
const permDelay = retryDecision(20, 30, { kind: "PERMANENT" }, fixedRandom).delayMs;
check("kalıcı gecikme tavanı 30 dk", permDelay <= 30 * 60_000, true);
// Jitter gerçekten değişiyor mu (senkron fırtınayı kıran şey)
const a = retryDecision(3, 8, { kind: "TRANSIENT" }, () => 0.0).delayMs;
const b = retryDecision(3, 8, { kind: "TRANSIENT" }, () => 1.0).delayMs;
check("jitter aralığı 50-150% (b ≈ 3a)", b > a * 2.5 && b < a * 3.5, true);
check("Retry-After dikkate alınır", retryDecision(1, 8, { kind: "TRANSIENT", retryAfterMs: 600_000 }, fixedRandom).delayMs >= 600_000, true);

console.log("\n=== needsCommentSync (fan-out kontrolü) ===");
const now = Date.UTC(2026, 6, 30, 12, 0, 0);
const oldVideo = new Date(now - 200 * 86_400_000); // 200 gün önce = sıcak pencere dışı
check(
  "hiç senkron olmamış -> senkronla",
  needsCommentSync({ ageReference: oldVideo, commentsSyncedAt: null, remoteCommentCount: null }, 10, now),
  true,
);
check(
  "sayı aynı + eski video + taze senkron -> ATLA (asıl kazanç)",
  needsCommentSync(
    { ageReference: oldVideo, commentsSyncedAt: new Date(now - 3_600_000), remoteCommentCount: 10 },
    10,
    now,
  ),
  false,
);
check(
  "sayı değişti -> senkronla",
  needsCommentSync(
    { ageReference: oldVideo, commentsSyncedAt: new Date(now - 3_600_000), remoteCommentCount: 10 },
    11,
    now,
  ),
  true,
);
check(
  "sıcak pencere (24 saatlik video) -> her zaman senkronla",
  needsCommentSync(
    { ageReference: new Date(now - 86_400_000), commentsSyncedAt: new Date(now - 60_000), remoteCommentCount: 10 },
    10,
    now,
  ),
  true,
);
check(
  "8 gün önce senkronlanmış -> haftalık emniyet ağı",
  needsCommentSync(
    { ageReference: oldVideo, commentsSyncedAt: new Date(now - 8 * 86_400_000), remoteCommentCount: 10 },
    10,
    now,
  ),
  true,
);
check(
  "uzak sayı bilinmiyor (tarama) + taze -> ATLA, takvime bırak",
  needsCommentSync(
    { ageReference: oldVideo, commentsSyncedAt: new Date(now - 3_600_000), remoteCommentCount: 10 },
    null,
    now,
  ),
  false,
);

console.log("\n=== facebookCommentSyncDue (yaş kademeli takvim) ===");
check("hiç senkron olmamış -> evet", facebookCommentSyncDue({ ageReference: new Date(now), commentsSyncedAt: null }, now), true);
check("3 günlük video -> her tur", facebookCommentSyncDue({ ageReference: new Date(now - 3 * 86_400_000), commentsSyncedAt: new Date(now - 60_000) }, now), true);
check("15 günlük + 1 saat önce -> hayır", facebookCommentSyncDue({ ageReference: new Date(now - 15 * 86_400_000), commentsSyncedAt: new Date(now - 3_600_000) }, now), false);
check("15 günlük + 7 saat önce -> evet", facebookCommentSyncDue({ ageReference: new Date(now - 15 * 86_400_000), commentsSyncedAt: new Date(now - 7 * 3_600_000) }, now), true);
check("60 günlük + 2 gün önce -> hayır", facebookCommentSyncDue({ ageReference: new Date(now - 60 * 86_400_000), commentsSyncedAt: new Date(now - 2 * 86_400_000) }, now), false);
check("60 günlük + 8 gün önce -> evet", facebookCommentSyncDue({ ageReference: new Date(now - 60 * 86_400_000), commentsSyncedAt: new Date(now - 8 * 86_400_000) }, now), true);

console.log("\n=== kota bütçesi ===");
check("kota tükendi -> 0 slot", quotaChannelSlots(10_000, 10_000, 10, 8), 0);
// 10000*0.85 = 8500 kullanılabilir; 10 tur kaldı; kanal 8 birim -> 8500/10/8 = 106
check("boş kota, 10 tur, 8 birim/kanal -> 106", quotaChannelSlots(0, 10_000, 10, 8), 106);
check("yarı kullanılmış -> daha az slot", quotaChannelSlots(5_000, 10_000, 10, 8) < quotaChannelSlots(0, 10_000, 10, 8), true);
const cycles = cyclesRemainingToday(15, new Date(Date.UTC(2026, 6, 30, 19, 0, 0))); // 12:00 Pasifik
check("kalan tur sayısı pozitif ve makul", cycles > 0 && cycles <= 96, true);

console.log("\n=== öncelik bantları ===");
check("kökler roots bandında", JOB_PRIORITY.SYNC_CHANNEL >= PRIORITY_BAND.roots.min && JOB_PRIORITY.SYNC_CHANNEL <= PRIORITY_BAND.roots.max, true);
check("analiz kendi bandında", JOB_PRIORITY.ANALYZE_COMMENTS >= PRIORITY_BAND.analysis.min && JOB_PRIORITY.ANALYZE_COMMENTS <= PRIORITY_BAND.analysis.max, true);
check("yorum fan-out rest bandında", JOB_PRIORITY.SYNC_COMMENTS >= PRIORITY_BAND.rest.min, true);
check("eski birikim (100) rest bandında ve fan-out'un altında", 100 >= PRIORITY_BAND.rest.min && 100 > JOB_PRIORITY.SYNC_COMMENTS, true);
check("bantlar örtüşmüyor", PRIORITY_BAND.roots.max < PRIORITY_BAND.analysis.min && PRIORITY_BAND.analysis.max < PRIORITY_BAND.rest.min, true);

console.log("\n=== üretilen SQL (parametre yerleşimi) ===");
// claim.ts'teki ifadeyi aynı şekilde kurup parametrelerin doğru yere gittiğini denetle.
const take = 4;
const sql = Prisma.sql`
    UPDATE "SyncJob" AS j
       SET status = 'RUNNING', "lockedBy" = ${"worker-uuid"}, "updatedAt" = now()
     WHERE j.id IN (
       SELECT c.id FROM "SyncJob" c
        WHERE c.status = 'PENDING' AND c."runAfter" <= now()
          AND c.priority >= ${0} AND c.priority <= ${39}
        ORDER BY c.priority ASC, c."runAfter" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${Prisma.raw(String(take))}
     ) AND j.status = 'PENDING'
    RETURNING j.id, j.type::text AS type;`;
const text = sql.sql;
// Prisma.sql `?` placeholder üretir; engine bunları Postgres için $n'e çevirir.
// Önemli olan değerin gömülmemiş, bağlanmış olması.
check("workerId parametreleştirildi (gömülmedi)", /"lockedBy" = \?/.test(text) && !text.includes("worker-uuid"), true);
check("LIMIT gömülü sabit (parametre değil)", /LIMIT 4/.test(text), true);
check("FOR UPDATE SKIP LOCKED mevcut", /FOR UPDATE SKIP LOCKED/.test(text), true);
check("updatedAt elle yazılıyor (@updatedAt istemci taraflı)", /"updatedAt" = now\(\)/.test(text), true);
check("enum ::text cast ediliyor", /j\.type::text/.test(text), true);
check("3 parametre bağlandı", sql.values.length, 3);
check("değerler sırayla", sql.values, ["worker-uuid", 0, 39]);

console.log(`\n${failures === 0 ? "TÜM TESTLER GEÇTİ" : `${failures} TEST BAŞARISIZ`}`);
process.exit(failures === 0 ? 0 : 1);

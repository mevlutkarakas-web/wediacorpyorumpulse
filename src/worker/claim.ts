import { Prisma, type JobType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { PRIORITY_BAND } from "./priorities";

export type ClaimedJob = {
  id: string;
  type: JobType;
  channelId: string | null;
  payload: Prisma.JsonValue | null;
  attempts: number;
  maxAttempts: number;
  priority: number;
};

export const HEARTBEAT_MS = Math.max(5_000, Number(process.env.WORKER_HEARTBEAT_MS || 30_000));
export const LOCK_TTL_MS = Math.max(60_000, Number(process.env.WORKER_LOCK_TTL_MS || 180_000));
export const SWEEP_MS = Math.max(15_000, Number(process.env.WORKER_SWEEP_MS || 60_000));

/**
 * Tek ifadeli Postgres kuyruk deseni. Eskiden 6 coroutine aynı satırı `findFirst`
 * ile bulup 5'i kaybediyor ve 500ms uyuyordu; ayrıca her biri interactive
 * transaction boyunca bir havuz bağlantısı tutuyordu (P2024'ün kaynağı).
 *
 * Dikkat edilenler:
 * - `@updatedAt` istemci taraflı olduğu için raw UPDATE'te elle yazılmalı.
 * - `ORDER BY` parametre olamaz; bu yüzden aralık sabit varyantlarla veriliyor.
 * - LIMIT için `Prisma.raw` yalnızca doğrulanmış tamsayıyla kullanılır.
 * - Enum dönüşte `::text` cast edilir; raw sorgular engine'in enum çözümlemesini atlar.
 * - `payload` (jsonb) zaten çözümlenmiş gelir, JSON.parse edilmez.
 */
async function claimRange(
  minPriority: number,
  maxPriority: number,
  limit: number,
  workerId: string,
): Promise<ClaimedJob[]> {
  const take = Math.trunc(limit);
  if (!Number.isSafeInteger(take) || take <= 0) return [];
  return prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
    UPDATE "SyncJob" AS j
       SET status      = 'RUNNING',
           "lockedAt"  = now(),
           "lockedBy"  = ${workerId},
           "startedAt" = COALESCE(j."startedAt", now()),
           attempts    = j.attempts + 1,
           "updatedAt" = now()
     WHERE j.id IN (
       SELECT c.id
         FROM "SyncJob" c
        WHERE c.status     = 'PENDING'
          AND c."runAfter" <= now()
          AND c.priority  >= ${minPriority}
          AND c.priority  <= ${maxPriority}
        ORDER BY c.priority ASC, c."runAfter" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${Prisma.raw(String(take))}
     )
       AND j.status = 'PENDING'
    RETURNING j.id,
              j.type::text  AS type,
              j."channelId",
              j.payload,
              j.attempts,
              j."maxAttempts",
              j.priority;
  `);
}

export type ClaimOptions = {
  workerId: string;
  freeSlots: number;
  analyzeInFlight: number;
  analyzeSlots: number;
  /** Facebook tarama işleri Chromium'u paylaştığı için claim zamanında sınırlanır. */
  scrapeInFlight: number;
  scrapeSlots: number;
};

const SCRAPE_TYPES = new Set<JobType>(["SYNC_FACEBOOK_VIDEOS", "SYNC_FACEBOOK_COMMENTS"]);

export function isScrapeJob(type: JobType) {
  return SCRAPE_TYPES.has(type);
}

/**
 * Sıralı aralık claim'leri. Statik öncelik tek başına açlığı çözmez, yerini
 * değiştirir; bu yüzden analiz için hem garantili taban hem sert tavan var.
 * Kökler her zaman öne geçer, kalan kapasiteyi fan-out emer.
 */
export async function claimBatch(options: ClaimOptions): Promise<ClaimedJob[]> {
  const { workerId, freeSlots } = options;
  if (freeSlots <= 0) return [];
  const claimed: ClaimedJob[] = [];

  const remaining = () => freeSlots - claimed.length;

  // 1) Kökler ve video listeleme: kanal başına en fazla ikisi, açlığa yol açamaz.
  claimed.push(...(await claimRange(PRIORITY_BAND.roots.min, PRIORITY_BAND.roots.max, remaining(), workerId)));

  // 2) Analiz: tavanlı.
  const analyzeBudget = Math.min(remaining(), options.analyzeSlots - options.analyzeInFlight);
  if (analyzeBudget > 0)
    claimed.push(
      ...(await claimRange(PRIORITY_BAND.analysis.min, PRIORITY_BAND.analysis.max, analyzeBudget, workerId)),
    );

  // 3) Geri kalan her şey (yorum fan-out'u, eski birikim).
  if (remaining() > 0)
    claimed.push(...(await claimRange(PRIORITY_BAND.rest.min, PRIORITY_BAND.rest.max, remaining(), workerId)));

  // Tarama slotu dolmuşsa fazla Facebook işini hemen kuyruğa geri bırak: bir işin
  // tarayıcı bekleyerek worker slotunu tutması, kuyruğu boşuna yavaşlatır.
  const scrapeCapacity = Math.max(0, options.scrapeSlots - options.scrapeInFlight);
  const keep: ClaimedJob[] = [];
  const giveBack: ClaimedJob[] = [];
  let scrapeTaken = 0;
  for (const job of claimed) {
    if (isScrapeJob(job.type)) {
      if (scrapeTaken >= scrapeCapacity) {
        giveBack.push(job);
        continue;
      }
      scrapeTaken++;
    }
    keep.push(job);
  }
  if (giveBack.length) await releaseJobs(workerId, giveBack.map((job) => job.id), { refund: true });
  return keep;
}

/**
 * Uçuştaki tüm işler için tek `updateMany`. `lockedBy` + `status` filtresi,
 * kirasını kaybetmiş bir worker'ın başkasının kilidini diriltmesini engeller.
 */
export async function heartbeat(workerId: string, jobIds: string[]) {
  if (!jobIds.length) return 0;
  const { count } = await prisma.syncJob.updateMany({
    where: { id: { in: jobIds }, lockedBy: workerId, status: "RUNNING" },
    data: { lockedAt: new Date() },
  });
  return count;
}

/**
 * Süpürme periyodiktir (eskiden yalnızca açılışta bir kez çalışıyordu; bu yüzden
 * 30 dakika içinde yeniden başlatma yetim kilitleri hiç kurtaramıyor ve o kanalın
 * planlanması kalıcı olarak bloke oluyordu).
 *
 * Heartbeat sayesinde TTL'in en uzun işten uzun olması gerekmez: canlı bir
 * 40 dakikalık tarama `lockedAt`'i taze tutar, SIGKILL yemiş worker'ın kilitleri
 * ise TTL kadar sonra düşer.
 */
export async function sweepStaleLocks() {
  const cutoff = new Date(Date.now() - LOCK_TTL_MS);
  // (a) Deneme hakkı bitmişler FAILED olur, yoksa tekrarlanan yetimlik sonsuz döner.
  const failed = await prisma.$executeRaw`
    UPDATE "SyncJob"
       SET status='FAILED', error='Kilit süresi doldu (deneme hakkı bitti)',
           "lockedAt"=NULL, "lockedBy"=NULL, "completedAt"=now(), "updatedAt"=now()
     WHERE status='RUNNING'
       AND attempts >= "maxAttempts"
       AND ("lockedAt" IS NULL OR "lockedAt" < ${cutoff})`;
  // (b) Kalanlar hemen alınabilir şekilde kuyruğa döner.
  const revived = await prisma.$executeRaw`
    UPDATE "SyncJob"
       SET status='PENDING', "lockedAt"=NULL, "lockedBy"=NULL,
           "runAfter"=now(), "updatedAt"=now()
     WHERE status='RUNNING'
       AND ("lockedAt" IS NULL OR "lockedAt" < ${cutoff})`;
  if (failed || revived) logger.warn("stale_locks_swept", { failed, revived, ttlMs: LOCK_TTL_MS });
  return { failed, revived };
}

/**
 * Kapanışta veya tarama slotu yetmediğinde işi gönüllü olarak bırakır.
 * `refund` deneme hakkını geri verir — gönüllü bırakma bir başarısızlık değil,
 * ve claim tam olarak 1 artırdığı için düşüş tam.
 */
export async function releaseJobs(
  workerId: string,
  jobIds: string[],
  { refund = true }: { refund?: boolean } = {},
) {
  if (!jobIds.length) return 0;
  const { count } = await prisma.syncJob.updateMany({
    where: { id: { in: jobIds }, lockedBy: workerId, status: "RUNNING" },
    data: {
      status: "PENDING",
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
      ...(refund ? { attempts: { decrement: 1 } } : {}),
    },
  });
  return count;
}

/**
 * Terminal yazmalarda `lockedBy` fencing token'ı olarak kullanılır: kirasını
 * kaybetmiş bir worker yeni sahibin durumunu ezemez. Planın en kritik invaryantı.
 */
export async function completeJob(workerId: string, jobId: string) {
  const { count } = await prisma.syncJob.updateMany({
    where: { id: jobId, lockedBy: workerId, status: "RUNNING" },
    data: { status: "COMPLETED", progress: 100, completedAt: new Date(), error: null },
  });
  if (!count) logger.warn("job_lock_lost", { jobId, phase: "complete" });
  return count > 0;
}

export async function failJob(
  workerId: string,
  jobId: string,
  { retry, delayMs, error }: { retry: boolean; delayMs: number; error: string },
) {
  const { count } = await prisma.syncJob.updateMany({
    where: { id: jobId, lockedBy: workerId, status: "RUNNING" },
    data: {
      status: retry ? "PENDING" : "FAILED",
      error: error.slice(0, 2_000),
      runAfter: new Date(Date.now() + delayMs),
      lockedAt: null,
      lockedBy: null,
      ...(retry ? {} : { completedAt: new Date() }),
    },
  });
  if (!count) logger.warn("job_lock_lost", { jobId, phase: "fail" });
  return count > 0;
}

/**
 * Sınırlı sayım: 23.000 satır saymak yerine en fazla `limit + 1` girdilik
 * indeks taraması. `::int` cast'i BigInt dönüşünü engeller.
 */
export async function countPending(limit: number, types?: JobType[]) {
  const cap = Math.trunc(limit) + 1;
  const typeFilter = types?.length
    ? Prisma.sql`AND type::text IN (${Prisma.join(types.map((type) => Prisma.sql`${type}`))})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ pending: number }[]>(Prisma.sql`
    SELECT count(*)::int AS pending
      FROM (SELECT 1 FROM "SyncJob"
             WHERE status = 'PENDING' ${typeFilter}
             LIMIT ${Prisma.raw(String(cap))}) s`);
  return rows[0]?.pending ?? 0;
}

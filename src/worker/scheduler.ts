import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { youtubeQuotaUsage } from "../lib/youtube";
import { countPending } from "./claim";
import { JOB_PRIORITY } from "./priorities";
import {
  MAX_PENDING_BACKLOG,
  cyclesRemainingToday,
  quotaChannelSlots,
} from "./sync-policy";

export type PeriodicTask = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type TaskState = PeriodicTask & { nextAt: number; failures: number };

/**
 * Tek planlayıcı döngüsü. Eskiden üç periyodik görev HER coroutine'in iş
 * döngüsünde çalışıyordu ve sonraki çalışma zamanı iş BAŞLAMADAN ilerletiliyordu:
 * herhangi bir hata tüm turu 15 dakika sessizce atlıyordu.
 */
export async function schedulerLoop(
  tasks: PeriodicTask[],
  isShuttingDown: () => boolean,
  sleep: (ms: number) => Promise<void>,
) {
  const states: TaskState[] = tasks.map((task) => ({ ...task, nextAt: 0, failures: 0 }));
  while (!isShuttingDown()) {
    for (const task of states) {
      if (isShuttingDown()) break;
      if (Date.now() < task.nextAt) continue;
      const startedAt = Date.now();
      try {
        await task.run();
        task.nextAt = Date.now() + task.intervalMs; // ← yalnızca BAŞARIDAN sonra
        task.failures = 0;
        logger.info("periodic_task_ok", { task: task.name, ms: Date.now() - startedAt });
      } catch (error) {
        task.failures++;
        // Hatada daha erken tekrar dene, ama normal aralıktan yavaşa asla düşme.
        const backoff = Math.min(task.intervalMs, 15_000 * 2 ** Math.min(task.failures, 5));
        task.nextAt = Date.now() + backoff;
        logger.error("periodic_task_failed", {
          task: task.name,
          failures: task.failures,
          retryInMs: backoff,
          error: String(error).slice(0, 300),
        });
      }
    }
    await sleep(1_000);
  }
}

const STAGGER_MS = Math.max(0, Number(process.env.SYNC_STAGGER_MS || 2_000));

/**
 * Kanal senkron işlerini planlar. Üç davranış değişti:
 * 1. Kabul kapısı: birikim eşiği aşılmışsa hiç iş üretmez (devre kesici).
 * 2. Kota farkındalığı: kaç kanalın ziyaret edilebileceğini günlük bütçeden türetir
 *    ve `Channel.lastSyncedAt`'e göre en eskiden başlar (adil round-robin).
 *    Bu, o kolonun kodda ilk kez OKUNDUĞU yer.
 * 3. Mükerrer kontrolüne zaman sınırı: takılmış bir satır bir kanalı artık
 *    kalıcı olarak bastıramaz (eski davranışın 27 Temmuz'dan beri süren etkisi).
 */
export async function scheduleChannelSyncs(intervalMinutes: number) {
  const pending = await countPending(MAX_PENDING_BACKLOG);
  if (pending > MAX_PENDING_BACKLOG) {
    logger.warn("periodic_sync_skipped_backlog", { pending, threshold: MAX_PENDING_BACKLOG });
    return;
  }

  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  const active = await prisma.syncJob.findMany({
    where: {
      status: { in: ["PENDING", "RUNNING"] },
      type: { in: ["SYNC_CHANNEL", "SYNC_FACEBOOK_CHANNEL"] },
      createdAt: { gt: new Date(Date.now() - 2 * intervalMs) },
    },
    select: { channelId: true, type: true },
  });
  const busy = new Set(active.map((job) => `${job.type}:${job.channelId}`));

  const quota = await youtubeQuotaUsage();
  const cycles = cyclesRemainingToday(intervalMinutes);
  const youtubeSlots = quotaChannelSlots(quota.used, quota.limit, cycles);

  const youtubeChannels = youtubeSlots
    ? await prisma.channel.findMany({
        where: { OR: [{ youtubeUrl: { not: null } }, { uc: { not: null } }] },
        orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
        take: youtubeSlots + busy.size,
        select: { id: true },
      })
    : [];
  const facebookChannels = await prisma.channel.findMany({
    where: { facebookUrl: { not: null } },
    orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
    select: { id: true },
  });

  const jobs: {
    channelId: string;
    type: "SYNC_CHANNEL" | "SYNC_FACEBOOK_CHANNEL";
    priority: number;
    maxAttempts: number;
    runAfter: Date;
  }[] = [];
  const now = Date.now();
  const push = (channelId: string, type: "SYNC_CHANNEL" | "SYNC_FACEBOOK_CHANNEL") => {
    if (busy.has(`${type}:${channelId}`)) return;
    jobs.push({
      channelId,
      type,
      priority: JOB_PRIORITY[type],
      maxAttempts: 5,
      // Kademelendirme: bir tur tek patlama halinde inmesin.
      runAfter: new Date(now + jobs.length * STAGGER_MS),
    });
  };

  for (const channel of youtubeChannels) {
    if (jobs.length >= youtubeSlots) break;
    push(channel.id, "SYNC_CHANNEL");
  }
  const youtubeQueued = jobs.length;
  for (const channel of facebookChannels) push(channel.id, "SYNC_FACEBOOK_CHANNEL");

  if (jobs.length) await prisma.syncJob.createMany({ data: jobs });
  logger.info("periodic_sync_scheduled", {
    jobs: jobs.length,
    youtube: youtubeQueued,
    facebook: jobs.length - youtubeQueued,
    youtubeSlots,
    quotaUsed: quota.used,
    quotaLimit: quota.limit,
    cyclesRemaining: cycles,
    pending,
  });
}

const RETENTION_COMPLETED_MS =
  Math.max(1, Number(process.env.JOB_RETENTION_COMPLETED_HOURS || 24)) * 3_600_000;
const RETENTION_FAILED_MS =
  Math.max(1, Number(process.env.JOB_RETENTION_FAILED_DAYS || 14)) * 86_400_000;

/**
 * Eskiden hiç temizlik yoktu: tablo sonsuza kadar büyüyor ve claim sorguları
 * monoton yavaşlıyordu. `createdAt`'e göre budanır — FAILED satırlarda
 * `completedAt` NULL olabiliyor.
 */
export async function pruneJobs() {
  const remove = async (status: "COMPLETED" | "FAILED", cutoff: Date) => {
    let total = 0;
    for (let round = 0; round < 20; round++) {
      const deleted = await prisma.$executeRaw`
        DELETE FROM "SyncJob"
         WHERE id IN (SELECT id FROM "SyncJob"
                       WHERE status = ${status}::"JobStatus" AND "createdAt" < ${cutoff}
                       LIMIT 5000)`;
      total += deleted;
      if (deleted < 5000) break;
    }
    return total;
  };
  const completed = await remove("COMPLETED", new Date(Date.now() - RETENTION_COMPLETED_MS));
  const failed = await remove("FAILED", new Date(Date.now() - RETENTION_FAILED_MS));
  if (completed || failed) logger.info("jobs_pruned", { completed, failed });
}

const ANALYSIS_QUEUE_CAP = Math.max(20, Number(process.env.ANALYSIS_QUEUE_CAP || 200));

/**
 * Geride kalan analizler. Senkron yolu artık yalnızca YENİ yorumları kuyruğa
 * aldığı için (eskiden `analyzedAt == null` olan her yorum her turda yeniden
 * kuyruğa giriyordu), analizi başarısız olmuş yorumlar için sınırlı bir süpürme
 * gerekiyor. Kuyruk zaten doluysa hiç çalışmaz.
 */
export async function enqueueAnalysisStragglers() {
  const queued = await countPending(ANALYSIS_QUEUE_CAP, ["ANALYZE_COMMENTS"]);
  if (queued > ANALYSIS_QUEUE_CAP) return;
  const stragglers = await prisma.comment.findMany({
    where: { analyzedAt: null, createdAt: { lt: new Date(Date.now() - 3_600_000) } },
    orderBy: { publishedAt: "desc" },
    take: 400,
    select: { id: true },
  });
  if (!stragglers.length) return;
  const ids = stragglers.map((comment) => comment.id);
  const chunks = [];
  for (let index = 0; index < ids.length; index += 40)
    chunks.push({
      type: "ANALYZE_COMMENTS" as const,
      priority: JOB_PRIORITY.ANALYZE_COMMENTS,
      payload: { commentIds: ids.slice(index, index + 40) },
    });
  await prisma.syncJob.createMany({ data: chunks });
  logger.info("analysis_stragglers_queued", { comments: ids.length, jobs: chunks.length });
}

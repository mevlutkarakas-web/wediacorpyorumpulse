import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { youtubeQuotaUsage } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOCK_TTL_MS = Math.max(60_000, Number(process.env.WORKER_LOCK_TTL_MS || 180_000));
const SYNC_INTERVAL_MS = Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES || 15)) * 60_000;
// Kaç tur geçtikten sonra "bayat" sayılacağı. Worker öldüğünde bu eşik aşılır.
const STALE_INTERVALS = Math.max(2, Number(process.env.HEALTH_STALE_INTERVALS || 4));
const OLDEST_PENDING_LIMIT_MS =
  Math.max(1, Number(process.env.HEALTH_OLDEST_PENDING_HOURS || 6)) * 3_600_000;

/**
 * Bu uç noktanın tek amacı: worker öldüğünde birinin haberdar olması.
 * Bir aydır senkron olmadığı hâlde arayüzde hiçbir işaret yoktu.
 *
 * Kimlik doğrulama YOK (middleware matcher'ında muaf) ve bilinçli olarak yalnızca
 * toplam sayılar dönüyor — kanal/kullanıcı/yorum içeriği sızdırmaz. Böylece
 * herhangi bir uptime servisi 503'e bakarak uyarı verebilir.
 */
export async function GET() {
  const now = Date.now();
  const lockCutoff = new Date(now - LOCK_TTL_MS);

  const [pendingGroups, runningCount, orphanCount, oldestPending, lastCompleted, freshest, failedLast24h, quota] =
    await Promise.all([
      prisma.syncJob.groupBy({ by: ["type"], where: { status: "PENDING" }, _count: true }),
      prisma.syncJob.count({ where: { status: "RUNNING" } }),
      prisma.syncJob.count({
        where: { status: "RUNNING", OR: [{ lockedAt: null }, { lockedAt: { lt: lockCutoff } }] },
      }),
      prisma.syncJob.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.syncJob.findFirst({
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
      prisma.channel.findFirst({
        where: { lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      }),
      prisma.syncJob.count({
        where: { status: "FAILED", updatedAt: { gte: new Date(now - 86_400_000) } },
      }),
      youtubeQuotaUsage().catch(() => ({ used: 0, limit: 0 })),
    ]);

  const pendingByType = Object.fromEntries(
    pendingGroups.map((group) => [group.type, group._count]),
  );
  const pendingTotal = pendingGroups.reduce((sum, group) => sum + group._count, 0);
  const age = (value: Date | null | undefined) =>
    value ? Math.round((now - value.getTime()) / 1000) : null;

  const lastActivityAgeSeconds = age(lastCompleted?.completedAt);
  const channelSyncAgeSeconds = age(freshest?.lastSyncedAt);
  const oldestPendingAgeSeconds = age(oldestPending?.createdAt);

  const problems: string[] = [];
  // Kanal senkronu bayatladı = worker büyük olasılıkla ölü ya da tıkalı. Bu vakayı
  // ilk gün yakalayacak olan kontrol tam olarak bu.
  if (channelSyncAgeSeconds === null || channelSyncAgeSeconds * 1000 > STALE_INTERVALS * SYNC_INTERVAL_MS)
    problems.push("channel_sync_stale");
  if (lastActivityAgeSeconds !== null && lastActivityAgeSeconds * 1000 > STALE_INTERVALS * SYNC_INTERVAL_MS)
    problems.push("no_recent_job_completion");
  if (orphanCount > 0) problems.push("orphaned_locks");
  if (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds * 1000 > OLDEST_PENDING_LIMIT_MS)
    problems.push("queue_stalled");

  const body = {
    status: problems.length ? "degraded" : "ok",
    problems,
    queue: {
      pendingTotal,
      pendingByType,
      runningCount,
      orphanCount,
      oldestPendingAgeSeconds,
      failedLast24h,
    },
    worker: { lastActivityAgeSeconds, lockTtlSeconds: Math.round(LOCK_TTL_MS / 1000) },
    sync: { channelSyncAgeSeconds, intervalSeconds: Math.round(SYNC_INTERVAL_MS / 1000) },
    youtubeQuota: { used: quota.used, limit: quota.limit },
    checkedAt: new Date(now).toISOString(),
  };

  return NextResponse.json(body, {
    status: problems.length ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}

// Arka plan iş motoru. Kuyruk ilkelleri src/worker/* içinde; burada sinyaller,
// claim döngüsü, planlayıcı kablolaması ve iş tipi handler'ları var.
import { randomUUID } from "node:crypto";
import type { JobType } from "@prisma/client";
import { analyzeComments } from "./lib/gemini";
import {
  facebookPageIdentifier,
  fetchFacebookComments,
  fetchFacebookVideos,
  hasFacebookApiToken,
  resolveFacebookPage,
  type FacebookVideo,
} from "./lib/facebook";
import {
  closeFacebookBrowser,
  scrapeFacebookComments,
  scrapeFacebookVideos,
} from "./lib/facebook-scraper";
import { mirrorFacebookComments } from "./lib/facebook-comment-mirror";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import {
  fetchChannel,
  fetchComments,
  fetchPlaylistVideos,
  fetchVideoStats,
  resolveChannelId,
} from "./lib/youtube";
import { sendWeekdayReminders } from "./lib/reminder-email";
import { directCommentUrl } from "./lib/comment-links";
import {
  claimBatch,
  completeJob,
  failJob,
  heartbeat,
  isScrapeJob,
  releaseJobs,
  sweepStaleLocks,
  countPending,
  HEARTBEAT_MS,
  SWEEP_MS,
  type ClaimedJob,
} from "./worker/claim";
import { classifyJobError, retryDecision, PermanentJobError } from "./worker/job-errors";
import { JOB_PRIORITY } from "./worker/priorities";
import {
  facebookCommentSyncDue,
  needsCommentSync,
  MAX_PENDING_COMMENT_JOBS,
} from "./worker/sync-policy";
import {
  enqueueAnalysisStragglers,
  pruneJobs,
  scheduleChannelSyncs,
  schedulerLoop,
} from "./worker/scheduler";

const workerId = randomUUID();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * `payload` DB'den `Prisma.JsonValue` olarak geliyor, yani gerçekten bilinmiyor.
 * Şema doğrulaması (zod) bu turun kapsamı dışında bırakıldı; handler'lar payload'ı
 * okurken zorunlu alanları kendileri kontrol edip PermanentJobError fırlatıyor.
 */
type JobRow = Omit<ClaimedJob, "payload"> & { payload: any };

/**
 * Eskiden handler'lar `job.type === "X" && job.channelId` şeklinde koşulluydu:
 * channelId'si null olan bir iş hiçbir dala girmiyor ve hiçbir şey yapmadan
 * COMPLETED olarak işaretleniyordu. Artık yüksek sesle başarısız oluyor.
 */
function requireChannelId(job: JobRow) {
  if (!job.channelId) throw new PermanentJobError(`${job.type} için channelId zorunlu.`);
  return job.channelId;
}

const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.WORKER_CONCURRENCY || 6)));
const ANALYZE_SLOTS = Math.max(
  1,
  Number(process.env.WORKER_ANALYZE_SLOTS || Math.max(1, Math.floor(CONCURRENCY / 3))),
);
// Tarama işleri tek Chromium sürecini paylaşıyor; eşzamanlı context'ler belleği tüketir.
// Graph API yolu açıksa tarayıcı yok, o yüzden sınırlamaya da gerek yok.
const SCRAPE_SLOTS = hasFacebookApiToken()
  ? CONCURRENCY
  : Math.max(1, Number(process.env.FACEBOOK_SCRAPE_SLOTS || 1));
const SYNC_INTERVAL_MINUTES = Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES || 15));
const DRAIN_MS = Math.max(5_000, Number(process.env.WORKER_DRAIN_MS || 25_000));
const MAX_VIDEOS_PER_CHANNEL = Math.max(50, Number(process.env.MAX_VIDEOS_PER_CHANNEL || 500));
const MAX_COMMENTS_PER_VIDEO = Math.max(100, Number(process.env.MAX_COMMENTS_PER_VIDEO || 2000));

/** Uçuştaki işler: id -> {type, startedAt}. Heartbeat ve kapanış bunu okur. */
const running = new Map<string, { type: JobType; startedAt: number }>();
let shuttingDown = false;
let forcedExit = false;
let heartbeatTimer: NodeJS.Timeout | undefined;
let sweepTimer: NodeJS.Timeout | undefined;
let heartbeatFailures = 0;

async function createContentAlert({
  channelId,
  videoId,
  type,
  title,
  description,
  occurrenceCount = 1,
}: {
  channelId: string;
  videoId?: string;
  type: string;
  title: string;
  description: string;
  occurrenceCount?: number;
}) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.alert.findFirst({
    where: {
      channelId,
      videoId: videoId || null,
      type,
      createdAt: { gte: since },
      resolvedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await prisma.$transaction([
      prisma.alert.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: { increment: occurrenceCount },
          description,
          createdAt: new Date(),
        },
      }),
      prisma.alertRead.deleteMany({ where: { alertId: existing.id } }),
    ]);
    return;
  }
  await prisma.alert.create({
    data: {
      channelId,
      videoId,
      type,
      title,
      description,
      occurrenceCount,
      severity:
        type === "NEW_COMMENTS" && occurrenceCount >= 10 ? "high" : "medium",
    },
  });
}

/**
 * Yorum başına upsert yerine tek `createMany`. `@@unique([type, commentId])`
 * sayesinde `skipDuplicates` aynı işi yapıyor.
 */
async function createNewCommentAlerts(
  channelId: string | null,
  videoId: string,
  platform: "YOUTUBE" | "FACEBOOK",
  comments: { id: string; authorName: string; text: string }[],
) {
  if (!channelId || !comments.length) return;
  await prisma.alert.createMany({
    data: comments.map((comment) => ({
      channelId,
      videoId,
      commentId: comment.id,
      type: "NEW_COMMENT",
      title: `Yeni ${platform === "FACEBOOK" ? "Facebook" : "YouTube"} yorumu`,
      description: `${comment.authorName}: ${comment.text.slice(0, 220)}`,
      severity: "medium",
    })),
    skipDuplicates: true,
  });
}

async function backfillRecentContentAlerts() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const videos = await prisma.video.findMany({
    where: {
      platform: "YOUTUBE",
      publishedAt: { gte: since },
      alerts: { none: { type: "NEW_VIDEO" } },
    },
    select: { id: true, channelId: true, platform: true, title: true },
  });
  for (const video of videos)
    await createContentAlert({
      channelId: video.channelId,
      videoId: video.id,
      type: "NEW_VIDEO",
      title: `Yeni ${video.platform === "FACEBOOK" ? "Facebook" : "YouTube"} videosu`,
      description: video.title,
    });

  const commentGroups = await prisma.comment.groupBy({
    by: ["videoId", "platform"],
    where: { publishedAt: { gte: since } },
    _count: true,
  });
  if (!commentGroups.length) return;
  // Grup başına iki sorgu yerine iki toplu sorgu.
  const groupVideoIds = commentGroups.map((group) => group.videoId);
  const [alerted, videoRows] = await Promise.all([
    prisma.alert.findMany({
      where: { videoId: { in: groupVideoIds }, type: "NEW_COMMENTS", createdAt: { gte: since } },
      select: { videoId: true },
    }),
    prisma.video.findMany({
      where: { id: { in: groupVideoIds } },
      select: { id: true, channelId: true },
    }),
  ]);
  const alreadyAlerted = new Set(alerted.map((alert) => alert.videoId));
  const channelByVideo = new Map(videoRows.map((video) => [video.id, video.channelId]));
  for (const group of commentGroups) {
    if (alreadyAlerted.has(group.videoId)) continue;
    const channelId = channelByVideo.get(group.videoId);
    if (!channelId) continue;
    await createContentAlert({
      channelId,
      videoId: group.videoId,
      type: "NEW_COMMENTS",
      title: `Yeni ${group.platform === "FACEBOOK" ? "Facebook" : "YouTube"} yorumları`,
      description: `Son 24 saatte videoya ${group._count} yorum geldi.`,
      occurrenceCount: group._count,
    });
  }
  if (videos.length || commentGroups.length)
    logger.info("recent_alerts_checked", {
      videos: videos.length,
      commentGroups: commentGroups.length,
    });
}

async function youtubeChannelIdFor(channel: {
  youtubeChannelId: string | null;
  youtubeUrl: string | null;
  uc: string | null;
}) {
  if (channel.youtubeChannelId) return channel.youtubeChannelId;
  if (channel.youtubeUrl && channel.youtubeUrl !== "[object Object]") {
    try {
      const resolved = await resolveChannelId(channel.youtubeUrl);
      if (resolved) return resolved;
    } catch (error) {
      logger.warn("youtube_channel_resolve_failed", {
        youtubeUrl: channel.youtubeUrl,
        error: String(error).slice(0, 200),
      });
    }
  }
  return /^UC[\w-]+$/.test(channel.uc || "") ? channel.uc : null;
}

/**
 * Eskiden bu, kanalın TÜM yorumları üzerinde join-count çalıştırıyordu ve video
 * başına (günde ~16.000 kez) çağrılıyordu. Artık video satırlarının toplamı
 * (<=500 satır) ve kanal başına bir kez.
 */
async function refreshChannelCommentCount(channelId: string) {
  const { _sum } = await prisma.video.aggregate({
    where: { channelId },
    _sum: { commentCount: true },
  });
  await prisma.channel.update({
    where: { id: channelId },
    data: { commentCount: _sum.commentCount ?? 0, lastSyncedAt: new Date() },
  });
}

/**
 * Yalnızca YENİ eklenen yorumlar için çağrılır. Eskiden `analyzedAt == null` olan
 * her yorum her turda yeniden kuyruğa giriyordu; yeni satırların bekleyen işi
 * olamayacağı için mükerrerlik artık yapısal olarak imkânsız.
 * Analizi başarısız olanları scheduler'daki sınırlı süpürme toplar.
 */
async function enqueueAnalysis(channelId: string | null, ids: string[]) {
  if (!ids.length) return;
  const chunks = [];
  for (let index = 0; index < ids.length; index += 40)
    chunks.push({
      type: "ANALYZE_COMMENTS" as const,
      channelId,
      priority: JOB_PRIORITY.ANALYZE_COMMENTS,
      payload: { commentIds: ids.slice(index, index + 40) },
    });
  await prisma.syncJob.createMany({ data: chunks });
}

/**
 * Yorum fan-out'u için ikinci kabul kapısı. Tek bir video listeleme işi iki
 * planlayıcı turu arasında yüzlerce satır ekleyebildiği için genel kapı yetmez.
 * Kırpma sessiz yapılmaz — loglanır.
 */
async function commentFanoutBudget(channelId: string | null, requested: number) {
  if (requested <= 0) return 0;
  const queued = await countPending(MAX_PENDING_COMMENT_JOBS, [
    "SYNC_COMMENTS",
    "SYNC_FACEBOOK_COMMENTS",
  ]);
  const budget = Math.max(0, MAX_PENDING_COMMENT_JOBS - queued);
  if (budget < requested)
    logger.warn("comment_fanout_truncated", {
      channelId,
      requested,
      allowed: budget,
      queued,
    });
  return Math.min(requested, budget);
}

async function handleSyncChannel(job: JobRow) {
  const channelId = requireChannelId(job);
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  const youtubeChannelId = await youtubeChannelIdFor(channel);
  if (!youtubeChannelId)
    throw new PermanentJobError("Kanal için geçerli YouTube bağlantısı veya kimliği yok.");
  const info = (await fetchChannel(youtubeChannelId)).items[0];
  if (!info) throw new PermanentJobError("YouTube kanalı bulunamadı.");
  const remoteVideoCount = Number(info.statistics.videoCount || 0);
  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      youtubeChannelId,
      subscriberCount: BigInt(info.statistics.subscriberCount || 0),
      totalViewCount: BigInt(info.statistics.viewCount || 0),
      videoCount: remoteVideoCount,
      status: "ACTIVE",
      lastSyncedAt: new Date(),
    },
  });
  if (job.payload?.channelOnly) return;
  // Yerel video sayısı uzak sayının altındaysa derin tarama yap; yakalayınca
  // kalıcı olarak artımlı listelemeye geç. Yeni kolon gerektirmeyen, kendini
  // onaran bir ölçüt (sayı sürüklenirse tekrar derin taramaya döner).
  const localVideoCount = await prisma.video.count({
    where: { channelId: channel.id, platform: "YOUTUBE" },
  });
  const full = localVideoCount < Math.min(remoteVideoCount, MAX_VIDEOS_PER_CHANNEL);
  await prisma.syncJob.create({
    data: {
      type: "SYNC_VIDEOS",
      channelId: channel.id,
      priority: JOB_PRIORITY.SYNC_VIDEOS,
      payload: { playlistId: info.contentDetails.relatedPlaylists.uploads, full },
    },
  });
}

async function handleSyncVideos(job: JobRow) {
  const channelId = requireChannelId(job);
  const { playlistId, full } = job.payload;
  if (!playlistId) throw new PermanentJobError("SYNC_VIDEOS için playlistId zorunlu.");
  // Artımlı mod: uploads playlist'i en yeni önce olduğu için tek sayfa yeterli
  // (2 birim). Derin tarama yalnızca yakalama sırasında.
  const maxVideos = full ? MAX_VIDEOS_PER_CHANNEL : 50;
  const items = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchPlaylistVideos(playlistId, pageToken);
    items.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken && items.length < maxVideos);

  const stats = new Map();
  for (let index = 0; index < items.length; index += 50) {
    const ids = items.slice(index, index + 50).map((item) => item.snippet.resourceId.videoId);
    const page = await fetchVideoStats(ids);
    for (const entry of page.items) stats.set(entry.id, entry.statistics);
  }

  const externalIds = items.map((item) => item.snippet.resourceId.videoId);
  // Video başına findUnique yerine tek sorgu (N+1 kaldırıldı).
  const existingRows = await prisma.video.findMany({
    where: { platform: "YOUTUBE", youtubeVideoId: { in: externalIds } },
    select: {
      id: true,
      youtubeVideoId: true,
      publishedAt: true,
      remoteCommentCount: true,
      commentsSyncedAt: true,
    },
  });
  const existingByExternalId = new Map(existingRows.map((row) => [row.youtubeVideoId, row]));

  const now = Date.now();
  const due: { videoId: string; youtubeVideoId: string; remoteCommentCount: number | null }[] = [];
  const createdVideos: { id: string; title: string }[] = [];

  for (const item of items) {
    const externalId = item.snippet.resourceId.videoId;
    const stat = stats.get(externalId);
    const remoteCommentCount = stat?.commentCount === undefined ? null : Number(stat.commentCount);
    const data = {
      platform: "YOUTUBE" as const,
      externalId,
      youtubeVideoId: externalId,
      permalinkUrl: `https://www.youtube.com/watch?v=${externalId}`,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: new Date(item.snippet.publishedAt),
      thumbnailUrl: item.snippet.thumbnails?.high?.url,
      viewCount: BigInt(stat?.viewCount || 0),
      likeCount: BigInt(stat?.likeCount || 0),
    };
    const existing = existingByExternalId.get(externalId);
    if (existing) {
      // `remoteCommentCount` BİLEREK burada yazılmıyor: yalnızca yorumlar
      // başarıyla senkronlandıktan sonra güncellenirse "en son başarılı senkrondaki
      // sayı" anlamını korur. Burada yazmak, yorum işi başarısız olduğunda sayıları
      // eşitleyip videoyu kalıcı olarak elemeye yol açardı.
      await prisma.video.update({ where: { id: existing.id }, data });
      if (
        needsCommentSync(
          {
            ageReference: existing.publishedAt,
            commentsSyncedAt: existing.commentsSyncedAt,
            remoteCommentCount: existing.remoteCommentCount,
          },
          remoteCommentCount,
          now,
        )
      )
        due.push({ videoId: existing.id, youtubeVideoId: externalId, remoteCommentCount });
      continue;
    }
    const video = await prisma.video.create({
      data: { ...data, channelId: channelId, commentCount: 0 },
    });
    createdVideos.push({ id: video.id, title: item.snippet.title });
    due.push({ videoId: video.id, youtubeVideoId: externalId, remoteCommentCount });
  }

  for (const video of createdVideos)
    await createContentAlert({
      channelId: channelId,
      videoId: video.id,
      type: "NEW_VIDEO",
      title: "Yeni YouTube videosu",
      description: video.title,
    });

  const allowed = await commentFanoutBudget(channelId, due.length);
  if (allowed)
    await prisma.syncJob.createMany({
      data: due.slice(0, allowed).map((entry) => ({
        type: "SYNC_COMMENTS" as const,
        channelId: channelId,
        priority: JOB_PRIORITY.SYNC_COMMENTS,
        payload: entry,
      })),
    });
  // Kanal sayacı tur başına bir kez, video listeleme işinin sonunda tazelenir
  // (eskiden her yorum işinden sonra kanal çapında bir join-count çalışıyordu).
  await refreshChannelCommentCount(channelId);
  logger.info("youtube_videos_synced", {
    channelId: channelId,
    mode: full ? "full" : "incremental",
    videos: items.length,
    created: createdVideos.length,
    commentJobs: allowed,
    skipped: items.length - due.length,
  });
}

async function handleSyncComments(job: JobRow) {
  const { videoId, youtubeVideoId, remoteCommentCount } = job.payload;
  if (!videoId || !youtubeVideoId)
    throw new PermanentJobError("SYNC_COMMENTS için videoId ve youtubeVideoId zorunlu.");

  // En yeni bilinen yorum = filigran. `order=time` sayesinde bu tarihe inince durabiliriz.
  const newest = await prisma.comment.findFirst({
    where: { videoId },
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });
  const cutoff = newest ? new Date(newest.publishedAt.getTime() - 3_600_000) : null;

  const collected = [];
  let pageToken: string | undefined;
  let pages = 0;
  try {
    for (;;) {
      const page = await fetchComments(youtubeVideoId, pageToken);
      pages++;
      collected.push(...page.items);
      const pageIds = page.items.map((item) => item.snippet.topLevelComment.id);
      const known = new Set(
        (
          await prisma.comment.findMany({
            where: { youtubeCommentId: { in: pageIds } },
            select: { youtubeCommentId: true },
          })
        ).map((row) => row.youtubeCommentId),
      );
      const oldestOnPage = page.items.reduce<Date | null>((oldest, item) => {
        const at = new Date(item.snippet.topLevelComment.snippet.publishedAt);
        return !oldest || at < oldest ? at : oldest;
      }, null);
      const allKnown = pageIds.length > 0 && pageIds.every((id) => known.has(id));
      // Erken çıkış: bu sayfanın tamamı biliniyor VE filigranın gerisine geçtik.
      if (allKnown && cutoff && oldestOnPage && oldestOnPage <= cutoff) break;
      if (!page.nextPageToken || collected.length >= MAX_COMMENTS_PER_VIDEO) break;
      pageToken = page.nextPageToken;
    }
  } catch (error) {
    const { kind, code } = classifyJobError(error);
    // Yorumları kapalı / silinmiş video: bu bir hata değil, kalıcı bir durum.
    // İşaretlenmezse değişiklik kontrolü onu sonsuza kadar yeniden kuyruğa alır.
    if (kind !== "BENIGN") throw error;
    await prisma.video.update({
      where: { id: videoId },
      data: { commentsSyncedAt: new Date(), remoteCommentCount: 0 },
    });
    logger.info("comments_unavailable", { videoId, youtubeVideoId, reason: code });
    return;
  }

  const byExternalId = new Map();
  for (const item of collected) byExternalId.set(item.snippet.topLevelComment.id, item);
  const externalIds = [...byExternalId.keys()];
  const existingRows = await prisma.comment.findMany({
    where: { youtubeCommentId: { in: externalIds } },
    select: {
      id: true,
      youtubeCommentId: true,
      text: true,
      likeCount: true,
      analyzedAt: true,
    },
  });
  const existingByExternalId = new Map(existingRows.map((row) => [row.youtubeCommentId, row]));

  const toCreate = [];
  const toUpdate = [];
  for (const [externalId, item] of byExternalId) {
    const source = item.snippet.topLevelComment.snippet;
    const shared = {
      permalinkUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}&lc=${externalId}`,
      text: source.textDisplay,
      authorName: source.authorDisplayName,
      likeCount: source.likeCount,
    };
    const existing = existingByExternalId.get(externalId);
    if (!existing) {
      toCreate.push({
        platform: "YOUTUBE" as const,
        externalId,
        youtubeCommentId: externalId,
        videoId,
        authorChannelId: source.authorChannelId?.value,
        publishedAt: new Date(source.publishedAt),
        updatedOnYoutubeAt: new Date(source.updatedAt),
        ...shared,
      });
      continue;
    }
    // Yalnızca gerçekten değişmiş satırlar yazılır.
    if (existing.text !== shared.text || existing.likeCount !== shared.likeCount)
      toUpdate.push({ id: existing.id, data: { ...shared, updatedOnYoutubeAt: new Date(source.updatedAt) } });
  }

  if (toCreate.length) await prisma.comment.createMany({ data: toCreate, skipDuplicates: true });
  for (const entry of toUpdate)
    await prisma.comment.update({ where: { id: entry.id }, data: entry.data });

  const createdRows = toCreate.length
    ? await prisma.comment.findMany({
        where: {
          platform: "YOUTUBE",
          externalId: { in: toCreate.map((entry) => entry.externalId) },
        },
        select: { id: true, authorName: true, text: true },
      })
    : [];
  await createNewCommentAlerts(job.channelId, videoId, "YOUTUBE", createdRows);
  await enqueueAnalysis(job.channelId, createdRows.map((row) => row.id));

  const localCount = await prisma.comment.count({ where: { videoId } });
  await prisma.video.update({
    where: { id: videoId },
    data: {
      commentCount: localCount,
      // Yalnızca başarılı senkrondan sonra: değişiklik kontrolünün referansı bu.
      ...(typeof remoteCommentCount === "number" ? { remoteCommentCount } : {}),
      commentsSyncedAt: new Date(),
    },
  });
  if (job.channelId && createdRows.length > 0)
    await createContentAlert({
      channelId: job.channelId,
      videoId,
      type: "NEW_COMMENTS",
      title: "Yeni YouTube yorumları",
      description: `Videoya ${createdRows.length} yeni yorum geldi.`,
      occurrenceCount: createdRows.length,
    });
  logger.info("youtube_comments_synced", {
    videoId,
    pages,
    fetched: collected.length,
    created: toCreate.length,
    updated: toUpdate.length,
  });
}

async function handleSyncFacebookChannel(job: JobRow) {
  const channelId = requireChannelId(job);
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  if (!channel.facebookUrl) throw new PermanentJobError("Kanalın Facebook bağlantısı yok.");
  const page = hasFacebookApiToken()
    ? await resolveFacebookPage(channel.facebookUrl)
    : { id: facebookPageIdentifier(channel.facebookUrl) };
  await prisma.channel.update({
    where: { id: channel.id },
    data: { facebookPageId: page.id, status: "ACTIVE", lastSyncedAt: new Date() },
  });
  if (job.payload?.channelOnly) return;
  await prisma.syncJob.create({
    data: {
      type: "SYNC_FACEBOOK_VIDEOS",
      channelId: channel.id,
      priority: JOB_PRIORITY.SYNC_FACEBOOK_VIDEOS,
      payload: { facebookPageId: page.id, facebookUrl: channel.facebookUrl },
    },
  });
}

async function handleSyncFacebookVideos(job: JobRow) {
  const channelId = requireChannelId(job);
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  const facebookPageId = job.payload?.facebookPageId || channel.facebookPageId;
  if (!facebookPageId) throw new PermanentJobError("Facebook sayfa kimliği bulunamadı.");
  let page: { data: FacebookVideo[] };
  if (hasFacebookApiToken()) {
    page = await fetchFacebookVideos(facebookPageId);
  } else {
    if (!channel.facebookUrl)
      throw new PermanentJobError("Tarama için Facebook bağlantısı gerekli.");
    page = await scrapeFacebookVideos(channel.facebookUrl);
  }

  const externalIds = page.data.map((item) => item.id);
  const existingRows = await prisma.video.findMany({
    where: { platform: "FACEBOOK", externalId: { in: externalIds } },
    select: {
      id: true,
      externalId: true,
      createdAt: true,
      publishedAt: true,
      commentsSyncedAt: true,
      remoteCommentCount: true,
    },
  });
  const existingByExternalId = new Map(existingRows.map((row) => [row.externalId, row]));

  const now = Date.now();
  const due: {
    videoId: string;
    facebookVideoId: string;
    permalinkUrl?: string;
    remoteCommentCount: number | null;
  }[] = [];
  const createdVideos: { id: string; title: string }[] = [];

  for (const item of page.data) {
    const remoteCommentCount =
      item.comments?.summary?.total_count === undefined
        ? null
        : Number(item.comments.summary.total_count);
    const title = item.title || item.description?.slice(0, 120) || "Facebook videosu";
    const shared = {
      title,
      description: item.description,
      thumbnailUrl: item.picture,
      permalinkUrl: item.permalink_url,
      viewCount: BigInt(item.views || 0),
      likeCount: BigInt(item.likes?.summary?.total_count || 0),
    };
    const existing = existingByExternalId.get(item.id);
    const video = existing
      ? await prisma.video.update({ where: { id: existing.id }, data: shared })
      : await prisma.video.create({
          data: {
            platform: "FACEBOOK",
            externalId: item.id,
            channelId: channelId,
            publishedAt: new Date(item.created_time),
            commentCount: 0,
            ...shared,
          },
        });
    if (!existing) {
      createdVideos.push({ id: video.id, title });
      due.push({
        videoId: video.id,
        facebookVideoId: item.id,
        permalinkUrl: item.permalink_url,
        remoteCommentCount,
      });
      continue;
    }
    // Tarama yolunda uzak yorum sayısı yok; karar yaşa dayalı takvimle verilir.
    // Yaş ölçütü createdAt (ilk görülme): scrapeFacebookVideos publishedAt'e
    // tarama anını yazdığı için o alan güvenilmez.
    const state = {
      ageReference: hasFacebookApiToken() ? existing.publishedAt : existing.createdAt,
      commentsSyncedAt: existing.commentsSyncedAt,
      remoteCommentCount: existing.remoteCommentCount,
    };
    const dueNow =
      remoteCommentCount !== null
        ? needsCommentSync(state, remoteCommentCount, now)
        : facebookCommentSyncDue(state, now);
    if (dueNow)
      due.push({
        videoId: existing.id,
        facebookVideoId: item.id,
        permalinkUrl: item.permalink_url,
        remoteCommentCount,
      });
  }

  for (const video of createdVideos)
    await createContentAlert({
      channelId: channelId,
      videoId: video.id,
      type: "NEW_VIDEO",
      title: "Yeni Facebook videosu",
      description: video.title,
    });

  const allowed = await commentFanoutBudget(channelId, due.length);
  if (allowed)
    await prisma.syncJob.createMany({
      data: due.slice(0, allowed).map((entry) => ({
        type: "SYNC_FACEBOOK_COMMENTS" as const,
        channelId: channelId,
        priority: JOB_PRIORITY.SYNC_FACEBOOK_COMMENTS,
        payload: entry,
      })),
    });
  await refreshChannelCommentCount(channelId);
  logger.info("facebook_videos_synced", {
    channelId: channelId,
    videos: page.data.length,
    created: createdVideos.length,
    commentJobs: allowed,
    skipped: page.data.length - due.length,
  });
}

async function handleSyncFacebookComments(job: JobRow) {
  const { videoId, facebookVideoId, permalinkUrl, remoteCommentCount } = job.payload;
  if (!videoId || !facebookVideoId)
    throw new PermanentJobError("SYNC_FACEBOOK_COMMENTS için videoId ve facebookVideoId zorunlu.");
  const videoUrl =
    permalinkUrl ||
    (await prisma.video.findUnique({ where: { id: videoId }, select: { permalinkUrl: true } }))
      ?.permalinkUrl;
  if (!hasFacebookApiToken() && !videoUrl) {
    // Eskiden bu dal sessizce COMPLETED oluyordu; artık kalıcı hata.
    throw new PermanentJobError("Facebook video bağlantısı yok, yorumlar taranamıyor.");
  }
  const page = hasFacebookApiToken()
    ? await fetchFacebookComments(facebookVideoId)
    : await scrapeFacebookComments(videoUrl);
  await mirrorFacebookComments(facebookVideoId, page.data);

  const items = page.data.flatMap((item) => {
    const message = item.message?.trim();
    return message ? [{ ...item, message }] : [];
  });
  const externalIds = items.map((item) => item.id);
  const existingRows = await prisma.comment.findMany({
    where: { platform: "FACEBOOK", externalId: { in: externalIds } },
    select: { id: true, externalId: true, text: true, likeCount: true, publishedAt: true },
  });
  const existingByExternalId = new Map(existingRows.map((row) => [row.externalId, row]));

  const toCreate = [];
  const toUpdate = [];
  for (const item of items) {
    const commentLink = directCommentUrl({
      platform: "FACEBOOK",
      externalId: item.id,
      permalinkUrl: item.permalink_url || null,
      videoUrl: videoUrl || null,
    });
    const shared = {
      text: item.message,
      authorName: item.from?.name || "Facebook kullanıcısı",
      likeCount: item.like_count || 0,
      permalinkUrl: commentLink || videoUrl,
    };
    const existing = existingByExternalId.get(item.id);
    if (!existing) {
      toCreate.push({
        platform: "FACEBOOK" as const,
        externalId: item.id,
        videoId,
        authorChannelId: item.from?.id,
        publishedAt: new Date(item.created_time),
        ...shared,
      });
      continue;
    }
    // Kesin tarih (Graph API veya aria-label) eski hatalı "tarama anı" kayıtlarını
    // düzeltir; yaklaşık tarihler mevcut değeri ezmez.
    const exactDate = item.created_time_exact !== false ? new Date(item.created_time) : null;
    const dateFix =
      exactDate && existing.publishedAt.getTime() !== exactDate.getTime()
        ? { publishedAt: exactDate }
        : undefined;
    if (existing.text !== shared.text || existing.likeCount !== shared.likeCount || dateFix)
      toUpdate.push({ id: existing.id, data: { ...shared, ...dateFix } });
  }

  if (toCreate.length) await prisma.comment.createMany({ data: toCreate, skipDuplicates: true });
  for (const entry of toUpdate)
    await prisma.comment.update({ where: { id: entry.id }, data: entry.data });

  const createdRows = toCreate.length
    ? await prisma.comment.findMany({
        where: {
          platform: "FACEBOOK",
          externalId: { in: toCreate.map((entry) => entry.externalId) },
        },
        select: { id: true, authorName: true, text: true },
      })
    : [];
  await createNewCommentAlerts(job.channelId, videoId, "FACEBOOK", createdRows);
  await enqueueAnalysis(job.channelId, createdRows.map((row) => row.id));

  const localCount = await prisma.comment.count({ where: { videoId } });
  await prisma.video.update({
    where: { id: videoId },
    data: {
      commentCount: localCount,
      ...(typeof remoteCommentCount === "number" ? { remoteCommentCount } : {}),
      commentsSyncedAt: new Date(),
    },
  });
  if (job.channelId && createdRows.length > 0)
    await createContentAlert({
      channelId: job.channelId,
      videoId,
      type: "NEW_COMMENTS",
      title: "Yeni Facebook yorumları",
      description: `Videoya ${createdRows.length} yeni yorum geldi.`,
      occurrenceCount: createdRows.length,
    });
  logger.info("facebook_comments_synced", {
    videoId,
    fetched: items.length,
    created: toCreate.length,
    updated: toUpdate.length,
  });
}

const handlers = {
  SYNC_CHANNEL: handleSyncChannel,
  SYNC_VIDEOS: handleSyncVideos,
  SYNC_COMMENTS: handleSyncComments,
  SYNC_FACEBOOK_CHANNEL: handleSyncFacebookChannel,
  SYNC_FACEBOOK_VIDEOS: handleSyncFacebookVideos,
  SYNC_FACEBOOK_COMMENTS: handleSyncFacebookComments,
  ANALYZE_COMMENTS: async (job: JobRow) => {
    const commentIds = job.payload?.commentIds;
    if (!Array.isArray(commentIds) || !commentIds.length)
      throw new PermanentJobError("ANALYZE_COMMENTS için commentIds zorunlu.");
    await analyzeComments(commentIds);
  },
  BUILD_INSIGHTS: async () => {
    // Enum'da var, hiçbir yer kuyruğa almıyor. Sessizce COMPLETED olmasın.
    throw new PermanentJobError("BUILD_INSIGHTS henüz uygulanmadı.");
  },
};

/** Kanal kimliği isteyen iş tipleri; eskiden `&& job.channelId` ile sessizce atlanıyordu. */
const CHANNEL_REQUIRED = new Set([
  "SYNC_CHANNEL",
  "SYNC_VIDEOS",
  "SYNC_FACEBOOK_CHANNEL",
  "SYNC_FACEBOOK_VIDEOS",
]);

async function processJob(job: JobRow) {
  const handler = handlers[job.type];
  if (!handler) throw new PermanentJobError(`Bilinmeyen iş tipi: ${job.type}`);
  if (CHANNEL_REQUIRED.has(job.type) && !job.channelId)
    throw new PermanentJobError(`${job.type} için channelId zorunlu.`);
  await handler(job);
}

async function runJob(job: JobRow) {
  try {
    await processJob(job);
    await completeJob(workerId, job.id);
  } catch (error) {
    const classification = classifyJobError(error);
    const { retry, delayMs } = retryDecision(job.attempts, job.maxAttempts, classification);
    const message = error instanceof Error ? error.message : String(error);
    logger.error("job_failed", {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      kind: classification.kind,
      code: classification.code,
      retry,
      retryInMs: retry ? delayMs : undefined,
      error: message.slice(0, 300),
    });
    await failJob(workerId, job.id, { retry, delayMs, error: message }).catch((failure) =>
      logger.error("job_fail_write_failed", { jobId: job.id, error: String(failure) }),
    );
  }
}

async function claimLoop() {
  let idle = 0;
  while (!shuttingDown) {
    const free = CONCURRENCY - running.size;
    if (free <= 0) {
      await sleep(100);
      continue;
    }
    const inFlight = [...running.values()];
    let jobs;
    try {
      jobs = await claimBatch({
        workerId,
        freeSlots: free,
        analyzeInFlight: inFlight.filter((entry) => entry.type === "ANALYZE_COMMENTS").length,
        analyzeSlots: ANALYZE_SLOTS,
        scrapeInFlight: inFlight.filter((entry) => isScrapeJob(entry.type)).length,
        scrapeSlots: SCRAPE_SLOTS,
      });
    } catch (error) {
      logger.error("claim_failed", { error: String(error).slice(0, 300) });
      await sleep(2_000);
      continue;
    }
    if (!jobs.length) {
      idle = Math.min(idle + 1, 8);
      await sleep(500 + Math.random() * 500 * idle);
      continue;
    }
    idle = 0;
    for (const job of jobs) {
      running.set(job.id, { type: job.type, startedAt: Date.now() });
      // Sahipsiz promise bırakılmaz: unhandledRejection politikası süreci kapatıyor.
      void runJob(job)
        .catch((error) => logger.error("run_job_escaped", { jobId: job.id, error: String(error) }))
        .finally(() => running.delete(job.id));
    }
  }
}

async function beat() {
  if (!running.size) {
    heartbeatFailures = 0;
    return;
  }
  try {
    await heartbeat(workerId, [...running.keys()]);
    heartbeatFailures = 0;
  } catch (error) {
    heartbeatFailures++;
    logger.error("heartbeat_failed", {
      failures: heartbeatFailures,
      inFlight: running.size,
      error: String(error).slice(0, 200),
    });
    // Münhasırlığı kanıtlayamıyorsak iddia etmeyi bırakırız: aksi halde süpürücü
    // işi başkasına verirken biz de çalışmaya devam eder ve çift çalışma olur.
    if (heartbeatFailures >= 3) void shutdown("heartbeat_exhausted", 1);
  }
}

async function shutdown(reason: string, code = 0) {
  if (shuttingDown) {
    if (!forcedExit) {
      forcedExit = true;
      logger.warn("shutdown_forced", { reason });
      process.exit(code || 1);
    }
    return;
  }
  shuttingDown = true;
  logger.info("shutdown_started", { reason, inFlight: running.size, drainMs: DRAIN_MS });
  if (sweepTimer) clearInterval(sweepTimer);
  const deadline = Date.now() + DRAIN_MS;
  while (running.size && Date.now() < deadline) await sleep(250);
  // Heartbeat drenaj boyunca AÇIK kaldı; erken kapatmak drene olmaya çalışan bir
  // işin kilidinin altından süpürülmesine yol açardı.
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (running.size) {
    const released = await releaseJobs(workerId, [...running.keys()], { refund: true }).catch(
      () => 0,
    );
    logger.warn("shutdown_released_jobs", { released, abandoned: [...running.keys()] });
  }
  await closeFacebookBrowser().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  logger.info("shutdown_complete", { reason });
  process.exit(code);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", {
    error: reason instanceof Error ? reason.stack : String(reason),
  });
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", { error: error.stack || String(error) });
  void shutdown("uncaughtException", 1);
});

async function run() {
  logger.info("worker_started", {
    workerId,
    concurrency: CONCURRENCY,
    analyzeSlots: ANALYZE_SLOTS,
    scrapeSlots: SCRAPE_SLOTS,
    syncIntervalMinutes: SYNC_INTERVAL_MINUTES,
  });
  // Açılışta bir kez: yetim kilit sayısı loglarda görünsün. Kurtarmanın kendisi
  // artık periyodik süpürücünün işi (eskiden yalnızca burada bir kez çalışıyordu
  // ve 30 dakika içinde yeniden başlatma hiçbir şeyi kurtaramıyordu).
  const recovered = await sweepStaleLocks();
  logger.info("worker_pool_started", { recovered });

  heartbeatTimer = setInterval(() => void beat(), HEARTBEAT_MS);
  heartbeatTimer.unref?.();
  sweepTimer = setInterval(
    () => void sweepStaleLocks().catch((error) => logger.error("sweep_failed", { error: String(error) })),
    SWEEP_MS,
  );
  sweepTimer.unref?.();

  const scheduler =
    process.env.SCHEDULER_ENABLED === "false"
      ? Promise.resolve()
      : schedulerLoop(
          [
            {
              name: "channel_syncs",
              intervalMs: SYNC_INTERVAL_MINUTES * 60_000,
              run: () => scheduleChannelSyncs(SYNC_INTERVAL_MINUTES),
            },
            { name: "prune_jobs", intervalMs: 15 * 60_000, run: pruneJobs },
            { name: "analysis_stragglers", intervalMs: 15 * 60_000, run: enqueueAnalysisStragglers },
            {
              name: "reminder_emails",
              intervalMs: 15 * 60_000,
              run: async () => {
                const result = await sendWeekdayReminders();
                if (result.sent) logger.info("weekday_reminders_sent", { sent: result.sent });
              },
            },
            { name: "alert_backfill", intervalMs: 15 * 60_000, run: backfillRecentContentAlerts },
          ],
          () => shuttingDown,
          sleep,
        );

  await Promise.all([claimLoop(), scheduler]);
}

run().catch((error) => {
  logger.error("worker_boot_failed", { error: error instanceof Error ? error.stack : String(error) });
  process.exit(1);
});

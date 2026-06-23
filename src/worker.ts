// Job payloads are narrowed by job type below.
// @ts-nocheck
import { randomUUID } from "node:crypto";
import { analyzeComments } from "./lib/gemini";
import { facebookPageIdentifier, fetchFacebookComments, fetchFacebookVideos, hasFacebookApiToken, resolveFacebookPage } from "./lib/facebook";
import { scrapeFacebookComments, scrapeFacebookVideos } from "./lib/facebook-scraper";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { fetchChannel, fetchComments, fetchPlaylistVideos, fetchVideoStats, resolveChannelId } from "./lib/youtube";

const workerId = randomUUID();
let schedulerTurn=0;
const isTransientError=(error:unknown)=>/\b(429|500|502|503|504)\b|high demand|temporar|timeout|fetch failed|ECONNRESET/i.test(String(error));

async function youtubeChannelIdFor(channel: { youtubeChannelId: string | null; youtubeUrl: string | null; uc: string | null }) {
  if (channel.youtubeChannelId) return channel.youtubeChannelId;
  if (channel.youtubeUrl && channel.youtubeUrl !== "[object Object]") {
    try { const resolved = await resolveChannelId(channel.youtubeUrl); if (resolved) return resolved; } catch {}
  }
  return /^UC[\w-]+$/.test(channel.uc || "") ? channel.uc : null;
}

async function refreshChannelCommentCount(channelId: string) {
  const commentCount = await prisma.comment.count({ where: { video: { channelId } } });
  await prisma.channel.update({ where: { id: channelId }, data: { commentCount, lastSyncedAt: new Date() } });
}

async function enqueueAnalysis(channelId: string | null, ids: string[]) {
  for (let index = 0; index < ids.length; index += 40) {
    await prisma.syncJob.create({ data: { type: "ANALYZE_COMMENTS", channelId, payload: { commentIds: ids.slice(index, index + 40) } } });
  }
}

async function processJob(job: { id: string; type: string; channelId: string | null; payload: unknown }) {
  if (job.type === "SYNC_CHANNEL" && job.channelId) {
    const channel = await prisma.channel.findUniqueOrThrow({ where: { id: job.channelId } });
    const youtubeChannelId = await youtubeChannelIdFor(channel);
    if (!youtubeChannelId) throw new Error("Kanal için geçerli YouTube bağlantısı veya kimliği yok.");
    const info = (await fetchChannel(youtubeChannelId)).items[0];
    if (!info) throw new Error("YouTube kanalı bulunamadı.");
    await prisma.channel.update({ where: { id: channel.id }, data: {
      youtubeChannelId,
      subscriberCount: BigInt(info.statistics.subscriberCount || 0),
      totalViewCount: BigInt(info.statistics.viewCount || 0),
      videoCount: Number(info.statistics.videoCount || 0),
      status: "ACTIVE",
      lastSyncedAt: new Date(),
    } });
    if (!(job.payload as { channelOnly?: boolean } | null)?.channelOnly) {
      await prisma.syncJob.create({ data: { type: "SYNC_VIDEOS", channelId: channel.id, payload: { playlistId: info.contentDetails.relatedPlaylists.uploads } } });
    }
    return;
  }

  if (job.type === "SYNC_VIDEOS" && job.channelId) {
    const playlistId = (job.payload as { playlistId: string }).playlistId;
    const page = await fetchPlaylistVideos(playlistId);
    const latestVideos = page.items.slice(0, 10);
    const stats = await fetchVideoStats(latestVideos.map(item => item.snippet.resourceId.videoId));
    const statsById = new Map(stats.items.map(item => [item.id, item.statistics]));
    for (const item of latestVideos) {
      const externalId = item.snippet.resourceId.videoId;
      const stats = statsById.get(externalId);
      const existing = await prisma.video.findUnique({ where: { youtubeVideoId: externalId } });
      const data = { platform: "YOUTUBE" as const, externalId, youtubeVideoId: externalId, permalinkUrl: `https://www.youtube.com/watch?v=${externalId}`, title: item.snippet.title, description: item.snippet.description, publishedAt: new Date(item.snippet.publishedAt), thumbnailUrl: item.snippet.thumbnails?.high?.url, viewCount: BigInt(stats?.viewCount || 0), likeCount: BigInt(stats?.likeCount || 0), commentCount: Number(stats?.commentCount || 0) };
      const video = existing
        ? await prisma.video.update({ where: { id: existing.id }, data })
        : await prisma.video.create({ data: { ...data, channelId: job.channelId } });
      await prisma.syncJob.create({ data: { type: "SYNC_COMMENTS", channelId: job.channelId, payload: { videoId: video.id, youtubeVideoId: externalId } } });
    }
    return;
  }

  if (job.type === "SYNC_COMMENTS") {
    const { videoId, youtubeVideoId } = job.payload as { videoId: string; youtubeVideoId: string };
    const page = await fetchComments(youtubeVideoId);
    const ids: string[] = [];
    for (const item of page.items) {
      const externalId = item.snippet.topLevelComment.id;
      const source = item.snippet.topLevelComment.snippet;
      const existing = await prisma.comment.findUnique({ where: { youtubeCommentId: externalId } });
      const data = { platform: "YOUTUBE" as const, externalId, youtubeCommentId: externalId, permalinkUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}&lc=${externalId}`, text: source.textDisplay, authorName: source.authorDisplayName, authorChannelId: source.authorChannelId?.value, likeCount: source.likeCount, publishedAt: new Date(source.publishedAt), updatedOnYoutubeAt: new Date(source.updatedAt) };
      const comment = existing
        ? await prisma.comment.update({ where: { id: existing.id }, data })
        : await prisma.comment.create({ data: { ...data, videoId } });
      if (!comment.analyzedAt) ids.push(comment.id);
    }
    await enqueueAnalysis(job.channelId, ids);
    if (job.channelId) await refreshChannelCommentCount(job.channelId);
    return;
  }

  if (job.type === "SYNC_FACEBOOK_CHANNEL" && job.channelId) {
    const channel = await prisma.channel.findUniqueOrThrow({ where: { id: job.channelId } });
    if (!channel.facebookUrl) throw new Error("Kanal için Facebook sayfa bağlantısı yok.");
    const page = hasFacebookApiToken()
      ? await resolveFacebookPage(channel.facebookUrl)
      : { id: facebookPageIdentifier(channel.facebookUrl) };
    await prisma.channel.update({ where: { id: channel.id }, data: { facebookPageId: page.id, status: "ACTIVE", lastSyncedAt: new Date() } });
    if (!(job.payload as { channelOnly?: boolean } | null)?.channelOnly) {
      await prisma.syncJob.create({ data: { type: "SYNC_FACEBOOK_VIDEOS", channelId: channel.id, payload: { facebookPageId: page.id, facebookUrl: channel.facebookUrl } } });
    }
    return;
  }

  if (job.type === "SYNC_FACEBOOK_VIDEOS" && job.channelId) {
    const channel = await prisma.channel.findUniqueOrThrow({ where: { id: job.channelId } });
    const facebookPageId = (job.payload as { facebookPageId?: string } | null)?.facebookPageId || channel.facebookPageId;
    if (!facebookPageId) throw new Error("Facebook sayfa kimliği bulunamadı.");
    const page = hasFacebookApiToken()
      ? await fetchFacebookVideos(facebookPageId)
      : await scrapeFacebookVideos(channel.facebookUrl!);
    for (const item of page.data) {
      const video = await prisma.video.upsert({
        where: { platform_externalId: { platform: "FACEBOOK", externalId: item.id } },
        create: { platform: "FACEBOOK", externalId: item.id, channelId: job.channelId, title: item.title || item.description?.slice(0, 120) || "Facebook videosu", description: item.description, publishedAt: new Date(item.created_time), thumbnailUrl: item.picture, permalinkUrl: item.permalink_url, viewCount: BigInt(item.views || 0), likeCount: BigInt(item.likes?.summary?.total_count || 0), commentCount: item.comments?.summary?.total_count || 0 },
        update: { title: item.title || item.description?.slice(0, 120) || "Facebook videosu", description: item.description, thumbnailUrl: item.picture, permalinkUrl: item.permalink_url, viewCount: BigInt(item.views || 0), likeCount: BigInt(item.likes?.summary?.total_count || 0), commentCount: item.comments?.summary?.total_count || 0 },
      });
      await prisma.syncJob.create({ data: { type: "SYNC_FACEBOOK_COMMENTS", channelId: job.channelId, payload: { videoId: video.id, facebookVideoId: item.id, permalinkUrl: item.permalink_url } } });
    }
    return;
  }

  if (job.type === "SYNC_FACEBOOK_COMMENTS") {
    const { videoId, facebookVideoId, permalinkUrl } = job.payload as { videoId: string; facebookVideoId: string; permalinkUrl?: string };
    const videoUrl = permalinkUrl || (await prisma.video.findUnique({ where: { id: videoId }, select: { permalinkUrl: true } }))?.permalinkUrl;
    const page = hasFacebookApiToken()
      ? await fetchFacebookComments(facebookVideoId)
      : videoUrl
        ? await scrapeFacebookComments(videoUrl)
        : { data: [] };
    const ids: string[] = [];
    for (const item of page.data) {
      if (!item.message?.trim()) continue;
      let commentLink=item.permalink_url;
      if(videoUrl&&item.permalink_url){
        try{const commentId=new URL(item.permalink_url).searchParams.get("comment_id");if(commentId)commentLink=`${videoUrl}${videoUrl.includes("?")?"&":"?"}comment_id=${encodeURIComponent(commentId)}`}catch{}
      }
      const comment = await prisma.comment.upsert({
        where: { platform_externalId: { platform: "FACEBOOK", externalId: item.id } },
        create: { platform: "FACEBOOK", externalId: item.id, videoId, text: item.message, authorName: item.from?.name || "Facebook kullanıcısı", authorChannelId: item.from?.id, likeCount: item.like_count || 0, publishedAt: new Date(item.created_time), permalinkUrl: commentLink || videoUrl },
        update: { text: item.message, authorName: item.from?.name || "Facebook kullanıcısı", likeCount: item.like_count || 0, permalinkUrl: commentLink || videoUrl },
      });
      if (!comment.analyzedAt) ids.push(comment.id);
    }
    await enqueueAnalysis(job.channelId, ids);
    if (job.channelId) await refreshChannelCommentCount(job.channelId);
    return;
  }

  if (job.type === "ANALYZE_COMMENTS") await analyzeComments((job.payload as { commentIds: string[] }).commentIds);
}

async function tick() {
  const job = await prisma.$transaction(async tx => {
    const ready = { status: "PENDING" as const, runAfter: { lte: new Date() } };
    const preferredTypes=["ANALYZE_COMMENTS","SYNC_FACEBOOK_COMMENTS","SYNC_FACEBOOK_VIDEOS"] as const;
    const preferredType=preferredTypes[schedulerTurn++%preferredTypes.length];
    const found = await tx.syncJob.findFirst({ where: { ...ready, type: preferredType }, orderBy: { createdAt: preferredType==="ANALYZE_COMMENTS"?"desc":"asc" } })
      || await tx.syncJob.findFirst({ where: ready, orderBy: { createdAt: "asc" } });
    if (!found) return null;
    return tx.syncJob.update({ where: { id: found.id }, data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 } } });
  });
  if (!job) return false;
  try {
    await processJob(job);
    await prisma.syncJob.update({ where: { id: job.id }, data: { status: "COMPLETED", progress: 100, completedAt: new Date() } });
  } catch (error) {
    logger.error("job_failed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) });
    const temporary=isTransientError(error);
    const retry=temporary?job.attempts<10:job.attempts<job.maxAttempts;
    const delay=temporary?Math.min(15*60_000,Math.pow(2,job.attempts)*60_000):Math.pow(2,job.attempts)*30_000;
    await prisma.syncJob.update({ where: { id: job.id }, data: { status: retry ? "PENDING" : "FAILED", maxAttempts: temporary?10:job.maxAttempts, error: error instanceof Error ? error.message : String(error), runAfter: new Date(Date.now()+delay), lockedAt: null, lockedBy: null } });
  }
  return true;
}

logger.info("worker_started", { workerId });
async function run() { for (;;) { try { const worked = await tick(); if (!worked) await new Promise(resolve => setTimeout(resolve, 500)); } catch (error) { logger.error("worker_tick_failed", { error: String(error) }); await new Promise(resolve => setTimeout(resolve, 1000)); } } }
void run();

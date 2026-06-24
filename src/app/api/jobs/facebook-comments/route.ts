import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeComments } from "@/lib/gemini";

const input = z.object({
  videoExternalId: z.string().min(1),
  replace: z.boolean().optional().default(false),
  comments: z.array(z.object({
    id: z.string().min(1),
    message: z.string().optional(),
    from: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
    created_time: z.string(),
    like_count: z.number().optional(),
    permalink_url: z.string().optional(),
  })).max(500),
});

export async function POST(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const session = await getSession();
  const authorized = Boolean(
    (bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) ||
    session?.role === "ADMIN",
  );
  if (!authorized) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });

  const video = await prisma.video.findUnique({
    where: { platform_externalId: { platform: "FACEBOOK", externalId: parsed.data.videoExternalId } },
    select: { id: true, channelId: true, permalinkUrl: true },
  });
  if (!video) return NextResponse.json({ error: "Video bulunamadı." }, { status: 404 });

  if (parsed.data.replace && parsed.data.comments.length) {
    await prisma.comment.deleteMany({
      where: {
        videoId: video.id,
        platform: "FACEBOOK",
        externalId: { notIn: parsed.data.comments.map((comment) => comment.id) },
      },
    });
  }

  let imported = 0;
  for (const item of parsed.data.comments) {
    if (!item.message?.trim()) continue;
    await prisma.comment.upsert({
      where: { platform_externalId: { platform: "FACEBOOK", externalId: item.id } },
      create: {
        platform: "FACEBOOK",
        externalId: item.id,
        videoId: video.id,
        text: item.message,
        authorName: item.from?.name || "Facebook kullanıcısı",
        authorChannelId: item.from?.id,
        likeCount: item.like_count || 0,
        publishedAt: new Date(item.created_time),
        permalinkUrl: item.permalink_url || video.permalinkUrl,
      },
      update: {
        text: item.message,
        authorName: item.from?.name || "Facebook kullanıcısı",
        likeCount: item.like_count || 0,
        permalinkUrl: item.permalink_url || video.permalinkUrl,
      },
    });
    imported++;
  }
  const [videoCount, channelCount] = await Promise.all([
    prisma.comment.count({ where: { videoId: video.id } }),
    prisma.comment.count({ where: { video: { channelId: video.channelId } } }),
  ]);
  await prisma.$transaction([
    prisma.video.update({ where: { id: video.id }, data: { commentCount: videoCount } }),
    prisma.channel.update({ where: { id: video.channelId }, data: { commentCount: channelCount, lastSyncedAt: new Date() } }),
  ]);
  const pendingAnalysis = await prisma.comment.findMany({
    where: { videoId: video.id, analyzedAt: null },
    orderBy: { publishedAt: "desc" },
    take: 40,
    select: { id: true },
  });
  let analyzed = 0;
  if (pendingAnalysis.length) {
    try {
      analyzed = await analyzeComments(pendingAnalysis.map(comment => comment.id));
    } catch (error) {
      console.error("mirrored_comment_analysis_failed", String(error).slice(0, 300));
    }
  }
  return NextResponse.json({ imported, videoCount, analyzed });
}

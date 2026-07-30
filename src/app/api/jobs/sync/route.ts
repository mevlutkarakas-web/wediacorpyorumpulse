import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { allow, getSession } from "@/lib/auth";
import { JOB_PRIORITY } from "@/worker/priorities";

const body = z.object({
  // `all: true` ile en uzun süredir senkronlanmamış kanallar seçilir — worker
  // durduktan sonra elle kurtarma için (Ayarlar sayfasındaki düğme bunu kullanır).
  channelIds: z.array(z.string()).min(1).max(100).optional(),
  all: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  platform: z.enum(["ALL", "YOUTUBE", "FACEBOOK"]).default("ALL"),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!allow(session, ["ADMIN"])) return NextResponse.json({ error: "Senkronizasyonu yalnızca admin başlatabilir." }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  if (!parsed.data.channelIds && !parsed.data.all)
    return NextResponse.json({ error: "channelIds veya all gerekli." }, { status: 400 });

  const channels = await prisma.channel.findMany({
    where: parsed.data.channelIds
      ? { id: { in: parsed.data.channelIds } }
      : { OR: [{ youtubeUrl: { not: null } }, { uc: { not: null } }, { facebookUrl: { not: null } }] },
    ...(parsed.data.channelIds
      ? {}
      : { orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } as const }], take: parsed.data.limit ?? 50 }),
    select: { id: true, youtubeUrl: true, uc: true, facebookUrl: true },
  });
  const jobs = channels.flatMap(channel => [
    ...(parsed.data.platform !== "FACEBOOK" && (channel.youtubeUrl || channel.uc)
      ? [{ channelId: channel.id, type: "SYNC_CHANNEL" as const, priority: JOB_PRIORITY.SYNC_CHANNEL, maxAttempts: 5 }]
      : []),
    ...(parsed.data.platform !== "YOUTUBE" && channel.facebookUrl
      ? [{ channelId: channel.id, type: "SYNC_FACEBOOK_CHANNEL" as const, priority: JOB_PRIORITY.SYNC_FACEBOOK_CHANNEL, maxAttempts: 5 }]
      : []),
  ]);
  if (jobs.length) await prisma.syncJob.createMany({ data: jobs });
  return NextResponse.json({ queued: jobs.length }, { status: 202 });
}

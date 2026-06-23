import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { allow, getSession } from "@/lib/auth";

const body = z.object({
  channelIds: z.array(z.string()).min(1).max(100),
  platform: z.enum(["ALL", "YOUTUBE", "FACEBOOK"]).default("ALL"),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!allow(session, ["ADMIN"])) return NextResponse.json({ error: "Senkronizasyonu yalnızca admin başlatabilir." }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

  const channels = await prisma.channel.findMany({
    where: { id: { in: parsed.data.channelIds } },
    select: { id: true, youtubeUrl: true, uc: true, facebookUrl: true },
  });
  const jobs = channels.flatMap(channel => [
    ...(parsed.data.platform !== "FACEBOOK" && (channel.youtubeUrl || channel.uc)
      ? [{ channelId: channel.id, type: "SYNC_CHANNEL" as const }]
      : []),
    ...(parsed.data.platform !== "YOUTUBE" && channel.facebookUrl
      ? [{ channelId: channel.id, type: "SYNC_FACEBOOK_CHANNEL" as const }]
      : []),
  ]);
  if (jobs.length) await prisma.syncJob.createMany({ data: jobs });
  return NextResponse.json({ queued: jobs.length }, { status: 202 });
}

import { Suspense } from "react";
import { ChannelManager } from "@/components/channel-manager";
import { prisma } from "@/lib/prisma";

export default async function ChannelsPage() {
  const rows = await prisma.channel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, youtubeUrl: true, category: true, responsibleName: true, status: true, subscriberCount: true, totalViewCount: true, commentCount: true } });
  const channels = rows.map(row => ({ ...row, subscriberCount: Number(row.subscriberCount), totalViewCount: Number(row.totalViewCount) }));
  return <div className="mx-auto max-w-[1600px] space-y-6"><div><h1 className="text-3xl font-black tracking-tight">Kanallar</h1><p className="mt-1 text-sm text-slate-500">YouTube ve Facebook portföyünüzü yönetin.</p></div><Suspense><ChannelManager channels={channels}/></Suspense></div>;
}

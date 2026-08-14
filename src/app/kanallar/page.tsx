import { Suspense } from "react";
import { ChannelManager } from "@/components/channel-manager";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere, getSession } from "@/lib/auth";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
  const session=await getSession();
  const scope = channelAccessWhere(session);
  const totalCount = await prisma.channel.count({ where: scope });
  const { skip, take, page, totalPages } = paginate(parsePage(rawPage), PAGE_SIZE.CHANNELS, totalCount);
  const rows = await prisma.channel.findMany({ where:scope,orderBy: { name: "asc" }, skip, take, select: { id: true, name: true, youtubeUrl: true, category: true, responsibleName: true, status: true, subscriberCount: true, totalViewCount: true, commentCount: true } });
  const channels = rows.map(row => ({ ...row, subscriberCount: Number(row.subscriberCount), totalViewCount: Number(row.totalViewCount) }));
  return <div className="mx-auto max-w-[1600px] space-y-6"><div><h1 className="text-3xl font-black tracking-tight">Kanallar</h1><p className="mt-1 text-sm text-slate-500">YouTube ve Facebook portföyünüzü yönetin.</p></div><Suspense><ChannelManager channels={channels} canImport={session?.role==="ADMIN"} page={page} totalPages={totalPages} totalCount={totalCount}/></Suspense></div>;
}

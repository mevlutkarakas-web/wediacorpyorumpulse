import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, MessageSquareText, MonitorPlay, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere,getSession } from "@/lib/auth";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";
import { PaginationControls } from "@/components/pagination-controls";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";

export default async function FacebookPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
  const session=await getSession();
  const channelWhere = { AND:[channelAccessWhere(session),{facebookUrl: { not: null }}] };
  const [totalCount, pageVideoCount, pageCommentSum] = await Promise.all([
    prisma.channel.count({ where: channelWhere }),
    prisma.video.count({ where: { platform: "FACEBOOK", channel: channelWhere } }),
    prisma.video.aggregate({ where: { platform: "FACEBOOK", channel: channelWhere }, _sum: { commentCount: true } }),
  ]);
  const { skip, take, page, totalPages } = paginate(parsePage(rawPage), PAGE_SIZE.FACEBOOK_CHANNELS, totalCount);
  const channels = await prisma.channel.findMany({
    where: channelWhere,
    orderBy: [{ name: "asc" }, { versionChannel: "asc" }],
    skip,
    take,
    select: {
      id: true,
      name: true,
      versionChannel: true,
      facebookUrl: true,
      facebookOpened: true,
      facebookPageId: true,
      responsibleName: true,
      status: true,
      _count: { select: { videos: { where: { platform: "FACEBOOK" } } } },
    },
  });
  const commentsByChannel = channels.length
    ? new Map(
        (
          await prisma.video.groupBy({
            by: ["channelId"],
            where: { platform: "FACEBOOK", channelId: { in: channels.map((c) => c.id) } },
            _sum: { commentCount: true },
          })
        ).map((row) => [row.channelId, row._sum.commentCount ?? 0]),
      )
    : new Map<string, number>();

  return <div className="mx-auto max-w-[1600px] space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="flex items-center gap-2 text-blue-600"><MonitorPlay size={18}/><span className="text-xs font-bold uppercase tracking-widest">Facebook Operasyonları</span></div><h1 className="mt-2 text-3xl font-black">Facebook Kanalları</h1><p className="mt-1 text-sm text-slate-500">Excel dosyasındaki Facebook sayfaları, videoları ve yorumları.</p></div>
      <Link href="/kanallar?import=1" className="btn-primary"><UploadIcon/>Excel’i yeniden aktar</Link>
    </div>
    <section className="grid gap-4 sm:grid-cols-3">
      <StatCard icon={MonitorPlay} label="Facebook sayfası" value={totalCount.toLocaleString("tr-TR")} iconClassName="text-blue-600"/>
      <StatCard icon={Video} label="Senkronize video" value={pageVideoCount.toLocaleString("tr-TR")} iconClassName="text-blue-600"/>
      <StatCard icon={MessageSquareText} label="Video yorumu" value={(pageCommentSum._sum.commentCount ?? 0).toLocaleString("tr-TR")} iconClassName="text-blue-600"/>
    </section>
    {channels.length ? <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{channels.map(channel => {
      const channelComments = commentsByChannel.get(channel.id) ?? 0;
      return <article key={channel.id} className="card p-5">
        <div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-600 font-black text-white">f</span><div className="min-w-0 flex-1"><h2 className="truncate font-bold">{channel.versionChannel || channel.name}</h2><p className="truncate text-xs text-slate-400">{channel.name}</p></div><span className={`tag ${channel.facebookPageId ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>{channel.facebookPageId ? "Bağlı" : "Bekliyor"}</span></div>
        <div className="my-5 grid grid-cols-2 divide-x rounded-xl bg-muted/60 py-3 text-center"><div><b className="block text-sm">{channel._count.videos}</b><span className="text-[10px] text-slate-400">Video</span></div><div><b className="block text-sm">{channelComments}</b><span className="text-[10px] text-slate-400">Yorum</span></div></div>
        <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Sorumlu</span><b>{channel.responsibleName || "Atanmadı"}</b></div>
        <div className="mt-4 flex gap-2 border-t pt-4"><Link href={`/kanallar/${channel.id}`} className="btn-outline h-9 flex-1 px-3 text-xs">Detay</Link>{channel.facebookUrl && <a href={channel.facebookUrl} target="_blank" rel="noreferrer" className="btn-outline h-9 flex-1 px-3 text-xs">Facebook’ta aç <ExternalLink size={13}/></a>}</div>
      </article>;
    })}</section> : <EmptyState card size="lg" icon={MonitorPlay} title="Facebook kanalı bulunamadı" description="Facebook Link sütunu bulunan Excel dosyasını aktarın."/>}
    <Suspense>
      <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE.FACEBOOK_CHANNELS}/>
    </Suspense>
  </div>;
}

function UploadIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 21h14"/></svg>;
}

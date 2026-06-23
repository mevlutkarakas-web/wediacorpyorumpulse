import Link from "next/link";
import { ExternalLink, MessageSquareText, MonitorPlay, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function FacebookPage() {
  const channels = await prisma.channel.findMany({
    where: { facebookUrl: { not: null } },
    orderBy: [{ name: "asc" }, { versionChannel: "asc" }],
    select: {
      id: true,
      name: true,
      versionChannel: true,
      facebookUrl: true,
      facebookOpened: true,
      facebookPageId: true,
      responsibleName: true,
      status: true,
      videos: {
        where: { platform: "FACEBOOK" },
        select: { commentCount: true },
      },
    },
  });
  const videoCount = channels.reduce((total, channel) => total + channel.videos.length, 0);
  const commentCount = channels.reduce((total, channel) => total + channel.videos.reduce((sum, video) => sum + video.commentCount, 0), 0);

  return <div className="mx-auto max-w-[1600px] space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="flex items-center gap-2 text-blue-600"><MonitorPlay size={18}/><span className="text-xs font-bold uppercase tracking-widest">Facebook Operasyonları</span></div><h1 className="mt-2 text-3xl font-black">Facebook Kanalları</h1><p className="mt-1 text-sm text-slate-500">Excel dosyasındaki Facebook sayfaları, videoları ve yorumları.</p></div>
      <Link href="/kanallar?import=1" className="btn-primary"><UploadIcon/>Excel’i yeniden aktar</Link>
    </div>
    <section className="grid gap-4 sm:grid-cols-3">
      <Summary icon={<MonitorPlay/>} label="Facebook sayfası" value={channels.length}/>
      <Summary icon={<Video/>} label="Senkronize video" value={videoCount}/>
      <Summary icon={<MessageSquareText/>} label="Video yorumu" value={commentCount}/>
    </section>
    {channels.length ? <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{channels.map(channel => {
      const channelComments = channel.videos.reduce((sum, video) => sum + video.commentCount, 0);
      return <article key={channel.id} className="card p-5">
        <div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-600 font-black text-white">f</span><div className="min-w-0 flex-1"><h2 className="truncate font-bold">{channel.versionChannel || channel.name}</h2><p className="truncate text-xs text-slate-400">{channel.name}</p></div><span className={`tag ${channel.facebookPageId ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{channel.facebookPageId ? "Bağlı" : "Bekliyor"}</span></div>
        <div className="my-5 grid grid-cols-2 divide-x rounded-xl bg-muted/60 py-3 text-center"><div><b className="block text-sm">{channel.videos.length}</b><span className="text-[10px] text-slate-400">Video</span></div><div><b className="block text-sm">{channelComments}</b><span className="text-[10px] text-slate-400">Yorum</span></div></div>
        <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Sorumlu</span><b>{channel.responsibleName || "Atanmadı"}</b></div>
        <div className="mt-4 flex gap-2 border-t pt-4"><Link href={`/kanallar/${channel.id}`} className="btn-outline h-9 flex-1 px-3 text-xs">Detay</Link>{channel.facebookUrl && <a href={channel.facebookUrl} target="_blank" rel="noreferrer" className="btn-outline h-9 flex-1 px-3 text-xs">Facebook’ta aç <ExternalLink size={13}/></a>}</div>
      </article>;
    })}</section> : <div className="card p-14 text-center"><MonitorPlay className="mx-auto text-slate-300" size={38}/><h2 className="mt-4 font-bold">Facebook kanalı bulunamadı</h2><p className="mt-1 text-sm text-slate-500">Facebook Link sütunu bulunan Excel dosyasını aktarın.</p></div>}
  </div>;
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="card p-5"><div className="text-blue-600">{icon}</div><div className="mt-4 text-3xl font-black">{value.toLocaleString("tr-TR")}</div><div className="text-sm text-slate-500">{label}</div></div>;
}

function UploadIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 21h14"/></svg>;
}

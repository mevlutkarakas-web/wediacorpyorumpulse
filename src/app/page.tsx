import Link from "next/link";
import {
  Activity,
  Clock3,
  MessageSquareText,
  Upload,
  UserCheck,
  Video,
} from "lucide-react";
import { CategoryChart, GrowthChart } from "@/components/charts";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere, getSession } from "@/lib/auth";
import { compactNumber } from "@/lib/utils";

export default async function Dashboard() {
  const session = await getSession();
  const since = new Date(Date.now() - 7 * 86400000);
  const scope = channelAccessWhere(session);
  const commentScope = { video: { channel: scope } };
  const [
    total,
    active,
    assigned,
    pending,
    commentTotal,
    recentComments,
    categories,
    channels,
    platformPerformance,
    alerts,
  ] = await Promise.all([
    prisma.channel.count({ where: scope }),
    prisma.channel.count({ where: { AND: [scope, { status: "ACTIVE" }] } }),
    prisma.channel.count({
      where: { AND: [scope, { responsibleName: { not: null } }] },
    }),
    prisma.channel.count({ where: { AND: [scope, { status: "PENDING" }] } }),
    prisma.comment.count({ where: commentScope }),
    prisma.comment.findMany({
      where: { AND: [commentScope, { publishedAt: { gte: since } }] },
      select: { publishedAt: true },
    }),
    prisma.channel.groupBy({ by: ["category"], where: scope, _count: true }),
    prisma.channel.findMany({
      where: scope,
      take: 5,
      orderBy: { totalViewCount: "desc" },
      select: {
        id: true,
        name: true,
        category: true,
        totalViewCount: true,
        commentCount: true,
        status: true,
        youtubeUrl: true,
        facebookUrl: true,
      },
    }),
    prisma.video.groupBy({
      by: ["channelId", "platform"],
      where: { channel: scope },
      _sum: { viewCount: true, commentCount: true },
    }),
    prisma.alert.findMany({
      where: { channel: scope },
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        createdAt: true,
        reads: { where: { userId: session!.sub }, select: { userId: true } },
        channel: { select: { name: true, versionChannel: true } },
        video: { select: { platform: true, permalinkUrl: true } },
      },
    }),
  ]);
  const performance = new Map(
    platformPerformance.map((row) => [
      `${row.channelId}:${row.platform}`,
      {
        views: Number(row._sum.viewCount || 0),
        comments: row._sum.commentCount || 0,
      },
    ]),
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return {
      key: d.toISOString().slice(0, 10),
      date: d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
      yorum: 0,
    };
  });
  for (const c of recentComments) {
    const day = days.find(
      (x) => x.key === c.publishedAt.toISOString().slice(0, 10),
    );
    if (day) day.yorum++;
  }
  const cards = [
    ["Toplam kanal", total, Video],
    ["Aktif kanal", active, Activity],
    ["Sorumlu atanmış", assigned, UserCheck],
    ["Atama bekliyor", pending, Clock3],
  ] as const;
  const greetings = [
    "Yorumlar kahvesini içmiş, sizi bekliyor ☕",
    "Bugün de topluluğun kalbine dokunmaya geldik ✨",
    "Klavyeler hazırsa güzel cevaplar başlasın 🚀",
    "İzleyiciler konuşmuş; sıra bizde 🎬",
    "Bugünün süper gücü: doğru zamanda samimi bir cevap 💜",
  ];
  const greeting = greetings[new Date().getDate() % greetings.length];
  return (
    <div className="mx-auto max-w-[1600px] space-y-7">
      <div>
        <p className="text-sm font-semibold text-violet-600">
          {new Date().toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        <h1 className="mt-1 text-3xl font-black">
          Hoş geldiniz, {session?.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {greeting}
        </p>
      </div>
      {total === 0 && (
        <section className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-6 dark:border-violet-500/20 dark:from-violet-500/10 dark:to-indigo-500/10">
          <h2 className="text-lg font-black">İlk kanal listenizi ekleyin</h2>
          <p className="mt-1 text-sm text-slate-500">
            Excel dosyanızı yüklediğinizde dashboard otomatik olarak gerçek
            verilerle dolacak.
          </p>
          <Link href="/kanallar?import=1" className="btn-primary mt-4">
            <Upload size={17} />
            Excel yükle
          </Link>
        </section>
      )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div className="card p-5" key={label}>
            <Icon className="text-violet-600" />
            <div className="mt-5 text-3xl font-black">{value}</div>
            <div className="text-sm text-slate-500">{label}</div>
          </div>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="card p-6">
          <h2 className="font-bold">Son 7 gün yorum hareketliliği</h2>
          <p className="text-xs text-slate-500">
            Toplam {commentTotal.toLocaleString("tr-TR")} gerçek yorum
          </p>
          <GrowthChart data={days} />
        </div>
        <div className="card p-6">
          <h2 className="font-bold">Kategori dağılımı</h2>
          <CategoryChart
            data={categories
              .filter((x) => x.category)
              .map((x) => ({ name: x.category!, value: x._count }))}
          />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b p-5">
            <h2 className="font-bold">Kanal performansı</h2>
          </div>
          {channels.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Kanal</th>
                    <th>YouTube</th>
                    <th>Facebook</th>
                    <th>Toplam yorum</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c) => (
                    <tr className="border-b last:border-0" key={c.id}>
                      <td className="px-5 py-4">
                        <Link className="font-bold" href={`/kanallar/${c.id}`}>
                          {c.name}
                        </Link>
                        <p className="text-xs text-slate-400">
                          {c.category || "—"}
                        </p>
                      </td>
                      <td>
                        <b>{compactNumber(performance.get(`${c.id}:YOUTUBE`)?.views || 0)}</b>
                        <p className="text-[11px] text-slate-400">{compactNumber(performance.get(`${c.id}:YOUTUBE`)?.comments || 0)} yorum</p>
                      </td>
                      <td>
                        <b>{compactNumber(performance.get(`${c.id}:FACEBOOK`)?.views || 0)}</b>
                        <p className="text-[11px] text-slate-400">{compactNumber(performance.get(`${c.id}:FACEBOOK`)?.comments || 0)} yorum</p>
                      </td>
                      <td>{compactNumber(c.commentCount)}</td>
                      <td>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-400">
              Kanal verisi yok.
            </div>
          )}
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <MessageSquareText className="text-violet-500" />
            <h2 className="font-bold">Bildirimlerim</h2>
          </div>
          {alerts.length ? (
            <div className="mt-4 space-y-3">
              {alerts.map((a) => (
                <div className={`rounded-xl border p-4 ${a.reads.length ? "opacity-60" : "border-violet-200 bg-violet-50/40 dark:bg-violet-500/5"}`} key={a.id}>
                  <div className="flex items-center gap-2"><b className="text-sm">{a.title}</b>{!a.reads.length&&<span className="size-2 rounded-full bg-red-500"/>}</div>
                  <p className="mt-1 text-xs text-slate-500">{a.description}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{a.channel.versionChannel||a.channel.name} · {a.video?.platform==="FACEBOOK"?"Facebook":"YouTube"} · {a.createdAt.toLocaleString("tr-TR")}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-400">
              Henüz yeni video veya yorum bildirimi yok.
            </div>
          )}
        </div>
      </section>
      <div className="flex justify-end"><Link href="/bildirimler" className="btn-outline">Tüm bildirimleri aç</Link></div>
    </div>
  );
}

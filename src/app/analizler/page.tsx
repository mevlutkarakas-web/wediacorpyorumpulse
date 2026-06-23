import { BrainCircuit, ExternalLink, MessageCircleQuestion, Sparkles, Tags } from "lucide-react";
import { prisma } from "@/lib/prisma";

const labels: Record<string, string> = { POSITIVE: "Pozitif", NEGATIVE: "Negatif", NEUTRAL: "Nötr", QUESTION: "Soru", COMPLAINT: "Şikâyet", SUGGESTION: "Öneri", SPAM: "Spam" };

export default async function AnalyticsPage() {
  const [total, analyzed, kinds, topics, recent] = await Promise.all([
    prisma.comment.count(),
    prisma.comment.count({ where: { analyzedAt: { not: null } } }),
    prisma.comment.groupBy({ by: ["kind"], where: { analyzedAt: { not: null } }, _count: true }),
    prisma.comment.groupBy({ by: ["topic"], where: { analyzedAt: { not: null }, topic: { not: null } }, _count: true, orderBy: { _count: { topic: "desc" } }, take: 10 }),
    prisma.comment.findMany({ where: { analyzedAt: { not: null } }, take: 10, orderBy: { analyzedAt: "desc" }, select: { id: true, platform: true, permalinkUrl: true, aiSummary: true, topic: true, kind: true, video: { select: { title: true, permalinkUrl: true, channel: { select: { name: true, versionChannel: true } } } } } }),
  ]);
  const progress = total ? Math.round(analyzed / total * 100) : 0;
  return <div className="mx-auto max-w-[1500px] space-y-6">
    <div><div className="flex items-center gap-2 text-violet-600"><Sparkles size={18}/><span className="text-xs font-bold uppercase tracking-widest">Gemini Intelligence</span></div><h1 className="mt-2 text-3xl font-black">AI Analizleri</h1><p className="mt-1 text-sm text-slate-500">{analyzed.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")} yorum analiz edildi · %{progress}</p><div className="mt-3 h-2 max-w-xl rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${progress}%` }}/></div></div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kinds.map(item => <div className="card p-5" key={item.kind}><div className="text-3xl font-black">{item._count.toLocaleString("tr-TR")}</div><p className="mt-1 text-sm text-slate-500">{labels[item.kind]}</p></div>)}</section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card p-6"><div className="flex items-center gap-2"><Tags className="text-violet-500"/><h2 className="font-bold">En çok konuşulan konular</h2></div>{topics.length ? <div className="mt-5 space-y-4">{topics.map((item, index) => <div key={item.topic}><div className="flex justify-between text-sm"><b>{item.topic}</b><span className="text-slate-400">{item._count.toLocaleString("tr-TR")} yorum</span></div><div className="mt-2 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(5, 100 - index * 9)}%` }}/></div></div>)}</div> : <p className="py-12 text-center text-sm text-slate-400">Analiz sonuçları hazırlanıyor.</p>}</section>
      <section className="card p-6"><div className="flex items-center gap-2"><MessageCircleQuestion className="text-cyan-500"/><h2 className="font-bold">Son AI değerlendirmeleri</h2></div>{recent.length ? <div className="mt-5 space-y-3">{recent.map(item => { const link = item.permalinkUrl || item.video.permalinkUrl; return <article className="rounded-xl border p-4" key={item.id}><div className="flex flex-wrap gap-2"><span className={`tag ${item.platform === "FACEBOOK" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>{item.platform === "FACEBOOK" ? "Facebook" : "YouTube"}</span><span className="tag bg-violet-50 text-violet-600">{labels[item.kind]}</span>{item.topic && <span className="tag bg-muted">{item.topic}</span>}</div><p className="mt-3 text-sm">{item.aiSummary}</p><div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs"><p><span className="text-slate-400">Kanal:</span> <b>{item.video.channel.versionChannel || item.video.channel.name}</b></p><p className="mt-1"><span className="text-slate-400">Video:</span> <b>{item.video.title}</b></p></div>{link && <a href={link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-600">Yoruma git <ExternalLink size={12}/></a>}</article>; })}</div> : <div className="py-12 text-center"><BrainCircuit className="mx-auto text-slate-300"/><p className="mt-3 text-sm text-slate-400">Gemini kuyruğu başladığında sonuçlar burada görünecek.</p></div>}</section>
    </div>
  </div>;
}

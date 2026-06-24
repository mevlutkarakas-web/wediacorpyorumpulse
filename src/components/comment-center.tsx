"use client";

import { Check, CheckCircle2, Clipboard, ExternalLink, Search, Sparkles, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { directCommentUrl } from "@/lib/comment-links";

type Platform = "YOUTUBE" | "FACEBOOK";
type Row = {
  id: string;
  platform: Platform;
  externalId: string | null;
  permalinkUrl: string | null;
  completed: boolean;
  authorName: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  kind: string;
  confidence: number | null;
  topic: string | null;
  aiSummary: string | null;
  suggestedReply: string | null;
  video: { permalinkUrl: string | null; title: string; channel: { name: string; category: string | null } };
};

const labels: Record<string, string> = { POSITIVE: "Pozitif", NEGATIVE: "Negatif", NEUTRAL: "Nötr", QUESTION: "Soru", COMPLAINT: "Şikayet", SUGGESTION: "Öneri", SPAM: "Spam" };
const tones: Record<string, string> = { POSITIVE: "bg-emerald-50 text-emerald-700", NEGATIVE: "bg-red-50 text-red-700", COMPLAINT: "bg-orange-50 text-orange-700", QUESTION: "bg-blue-50 text-blue-700", SUGGESTION: "bg-cyan-50 text-cyan-700", SPAM: "bg-slate-100 text-slate-500", NEUTRAL: "bg-violet-50 text-violet-700" };

export function CommentCenter({ comments }: { comments: Row[] }) {
  const [platform, setPlatform] = useState<Platform>("YOUTUBE");
  const [portfolio, setPortfolio] = useState<"ALL" | "TMC" | "OTHER">("ALL");
  const [kind, setKind] = useState("ALL");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Record<string, boolean>>(() => Object.fromEntries(comments.map(c => [c.id, c.completed])));
  const [updating, setUpdating] = useState<string | null>(null);
  const router = useRouter();
  const platformComments = comments.filter(comment => comment.platform === platform && (portfolio === "ALL" || (portfolio === "TMC") === Boolean(comment.video.channel.category?.toLocaleLowerCase("tr").includes("tmc"))));
  const shown = platformComments.filter(comment => (kind === "ALL" || comment.kind === kind) && comment.text.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("Cevap önerisi kopyalandı");
    setTimeout(() => setCopied(null), 1800);
  }

  async function toggleCompleted(id: string) {
    setUpdating(id);
    const response = await fetch(`/api/comments/${id}/complete`, { method: "PATCH" });
    const data = await response.json();
    setUpdating(null);
    if (!response.ok) return toast.error(data.error || "Durum güncellenemedi");
    setCompletion(current => ({ ...current, [id]: data.completed }));
    toast.success(data.completed ? "Yorum yapıldı olarak işaretlendi" : "Yorum yeniden açıldı");
    router.refresh();
  }

  return <div className="space-y-4">
    <div className="inline-flex rounded-xl border bg-card p-1">
      {(["YOUTUBE", "FACEBOOK"] as const).map(value => <button key={value} onClick={() => { setPlatform(value); setKind("ALL"); }} className={`rounded-lg px-5 py-2 text-sm font-bold ${platform === value ? value === "YOUTUBE" ? "bg-red-600 text-white" : "bg-blue-600 text-white" : "text-slate-500"}`}>
        {value === "YOUTUBE" ? "YouTube" : "Facebook"} <span className="ml-1 opacity-70">{comments.filter(comment => comment.platform === value).length}</span>
      </button>)}
    </div>
    <div className="inline-flex rounded-xl border bg-card p-1">{(["ALL", "TMC", "OTHER"] as const).map(value => <button key={value} onClick={() => { setPortfolio(value); setKind("ALL"); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${portfolio === value ? "bg-violet-600 text-white" : "text-slate-500"}`}>{value === "ALL" ? "Tümü" : value === "TMC" ? "TMC Dizileri" : "Diğer"}</button>)}</div>
    <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
      <aside className="card h-fit p-4">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-400">Sınıflandırma</h3>
        {[["ALL", "Tümü"], ...Object.entries(labels)].map(([key, label]) => <button key={key} onClick={() => setKind(key)} className={`flex w-full justify-between rounded-lg px-3 py-2.5 text-left text-sm ${kind === key ? "bg-violet-50 font-bold text-violet-600 dark:bg-violet-500/10" : "text-slate-500"}`}>
          <span>{label}</span><span>{key === "ALL" ? platformComments.length : platformComments.filter(comment => comment.kind === key).length}</span>
        </button>)}
      </aside>
      <section className="space-y-3">
        <div className="card relative p-3"><Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input value={query} onChange={event => setQuery(event.target.value)} className="h-10 w-full rounded-lg bg-muted pl-10 text-sm outline-none" placeholder="Yorumlarda ara..."/></div>
        {shown.map(comment => {
          const videoUrl = comment.video.permalinkUrl;
          const commentUrl = directCommentUrl({ platform: comment.platform, externalId: comment.externalId, permalinkUrl: comment.permalinkUrl, videoUrl });
          return <article className="card p-5" key={comment.id}><div className="flex gap-4">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-black ${comment.platform === "FACEBOOK" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>{comment.authorName.slice(0, 2).toLocaleUpperCase("tr")}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{comment.authorName}</b><span className={`tag ${tones[comment.kind] || tones.NEUTRAL}`}>{labels[comment.kind] || comment.kind}</span>{comment.topic && <span className="tag bg-muted text-slate-500">{comment.topic}</span>}<span className="text-[11px] text-slate-400">{new Date(comment.publishedAt).toLocaleString("tr-TR")}</span></div>
              <p className="mt-2 text-sm leading-6">{comment.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400"><b className="text-foreground">{comment.video.channel.name}</b><span>·</span><span className="max-w-md truncate">{comment.video.title}</span><span className="ml-auto flex items-center gap-1"><ThumbsUp size={13}/>{comment.likeCount}</span></div>
              {comment.suggestedReply ? <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-500/20 dark:bg-violet-500/5"><div className="flex items-center gap-2 text-xs font-bold text-violet-600"><Sparkles size={14}/>AI cevap önerisi{comment.confidence !== null && <span className="ml-auto text-[10px] text-slate-400">Güven %{Math.round(comment.confidence * 100)}</span>}</div><p className="mt-2 text-sm leading-6">{comment.suggestedReply}</p><button onClick={() => copy(comment.id, comment.suggestedReply!)} className="btn-outline mt-3 h-8 px-3 text-xs">{copied === comment.id ? <Check size={14}/> : <Clipboard size={14}/>} {copied === comment.id ? "Kopyalandı" : "Cevabı kopyala"}</button></div> : <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-xs text-slate-400"><Sparkles size={14}/>AI analizi bekleniyor</div>}
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">{videoUrl && <a href={videoUrl} target="_blank" rel="noreferrer" className="btn-outline h-9 px-3 text-xs">Videoya git <ExternalLink size={14}/></a>}{commentUrl && <a href={commentUrl} target="_blank" rel="noreferrer" className="btn-outline h-9 px-3 text-xs">Doğrudan yoruma git <ExternalLink size={14}/></a>}<button disabled={updating === comment.id} onClick={() => toggleCompleted(comment.id)} className={completion[comment.id] ? "btn-primary h-9 px-3 text-xs" : "btn-outline h-9 px-3 text-xs"}><CheckCircle2 size={14}/>{completion[comment.id] ? "Yapıldı" : "Yaptım"}</button></div>
            </div>
          </div></article>;
        })}
        {!shown.length && <div className="card p-14 text-center text-sm text-slate-400">Bu filtrede {platform === "YOUTUBE" ? "YouTube" : "Facebook"} yorumu bulunamadı.</div>}
      </section>
    </div>
  </div>;
}

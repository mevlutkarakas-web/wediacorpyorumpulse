"use client";

import { Check, CheckCircle2, Clipboard, ExternalLink, Search, Sparkles, ThumbsUp } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { directCommentUrl } from "@/lib/comment-links";
import { platformAvatarClass, type Platform } from "@/lib/platform";
import { SegmentedControl } from "@/components/segmented-control";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/lib/pagination";

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
const tones: Record<string, string> = {
  POSITIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  NEGATIVE: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  COMPLAINT: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  QUESTION: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  SUGGESTION: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
  SPAM: "bg-muted text-slate-500",
  NEUTRAL: "bg-muted text-slate-600",
};

export function CommentCenter({
  comments,
  platform,
  youtubeTotal,
  facebookTotal,
  kindCounts,
  page,
  totalPages,
  totalCount,
}: {
  comments: Row[];
  platform: Platform;
  youtubeTotal: number;
  facebookTotal: number;
  kindCounts: Record<string, number>;
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const [portfolio, setPortfolio] = useState<"ALL" | "TMC" | "OTHER">("ALL");
  const [kind, setKind] = useState("ALL");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Record<string, boolean>>(() => Object.fromEntries(comments.map(c => [c.id, c.completed])));
  const [updating, setUpdating] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [router]);
  useEffect(() => {
    setCompletion(Object.fromEntries(comments.map(comment => [comment.id, comment.completed])));
  }, [comments]);
  const platformComments = comments.filter(comment => portfolio === "ALL" || (portfolio === "TMC") === Boolean(comment.video.channel.category?.toLocaleLowerCase("tr").includes("tmc")));
  const shown = platformComments.filter(comment => (kind === "ALL" || comment.kind === kind) && comment.text.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));

  function selectPlatform(value: Platform) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "YOUTUBE") params.delete("platform"); else params.set("platform", value);
    params.delete("page");
    setKind("ALL");
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    });
  }

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

  return <div className={`space-y-4 ${isPending ? "opacity-60" : ""}`}>
    <SegmentedControl
      options={[
        { value: "YOUTUBE" as const, label: `YouTube ${youtubeTotal}`, activeClassName: "bg-red-600 text-white" },
        { value: "FACEBOOK" as const, label: `Facebook ${facebookTotal}`, activeClassName: "bg-blue-600 text-white" },
      ]}
      value={platform}
      onChange={selectPlatform}
    />
    <SegmentedControl
      options={[
        { value: "ALL" as const, label: "Tümü" },
        { value: "TMC" as const, label: "TMC Dizileri" },
        { value: "OTHER" as const, label: "Diğer" },
      ]}
      value={portfolio}
      onChange={value => { setPortfolio(value); setKind("ALL"); }}
    />
    <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
      <aside className="card h-fit p-4">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-400">Sınıflandırma</h3>
        {[["ALL", "Tümü"], ...Object.entries(labels)].map(([key, label]) => <button key={key} onClick={() => setKind(key)} className={`flex w-full justify-between rounded-lg px-3 py-2.5 text-left text-sm ${kind === key ? "bg-teal-50 font-bold text-teal-600 dark:bg-teal-500/10" : "text-slate-500"}`}>
          <span>{label}</span><span>{key === "ALL" ? totalCount : kindCounts[key] || 0}</span>
        </button>)}
      </aside>
      <section className="space-y-3">
        <div className="card relative p-3"><Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input aria-label="Yorumlarda ara" value={query} onChange={event => setQuery(event.target.value)} className="h-10 w-full rounded-lg bg-muted pl-10 text-sm outline-none" placeholder="Yorumlarda ara..."/></div>
        {shown.map(comment => {
          const videoUrl = comment.video.permalinkUrl;
          const commentUrl = directCommentUrl({ platform: comment.platform, externalId: comment.externalId, permalinkUrl: comment.permalinkUrl, videoUrl });
          return <article className="card p-5" key={comment.id}><div className="flex gap-4">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${platformAvatarClass(comment.platform)}`}>{comment.authorName.slice(0, 2).toLocaleUpperCase("tr")}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{comment.authorName}</b><span className={`tag ${tones[comment.kind] || tones.NEUTRAL}`}>{labels[comment.kind] || comment.kind}</span>{comment.topic && <span className="tag bg-muted text-slate-500">{comment.topic}</span>}<span className="text-[11px] text-slate-400">{new Date(comment.publishedAt).toLocaleString("tr-TR")}</span></div>
              <p className="mt-2 text-sm leading-6">{comment.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400"><b className="text-foreground">{comment.video.channel.name}</b><span>·</span><span className="max-w-md truncate">{comment.video.title}</span><span className="ml-auto flex items-center gap-1"><ThumbsUp size={13}/>{comment.likeCount}</span></div>
              {comment.suggestedReply ? <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4 dark:border-teal-500/20 dark:bg-teal-500/5"><div className="flex items-center gap-2 text-xs font-bold text-teal-600"><Sparkles size={14}/>AI cevap önerisi{comment.confidence !== null && <span className="ml-auto text-[10px] text-slate-400">Güven %{Math.round(comment.confidence * 100)}</span>}</div><p className="mt-2 text-sm leading-6">{comment.suggestedReply}</p><button onClick={() => copy(comment.id, comment.suggestedReply!)} className="btn-outline mt-3 h-8 px-3 text-xs">{copied === comment.id ? <Check size={14}/> : <Clipboard size={14}/>} {copied === comment.id ? "Kopyalandı" : "Cevabı kopyala"}</button></div> : comment.kind === "SPAM" ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700 dark:bg-amber-500/10"><Sparkles size={14}/>Spam olarak değerlendirildi — yanıt önerilmez</div> : <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-xs text-slate-400"><Sparkles size={14}/>AI analizi bekleniyor</div>}
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">{videoUrl && <a href={videoUrl} target="_blank" rel="noreferrer" className="btn-outline h-9 px-3 text-xs">Videoya git <ExternalLink size={14}/></a>}{commentUrl && <a href={commentUrl} target="_blank" rel="noreferrer" className="btn-outline h-9 px-3 text-xs">Doğrudan yoruma git <ExternalLink size={14}/></a>}<button disabled={updating === comment.id} onClick={() => toggleCompleted(comment.id)} className={completion[comment.id] ? "btn-primary h-9 px-3 text-xs" : "btn-outline h-9 px-3 text-xs"}><CheckCircle2 size={14}/>{completion[comment.id] ? "Yapıldı" : "Yaptım"}</button></div>
            </div>
          </div></article>;
        })}
        {!shown.length && <EmptyState card size="lg" title={`Bu filtrede ${platform === "YOUTUBE" ? "YouTube" : "Facebook"} yorumu bulunamadı.`}/>}
        <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE.COMMENTS}/>
      </section>
    </div>
  </div>;
}

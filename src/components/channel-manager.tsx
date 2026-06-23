"use client";

import { Check, ExternalLink, Search, Upload, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { compactNumber } from "@/lib/utils";

export type ChannelCard = { id: string; name: string; youtubeUrl: string | null; category: string | null; responsibleName: string | null; status: string; subscriberCount: number; totalViewCount: number; commentCount: number };

export function ChannelManager({ channels }: { channels: ChannelCard[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [modal, setModal] = useState(params.get("import") === "1");
  const [query, setQuery] = useState("");
  const [portfolio, setPortfolio] = useState<"ALL" | "TMC" | "OTHER">("ALL");
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const isTmc = (channel: ChannelCard) => Boolean(channel.category?.toLocaleLowerCase("tr").includes("tmc"));
  const visible = channels.filter(channel => (portfolio === "ALL" || (portfolio === "TMC") === isTmc(channel)) && channel.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));

  async function upload() {
    if (!file) return;
    setLoading(true);
    const body = new FormData(); body.append("file", file);
    try { const response = await fetch("/api/import/channels", { method: "POST", body }); const data = await response.json(); if (!response.ok) throw new Error(data.error); toast.success(`${data.total} kanal işlendi · ${data.queued} senkronizasyon işi`); setModal(false); setFile(null); router.refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Dosya işlenemedi"); }
    finally { setLoading(false); }
  }

  return <>
    <div className="flex flex-wrap items-center gap-3"><div className="inline-flex rounded-xl border bg-card p-1">{(["ALL", "TMC", "OTHER"] as const).map(value => <button key={value} onClick={() => setPortfolio(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${portfolio === value ? "bg-violet-600 text-white" : "text-slate-500"}`}>{value === "ALL" ? `Tümü (${channels.length})` : value === "TMC" ? `TMC Dizileri (${channels.filter(isTmc).length})` : `Diğer (${channels.filter(channel => !isTmc(channel)).length})`}</button>)}</div><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input value={query} onChange={event => setQuery(event.target.value)} className="h-11 w-full rounded-xl border bg-card pl-10 pr-4 text-sm outline-none" placeholder="Kanal ara..."/></div><button onClick={() => setModal(true)} className="btn-primary"><Upload size={17}/>Excel’den aktar</button></div>
    {visible.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{visible.map(channel => <article key={channel.id} className="card p-5"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 font-bold text-white">{channel.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span><div className="min-w-0 flex-1"><Link href={`/kanallar/${channel.id}`} className="font-bold hover:text-violet-600">{channel.name}</Link><p className="truncate text-xs text-slate-400">{channel.youtubeUrl || "YouTube bağlantısı yok"}</p></div><span className={`tag ${isTmc(channel) ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{isTmc(channel) ? "TMC Dizileri" : "Diğer"}</span></div><div className="my-5 grid grid-cols-3 divide-x rounded-xl bg-muted/60 py-3 text-center"><div><b className="block text-sm">{compactNumber(channel.subscriberCount)}</b><span className="text-[10px] text-slate-400">Abone</span></div><div><b className="block text-sm">{compactNumber(channel.totalViewCount)}</b><span className="text-[10px] text-slate-400">İzlenme</span></div><div><b className="block text-sm">{compactNumber(channel.commentCount)}</b><span className="text-[10px] text-slate-400">Yorum</span></div></div><div className="space-y-3 text-xs"><div className="flex justify-between"><span className="text-slate-400">Kategori</span><span>{channel.category || "Diğer"}</span></div><div className="flex justify-between"><span className="text-slate-400">Sorumlu</span><span className="flex items-center gap-1 font-semibold"><Users size={13}/>{channel.responsibleName || "Atanmadı"}</span></div></div><Link href={`/kanallar/${channel.id}`} className="mt-5 flex items-center justify-center gap-2 border-t pt-4 text-xs font-bold text-violet-600">Kanalı incele <ExternalLink size={13}/></Link></article>)}</div> : <div className="card p-14 text-center text-sm text-slate-400">Bu filtrede kanal bulunamadı.</div>}
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><div className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-black">Excel’den kanal aktar</h2><p className="text-sm text-slate-500">XLSX dosyanızı yükleyin.</p></div><button onClick={() => setModal(false)}><X/></button></div><div onDragOver={event => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={event => { event.preventDefault(); setDrag(false); setFile(event.dataTransfer.files[0]); }} onClick={() => input.current?.click()} className={`my-6 cursor-pointer rounded-2xl border-2 border-dashed p-9 text-center ${drag ? "border-violet-500 bg-violet-50" : ""}`}><input ref={input} hidden type="file" accept=".xlsx" onChange={event => setFile(event.target.files?.[0] ?? null)}/>{file ? <><Check className="mx-auto text-emerald-500"/><p className="mt-2 font-bold">{file.name}</p></> : <><Upload className="mx-auto text-violet-500"/><p className="mt-2 font-bold">Dosyayı buraya bırakın veya seçin</p></>}</div><div className="flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-outline">Vazgeç</button><button disabled={!file || loading} onClick={upload} className="btn-primary">{loading ? "İşleniyor..." : "Aktarımı başlat"}</button></div></div></div>}
  </>;
}

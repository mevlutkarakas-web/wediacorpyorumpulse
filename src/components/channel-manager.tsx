"use client";
import { Check,ExternalLink,Search,Upload,Users } from "lucide-react";
import Link from "next/link";
import { useRouter,useSearchParams } from "next/navigation";
import { useRef,useState } from "react";
import { toast } from "sonner";
import { compactNumber } from "@/lib/utils";
import { SegmentedControl } from "@/components/segmented-control";
import { AvatarBadge } from "@/components/avatar-badge";
import { Modal, ModalCloseButton } from "@/components/modal";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/lib/pagination";

export type ChannelCard={id:string;name:string;youtubeUrl:string|null;category:string|null;responsibleName:string|null;status:string;subscriberCount:number;totalViewCount:number;commentCount:number};

export function ChannelManager({channels,canImport,page,totalPages,totalCount}:{channels:ChannelCard[];canImport:boolean;page:number;totalPages:number;totalCount:number}){
  const params=useSearchParams();const router=useRouter();const [modal,setModal]=useState(canImport&&params.get("import")==="1");const [query,setQuery]=useState("");const [portfolio,setPortfolio]=useState<"ALL"|"TMC"|"OTHER">("ALL");const [file,setFile]=useState<File|null>(null);const [loading,setLoading]=useState(false);const input=useRef<HTMLInputElement>(null);
  const isTmc=(channel:ChannelCard)=>Boolean(channel.category?.toLocaleLowerCase("tr").includes("tmc"));const visible=channels.filter(channel=>(portfolio==="ALL"||(portfolio==="TMC")===isTmc(channel))&&channel.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));
  async function upload(){if(!file||!canImport)return;setLoading(true);const body=new FormData();body.append("file",file);try{const response=await fetch("/api/import/channels",{method:"POST",body});const data=await response.json();if(!response.ok)throw new Error(data.error);toast.success(`${data.total} kanal işlendi`);setModal(false);setFile(null);router.refresh()}catch(error){toast.error(error instanceof Error?error.message:"Dosya işlenemedi")}finally{setLoading(false)}}
  return <>
    <div className="flex flex-wrap gap-3">
      <SegmentedControl
        options={[
          { value: "ALL", label: `Tümü (${channels.length})` },
          { value: "TMC", label: `TMC Dizileri (${channels.filter(isTmc).length})` },
          { value: "OTHER", label: `Diğer (${channels.filter(channel=>!isTmc(channel)).length})` },
        ]}
        value={portfolio}
        onChange={setPortfolio}
      />
      <div className="relative min-w-[240px] flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
        <input aria-label="Kanal ara" value={query} onChange={event=>setQuery(event.target.value)} className="h-11 w-full rounded-xl border bg-card pl-10 pr-4 text-sm" placeholder="Kanal ara..."/>
      </div>
      {canImport&&<button className="btn-primary" onClick={()=>setModal(true)}><Upload size={17}/>Excel’den aktar</button>}
    </div>
    <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {visible.map(channel=>
        <article key={channel.id} className="card p-5">
          <div className="flex items-start gap-4">
            <AvatarBadge name={channel.name} variant="gradient" size="lg" />
            <div className="min-w-0 flex-1">
              <Link href={`/kanallar/${channel.id}`} className="font-bold hover:text-violet-600">{channel.name}</Link>
              <p className="truncate text-xs text-slate-400">{channel.youtubeUrl||"YouTube bağlantısı yok"}</p>
            </div>
            <span className={`tag ${isTmc(channel)?"bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300":"bg-muted text-slate-600"}`}>{isTmc(channel)?"TMC":"Diğer"}</span>
          </div>
          <div className="my-5 grid grid-cols-3 divide-x rounded-xl bg-muted/60 py-3 text-center">
            <div><b>{compactNumber(channel.subscriberCount)}</b><span className="block text-[10px] text-slate-400">Abone</span></div>
            <div><b>{compactNumber(channel.totalViewCount)}</b><span className="block text-[10px] text-slate-400">İzlenme</span></div>
            <div><b>{compactNumber(channel.commentCount)}</b><span className="block text-[10px] text-slate-400">Yorum</span></div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Sorumlu</span>
            <span className="flex items-center gap-1 font-semibold"><Users size={13}/>{channel.responsibleName||"Atanmadı"}</span>
          </div>
          <Link href={`/kanallar/${channel.id}`} className="mt-5 flex items-center justify-center gap-2 border-t pt-4 text-xs font-bold text-violet-600">Kanalı incele <ExternalLink size={13}/></Link>
        </article>,
      )}
    </div>
    {!visible.length&&<EmptyState card size="lg" className="mt-5" title="Bu filtrede kanal bulunamadı." />}
    <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE.CHANNELS} />
    {canImport && (
      <Modal open={modal} onClose={()=>setModal(false)}>
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-black">Excel’den kanal aktar</h2>
            <p className="text-sm text-slate-500">Kanal ve ekip atamaları birlikte işlenir.</p>
          </div>
          <ModalCloseButton onClick={()=>setModal(false)} label="Kapat" />
        </div>
        <button onClick={()=>input.current?.click()} className="my-6 w-full rounded-2xl border-2 border-dashed p-9">
          <input ref={input} hidden type="file" accept=".xlsx" onChange={event=>setFile(event.target.files?.[0]||null)}/>
          {file?<><Check className="mx-auto text-emerald-500"/><p className="mt-2 font-bold">{file.name}</p></>:<><Upload className="mx-auto text-violet-500"/><p className="mt-2 font-bold">Excel dosyasını seçin</p></>}
        </button>
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={()=>setModal(false)}>Vazgeç</button>
          <button className="btn-primary" disabled={!file||loading} onClick={upload}>{loading?"İşleniyor...":"Aktar"}</button>
        </div>
      </Modal>
    )}
  </>;
}

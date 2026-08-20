"use client";

import { Bell, CheckCheck, ExternalLink, MessageSquareText, Video, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/lib/pagination";
import { SegmentedControl } from "@/components/segmented-control";

type AlertRow={id:string;type:string;title:string;description:string;occurrenceCount:number;read:boolean;createdAt:string;channel:{name:string;versionChannel:string|null};video:{title:string;permalinkUrl:string|null;platform:"YOUTUBE"|"FACEBOOK"}|null;comment:{permalinkUrl:string|null;externalId:string|null;platform:"YOUTUBE"|"FACEBOOK"}|null};
type Filters={status:string;type:string};

export function AlertCenter({initialAlerts,page,totalPages,totalCount,filters,counts}:{initialAlerts:AlertRow[];page:number;totalPages:number;totalCount:number;filters:Filters;counts:{unread:number;all:number}}){
  // Liste doğrudan prop'tan türetilir: sayfalama soft navigasyon olduğu için bileşen
  // yeniden kurulmuyor, veriyi state'e kopyalasak eski sayfada takılı kalırdı.
  // justRead yalnızca sunucu tazelenene kadar süren iyimser bir katman.
  const [justRead,setJustRead]=useState<Set<string>>(new Set());
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [saving,setSaving]=useState(false);
  const router=useRouter();const pathname=usePathname();const params=useSearchParams();
  const alerts=initialAlerts.map(alert=>justRead.has(alert.id)?{...alert,read:true}:alert);

  function setParam(key:string,value:string){
    const next=new URLSearchParams(params.toString());
    if(value)next.set(key,value);else next.delete(key);
    next.delete("page"); // filtre değişince 1. sayfaya dön
    router.replace(`${pathname}${next.size?`?${next}`:""}`,{scroll:false});
  }

  function toggle(id:string){
    setSelected(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next});
  }

  // Yalnızca okunmamışlar seçilebilir; okunmuş bir kaydı tekrar işaretlemenin anlamı yok.
  const selectableIds=alerts.filter(alert=>!alert.read).map(alert=>alert.id);
  const allSelected=selectableIds.length>0&&selectableIds.every(id=>selected.has(id));
  // Başka sayfada seçilip ekranda olmayan kayıtlar sayıma ve işleme girmesin.
  const activeSelection=selectableIds.filter(id=>selected.has(id));

  async function markRead(ids:string[]){
    if(!ids.length)return;
    setSaving(true);
    const response=await fetch("/api/alerts",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({ids})});
    const data=await response.json().catch(()=>({}));
    if(response.ok){
      setJustRead(current=>new Set([...current,...ids]));
      setSelected(new Set());
      toast.success(`${ids.length} bildirim okundu işaretlendi`);
      router.refresh();
    } else toast.error(data.error||"Bildirimler işaretlenemedi.");
    setSaving(false);
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl
        options={[{value:"okunmamis",label:`Okunmamış (${counts.unread.toLocaleString("tr-TR")})`},{value:"tumu",label:`Tümü (${counts.all.toLocaleString("tr-TR")})`}]}
        value={filters.status}
        onChange={value=>{setSelected(new Set());setParam("durum",value==="okunmamis"?"":value)}}
      />
      <SegmentedControl
        options={[{value:"tumu",label:"Hepsi"},{value:"yorum",label:"Yorumlar"},{value:"video",label:"Videolar"}]}
        value={filters.type}
        onChange={value=>{setSelected(new Set());setParam("tur",value==="tumu"?"":value)}}
      />
      {selectableIds.length>0&&
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-500">
          <input
            type="checkbox"
            className="size-4"
            checked={allSelected}
            onChange={()=>setSelected(allSelected?new Set():new Set(selectableIds))}
          />
          Bu sayfadakileri seç ({selectableIds.length})
        </label>}
    </div>

    {activeSelection.length>0&&
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
        <span className="text-sm font-bold">{activeSelection.length} bildirim seçildi</span>
        <button onClick={()=>setSelected(new Set())} className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          <X size={13}/>Seçimi temizle
        </button>
        <button disabled={saving} className="btn-primary ml-auto h-9 px-4 text-xs" onClick={()=>markRead(activeSelection)}>
          <CheckCheck size={15}/>{saving?"İşaretleniyor...":"Seçilenleri okundu işaretle"}
        </button>
      </div>}

    {alerts.length?<div className="space-y-3">{alerts.map(alert=>{
      const link=alert.comment?.permalinkUrl||alert.video?.permalinkUrl;
      const checked=selected.has(alert.id);
      return <article key={alert.id} className={`card p-5 ${alert.read?"opacity-60":checked?"border-teal-500":"border-teal-200"}`}>
        <div className="flex gap-4">
          {!alert.read&&
            <input
              type="checkbox"
              aria-label={`${alert.title} bildirimini seç`}
              className="mt-1 size-4 shrink-0"
              checked={checked}
              onChange={()=>toggle(alert.id)}
            />}
          {alert.type==="NEW_VIDEO"?<Video className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-400" size={20}/>:<MessageSquareText className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" size={20}/>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{alert.title}</h2>
              {!alert.read&&<span className="size-2 rounded-full bg-teal-600"/>}
              <span className="text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString("tr-TR")}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{alert.description}</p>
            <p className="mt-2 text-xs"><b>{alert.channel.versionChannel||alert.channel.name}</b>{alert.video&&<> · {alert.video.title} · {alert.video.platform==="FACEBOOK"?"Facebook":"YouTube"}</>}</p>
            <div className="mt-3 flex gap-2">
              {link&&<a href={link} target="_blank" rel="noreferrer" className="btn-outline h-8 px-3 text-xs">{alert.comment?"Yoruma git":"İçeriğe git"} <ExternalLink size={12}/></a>}
              {!alert.read&&<button disabled={saving} onClick={()=>markRead([alert.id])} className="h-8 text-xs font-bold text-teal-600">Okundu</button>}
            </div>
          </div>
        </div>
      </article>;
    })}</div>:<EmptyState card size="lg" icon={Bell} title={filters.status==="okunmamis"?"Okunmamış bildirim yok":"Bildirim yok"} description="Yeni video ve yorumlar burada görünecek."/>}

    <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE.ALERTS}/>
  </div>;
}

"use client";

import { Bell, CheckCheck, ExternalLink, MessageSquareText, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/lib/pagination";

type AlertRow={id:string;type:string;title:string;description:string;occurrenceCount:number;read:boolean;createdAt:string;channel:{name:string;versionChannel:string|null};video:{title:string;permalinkUrl:string|null;platform:"YOUTUBE"|"FACEBOOK"}|null;comment:{permalinkUrl:string|null;externalId:string|null;platform:"YOUTUBE"|"FACEBOOK"}|null};

export function AlertCenter({initialAlerts,page,totalPages,totalCount}:{initialAlerts:AlertRow[];page:number;totalPages:number;totalCount:number}){
  const [alerts,setAlerts]=useState(initialAlerts);const router=useRouter();
  async function mark(ids:string[],all=false){const response=await fetch("/api/alerts",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(all?{all:true}:{ids})});if(response.ok){setAlerts(rows=>rows.map(row=>all||ids.includes(row.id)?{...row,read:true}:row));toast.success("Bildirimler okundu");router.refresh();}}
  return <div className="space-y-4"><div className="flex justify-end"><button className="btn-outline" onClick={()=>mark([],true)}><CheckCheck size={16}/>Tümünü okundu işaretle</button></div>{alerts.length?<div className="space-y-3">{alerts.map(alert=>{const link=alert.comment?.permalinkUrl||alert.video?.permalinkUrl;return <article key={alert.id} className={`card p-5 ${alert.read?"opacity-60":"border-violet-200"}`}><div className="flex gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${alert.type==="NEW_VIDEO"?"bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400":"bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"}`}>{alert.type==="NEW_VIDEO"?<Video size={20}/>:<MessageSquareText size={20}/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{alert.title}</h2>{!alert.read&&<span className="size-2 rounded-full bg-violet-600"/>}<span className="text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString("tr-TR")}</span></div><p className="mt-1 text-sm text-slate-500">{alert.description}</p><p className="mt-2 text-xs"><b>{alert.channel.versionChannel||alert.channel.name}</b>{alert.video&&<> · {alert.video.title} · {alert.video.platform==="FACEBOOK"?"Facebook":"YouTube"}</>}</p><div className="mt-3 flex gap-2">{link&&<a href={link} target="_blank" rel="noreferrer" className="btn-outline h-8 px-3 text-xs">{alert.comment?"Yoruma git":"İçeriğe git"} <ExternalLink size={12}/></a>}{!alert.read&&<button onClick={()=>mark([alert.id])} className="h-8 text-xs font-bold text-violet-600">Okundu</button>}</div></div></div></article>})}</div>:<EmptyState card size="lg" icon={Bell} title="Yeni bildirim yok" description="Yeni video ve yorumlar burada görünecek."/>}<PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE.ALERTS}/></div>;
}

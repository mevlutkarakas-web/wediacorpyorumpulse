"use client";

import { Bell, CheckCheck, ExternalLink, MessageSquareText, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type AlertRow={id:string;type:string;title:string;description:string;occurrenceCount:number;read:boolean;createdAt:string;channel:{name:string;versionChannel:string|null};video:{title:string;permalinkUrl:string|null;platform:"YOUTUBE"|"FACEBOOK"}|null};

export function AlertCenter({initialAlerts}:{initialAlerts:AlertRow[]}){
  const [alerts,setAlerts]=useState(initialAlerts);const router=useRouter();
  async function mark(ids:string[],all=false){const response=await fetch("/api/alerts",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(all?{all:true}:{ids})});if(response.ok){setAlerts(rows=>rows.map(row=>all||ids.includes(row.id)?{...row,read:true}:row));toast.success("Bildirimler okundu");router.refresh();}}
  return <div className="space-y-4"><div className="flex justify-end"><button className="btn-outline" onClick={()=>mark([],true)}><CheckCheck size={16}/>Tümünü okundu işaretle</button></div>{alerts.length?<div className="space-y-3">{alerts.map(alert=><article key={alert.id} className={`card p-5 ${alert.read?"opacity-60":"border-violet-200"}`}><div className="flex gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${alert.type==="NEW_VIDEO"?"bg-cyan-50 text-cyan-600":"bg-violet-50 text-violet-600"}`}>{alert.type==="NEW_VIDEO"?<Video size={20}/>:<MessageSquareText size={20}/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{alert.title}</h2>{!alert.read&&<span className="size-2 rounded-full bg-violet-600"/>}<span className="text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString("tr-TR")}</span></div><p className="mt-1 text-sm text-slate-500">{alert.description}</p><p className="mt-2 text-xs"><b>{alert.channel.versionChannel||alert.channel.name}</b>{alert.video&&<> · {alert.video.title} · {alert.video.platform==="FACEBOOK"?"Facebook":"YouTube"}</>}</p><div className="mt-3 flex gap-2">{alert.video?.permalinkUrl&&<a href={alert.video.permalinkUrl} target="_blank" rel="noreferrer" className="btn-outline h-8 px-3 text-xs">İçeriğe git <ExternalLink size={12}/></a>}{!alert.read&&<button onClick={()=>mark([alert.id])} className="h-8 text-xs font-bold text-violet-600">Okundu</button>}</div></div></div></article>)}</div>:<div className="card p-14 text-center"><Bell className="mx-auto text-slate-300" size={36}/><h2 className="mt-3 font-bold">Yeni bildirim yok</h2><p className="text-sm text-slate-500">Yeni video ve yorumlar burada görünecek.</p></div>}</div>;
}

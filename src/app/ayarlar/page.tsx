import { Bot,CheckCircle2,KeyRound,Mail,MonitorPlay,Youtube } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAiSettingsSummary } from "@/lib/ai-settings";
import { AiSettingsForm } from "@/components/ai-settings-form";

export default async function SettingsPage(){
  const session=await getSession();if(session?.role!=="ADMIN")redirect("/");const aiSettings=await getAiSettingsSummary();
  const integrations=[{Icon:Youtube,title:"YouTube Data API v3",key:"YOUTUBE_API_KEY",ready:!!process.env.YOUTUBE_API_KEY},{Icon:Bot,title:"Gemini API",key:"GEMINI_API_KEY",ready:!!process.env.GEMINI_API_KEY},{Icon:MonitorPlay,title:"Facebook tarayıcı oturumu",key:"FACEBOOK_SESSION_COOKIES",ready:!!process.env.FACEBOOK_SESSION_COOKIES},{Icon:Mail,title:"Hafta içi e-posta hatırlatıcısı",key:"SMTP_HOST / SMTP_USER / SMTP_PASS",ready:!!process.env.SMTP_HOST&&!!process.env.SMTP_USER&&!!process.env.SMTP_PASS}];
  return <div className="mx-auto max-w-4xl space-y-6"><div><h1 className="text-3xl font-black">Ayarlar</h1><p className="mt-1 text-sm text-slate-500">Entegrasyonların ortam durumunu yalnızca admin görebilir.</p></div><AiSettingsForm initial={aiSettings}/>{integrations.map(({Icon,title,key,ready})=><section className="card p-6" key={key}><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-600"><Icon/></span><div><h2 className="font-bold">{title}</h2><p className="text-xs text-slate-500">{key}</p></div><span className={`tag ml-auto ${ready?"bg-emerald-50 text-emerald-600":"bg-amber-50 text-amber-600"}`}>{ready?<><CheckCircle2 size={12} className="mr-1"/>Yapılandırıldı</>:<><KeyRound size={12} className="mr-1"/>Değer gerekli</>}</span></div></section>)}</div>;
}

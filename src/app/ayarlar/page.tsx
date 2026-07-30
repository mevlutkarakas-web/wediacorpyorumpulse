import { Bot,CheckCircle2,KeyRound,Mail,MonitorPlay,Youtube } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAiSettingsSummary } from "@/lib/ai-settings";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { WorkerStatusPanel } from "@/components/worker-status";
import { prisma } from "@/lib/prisma";
import { youtubeQuotaUsage } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOCK_TTL_MS = Math.max(60_000, Number(process.env.WORKER_LOCK_TTL_MS || 180_000));
const INTERVAL_MINUTES = Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES || 15));
const STALE_INTERVALS = Math.max(2, Number(process.env.HEALTH_STALE_INTERVALS || 4));

async function workerStatus() {
  const now = Date.now();
  const lockCutoff = new Date(now - LOCK_TTL_MS);
  const [pendingTotal, runningCount, orphanCount, oldestPending, lastCompleted, freshest, failedLast24h, channelCount, quota] =
    await Promise.all([
      prisma.syncJob.count({ where: { status: "PENDING" } }),
      prisma.syncJob.count({ where: { status: "RUNNING" } }),
      prisma.syncJob.count({ where: { status: "RUNNING", OR: [{ lockedAt: null }, { lockedAt: { lt: lockCutoff } }] } }),
      prisma.syncJob.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      prisma.syncJob.findFirst({ where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
      prisma.channel.findFirst({ where: { lastSyncedAt: { not: null } }, orderBy: { lastSyncedAt: "desc" }, select: { lastSyncedAt: true } }),
      prisma.syncJob.count({ where: { status: "FAILED", updatedAt: { gte: new Date(now - 86_400_000) } } }),
      prisma.channel.count(),
      youtubeQuotaUsage().catch(() => ({ used: 0, limit: 0 })),
    ]);
  const age = (value: Date | null | undefined) => (value ? Math.round((now - value.getTime()) / 1000) : null);
  const channelSyncAgeSeconds = age(freshest?.lastSyncedAt);
  const lastActivityAgeSeconds = age(lastCompleted?.completedAt);
  const oldestPendingAgeSeconds = age(oldestPending?.createdAt);
  const staleMs = STALE_INTERVALS * INTERVAL_MINUTES * 60_000;
  const problems: string[] = [];
  if (channelSyncAgeSeconds === null || channelSyncAgeSeconds * 1000 > staleMs) problems.push("channel_sync_stale");
  if (lastActivityAgeSeconds !== null && lastActivityAgeSeconds * 1000 > staleMs) problems.push("no_recent_job_completion");
  if (orphanCount > 0) problems.push("orphaned_locks");
  if (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds > 6 * 3600) problems.push("queue_stalled");
  return { problems, pendingTotal, runningCount, orphanCount, failedLast24h, channelSyncAgeSeconds, lastActivityAgeSeconds, oldestPendingAgeSeconds, intervalMinutes: INTERVAL_MINUTES, quotaUsed: quota.used, quotaLimit: quota.limit, channelCount };
}

export default async function SettingsPage(){
  const session=await getSession();if(session?.role!=="ADMIN")redirect("/");
  const [aiSettings,status]=await Promise.all([getAiSettingsSummary(),workerStatus()]);
  // NOT: bu kartlar web sürecinin ortam değişkenlerini okur. FACEBOOK_SESSION_COOKIES
  // ve SMTP yalnızca worker tarafından kullanılıyor, o yüzden burada yeşil görünmeleri
  // worker'da tanımlı olduklarını KANITLAMAZ. Worker'ın gerçek durumu üstteki panelde.
  const integrations=[{Icon:Youtube,title:"YouTube Data API v3",key:"YOUTUBE_API_KEY",ready:!!process.env.YOUTUBE_API_KEY},{Icon:Bot,title:"Gemini API",key:"GEMINI_API_KEY",ready:!!process.env.GEMINI_API_KEY},{Icon:MonitorPlay,title:"Facebook tarayıcı oturumu",key:"FACEBOOK_SESSION_COOKIES",ready:!!process.env.FACEBOOK_SESSION_COOKIES},{Icon:Mail,title:"Hafta içi e-posta hatırlatıcısı",key:"SMTP_HOST / SMTP_USER / SMTP_PASS",ready:!!process.env.SMTP_HOST&&!!process.env.SMTP_USER&&!!process.env.SMTP_PASS}];
  return <div className="mx-auto max-w-4xl space-y-6"><div><h1 className="text-3xl font-black">Ayarlar</h1><p className="mt-1 text-sm text-slate-500">Senkronizasyon servisinin durumu ve entegrasyonlar. Yalnızca admin görebilir.</p></div><WorkerStatusPanel status={status}/><AiSettingsForm initial={aiSettings}/><div><h2 className="mb-1 font-bold">Ortam değişkenleri (web süreci)</h2><p className="mb-3 text-xs text-slate-500">Facebook oturumu ve SMTP yalnızca worker tarafından kullanılır; burada yeşil olmaları worker&apos;da tanımlı olduklarını göstermez.</p></div>{integrations.map(({Icon,title,key,ready})=><section className="card p-6" key={key}><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-600"><Icon/></span><div><h2 className="font-bold">{title}</h2><p className="text-xs text-slate-500">{key}</p></div><span className={`tag ml-auto ${ready?"bg-emerald-50 text-emerald-600":"bg-amber-50 text-amber-600"}`}>{ready?<><CheckCircle2 size={12} className="mr-1"/>Yapılandırıldı</>:<><KeyRound size={12} className="mr-1"/>Değer gerekli</>}</span></div></section>)}</div>;
}

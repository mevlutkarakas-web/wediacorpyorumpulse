"use client";

import { Activity, AlertTriangle, CheckCircle2, PlayCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type WorkerStatus = {
  problems: string[];
  pendingTotal: number;
  runningCount: number;
  orphanCount: number;
  failedLast24h: number;
  channelSyncAgeSeconds: number | null;
  lastActivityAgeSeconds: number | null;
  oldestPendingAgeSeconds: number | null;
  intervalMinutes: number;
  quotaUsed: number;
  quotaLimit: number;
  channelCount: number;
};

const PROBLEM_LABELS: Record<string, string> = {
  channel_sync_stale: "Kanal senkronu bayat — worker durmuş olabilir",
  no_recent_job_completion: "Uzun süredir hiçbir iş tamamlanmadı",
  orphaned_locks: "Yetim kilitli işler var",
  queue_stalled: "Kuyruk tıkanmış görünüyor",
};

function humanAge(seconds: number | null) {
  if (seconds === null) return "hiç";
  if (seconds < 60) return `${seconds} sn önce`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk önce`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} sa önce`;
  return `${Math.round(seconds / 86400)} gün önce`;
}

export function WorkerStatusPanel({ status }: { status: WorkerStatus }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const healthy = status.problems.length === 0;

  async function triggerSync() {
    setLoading(true);
    try {
      // Bu düğmeye kadar /api/jobs/sync'i çağıran hiçbir arayüz yoktu, yani
      // worker durduğunda elle kurtarma imkânı da yoktu.
      const response = await fetch("/api/jobs/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: "ALL", all: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Senkronizasyon kuyruğa alınamadı");
      toast.success(`${data.queued ?? 0} senkronizasyon işi kuyruğa alındı`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Senkronizasyon başlatılamadı");
    } finally {
      setLoading(false);
    }
  }

  const quotaPercent = status.quotaLimit
    ? Math.min(100, Math.round((status.quotaUsed / status.quotaLimit) * 100))
    : 0;

  return (
    <section className={`card p-6 ${healthy ? "" : "border-red-300 dark:border-red-500/40"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`grid size-11 place-items-center rounded-xl ${
            healthy
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
          }`}
        >
          {healthy ? <CheckCircle2 /> : <AlertTriangle />}
        </span>
        <div>
          <h2 className="font-bold">Senkronizasyon servisi</h2>
          <p className="text-xs text-slate-500">
            Son kanal senkronu: <b>{humanAge(status.channelSyncAgeSeconds)}</b> · son iş:{" "}
            <b>{humanAge(status.lastActivityAgeSeconds)}</b>
          </p>
        </div>
        <span
          className={`tag ml-auto ${
            healthy
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
          }`}
        >
          <Activity size={12} className="mr-1" />
          {healthy ? "Çalışıyor" : "Sorun var"}
        </span>
      </div>

      {!healthy && (
        <ul className="mt-4 space-y-1 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {status.problems.map((problem) => (
            <li key={problem}>• {PROBLEM_LABELS[problem] || problem}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Bekleyen iş", status.pendingTotal.toLocaleString("tr-TR")],
          ["Çalışan iş", `${status.runningCount}${status.orphanCount ? ` (${status.orphanCount} yetim)` : ""}`],
          ["24 saatte başarısız", status.failedLast24h.toLocaleString("tr-TR")],
          ["Kanal sayısı", status.channelCount.toLocaleString("tr-TR")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-muted/60 p-3">
            <p className="text-[11px] uppercase text-slate-400">{label}</p>
            <p className="mt-1 font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">YouTube günlük kota</span>
          <span className="font-bold">
            {status.quotaUsed.toLocaleString("tr-TR")} / {status.quotaLimit.toLocaleString("tr-TR")}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full ${quotaPercent > 85 ? "bg-red-500" : "bg-violet-500"}`}
            style={{ width: `${quotaPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
        <button onClick={triggerSync} disabled={loading} className="btn-primary h-9 px-3 text-xs">
          <PlayCircle size={14} />
          {loading ? "Kuyruğa alınıyor..." : "Senkronizasyonu şimdi başlat"}
        </button>
        <button onClick={() => router.refresh()} className="btn-outline h-9 px-3 text-xs">
          <RefreshCw size={14} />
          Yenile
        </button>
        <a href="/api/jobs/health" target="_blank" rel="noreferrer" className="btn-outline h-9 px-3 text-xs">
          Sağlık JSON
        </a>
      </div>
    </section>
  );
}

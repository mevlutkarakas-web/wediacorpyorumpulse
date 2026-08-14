"use client";
import { CheckCircle2,Circle,Clock3,ExternalLink,PlayCircle } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState } from "@/components/empty-state";
import { platformLabel, platformTagClass } from "@/lib/platform";

type TaskRow={id:string;title:string;description:string|null;status:string;priority:string;dueAt:string|null;createdAt:string;updatedAt:string;assignee:{name:string}|null;channel:{name:string;versionChannel:string|null}|null;comment:{platform:"YOUTUBE"|"FACEBOOK";permalinkUrl:string|null;video:{title:string;permalinkUrl:string|null}}|null};
type ColumnData={status:string;label:string;param:string;page:number;totalPages:number;totalCount:number;tasks:TaskRow[]};
const ICONS: Record<string, typeof Circle> = { TODO: Circle, IN_PROGRESS: Clock3, DONE: CheckCircle2 };

export function TaskBoard({ columns }: { columns: ColumnData[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  async function update(id: string, status: "IN_PROGRESS" | "DONE") {
    setLoading(id);
    const response = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json();
    if (response.ok) {
      toast.success(status === "DONE" ? "Görev tamamlandı" : "Görev üzerinde çalışılıyor");
      router.refresh();
    } else toast.error(data.error);
    setLoading(null);
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div>
        <h1 className="text-3xl font-black">Görevler</h1>
        <p className="mt-1 text-sm text-slate-500">Size atanmış YouTube ve Facebook iletişim görevleri.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {columns.map((column) => {
          const Icon = ICONS[column.status] || Circle;
          return (
            <section key={column.status}>
              <div className="mb-3 flex items-center gap-2">
                <Icon size={17} />
                <h2 className="font-bold">{column.label}</h2>
                <span className="tag bg-muted">{column.totalCount}</span>
              </div>
              <div className="space-y-3">
                {column.tasks.map((task) => {
                  const link = task.comment?.permalinkUrl || task.comment?.video.permalinkUrl;
                  return (
                    <article className="card p-4" key={task.id}>
                      <div className="flex flex-wrap gap-2">
                        {task.comment && (
                          <span className={`tag ${platformTagClass(task.comment.platform)}`}>{platformLabel(task.comment.platform)}</span>
                        )}
                        <span
                          className={`tag ${
                            task.priority === "HIGH" || task.priority === "CRITICAL"
                              ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                              : "bg-muted"
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                      <h3 className="mt-3 font-bold">{task.title}</h3>
                      {task.comment?.video.title && <p className="mt-1 text-xs font-semibold text-slate-500">Video: {task.comment.video.title}</p>}
                      {task.description && <p className="mt-2 line-clamp-6 whitespace-pre-line text-sm text-slate-500">{task.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {link && (
                          <a href={link} target="_blank" rel="noreferrer" className="btn-outline h-8 px-3 text-xs">
                            Yoruma git <ExternalLink size={12} />
                          </a>
                        )}
                        {task.status === "TODO" && (
                          <button disabled={loading === task.id} onClick={() => update(task.id, "IN_PROGRESS")} className="btn-outline h-8 px-3 text-xs">
                            <PlayCircle size={13} />
                            Yaptım / Başladım
                          </button>
                        )}
                        {task.status !== "DONE" && (
                          <button disabled={loading === task.id} onClick={() => update(task.id, "DONE")} className="btn-primary h-8 px-3 text-xs">
                            <CheckCircle2 size={13} />
                            Tamamlandı
                          </button>
                        )}
                      </div>
                      <div className="mt-4 flex justify-between border-t pt-3 text-xs text-slate-400">
                        <span>{task.assignee?.name || "Atanmadı"}</span>
                        <span>{task.channel?.versionChannel || task.channel?.name || task.priority}</span>
                      </div>
                    </article>
                  );
                })}
                {!column.tasks.length && <EmptyState size="sm" className="rounded-xl border border-dashed" title="Görev yok" />}
              </div>
              <PaginationControls page={column.page} totalPages={column.totalPages} paramName={column.param} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

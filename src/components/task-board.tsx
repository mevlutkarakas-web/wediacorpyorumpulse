"use client";
import { CheckCircle2,Circle,Clock3,ExternalLink,PlayCircle,Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState } from "@/components/empty-state";
import { Modal, ModalCloseButton } from "@/components/modal";
import { platformLabel, platformTagClass } from "@/lib/platform";

type TaskRow={id:string;assigneeId:string|null;title:string;description:string|null;status:string;priority:string;dueAt:string|null;createdAt:string;updatedAt:string;assignee:{name:string}|null;channel:{name:string;versionChannel:string|null}|null;comment:{platform:"YOUTUBE"|"FACEBOOK";permalinkUrl:string|null;video:{title:string;permalinkUrl:string|null}}|null};
type ColumnData={status:string;label:string;param:string;page:number;totalPages:number;totalCount:number;tasks:TaskRow[]};
type ChannelOption={id:string;name:string;versionChannel:string|null};
type TeamMember={id:string;name:string};
const PRIORITIES=[["MEDIUM","Normal"],["LOW","Düşük"],["HIGH","Yüksek"],["CRITICAL","Kritik"]] as const;
const FIELD="h-11 w-full rounded-xl border bg-card px-4 text-sm";
const ICONS: Record<string, typeof Circle> = { TODO: Circle, IN_PROGRESS: Clock3, DONE: CheckCircle2 };

export function TaskBoard({ columns, canManage, channels, teamMembers }: { columns: ColumnData[]; canManage: boolean; channels: ChannelOption[]; teamMembers: TeamMember[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  async function reassign(id: string, assigneeId: string) {
    setLoading(id);
    const response = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigneeId: assigneeId || null }) });
    const data = await response.json();
    if (response.ok) { toast.success(data.assignee?.name ? `${data.assignee.name} kişisine atandı` : "Görev atamadan çıkarıldı"); router.refresh(); }
    else toast.error(data.error);
    setLoading(null);
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || undefined,
        channelId: form.channelId,
        assigneeId: form.assigneeId || null,
        priority: form.priority,
        // <input type="date"> yerel gün döndürür; Prisma DateTime beklediği için ISO'ya çevrilir.
        dueAt: form.dueAt ? new Date(`${form.dueAt}T23:59:59`).toISOString() : null,
      }),
    });
    const data = await response.json();
    if (response.ok) { toast.success("Görev oluşturuldu"); setCreateOpen(false); router.refresh(); }
    else toast.error(data.error);
    setCreating(false);
  }

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Görevler</h1>
          <p className="mt-1 text-sm text-slate-500">{canManage ? "Ekibinizin YouTube ve Facebook iletişim görevleri." : "Size atanmış YouTube ve Facebook iletişim görevleri."}</p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={17}/>Görev ekle</button>}
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
                        {canManage ? (
                          <select
                            aria-label="Görev sorumlusu"
                            value={task.assigneeId || ""}
                            disabled={loading === task.id}
                            onChange={event => reassign(task.id, event.target.value)}
                            className="-my-1 rounded-lg border bg-card px-2 py-1 text-xs"
                          >
                            <option value="">Atanmadı</option>
                            {teamMembers.map(member => (
                              <option key={member.id} value={member.id}>{member.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span>{task.assignee?.name || "Atanmadı"}</span>
                        )}
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} className="w-full max-w-lg">
        <form onSubmit={createTask} className="space-y-4">
          <div className="flex justify-between">
            <div>
              <h2 className="text-xl font-black">Görev ekle</h2>
              <p className="text-sm text-slate-500">Ekibinizin sorumlu olduğu kanallar için görev açın.</p>
            </div>
            <ModalCloseButton onClick={() => setCreateOpen(false)}/>
          </div>
          <input name="title" required minLength={3} placeholder="Görev başlığı" aria-label="Görev başlığı" className={FIELD}/>
          <textarea name="description" rows={3} placeholder="Açıklama (isteğe bağlı)" aria-label="Açıklama" className="w-full rounded-xl border bg-card p-4 text-sm"/>
          <select name="channelId" required aria-label="Kanal" className={FIELD}>
            <option value="">Kanal seçin</option>
            {channels.map(channel => (
              <option key={channel.id} value={channel.id}>{channel.versionChannel || channel.name}</option>
            ))}
          </select>
          <select name="assigneeId" aria-label="Sorumlu" className={FIELD}>
            <option value="">Atanmadı</option>
            {teamMembers.map(member => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="priority" defaultValue="MEDIUM" aria-label="Öncelik" className={FIELD}>
              {PRIORITIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input name="dueAt" type="date" aria-label="Termin tarihi" className={FIELD}/>
          </div>
          <button disabled={creating} className="btn-primary w-full">{creating ? "Oluşturuluyor..." : "Görevi oluştur"}</button>
        </form>
      </Modal>
    </div>
  );
}

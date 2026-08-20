"use client";

import { AlertTriangle, Check, ChevronRight, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal, ModalCloseButton } from "@/components/modal";
import { AvatarBadge } from "@/components/avatar-badge";
import { EmptyState } from "@/components/empty-state";

type Channel = { id: string; name: string; versionChannel: string | null; category: string | null; responsibleId: string | null; responsibleName: string | null };
type Member = { id: string; name: string; email: string; role: string; active: boolean; isSelf: boolean; channelCount: number; openTasks: number; completedComments: number };

export function TeamLeadBoard({ channels, team, performanceDays }: { channels: Channel[]; team: Member[]; performanceDays: number }) {
  const [editing, setEditing] = useState<Member | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const unassigned = channels.filter(channel => !channel.responsibleId);
  // Ekip = kanallarımdan en az birini taşıyanlar (ve lider kendisi); geri kalanı atama havuzu.
  const active = team.filter(member => member.channelCount > 0 || member.isSelf);
  const available = team.filter(member => member.channelCount === 0 && !member.isSelf);
  const visibleChannels = useMemo(
    () => channels.filter(channel => `${channel.name} ${channel.versionChannel || ""} ${channel.category || ""}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"))),
    [channels, query],
  );

  function edit(member: Member) {
    setEditing(member);
    setSelected(new Set(channels.filter(channel => channel.responsibleId === member.id).map(channel => channel.id)));
    setQuery("");
  }

  async function save() {
    if (!editing) return;
    setLoading(true);
    const response = await fetch(`/api/users/${editing.id}/channels`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelIds: [...selected] }) });
    const data = await response.json();
    if (response.ok) { toast.success(`${editing.name} · ${data.assigned} kanal`); setEditing(null); router.refresh(); }
    else toast.error(data.error);
    setLoading(false);
  }

  return <>
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile label="Liderlik ettiğim kanal" value={channels.length}/>
      <Tile label="Ekip büyüklüğü" value={active.filter(member => !member.isSelf).length}/>
      <Tile label="Sorumlusuz kanal" value={unassigned.length} warn={unassigned.length > 0}/>
    </div>

    {unassigned.length > 0 && (
      <section className="card p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-amber-600" size={19}/>
          <h2 className="font-bold">Sorumlusuz kanallarım</h2>
          <span className="tag ml-auto bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{unassigned.length}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Bu kanalların günlük operasyonundan kimse sorumlu değil. Ekip üyesine tıklayıp atayabilirsiniz.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {unassigned.map(channel => <span key={channel.id} className="tag bg-muted">{channel.versionChannel || channel.name}</span>)}
        </div>
      </section>
    )}

    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b p-5">
        <UsersRound className="text-teal-600" size={20}/>
        <h2 className="font-bold">Kanal yöneticilerim</h2>
        <span className="tag ml-auto bg-muted">{active.length}</span>
      </div>
      {active.length ? <div>{active.map(member => (
        <div key={member.id} className={`flex flex-wrap items-center gap-3 border-b p-4 last:border-0 ${member.active ? "" : "opacity-60"}`}>
          <AvatarBadge name={member.name} variant="muted"/>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <b className="truncate text-sm">{member.name}</b>
              {member.isSelf && <span className="tag bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">siz</span>}
              {!member.active && <span className="tag bg-muted">pasif</span>}
            </div>
            <p className="truncate text-xs text-slate-400">{member.email}</p>
          </div>
          <Metric value={member.channelCount} label="kanalım"/>
          <Metric value={member.openTasks} label="açık görev"/>
          <Metric value={member.completedComments} label={`yorum · ${performanceDays}g`}/>
          <button onClick={() => edit(member)} className="grid size-9 place-items-center rounded-lg border hover:bg-muted" title="Kanallarını düzenle" aria-label={`${member.name} kanallarını düzenle`}>
            <ChevronRight size={17}/>
          </button>
        </div>
      ))}</div> : <EmptyState title="Ekibinizde henüz kimse yok." description="Aşağıdan bir kanal yöneticisine kanal atayarak başlayın."/>}
    </section>

    {available.length > 0 && (
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b p-5">
          <UsersRound className="text-slate-400" size={20}/>
          <h2 className="font-bold">Kanal atayabileceğiniz diğer kişiler</h2>
          <span className="tag ml-auto bg-muted">{available.length}</span>
        </div>
        <p className="px-5 pt-3 text-xs text-slate-500">Şu an sizin kanallarınızdan hiçbirini yönetmiyorlar. Kanal verirseniz ekibinize katılırlar.</p>
        <div className="mt-2">{available.map(member => (
          <div key={member.id} className="flex flex-wrap items-center gap-3 border-t p-4">
            <AvatarBadge name={member.name} variant="muted"/>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm">{member.name}</b>
              <p className="truncate text-xs text-slate-400">{member.email}</p>
            </div>
            <button onClick={() => edit(member)} className="btn-outline h-9 px-3 text-xs">Kanal ata</button>
          </div>
        ))}</div>
      </section>
    )}

    <Modal open={!!editing} onClose={() => setEditing(null)} className="flex max-h-[90vh] w-full max-w-3xl flex-col p-0 shadow-2xl">
      {editing && <>
        <div className="flex items-start justify-between border-b p-6">
          <div>
            <h2 className="text-xl font-black">{editing.name}</h2>
            <p className="text-sm text-slate-500">Yalnızca liderliğini yaptığınız kanallar listelenir; diğer liderlerin atamaları etkilenmez.</p>
          </div>
          <ModalCloseButton onClick={() => setEditing(null)}/>
        </div>
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/>
            <input aria-label="Kanal veya kategori ara" value={query} onChange={event => setQuery(event.target.value)} className="h-11 w-full rounded-xl border bg-card pl-10 pr-4 text-sm" placeholder="Kanal veya kategori ara..."/>
          </div>
          <div className="mt-3 flex justify-between text-xs text-slate-500">
            <span>{selected.size} kanal seçili</span>
            <button className="font-bold text-teal-600" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
          </div>
        </div>
        <div className="grid flex-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
          {visibleChannels.length ? visibleChannels.map(channel => {
            const checked = selected.has(channel.id);
            const otherOwner = channel.responsibleId && channel.responsibleId !== editing.id ? channel.responsibleName : null;
            return <button key={channel.id} onClick={() => setSelected(current => { const next = new Set(current); checked ? next.delete(channel.id) : next.add(channel.id); return next; })} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-teal-500 bg-teal-50 dark:bg-teal-500/10" : "hover:bg-muted"}`}>
              <span className={`grid size-5 shrink-0 place-items-center rounded border ${checked ? "border-teal-600 bg-teal-600 text-white" : ""}`}>{checked && <Check size={13}/>}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{channel.versionChannel || channel.name}</b>
                <span className="block truncate text-xs text-slate-400">{channel.name}{channel.category ? ` · ${channel.category}` : ""}</span>
                {otherOwner && <span className="text-[10px] font-semibold text-amber-600">Şu an {otherOwner} sorumlusu</span>}
                {!channel.responsibleId && <span className="text-[10px] font-semibold text-amber-600">Sorumlusuz</span>}
              </span>
            </button>;
          }) : <EmptyState className="sm:col-span-2" size="sm" icon={Search} title="Kanal bulunamadı" description="Farklı bir arama terimi deneyin."/>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button className="btn-outline" onClick={() => setEditing(null)}>Vazgeç</button>
          <button disabled={loading} className="btn-primary" onClick={save}>{loading ? "Kaydediliyor..." : `${selected.size} kanalı kaydet`}</button>
        </div>
      </>}
    </Modal>
  </>;
}

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return <div className="card p-4">
    <p className="text-xs text-slate-500">{label}</p>
    <p className={`mt-1 text-2xl font-black ${warn ? "text-amber-600" : ""}`}>{value.toLocaleString("tr-TR")}</p>
  </div>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <span className="hidden text-center text-xs text-slate-400 sm:block">
    <b className="block text-sm text-foreground">{value.toLocaleString("tr-TR")}</b>{label}
  </span>;
}

"use client";

import { Check, ChevronRight, Plus, Search, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type User = { id: string; name: string; email: string; role: string; active: boolean; assignedChannels: { id: string }[]; ledChannels: { id: string }[] };
type Channel = { id: string; name: string; versionChannel: string | null; category: string | null; responsibleId: string | null; teamLeadId: string | null };

export function TeamManager({ users, channels, canManage }: { users: User[]; channels: Channel[]; canManage: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const leaders = users.filter(user => user.role === "MANAGER");
  const managers = users.filter(user => user.role === "EDITOR");
  const admins = users.filter(user => user.role === "ADMIN");
  const visibleChannels = useMemo(() => channels.filter(channel => `${channel.name} ${channel.versionChannel || ""} ${channel.category || ""}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"))), [channels, query]);

  function edit(user: User) {
    setEditing(user);
    setSelected(new Set((user.role === "MANAGER" ? user.ledChannels : user.assignedChannels).map(channel => channel.id)));
    setQuery("");
  }

  async function saveAssignments() {
    if (!editing) return;
    setLoading(true);
    const response = await fetch(`/api/users/${editing.id}/channels`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelIds: [...selected] }) });
    const data = await response.json();
    if (response.ok) { toast.success(`${data.assigned} kanal atandı`); setEditing(null); router.refresh(); } else toast.error(data.error);
    setLoading(false);
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.ok) { toast.success("Hesap oluşturuldu"); setCreateOpen(false); router.refresh(); } else toast.error(data.error);
    setLoading(false);
  }

  return <>
    {canManage && <div className="flex justify-end"><button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={17}/>Ekip hesabı ekle</button></div>}
    <div className="grid gap-5 xl:grid-cols-2"><UserGroup title="Ekip Liderleri" description="Liderliğini yaptığı kanalları yönetin." users={leaders} relation="ledChannels" onEdit={edit} canManage={canManage}/><UserGroup title="Kanal Yöneticileri" description="Günlük operasyonundan sorumlu olduğu kanalları yönetin." users={managers} relation="assignedChannels" onEdit={edit} canManage={canManage}/></div>
    {admins.length > 0 && <section className="card p-5"><h2 className="font-bold">Admin Hesapları</h2><div className="mt-3 flex flex-wrap gap-2">{admins.map(user => <span key={user.id} className="tag bg-muted">{user.name} · {user.email}</span>)}</div></section>}

    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-card shadow-2xl"><div className="flex items-start justify-between border-b p-6"><div><h2 className="text-xl font-black">{editing.name}</h2><p className="text-sm text-slate-500">{editing.role === "MANAGER" ? "Ekip Lideri" : "Kanal Yöneticisi"} · Kanalları tek tek seçin</p></div><button onClick={() => setEditing(null)}><X/></button></div><div className="border-b p-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input value={query} onChange={event => setQuery(event.target.value)} className="h-11 w-full rounded-xl border bg-card pl-10 pr-4 text-sm" placeholder="Kanal veya kategori ara..."/></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{selected.size} kanal seçili</span><button className="font-bold text-violet-600" onClick={() => setSelected(new Set())}>Seçimi temizle</button></div></div><div className="grid flex-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">{visibleChannels.map(channel => { const checked = selected.has(channel.id); const assignedToOther = editing.role === "MANAGER" ? Boolean(channel.teamLeadId && channel.teamLeadId !== editing.id) : Boolean(channel.responsibleId && channel.responsibleId !== editing.id); return <button key={channel.id} onClick={() => setSelected(current => { const next = new Set(current); checked ? next.delete(channel.id) : next.add(channel.id); return next; })} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "hover:bg-muted"}`}><span className={`grid size-5 shrink-0 place-items-center rounded border ${checked ? "border-violet-600 bg-violet-600 text-white" : ""}`}>{checked && <Check size={13}/>}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{channel.versionChannel || channel.name}</b><span className="block truncate text-xs text-slate-400">{channel.name}{channel.category ? ` · ${channel.category}` : ""}</span>{assignedToOther && <span className="text-[10px] font-semibold text-amber-600">Başka bir kullanıcıya atanmış</span>}</span></button>; })}</div><div className="flex justify-end gap-2 border-t p-4"><button className="btn-outline" onClick={() => setEditing(null)}>Vazgeç</button><button disabled={loading} className="btn-primary" onClick={saveAssignments}>{loading ? "Kaydediliyor..." : `${selected.size} kanalı kaydet`}</button></div></div></div>}

    {createOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={createUser} className="w-full max-w-md space-y-4 rounded-2xl bg-card p-6"><div className="flex justify-between"><div><h2 className="text-xl font-black">Ekip hesabı ekle</h2><p className="text-sm text-slate-500">Rolü seçip daha sonra kanallarını atayın.</p></div><button type="button" onClick={() => setCreateOpen(false)}><X/></button></div>{[["name", "Ad soyad", "text"], ["email", "E-posta", "email"], ["password", "Geçici parola", "password"]].map(field => <input key={field[0]} name={field[0]} type={field[2]} placeholder={field[1]} required minLength={field[0] === "password" ? 8 : undefined} className="h-11 w-full rounded-xl border bg-card px-4"/>)}<select name="role" className="h-11 w-full rounded-xl border bg-card px-4"><option value="MANAGER">Ekip Lideri</option><option value="EDITOR">Kanal Yöneticisi</option></select><button disabled={loading} className="btn-primary w-full">{loading ? "Oluşturuluyor..." : "Hesabı oluştur"}</button></form></div>}
  </>;
}

function UserGroup({ title, description, users, relation, onEdit, canManage }: { title: string; description: string; users: User[]; relation: "ledChannels" | "assignedChannels"; onEdit: (user: User) => void; canManage: boolean }) {
  return <section className="card overflow-hidden"><div className="border-b p-5"><div className="flex items-center gap-2"><UsersRound className="text-violet-600" size={20}/><h2 className="font-bold">{title}</h2><span className="tag ml-auto bg-muted">{users.length}</span></div><p className="mt-1 text-xs text-slate-500">{description}</p></div>{users.length ? <div>{users.map(user => <div key={user.id} className="flex items-center gap-3 border-b p-4 last:border-0"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-xs font-black">{user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("tr")}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{user.name}</b><p className="truncate text-xs text-slate-400">{user.email}</p></div><span className="tag bg-violet-50 text-violet-700">{user[relation].length} kanal</span>{canManage && <button onClick={() => onEdit(user)} className="grid size-9 place-items-center rounded-lg border hover:bg-muted" title="Kanalları düzenle"><ChevronRight size={17}/></button>}</div>)}</div> : <div className="p-10 text-center text-sm text-slate-400">Henüz hesap oluşturulmadı.</div>}</section>;
}

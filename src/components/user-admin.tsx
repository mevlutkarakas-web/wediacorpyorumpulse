"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, GitMerge, KeyRound, Pencil, Plus, RefreshCw, Search, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { Modal, ModalCloseButton } from "@/components/modal";
import { AvatarBadge } from "@/components/avatar-badge";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { PAGE_SIZE } from "@/lib/pagination";
import { generatePassword } from "@/lib/utils";

export type Role = "ADMIN" | "MANAGER" | "EDITOR";
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  counts: { assignedChannels: number; ledChannels: number; tasks: number; createdTasks: number };
};
type DuplicateGroup = { key: string; members: AdminUser[] };

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", MANAGER: "Ekip Lideri", EDITOR: "Kanal Yöneticisi" };
const ROLE_CLASS: Record<Role, string> = {
  ADMIN: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  MANAGER: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
  EDITOR: "bg-muted text-slate-600 dark:text-slate-300",
};
const FIELD = "h-11 w-full rounded-xl border bg-card px-4 text-sm";

/** Rol değişince kaç kanal bağının kopacağı — sunucudaki roleChannelReset ile aynı kural. */
function resetImpact(role: Role, counts: AdminUser["counts"]) {
  return (role !== "MANAGER" ? counts.ledChannels : 0) + (role !== "EDITOR" ? counts.assignedChannels : 0);
}

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}) as { error?: string });
  if (!response.ok) throw new Error(data.error || `İşlem başarısız (${response.status})`);
  return data;
}

export function UserAdmin({
  users,
  allUsers,
  duplicates,
  currentUserId,
  totals,
  filters,
  pagination,
}: {
  users: AdminUser[];
  allUsers: AdminUser[];
  duplicates: DuplicateGroup[];
  currentUserId: string;
  totals: { all: number; admins: number; inactive: number };
  filters: { q: string; role: Role | null; status: "active" | "inactive" | null };
  pagination: { page: number; totalPages: number; totalCount: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [merging, setMerging] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  async function run(action: () => Promise<void>) {
    setLoading(true);
    try {
      await action();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İşlem başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Toplam hesap" value={totals.all} />
        <StatTile label="Aktif admin" value={totals.admins} />
        <StatTile label="Pasif hesap" value={totals.inactive} />
      </div>

      {duplicates.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center gap-2">
            <GitMerge className="text-amber-600" size={19} />
            <h2 className="font-bold">Olası mükerrer hesaplar</h2>
            <span className="tag ml-auto bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{duplicates.length} kişi</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Aynı kişiye ait görünen hesaplar. Birleştirince kanallar, görevler, tamamlanan yorumlar ve okunan bildirimler hedef hesaba taşınır, kaynak pasife alınır.</p>
          <div className="mt-4 space-y-2">
            {duplicates.map(group => (
              <div key={group.key} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {group.members.map(member => (
                    <button
                      key={member.id}
                      onClick={() => setMerging(member)}
                      disabled={member.id === currentUserId}
                      title={member.id === currentUserId ? "Kendi hesabınızı birleştiremezsiniz" : "Bu hesabı başka bir hesapla birleştir"}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <span className={`tag ${ROLE_CLASS[member.role]}`}>{ROLE_LABEL[member.role]}</span>
                      <span>
                        <b className="block">{member.name}</b>
                        <span className="text-slate-400">{member.email}</span>
                      </span>
                      <span className="text-slate-400">
                        {member.counts.assignedChannels + member.counts.ledChannels} kanal · {member.counts.tasks} görev
                      </span>
                      {!member.active && <span className="tag bg-muted">pasif</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <form
            className="relative min-w-[220px] flex-1"
            onSubmit={event => {
              event.preventDefault();
              setParam("q", String(new FormData(event.currentTarget).get("q") || "").trim());
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input name="q" defaultValue={filters.q} aria-label="Ad veya e-posta ara" placeholder="Ad veya e-posta ara..." className="h-11 w-full rounded-xl border bg-card pl-10 pr-4 text-sm" />
          </form>
          <select aria-label="Rol filtresi" value={filters.role || ""} onChange={event => setParam("role", event.target.value)} className="h-11 rounded-xl border bg-card px-3 text-sm">
            <option value="">Tüm roller</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map(role => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <select aria-label="Durum filtresi" value={filters.status || ""} onChange={event => setParam("status", event.target.value)} className="h-11 rounded-xl border bg-card px-3 text-sm">
            <option value="">Tüm durumlar</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={17} />
            Hesap ekle
          </button>
        </div>

        {users.length ? (
          <div>
            {users.map(user => (
              <div key={user.id} className={`flex flex-wrap items-center gap-3 border-b p-4 last:border-0 ${user.active ? "" : "opacity-60"}`}>
                <AvatarBadge name={user.name} variant="muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <b className="truncate text-sm">{user.name}</b>
                    {user.id === currentUserId && <span className="tag bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">siz</span>}
                    {!user.active && <span className="tag bg-muted">pasif</span>}
                  </div>
                  <p className="truncate text-xs text-slate-400">{user.email}</p>
                </div>
                <span className={`tag ${ROLE_CLASS[user.role]}`}>{ROLE_LABEL[user.role]}</span>
                <span className="hidden text-xs text-slate-400 md:block">
                  {user.role === "MANAGER" ? user.counts.ledChannels : user.counts.assignedChannels} kanal · {user.counts.tasks} görev
                </span>
                <div className="flex items-center gap-1">
                  <IconButton title="Düzenle" onClick={() => setEditing(user)} icon={Pencil} />
                  <IconButton title="Parola sıfırla" onClick={() => setResetting(user)} icon={KeyRound} />
                  <IconButton title="Başka hesapla birleştir" onClick={() => setMerging(user)} icon={GitMerge} disabled={user.id === currentUserId} />
                  <IconButton title="Sil" onClick={() => setDeleting(user)} icon={Trash2} disabled={user.id === currentUserId} danger />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Search} title="Hesap bulunamadı" description="Arama veya filtreleri değiştirin." />
        )}
        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalCount={pagination.totalCount} pageSize={PAGE_SIZE.ADMIN_USERS} />
      </section>

      <CreateModal open={createOpen} loading={loading} onClose={() => setCreateOpen(false)} onSubmit={body => run(async () => { await send("/api/users", "POST", body); toast.success("Hesap oluşturuldu"); setCreateOpen(false); })} />
      <EditModal user={editing} loading={loading} onClose={() => setEditing(null)} onSubmit={body => run(async () => { const data = await send(`/api/users/${editing!.id}`, "PATCH", body); toast.success(data.user?.clearedChannels ? `Güncellendi · ${data.user.clearedChannels} kanal bağı kaldırıldı` : "Hesap güncellendi"); setEditing(null); })} />
      <PasswordModal user={resetting} loading={loading} onClose={() => setResetting(null)} onSubmit={password => run(async () => { await send(`/api/users/${resetting!.id}`, "PATCH", { password }); toast.success("Parola güncellendi"); })} />
      <MergeModal source={merging} allUsers={allUsers} loading={loading} onClose={() => setMerging(null)} onSubmit={targetId => run(async () => { const data = await send("/api/users/merge", "POST", { sourceId: merging!.id, targetId }); toast.success(`Birleştirildi · ${data.merge.movedChannels} kanal, ${data.merge.assignedTasks + data.merge.createdTasks} görev taşındı`); setMerging(null); })} />
      <DeleteModal user={deleting} loading={loading} onClose={() => setDeleting(null)} onConfirm={() => run(async () => { await send(`/api/users/${deleting!.id}`, "DELETE"); toast.success("Hesap silindi"); setDeleting(null); })} />
    </>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value.toLocaleString("tr-TR")}</p>
    </div>
  );
}

function IconButton({ title, onClick, icon: Icon, disabled, danger }: { title: string; onClick: () => void; icon: typeof Pencil; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className={`grid size-9 place-items-center rounded-lg border hover:bg-muted disabled:opacity-40 ${danger ? "text-red-500" : ""}`}>
      <Icon size={16} />
    </button>
  );
}

function PasswordField({ value, onChange, label = "Parola" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <div className="mt-1 flex gap-2">
        <input name="password" value={value} onChange={event => onChange(event.target.value)} minLength={8} required className={`${FIELD} font-mono`} placeholder="En az 8 karakter" />
        <button type="button" title="Güçlü parola üret" aria-label="Güçlü parola üret" onClick={() => onChange(generatePassword())} className="btn-outline shrink-0 px-3">
          <RefreshCw size={16} />
        </button>
        <button
          type="button"
          title="Kopyala"
          aria-label="Parolayı kopyala"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Parola kopyalandı"), () => toast.error("Kopyalanamadı"))}
          disabled={!value}
          className="btn-outline shrink-0 px-3"
        >
          <Copy size={16} />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Parola bir daha gösterilmez — kaydetmeden önce kopyalayıp kullanıcıya iletin.</p>
    </label>
  );
}

function CreateModal({ open, loading, onClose, onSubmit }: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (body: Record<string, string>) => void }) {
  const [password, setPassword] = useState("");
  return (
    <Modal open={open} onClose={onClose} className="w-full max-w-md">
      <form
        className="space-y-4"
        onSubmit={event => {
          event.preventDefault();
          onSubmit({ ...(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>), password });
        }}
      >
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-black">Hesap ekle</h2>
            <p className="text-sm text-slate-500">Rolü seçin; kanal atamasını /ekip sayfasından yapabilirsiniz.</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <input name="name" placeholder="Ad soyad" required minLength={2} className={FIELD} />
        <input name="email" type="email" placeholder="E-posta" required className={FIELD} />
        <PasswordField value={password} onChange={setPassword} label="Geçici parola" />
        <select name="role" defaultValue="EDITOR" className={FIELD}>
          {(Object.keys(ROLE_LABEL) as Role[]).map(role => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
        <button disabled={loading} className="btn-primary w-full">
          {loading ? "Oluşturuluyor..." : "Hesabı oluştur"}
        </button>
      </form>
    </Modal>
  );
}

function EditModal({ user, loading, onClose, onSubmit }: { user: AdminUser | null; loading: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  return (
    <Modal open={!!user} onClose={onClose} className="w-full max-w-md">
      {/* key: modal her yeni kullanıcı için sıfırdan kurulur, form state'i önceki hesaptan taşınmaz. */}
      {user && <EditForm key={user.id} user={user} loading={loading} onClose={onClose} onSubmit={onSubmit} />}
    </Modal>
  );
}

function EditForm({ user, loading, onClose, onSubmit }: { user: AdminUser; loading: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const impact = resetImpact(role, user.counts);
  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
        onSubmit({ name: form.name, email: form.email, role, active });
      }}
    >
      <div className="flex justify-between">
        <div>
          <h2 className="text-xl font-black">{user.name}</h2>
          <p className="text-sm text-slate-500">Hesap bilgilerini ve yetkisini güncelleyin.</p>
        </div>
        <ModalCloseButton onClick={onClose} />
      </div>
      <input name="name" defaultValue={user.name} required minLength={2} aria-label="Ad soyad" className={FIELD} />
      <input name="email" type="email" defaultValue={user.email} required aria-label="E-posta" className={FIELD} />
      <select value={role} onChange={event => setRole(event.target.value as Role)} aria-label="Rol" className={FIELD}>
        {(Object.keys(ROLE_LABEL) as Role[]).map(option => (
          <option key={option} value={option}>
            {ROLE_LABEL[option]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} className="size-4" />
        Hesap aktif <span className="text-xs text-slate-500">(pasif hesap giriş yapamaz)</span>
      </label>
      {role !== user.role && impact > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Rol değişince bu hesabın {impact} kanal bağı kaldırılacak. Kanalları yeni rolüne göre /ekip sayfasından tekrar atayın.
        </p>
      )}
      <button disabled={loading} className="btn-primary w-full">
        {loading ? "Kaydediliyor..." : "Kaydet"}
      </button>
    </form>
  );
}

function PasswordModal({ user, loading, onClose, onSubmit }: { user: AdminUser | null; loading: boolean; onClose: () => void; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <Modal open={!!user} onClose={onClose} className="w-full max-w-md">
      {user && (
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            onSubmit(password);
          }}
        >
          <div className="flex justify-between">
            <div>
              <h2 className="text-xl font-black">Parola sıfırla</h2>
              <p className="text-sm text-slate-500">
                {user.name} · {user.email}
              </p>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>
          <PasswordField value={password} onChange={setPassword} label="Yeni parola" />
          <p className="rounded-xl bg-muted p-3 text-xs text-slate-500">
            Kullanıcının açık oturumu 12 saat daha geçerli kalır. Anında düşürmek için hesabı düzenle ekranından pasife alıp tekrar aktifleştirin.
          </p>
          <button disabled={loading || password.length < 8} className="btn-primary w-full">
            {loading ? "Kaydediliyor..." : "Parolayı güncelle"}
          </button>
        </form>
      )}
    </Modal>
  );
}

function MergeModal({ source, allUsers, loading, onClose, onSubmit }: { source: AdminUser | null; allUsers: AdminUser[]; loading: boolean; onClose: () => void; onSubmit: (targetId: string) => void }) {
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const candidates = useMemo(
    () =>
      allUsers
        .filter(user => user.id !== source?.id)
        .filter(user => `${user.name} ${user.email}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")))
        .slice(0, 30),
    [allUsers, source, query],
  );
  const target = allUsers.find(user => user.id === targetId) || null;
  // Sunucu kanal bağını hedefin rolüne göre taşır; uymayan bağ koparılır.
  const moving = source && target ? (target.role === "MANAGER" ? source.counts.ledChannels : target.role === "EDITOR" ? source.counts.assignedChannels : 0) : 0;
  const detaching = source && target ? source.counts.assignedChannels + source.counts.ledChannels - moving : 0;

  return (
    <Modal open={!!source} onClose={onClose} className="flex max-h-[85vh] w-full max-w-xl flex-col p-0">
      {source && (
        <>
          <div className="flex items-start justify-between border-b p-5">
            <div>
              <h2 className="text-xl font-black">Hesabı birleştir</h2>
              <p className="text-sm text-slate-500">
                Kaynak: <b>{source.name}</b> · {source.email}
              </p>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input value={query} onChange={event => setQuery(event.target.value)} aria-label="Hedef hesap ara" placeholder="Hedef hesabı ara..." className="h-11 w-full rounded-xl border bg-card pl-10 pr-4 text-sm" />
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-3">
            {candidates.length ? (
              candidates.map(user => (
                <button key={user.id} onClick={() => setTargetId(user.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${targetId === user.id ? "border-teal-500 bg-teal-50 dark:bg-teal-500/10" : "hover:bg-muted"}`}>
                  <AvatarBadge name={user.name} variant="muted" size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{user.name}</b>
                    <span className="block truncate text-xs text-slate-400">{user.email}</span>
                  </span>
                  <span className={`tag ${ROLE_CLASS[user.role]}`}>{ROLE_LABEL[user.role]}</span>
                </button>
              ))
            ) : (
              <EmptyState size="sm" icon={Search} title="Hesap bulunamadı" />
            )}
          </div>
          <div className="space-y-3 border-t p-4">
            {target && (
              <div className="rounded-xl bg-muted p-3 text-xs">
                <p className="font-bold">
                  {source.name} → {target.name}
                </p>
                <p className="mt-1 text-slate-500">
                  {moving} kanal, {source.counts.tasks} atanan görev, {source.counts.createdTasks} oluşturulan görev ve okunan bildirimler taşınacak. Kaynak hesap pasife alınacak.
                </p>
                {detaching > 0 && <p className="mt-1 font-semibold text-amber-600">{detaching} kanal bağı hedefin rolüne uymadığı için kaldırılacak.</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={onClose}>
                Vazgeç
              </button>
              <button disabled={loading || !targetId} className="btn-primary" onClick={() => onSubmit(targetId)}>
                {loading ? "Birleştiriliyor..." : "Birleştir"}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function DeleteModal({ user, loading, onClose, onConfirm }: { user: AdminUser | null; loading: boolean; onClose: () => void; onConfirm: () => void }) {
  const blocked = (user?.counts.createdTasks || 0) > 0;
  return (
    <Modal open={!!user} onClose={onClose} className="w-full max-w-md">
      {user && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <div>
              <h2 className="text-xl font-black">Hesabı sil</h2>
              <p className="text-sm text-slate-500">
                {user.name} · {user.email}
              </p>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>
          {blocked ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Bu hesap {user.counts.createdTasks.toLocaleString("tr-TR")} görev oluşturmuş, silinemez. Bunun yerine düzenle ekranından <b>pasife alın</b> veya başka bir hesapla <b>birleştirin</b>.
            </p>
          ) : (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              Bu işlem geri alınamaz. Hesabın kanal atamaları kaldırılacak, görevleri atamasız kalacak, okunan bildirim kayıtları silinecek. Geçmişi korumak istiyorsanız pasife almayı tercih edin.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={onClose}>
              Vazgeç
            </button>
            {blocked ? (
              <button className="btn-outline" onClick={onClose}>
                <UserX size={16} />
                Anladım
              </button>
            ) : (
              <button disabled={loading} className="btn inline-flex bg-red-600 text-white hover:bg-red-700" onClick={onConfirm}>
                {loading ? "Siliniyor..." : "Kalıcı olarak sil"}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

"use client";
import { Bot, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function SetupPage() {
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const data = await response.json();
    if (response.ok) location.href = "/"; else toast.error(data.error);
    setLoading(false);
  }
  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 p-4 text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#7c3aed33,transparent_35%),radial-gradient(circle_at_bottom_right,#0891b233,transparent_35%)]"/><section className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-white/[.07] p-8 shadow-2xl backdrop-blur-xl"><div className="mb-7 flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600"><Bot/></span><div><h1 className="text-xl font-black">YorumPulse</h1><p className="text-xs text-violet-300">İlk kurulum</p></div></div><h2 className="text-2xl font-black">Yönetici hesabınızı oluşturun</h2><p className="mt-2 text-sm text-slate-400">Bu ekran yalnızca ilk kullanıcı için çalışır. Diğer kullanıcıları daha sonra Ekip Yönetimi bölümünden siz ekleyeceksiniz.</p><form onSubmit={submit} className="mt-7 space-y-4">{[["name","Ad soyad","text",UserRound],["email","E-posta","email",Mail],["password","Parola (en az 8 karakter)","password",LockKeyhole]].map(([name,label,type,Icon])=><label className="block" key={String(name)}><span className="text-xs font-bold text-slate-300">{String(label)}</span><div className="relative mt-2"><Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17}/><input name={String(name)} type={String(type)} required minLength={name === "password" ? 8 : undefined} className="h-12 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 outline-none focus:border-violet-500"/></div></label>)}<button disabled={loading} className="btn-primary h-12 w-full">{loading ? "Hesap oluşturuluyor..." : "Yönetici hesabını oluştur"}</button></form></section></main>;
}

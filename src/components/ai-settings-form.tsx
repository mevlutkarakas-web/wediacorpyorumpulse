"use client";

import { Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  initial: {
    provider: string;
    groqConfigured: boolean;
    openRouterConfigured: boolean;
    geminiConfigured: boolean;
    groqModel: string;
    openRouterModel: string;
  };
};

export function AiSettingsForm({ initial }: Props) {
  const [provider, setProvider] = useState(initial.provider);
  const [groqModel, setGroqModel] = useState(initial.groqModel);
  const [openRouterModel, setOpenRouterModel] = useState(initial.openRouterModel);
  const [groqApiKey, setGroqApiKey] = useState("");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/settings/ai", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, groqModel, openRouterModel, groqApiKey: groqApiKey || undefined, openRouterApiKey: openRouterApiKey || undefined }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "AI ayarları kaydedilemedi");
    setGroqApiKey("");
    setOpenRouterApiKey("");
    toast.success("AI sağlayıcı ayarları kaydedildi");
  }

  return <form onSubmit={save} className="card space-y-5 p-6">
    <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-600"><ShieldCheck/></span><div><h2 className="font-bold">AI cevap motoru</h2><p className="text-xs text-slate-500">Anahtarlar şifrelenir ve tekrar görüntülenmez.</p></div></div>
    <label className="block text-sm font-semibold">Aktif sağlayıcı<select value={provider} onChange={e=>setProvider(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"><option value="AUTO">Otomatik (önerilen)</option><option value="GROQ">Groq</option><option value="OPENROUTER">OpenRouter</option><option value="GEMINI">Gemini</option></select></label>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-semibold">Groq modeli<input value={groqModel} onChange={e=>setGroqModel(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"/></label>
      <label className="text-sm font-semibold">Groq API anahtarı <span className="text-xs font-normal text-slate-400">({initial.groqConfigured?"yapılandırıldı":"eksik"})</span><input type="password" autoComplete="new-password" value={groqApiKey} onChange={e=>setGroqApiKey(e.target.value)} placeholder="Değiştirmek için yeni anahtar" className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"/></label>
      <label className="text-sm font-semibold">OpenRouter modeli<input value={openRouterModel} onChange={e=>setOpenRouterModel(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"/></label>
      <label className="text-sm font-semibold">OpenRouter API anahtarı <span className="text-xs font-normal text-slate-400">({initial.openRouterConfigured?"yapılandırıldı":"eksik"})</span><input type="password" autoComplete="new-password" value={openRouterApiKey} onChange={e=>setOpenRouterApiKey(e.target.value)} placeholder="Değiştirmek için yeni anahtar" className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal"/></label>
    </div>
    <p className="text-xs text-slate-500">Otomatik modda sıra: Groq → OpenRouter → Gemini → çeşitli yerel yanıtlar.</p>
    <button disabled={saving} className="btn-primary"><Save size={16}/>{saving?"Kaydediliyor…":"AI ayarlarını kaydet"}</button>
  </form>;
}

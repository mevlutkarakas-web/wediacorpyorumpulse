"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type TeamMember = { id: string; name: string };

/** Kanal detayındaki "Sorumlu" satırı — admin ve o kanalın ekip liderine düzenlenebilir gelir. */
export function ChannelResponsible({ channelId, responsibleId, teamMembers }: { channelId: string; responsibleId: string | null; teamMembers: TeamMember[] }) {
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function change(nextId: string) {
    setSaving(true);
    const response = await fetch(`/api/channels/${channelId}/responsible`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ responsibleId: nextId || null }),
    });
    const data = await response.json();
    if (response.ok) { toast.success(data.responsibleName ? `Sorumlu ${data.responsibleName} olarak güncellendi` : "Kanal sorumlusuz bırakıldı"); router.refresh(); }
    else toast.error(data.error);
    setSaving(false);
  }

  return (
    <select
      aria-label="Kanal sorumlusu"
      value={responsibleId || ""}
      disabled={saving}
      onChange={event => change(event.target.value)}
      className="rounded-lg border bg-card px-2 py-1 text-sm font-medium"
    >
      <option value="">Atanmadı</option>
      {teamMembers.map(member => (
        <option key={member.id} value={member.id}>{member.name}</option>
      ))}
    </select>
  );
}

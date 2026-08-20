import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input = z.object({ channelIds: z.array(z.string()).max(2000) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!allow(session, ["ADMIN", "MANAGER"])) return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Kanal seçimi geçersiz." }, { status: 400 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, active: true } });
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  if (user.role === "ADMIN") return NextResponse.json({ error: "Admin hesabına kanal atanamaz." }, { status: 400 });

  // Ekip lideri KENDİ liderlik ettiği kanalları dağıtabilir; kime verdiği kendi kararı.
  // Sınır kanalda, kişide değil: kanal yöneticilerinin çoğu birden fazla lidere bağlı
  // olduğu için kapsamsız bir "hepsini sil, yenisini yaz" başka liderin atamalarını silerdi.
  // Hedefi "hâlihazırda benim kanalımı taşıyanlar" ile sınırlamak ise kilitlenme yaratırdı:
  // lider birini boşalttığında o kişi ekipten düşer ve bir daha kanal verilemezdi.
  const leadOnly = session!.role === "MANAGER";
  if (leadOnly) {
    const self = user.id === session!.sub;
    if (!self && user.role !== "EDITOR") return NextResponse.json({ error: "Ekip lideri yalnızca kanal yöneticilerine kanal atayabilir." }, { status: 403 });
    if (!user.active) return NextResponse.json({ error: "Pasif hesaba kanal atanamaz." }, { status: 400 });
  }
  const leadScope = leadOnly ? { teamLeadId: session!.sub } : {};

  const validChannels = await prisma.channel.findMany({ where: { AND: [{ id: { in: parsed.data.channelIds } }, leadScope] }, select: { id: true } });
  const channelIds = validChannels.map(channel => channel.id);
  // Liderlik (teamLead) ataması yalnızca admin işidir ve kapsamsız çalışır. Ekip lideri
  // yalnızca sorumluluk (responsible) dağıtır — kendini hedef alsa bile. Bu ayrım rol
  // yerine EYLEMİ SAHİPLENENE göre yapılmalı: aksi hâlde lider kendine atama yaptığında
  // MANAGER dalına düşer ve kendi liderlik bağlarının hepsini silerdi.
  const assignLeadership = !leadOnly && user.role === "MANAGER";
  await prisma.$transaction(async tx => {
    if (assignLeadership) {
      await tx.channel.updateMany({ where: { teamLeadId: user.id }, data: { teamLeadId: null, teamLeadName: null } });
      if (channelIds.length) await tx.channel.updateMany({ where: { id: { in: channelIds } }, data: { teamLeadId: user.id, teamLeadName: user.name } });
    } else {
      await tx.channel.updateMany({ where: { AND: [{ responsibleId: user.id }, leadScope] }, data: { responsibleId: null, responsibleName: null } });
      if (channelIds.length) await tx.channel.updateMany({ where: { id: { in: channelIds } }, data: { responsibleId: user.id, responsibleName: user.name } });
    }
  });
  return NextResponse.json({ assigned: channelIds.length });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, teamScopeWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input = z.object({ responsibleId: z.string().min(1).nullable() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  const { id } = await params;
  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true, teamLeadId: true } });
  if (!channel) return NextResponse.json({ error: "Kanal bulunamadı." }, { status: 404 });

  // Bilerek channelAccessWhere kullanılmıyor: o, MANAGER'ın yalnızca sorumlusu olduğu
  // kanalları da kapsar; kendi atamasını değiştirmek liderin ya da admin'in işi.
  const canReassign = session.role === "ADMIN" || (session.role === "MANAGER" && channel.teamLeadId === session.sub);
  if (!canReassign) return NextResponse.json({ error: "Bu kanalın sorumlusunu değiştirme yetkiniz yok." }, { status: 403 });

  let responsibleName: string | null = null;
  if (parsed.data.responsibleId) {
    const user = await prisma.user.findFirst({ where: { AND: [{ id: parsed.data.responsibleId }, teamScopeWhere(session)] }, select: { name: true, role: true } });
    if (!user) return NextResponse.json({ error: "Bu kişiyi kanala atayamazsınız." }, { status: 400 });
    if (user.role === "ADMIN") return NextResponse.json({ error: "Admin hesabına kanal atanamaz." }, { status: 400 });
    responsibleName = user.name;
  }

  // responsibleName denormalize kopya; id ile birlikte yazılmazsa listelerde eski isim kalır.
  await prisma.channel.update({ where: { id }, data: { responsibleId: parsed.data.responsibleId, responsibleName } });
  return NextResponse.json({ responsibleId: parsed.data.responsibleId, responsibleName });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input = z.object({ channelIds: z.array(z.string()).max(2000) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Bu işlem için admin yetkisi gerekli." }, { status: 403 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Kanal seçimi geçersiz." }, { status: 400 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  if (user.role === "ADMIN") return NextResponse.json({ error: "Admin hesabına kanal atanamaz." }, { status: 400 });

  const validChannels = await prisma.channel.findMany({ where: { id: { in: parsed.data.channelIds } }, select: { id: true } });
  const channelIds = validChannels.map(channel => channel.id);
  await prisma.$transaction(async tx => {
    if (user.role === "MANAGER") {
      await tx.channel.updateMany({ where: { teamLeadId: user.id }, data: { teamLeadId: null, teamLeadName: null } });
      if (channelIds.length) await tx.channel.updateMany({ where: { id: { in: channelIds } }, data: { teamLeadId: user.id, teamLeadName: user.name } });
    } else {
      await tx.channel.updateMany({ where: { responsibleId: user.id }, data: { responsibleId: null, responsibleName: null } });
      if (channelIds.length) await tx.channel.updateMany({ where: { id: { in: channelIds } }, data: { responsibleId: user.id, responsibleName: user.name } });
    }
  });
  return NextResponse.json({ assigned: channelIds.length });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, channelAccessWhere, getSession, teamScopeWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().max(4000).optional(),
  channelId: z.string().min(1),
  assigneeId: z.string().min(1).nullish(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  dueAt: z.string().datetime().nullish(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!allow(session, ["ADMIN", "MANAGER"])) return NextResponse.json({ error: "Görev oluşturma yetkiniz yok." }, { status: 403 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Görev bilgilerini kontrol edin." }, { status: 400 });
  const { title, description, channelId, assigneeId, priority, dueAt } = parsed.data;

  // Ham id'ye güvenilmez: kanal oturumun kapsamında olmalı.
  const channel = await prisma.channel.findFirst({ where: { AND: [{ id: channelId }, channelAccessWhere(session)] }, select: { id: true } });
  if (!channel) return NextResponse.json({ error: "Kanal bulunamadı." }, { status: 404 });

  if (assigneeId) {
    const assignee = await prisma.user.findFirst({ where: { AND: [{ id: assigneeId }, teamScopeWhere(session)] }, select: { id: true } });
    if (!assignee) return NextResponse.json({ error: "Bu kişiye görev atayamazsınız." }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: { title, description: description || null, channelId: channel.id, assigneeId: assigneeId || null, priority, dueAt: dueAt ? new Date(dueAt) : null, createdById: session!.sub },
    select: { id: true, title: true, status: true },
  });
  return NextResponse.json({ task }, { status: 201 });
}

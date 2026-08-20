import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, getSession, taskAccessWhere, teamScopeWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input = z
  .object({ status: z.enum(["IN_PROGRESS", "DONE"]), assigneeId: z.string().min(1).nullable() })
  .partial()
  .refine(value => value.status !== undefined || value.assigneeId !== undefined, "Güncellenecek alan yok.");

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { AND: [{ id }, taskAccessWhere(session)] }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Görev bulunamadı." }, { status: 404 });

  const { status, assigneeId } = parsed.data;
  // Durum değiştirme herkese açık kalır (EDITOR kendi görevini tamamlayabiliyor);
  // sorumlu değiştirme yalnızca ADMIN/MANAGER.
  if (assigneeId !== undefined) {
    if (!allow(session, ["ADMIN", "MANAGER"])) return NextResponse.json({ error: "Görev atama yetkiniz yok." }, { status: 403 });
    if (assigneeId !== null) {
      const assignee = await prisma.user.findFirst({ where: { AND: [{ id: assigneeId }, teamScopeWhere(session)] }, select: { id: true } });
      if (!assignee) return NextResponse.json({ error: "Bu kişiye görev atayamazsınız." }, { status: 400 });
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data: { ...(status !== undefined ? { status } : {}), ...(assigneeId !== undefined ? { assigneeId } : {}) },
    select: { status: true, assignee: { select: { name: true } } },
  });
  return NextResponse.json(updated);
}

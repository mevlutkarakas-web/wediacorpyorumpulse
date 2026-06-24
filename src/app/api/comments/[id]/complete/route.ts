import { NextResponse } from "next/server";
import { getSession, channelAccessWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const { id } = await context.params;
  const comment = await prisma.comment.findFirst({
    where: { id, video: { channel: channelAccessWhere(session) } },
    select: { id: true, completed: true },
  });
  if (!comment) return NextResponse.json({ error: "Yorum bulunamadı." }, { status: 404 });
  const completed = !comment.completed;
  await prisma.comment.update({
    where: { id },
    data: { completed, completedAt: completed ? new Date() : null, completedById: completed ? session.sub : null },
  });
  return NextResponse.json({ completed });
}

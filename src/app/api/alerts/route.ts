import { NextResponse } from "next/server";
import { z } from "zod";
import { channelAccessWhere, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Yalnızca ekranda seçilen kayıtlar işaretlenir; bir sayfa en fazla PAGE_SIZE.ALERTS kadar.
const input = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  // Kapsam kontrolü: başkasının kanalına ait bir uyarı id'si gönderilse bile elenir.
  const alerts = await prisma.alert.findMany({ where: { AND: [{ channel: channelAccessWhere(session) }, { id: { in: parsed.data.ids } }] }, select: { id: true } });
  const result = await prisma.alertRead.createMany({ data: alerts.map(alert => ({ alertId: alert.id, userId: session.sub })), skipDuplicates: true });
  return NextResponse.json({ updated: result.count });
}

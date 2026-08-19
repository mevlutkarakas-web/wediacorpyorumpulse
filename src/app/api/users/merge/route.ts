import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { UserAdminError, assertNotSelf, mergeUsers } from "@/lib/user-admin";

const input = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Bu işlem için admin yetkisi gerekli." }, { status: 403 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Hesap seçimi geçersiz." }, { status: 400 });
  try {
    assertNotSelf(session.sub, parsed.data.sourceId, "birleştirme");
    return NextResponse.json({ merge: await mergeUsers(parsed.data.sourceId, parsed.data.targetId) });
  } catch (error) {
    if (error instanceof UserAdminError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("user_merge_failed", error);
    return NextResponse.json({ error: "Birleştirme tamamlanamadı." }, { status: 500 });
  }
}

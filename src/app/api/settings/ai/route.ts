import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secret-box";

const input = z.object({
  provider: z.enum(["AUTO", "GROQ", "OPENROUTER", "GEMINI"]),
  groqModel: z.string().trim().min(3).max(120),
  openRouterModel: z.string().trim().min(3).max(120),
  groqApiKey: z.string().trim().min(20).max(300).optional(),
  openRouterApiKey: z.string().trim().min(20).max(300).optional(),
});

export async function PATCH(request: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Yönetici yetkisi gerekli." }, { status: 403 });
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Sağlayıcı bilgilerini kontrol edin." }, { status: 400 });
  const { groqApiKey, openRouterApiKey, ...settings } = parsed.data;
  await prisma.aiSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...settings, groqApiKeyEncrypted: groqApiKey ? encryptSecret(groqApiKey) : null, openRouterKeyEncrypted: openRouterApiKey ? encryptSecret(openRouterApiKey) : null, updatedById: session.sub },
    update: { ...settings, ...(groqApiKey ? { groqApiKeyEncrypted: encryptSecret(groqApiKey) } : {}), ...(openRouterApiKey ? { openRouterKeyEncrypted: encryptSecret(openRouterApiKey) } : {}), updatedById: session.sub },
  });
  return NextResponse.json({ updated: true });
}

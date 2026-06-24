import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const input = z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), password: z.string().min(8), role: z.enum(["ADMIN", "MANAGER", "EDITOR"]) });
const passwordInput = z.object({ email: z.string().trim().email(), password: z.string().min(12) });

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekli." }, { status: 403 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bilgileri kontrol edin." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: "Bu e-posta zaten kayıtlı." }, { status: 409 });
  const { password, ...profile } = parsed.data;
  const user = await prisma.user.create({ data: { ...profile, email, passwordHash: await bcrypt.hash(password, 12) }, select: { id: true, name: true, email: true, role: true, active: true } });
  return NextResponse.json({ user }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Bu işlem için yönetici yetkisi gerekli." }, { status: 403 });
  const parsed = passwordInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bilgileri kontrol edin." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) } });
  return NextResponse.json({ updated: true });
}

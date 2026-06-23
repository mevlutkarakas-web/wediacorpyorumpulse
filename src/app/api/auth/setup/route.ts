import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

const input = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bilgileri kontrol edin; parola en az 8 karakter olmalı." }, { status: 400 });
  if (await prisma.user.count()) return NextResponse.json({ error: "İlk yönetici zaten oluşturulmuş." }, { status: 409 });
  const user = await prisma.user.create({
    data: { ...parsed.data, email: parsed.data.email.toLowerCase(), passwordHash: await bcrypt.hash(parsed.data.password, 12), role: "ADMIN" },
  });
  const token = await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
  const response = NextResponse.json({ ok: true }, { status: 201 });
  response.cookies.set("session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 43200 });
  return response;
}

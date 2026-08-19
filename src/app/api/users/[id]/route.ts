import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserAdminError, assertAdminRemains, assertNotSelf, detachUserFromChannels, normalizeEmail, roleChannelReset } from "@/lib/user-admin";

const input = z
  .object({
    name: z.string().trim().min(2),
    email: z.string().trim().email(),
    role: z.enum(["ADMIN", "MANAGER", "EDITOR"]),
    active: z.boolean(),
    password: z.string().min(8),
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, "Güncellenecek alan yok.");

function fail(error: unknown) {
  if (error instanceof UserAdminError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("user_admin_failed", error);
  return NextResponse.json({ error: "İşlem tamamlanamadı." }, { status: 500 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Bu işlem için admin yetkisi gerekli." }, { status: 403 });
  const parsed = input.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bilgileri kontrol edin." }, { status: 400 });
  const { id } = await params;
  const { name, role, active, password } = parsed.data;
  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : undefined;

  try {
    const user = await prisma.$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { id }, select: { id: true, email: true, role: true, active: true } });
      if (!existing) throw new UserAdminError("Kullanıcı bulunamadı.", 404);

      if (role !== undefined && role !== existing.role) {
        assertNotSelf(session.sub, id, "rol değişikliği");
        await assertAdminRemains(tx, id);
      }
      if (active !== undefined && active !== existing.active) {
        assertNotSelf(session.sub, id, "aktiflik değişikliği");
        if (!active) await assertAdminRemains(tx, id);
      }
      if (email && email !== existing.email) {
        const clash = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (clash) throw new UserAdminError("Bu e-posta başka bir hesapta kayıtlı.", 409);
      }

      // Rol değişince artık geçersiz kalan kanal bağları koparılır.
      const clearedChannels = role !== undefined && role !== existing.role ? await roleChannelReset(tx, id, role) : 0;
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(email ? { email } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        },
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      // İsim değiştiyse kanallardaki denormalize kopyalar da güncellenir.
      if (name !== undefined) {
        await tx.channel.updateMany({ where: { responsibleId: id }, data: { responsibleName: updated.name } });
        await tx.channel.updateMany({ where: { teamLeadId: id }, data: { teamLeadName: updated.name } });
      }
      return { ...updated, clearedChannels };
    });
    return NextResponse.json({ user });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Bu işlem için admin yetkisi gerekli." }, { status: 403 });
  const { id } = await params;
  try {
    assertNotSelf(session.sub, id, "silme");
    await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, _count: { select: { createdTasks: true } } } });
      if (!user) throw new UserAdminError("Kullanıcı bulunamadı.", 404);
      await assertAdminRemains(tx, id);
      // Task.createdById zorunlu ilişki (onDelete: Restrict) — görev oluşturmuş hesap silinemez.
      if (user._count.createdTasks > 0) {
        throw new UserAdminError(`Bu hesap ${user._count.createdTasks} görev oluşturmuş, silinemez. Bunun yerine pasife alın.`, 409);
      }
      await detachUserFromChannels(tx, id);
      await tx.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.comment.updateMany({ where: { completedById: id }, data: { completedById: null } });
      await tx.aiSettings.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
      await tx.user.delete({ where: { id } }); // AlertRead cascade ile gider
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}

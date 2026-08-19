import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient;

/** Rotaların tek tip HTTP yanıtı üretebilmesi için durum kodunu taşıyan hata. */
export class UserAdminError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UserAdminError";
  }
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function assertNotSelf(sessionUserId: string, targetId: string, action: string) {
  if (sessionUserId === targetId) throw new UserAdminError(`Kendi hesabınız üzerinde ${action} işlemi yapamazsınız.`, 400);
}

/** Hedef son aktif admin ise yetkisinin düşürülmesini/pasife alınmasını/silinmesini engeller. */
export async function assertAdminRemains(tx: Tx, targetId: string) {
  const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true, active: true } });
  if (target?.role !== "ADMIN" || !target.active) return;
  const others = await tx.user.count({ where: { role: "ADMIN", active: true, id: { not: targetId } } });
  if (others === 0) throw new UserAdminError("Sistemdeki son aktif admin hesabı kaldırılamaz.", 409);
}

/** responsibleId/teamLeadId ile birlikte denormalize isim kopyalarını da temizler. */
export async function detachUserFromChannels(tx: Tx, userId: string) {
  const lead = await tx.channel.updateMany({ where: { teamLeadId: userId }, data: { teamLeadId: null, teamLeadName: null } });
  const responsible = await tx.channel.updateMany({ where: { responsibleId: userId }, data: { responsibleId: null, responsibleName: null } });
  return lead.count + responsible.count;
}

/**
 * Rol değişince artık geçersiz olan kanal bağını koparır: MANAGER teamLead, EDITOR responsible
 * ilişkisini kullanır; ADMIN'e ise /api/users/[id]/channels kanal atamayı reddettiği için ikisi de
 * temizlenir (aksi halde UI'dan geri alınamayan bağlar kalırdı). Kopan bağ sayısını döndürür.
 */
export async function roleChannelReset(tx: Tx, userId: string, newRole: Role) {
  let cleared = 0;
  if (newRole !== "MANAGER") {
    const lead = await tx.channel.updateMany({ where: { teamLeadId: userId }, data: { teamLeadId: null, teamLeadName: null } });
    cleared += lead.count;
  }
  if (newRole !== "EDITOR") {
    const responsible = await tx.channel.updateMany({ where: { responsibleId: userId }, data: { responsibleId: null, responsibleName: null } });
    cleared += responsible.count;
  }
  return cleared;
}

/** Rol değişikliğinin kaç kanal bağını koparacağını önceden gösterir (onay ekranı için). */
export function roleResetImpact(role: Role, counts: { assignedChannels: number; ledChannels: number }) {
  return (role !== "MANAGER" ? counts.ledChannels : 0) + (role !== "EDITOR" ? counts.assignedChannels : 0);
}

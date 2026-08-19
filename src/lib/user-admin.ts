import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { slug } from "./team-sync";

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

/** Kişi adının ilk kelimesi — mükerrer hesap tespitinin anahtarı ("Görkem" ≈ "Görkem Durumlu"). */
export function firstNameKey(name: string) {
  return slug(name.split(/[\s/]+/)[0] || name);
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

export type MergeResult = Awaited<ReturnType<typeof mergeUsers>>;

/**
 * Kaynak hesabın tüm izlerini hedefe taşır, kaynağı pasife alır (geçmiş kaybolmasın diye silmez).
 * Kanal bağları hedefin rolüne göre taşınır; hedefin rolüne uymayan bağ koparılır.
 */
export async function mergeUsers(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new UserAdminError("Kaynak ve hedef hesap aynı olamaz.", 400);
  return prisma.$transaction(
    async tx => {
      const source = await tx.user.findUnique({ where: { id: sourceId }, select: { id: true, name: true, email: true } });
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, name: true, email: true, role: true } });
      if (!source) throw new UserAdminError("Kaynak hesap bulunamadı.", 404);
      if (!target) throw new UserAdminError("Hedef hesap bulunamadı.", 404);
      await assertAdminRemains(tx, sourceId);

      // Kanallar: hedefin rolüne uyan ilişki taşınır, uymayan koparılır.
      let movedChannels = 0;
      let detachedChannels = 0;
      if (target.role === "EDITOR") {
        movedChannels = (await tx.channel.updateMany({ where: { responsibleId: sourceId }, data: { responsibleId: targetId, responsibleName: target.name } })).count;
        detachedChannels = (await tx.channel.updateMany({ where: { teamLeadId: sourceId }, data: { teamLeadId: null, teamLeadName: null } })).count;
      } else if (target.role === "MANAGER") {
        movedChannels = (await tx.channel.updateMany({ where: { teamLeadId: sourceId }, data: { teamLeadId: targetId, teamLeadName: target.name } })).count;
        detachedChannels = (await tx.channel.updateMany({ where: { responsibleId: sourceId }, data: { responsibleId: null, responsibleName: null } })).count;
      } else {
        detachedChannels = await detachUserFromChannels(tx, sourceId);
      }

      const assignedTasks = (await tx.task.updateMany({ where: { assigneeId: sourceId }, data: { assigneeId: targetId } })).count;
      const createdTasks = (await tx.task.updateMany({ where: { createdById: sourceId }, data: { createdById: targetId } })).count;
      // Comment.completedById ilişki değil düz bir alan; dashboard liderlik tablosu bunu okuyor.
      const completedComments = (await tx.comment.updateMany({ where: { completedById: sourceId }, data: { completedById: targetId } })).count;
      await tx.aiSettings.updateMany({ where: { updatedById: sourceId }, data: { updatedById: targetId } });

      // AlertRead bileşik PK'lı (alertId+userId); iki hesabın ortak okuduğu kayıtlar çakışır,
      // önce kaynaktaki çakışan satırlar silinir. Liste 2000+ satıra çıkabildiği için ham SQL.
      await tx.$executeRaw`DELETE FROM "AlertRead" AS a WHERE a."userId" = ${sourceId} AND EXISTS (SELECT 1 FROM "AlertRead" b WHERE b."alertId" = a."alertId" AND b."userId" = ${targetId})`;
      const alertReads = await tx.$executeRaw`UPDATE "AlertRead" SET "userId" = ${targetId} WHERE "userId" = ${sourceId}`;

      await tx.user.update({ where: { id: sourceId }, data: { active: false } });
      return { source, target, movedChannels, detachedChannels, assignedTasks, createdTasks, completedComments, alertReads };
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}

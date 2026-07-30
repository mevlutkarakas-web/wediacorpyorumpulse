import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// Worker, web'den farklı bir havuz boyutuna ihtiyaç duyar: eşzamanlı işler + heartbeat +
// süpürücü + planlayıcı aynı istemciyi paylaşıyor. Varsayılan havuz (cpu*2+1) küçük bir
// makinede WORKER_CONCURRENCY'nin altında kalıp P2024'e yol açıyordu.
// WORKER_DATABASE_URL tanımlıysa (yalnızca worker ortamında) onu kullan.
const url = process.env.WORKER_DATABASE_URL?.trim() || process.env.DATABASE_URL;
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ ...(url ? { datasources: { db: { url } } } : {}), log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

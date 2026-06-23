import { TeamManager } from "@/components/team-manager";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function TeamPage() {
  const session = await getSession();
  const [users, channels] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, active: true, assignedChannels: { select: { id: true } }, ledChannels: { select: { id: true } } } }),
    prisma.channel.findMany({ orderBy: [{ name: "asc" }, { versionChannel: "asc" }], select: { id: true, name: true, versionChannel: true, category: true, responsibleId: true, teamLeadId: true } }),
  ]);
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><h1 className="text-3xl font-black">Ekip Yönetimi</h1><p className="mt-1 text-sm text-slate-500">Ekip liderlerini ve kanal yöneticilerini ayırın; kanalları her hesaba tek tek atayın.</p></div><TeamManager users={users} channels={channels} canManage={session?.role === "ADMIN"}/></div>;
}

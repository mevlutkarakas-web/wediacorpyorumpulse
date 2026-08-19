import { Suspense } from "react";
import { TeamManager } from "@/components/team-manager";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";

const userSelect = { id: true, name: true, email: true, role: true, active: true, assignedChannels: { select: { id: true } }, ledChannels: { select: { id: true } } } as const;

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ leadersPage?: string; managersPage?: string }> }) {
  const session = await getSession();
  if(session?.role!=="ADMIN")redirect("/");
  const { leadersPage: rawLeadersPage, managersPage: rawManagersPage } = await searchParams;
  const [leadersTotal, managersTotal] = await Promise.all([
    prisma.user.count({ where: { role: "MANAGER" } }),
    prisma.user.count({ where: { role: "EDITOR" } }),
  ]);
  const leadersPagination = paginate(parsePage(rawLeadersPage), PAGE_SIZE.TEAM_USERS, leadersTotal);
  const managersPagination = paginate(parsePage(rawManagersPage), PAGE_SIZE.TEAM_USERS, managersTotal);
  const [leaders, managers, channels] = await Promise.all([
    prisma.user.findMany({ where: { role: "MANAGER" }, orderBy: { name: "asc" }, skip: leadersPagination.skip, take: leadersPagination.take, select: userSelect }),
    prisma.user.findMany({ where: { role: "EDITOR" }, orderBy: { name: "asc" }, skip: managersPagination.skip, take: managersPagination.take, select: userSelect }),
    prisma.channel.findMany({ orderBy: [{ name: "asc" }, { versionChannel: "asc" }], take: 1000, select: { id: true, name: true, versionChannel: true, category: true, responsibleId: true, teamLeadId: true } }),
  ]);
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><h1 className="text-3xl font-black">Ekip Yönetimi</h1><p className="mt-1 text-sm text-slate-500">Ekip liderlerini ve kanal yöneticilerini ayırın; kanalları her hesaba tek tek atayın.</p></div><Suspense><TeamManager
    leaders={{ users: leaders, ...leadersPagination }}
    managers={{ users: managers, ...managersPagination }}
    channels={channels}
    canManage={session?.role === "ADMIN"}
  /></Suspense></div>;
}

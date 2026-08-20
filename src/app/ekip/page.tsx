import { Suspense } from "react";
import { TeamManager } from "@/components/team-manager";
import { TeamLeadBoard } from "@/components/team-lead-board";
import { allow, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";

const userSelect = { id: true, name: true, email: true, role: true, active: true, assignedChannels: { select: { id: true } }, ledChannels: { select: { id: true } } } as const;
const PERFORMANCE_DAYS = 30;

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ leadersPage?: string; managersPage?: string }> }) {
  const session = await getSession();
  if (!allow(session, ["ADMIN", "MANAGER"])) redirect("/");

  // Ekip lideri kendi ekibini görür; admin tüm ekip yapısını.
  if (session!.role === "MANAGER") return <TeamLeadView leadId={session!.sub} />;

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
    canManage
  /></Suspense></div>;
}

async function TeamLeadView({ leadId }: { leadId: string }) {
  const myChannels = await prisma.channel.findMany({
    where: { teamLeadId: leadId },
    orderBy: [{ name: "asc" }, { versionChannel: "asc" }],
    select: { id: true, name: true, versionChannel: true, category: true, responsibleId: true, responsibleName: true },
  });
  const myChannelIds = myChannels.map(channel => channel.id);
  const since = new Date(Date.now() - PERFORMANCE_DAYS * 86_400_000);

  // Ekip = kanallarımı taşıyanlar; ayrıca kanal verilebilecek diğer aktif kanal
  // yöneticileri de listelenir, yoksa birini boşaltan lider onu geri ekleyemezdi.
  const [members, openTaskGroups, completedGroups] = await Promise.all([
    prisma.user.findMany({ where: { OR: [{ id: leadId }, { role: "EDITOR", active: true }] }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, email: true, role: true, active: true } }),
    myChannelIds.length ? prisma.task.groupBy({ by: ["assigneeId"], where: { channelId: { in: myChannelIds }, status: { notIn: ["DONE", "CANCELLED"] } }, _count: true }) : [],
    myChannelIds.length ? prisma.comment.groupBy({ by: ["completedById"], where: { video: { channelId: { in: myChannelIds } }, completed: true, completedAt: { gte: since } }, _count: true }) : [],
  ]);
  const openTasks = new Map(openTaskGroups.map(row => [row.assigneeId, row._count]));
  const completed = new Map(completedGroups.map(row => [row.completedById, row._count]));

  const team = members.map(member => ({
    ...member,
    isSelf: member.id === leadId,
    channelCount: myChannels.filter(channel => channel.responsibleId === member.id).length,
    openTasks: openTasks.get(member.id) || 0,
    completedComments: completed.get(member.id) || 0,
  }));

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <div>
      <h1 className="text-3xl font-black">Ekibim</h1>
      <p className="mt-1 text-sm text-slate-500">Liderliğini yaptığınız kanalları ekibinize dağıtın; kimin ne kadar yük taşıdığını görün.</p>
    </div>
    <Suspense><TeamLeadBoard channels={myChannels} team={team} performanceDays={PERFORMANCE_DAYS}/></Suspense>
  </div>;
}

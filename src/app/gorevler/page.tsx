import { Suspense } from "react";
import { TaskBoard } from "@/components/task-board";
import { allow, channelAccessWhere, getSession, taskAccessWhere, teamScopeWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TASK_COLUMNS } from "@/lib/task-columns";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const session = await getSession();
  const scope = taskAccessWhere(session);
  // Sahipsiz görevler panelde görünmüyordu; 300'den fazlası kimseye atanmamış durumdaydı.
  const assignment = params.atama === "bana" || params.atama === "yok" ? params.atama : "tumu";
  const assignmentWhere = assignment === "bana" ? { assigneeId: session?.sub } : assignment === "yok" ? { assigneeId: null } : {};
  const [mineCount, unassignedCount, allCount] = await Promise.all([
    prisma.task.count({ where: { AND: [scope, { assigneeId: session?.sub }, { status: { notIn: ["DONE", "CANCELLED"] } }] } }),
    prisma.task.count({ where: { AND: [scope, { assigneeId: null }, { status: { notIn: ["DONE", "CANCELLED"] } }] } }),
    prisma.task.count({ where: { AND: [scope, { status: { notIn: ["DONE", "CANCELLED"] } }] } }),
  ]);
  const canManage = allow(session, ["ADMIN", "MANAGER"]);
  // Görev oluşturma/atama seçenekleri yalnızca yetkili için çekilir.
  const [channels, teamMembers] = canManage
    ? await Promise.all([
        prisma.channel.findMany({ where: channelAccessWhere(session), orderBy: [{ name: "asc" }], take: 1000, select: { id: true, name: true, versionChannel: true } }),
        prisma.user.findMany({ where: teamScopeWhere(session), orderBy: { name: "asc" }, take: 200, select: { id: true, name: true } }),
      ])
    : [[], []];
  const columns = await Promise.all(
    TASK_COLUMNS.map(async (col) => {
      const where = { AND: [scope, assignmentWhere, { status: col.status }] };
      const totalCount = await prisma.task.count({ where });
      const { skip, take, page, totalPages } = paginate(parsePage(params[col.param]), PAGE_SIZE.TASKS, totalCount);
      const tasks = await prisma.task.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip,
        take,
        include: {
          assignee: { select: { name: true } },
          channel: { select: { name: true, versionChannel: true } },
          comment: { select: { platform: true, permalinkUrl: true, video: { select: { title: true, permalinkUrl: true } } } },
        },
      });
      return {
        status: col.status,
        label: col.label,
        param: col.param,
        page,
        totalPages,
        totalCount,
        tasks: tasks.map((task) => ({
          ...task,
          dueAt: task.dueAt?.toISOString() || null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        })),
      };
    }),
  );
  return (
    <Suspense>
      <TaskBoard columns={columns} canManage={canManage} channels={channels} teamMembers={teamMembers} assignment={assignment} counts={{ mine: mineCount, unassigned: unassignedCount, all: allCount }} />
    </Suspense>
  );
}

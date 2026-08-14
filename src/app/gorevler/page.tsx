import { Suspense } from "react";
import { TaskBoard } from "@/components/task-board";
import { getSession,taskAccessWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TASK_COLUMNS } from "@/lib/task-columns";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const session = await getSession();
  const scope = taskAccessWhere(session);
  const columns = await Promise.all(
    TASK_COLUMNS.map(async (col) => {
      const where = { AND: [scope, { status: col.status }] };
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
      <TaskBoard columns={columns} />
    </Suspense>
  );
}

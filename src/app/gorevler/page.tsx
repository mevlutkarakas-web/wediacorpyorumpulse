import { TaskBoard } from "@/components/task-board";
import { getSession,taskAccessWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function TasksPage(){
  const session=await getSession();
  const tasks=await prisma.task.findMany({where:taskAccessWhere(session),orderBy:[{priority:"desc"},{createdAt:"desc"}],include:{assignee:{select:{name:true}},channel:{select:{name:true,versionChannel:true}},comment:{select:{platform:true,permalinkUrl:true,video:{select:{title:true,permalinkUrl:true}}}}}});
  return <TaskBoard initialTasks={tasks.map(task=>({...task,dueAt:task.dueAt?.toISOString()||null,createdAt:task.createdAt.toISOString(),updatedAt:task.updatedAt.toISOString()}))}/>;
}

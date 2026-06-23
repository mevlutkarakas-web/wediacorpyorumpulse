import { AlertCenter } from "@/components/alert-center";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere,getSession } from "@/lib/auth";

export default async function NotificationsPage(){
  const session=await getSession();const alerts=await prisma.alert.findMany({where:{channel:channelAccessWhere(session)},take:200,orderBy:{createdAt:"desc"},select:{id:true,type:true,title:true,description:true,occurrenceCount:true,read:true,createdAt:true,channel:{select:{name:true,versionChannel:true}},video:{select:{title:true,permalinkUrl:true,platform:true}}}});
  return <div className="mx-auto max-w-[1200px] space-y-6"><div><h1 className="text-3xl font-black">Bildirimler</h1><p className="mt-1 text-sm text-slate-500">Yeni YouTube ve Facebook videoları ile yorum hareketleri.</p></div><AlertCenter initialAlerts={alerts.map(alert=>({...alert,createdAt:alert.createdAt.toISOString()}))}/></div>;
}

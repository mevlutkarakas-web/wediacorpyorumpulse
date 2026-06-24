import { AlertCenter } from "@/components/alert-center";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere,getSession } from "@/lib/auth";

export default async function NotificationsPage(){
  const session=await getSession();const alerts=await prisma.alert.findMany({where:{channel:channelAccessWhere(session)},take:200,orderBy:{createdAt:"desc"},select:{id:true,type:true,title:true,description:true,occurrenceCount:true,createdAt:true,reads:{where:{userId:session!.sub},select:{userId:true}},channel:{select:{name:true,versionChannel:true}},video:{select:{title:true,permalinkUrl:true,platform:true}}}});
  return <div className="mx-auto max-w-[1200px] space-y-6"><div><h1 className="text-3xl font-black">Bildirimler</h1><p className="mt-1 text-sm text-slate-500">Size özel yeni YouTube ve Facebook video ve yorum hareketleri.</p></div><AlertCenter initialAlerts={alerts.map(({reads,...alert})=>({...alert,read:reads.length>0,createdAt:alert.createdAt.toISOString()}))}/></div>;
}

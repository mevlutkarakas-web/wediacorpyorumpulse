import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AlertCenter } from "@/components/alert-center";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere,getSession } from "@/lib/auth";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

// Bildirim tipleri iki gruba ayrılır: video hareketleri ve yorum hareketleri.
const TYPE_FILTER: Record<string, Prisma.AlertWhereInput> = {
  video: { type: "NEW_VIDEO" },
  yorum: { type: { in: ["NEW_COMMENT", "NEW_COMMENTS"] } },
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string; durum?: string; tur?: string }> }){
  const session=await getSession();if(!session)redirect("/login");
  const { page: rawPage, durum: rawStatus, tur: rawType } = await searchParams;
  // Sayfanın işi okunmamışları göstermek; varsayılan o.
  const status = rawStatus === "tumu" ? "tumu" : "okunmamis";
  const type = rawType === "video" || rawType === "yorum" ? rawType : "tumu";
  const where: Prisma.AlertWhereInput = {
    AND: [
      { channel: channelAccessWhere(session) },
      status === "okunmamis" ? { reads: { none: { userId: session.sub } } } : {},
      TYPE_FILTER[type] || {},
    ],
  };
  const scope = { channel: channelAccessWhere(session) };
  const [totalCount, unreadCount, allCount] = await Promise.all([
    prisma.alert.count({ where }),
    prisma.alert.count({ where: { AND: [scope, { reads: { none: { userId: session.sub } } }] } }),
    prisma.alert.count({ where: scope }),
  ]);
  const { skip, take, page, totalPages } = paginate(parsePage(rawPage), PAGE_SIZE.ALERTS, totalCount);
  const alerts=await prisma.alert.findMany({where,skip,take,orderBy:{createdAt:"desc"},select:{id:true,type:true,title:true,description:true,occurrenceCount:true,createdAt:true,reads:{where:{userId:session.sub},select:{userId:true}},channel:{select:{name:true,versionChannel:true}},video:{select:{title:true,permalinkUrl:true,platform:true}},comment:{select:{permalinkUrl:true,externalId:true,platform:true}}}});
  return <div className="mx-auto max-w-[1200px] space-y-6"><div><h1 className="text-3xl font-black">Bildirimler</h1><p className="mt-1 text-sm text-slate-500">Size özel yeni YouTube ve Facebook video ve yorum hareketleri.</p></div><Suspense><AlertCenter
    initialAlerts={alerts.map(({reads,...alert})=>({...alert,read:reads.length>0,createdAt:alert.createdAt.toISOString()}))}
    page={page} totalPages={totalPages} totalCount={totalCount}
    filters={{ status, type }} counts={{ unread: unreadCount, all: allCount }}
  /></Suspense></div>;
}

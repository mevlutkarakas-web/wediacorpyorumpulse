import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { channelAccessWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input=z.object({ids:z.array(z.string()).optional(),all:z.boolean().optional()});

/** channelAccessWhere ile aynı kural, ham SQL karşılığı — "tümünü okundu" tek sorguda dönsün diye. */
function channelScopeSql(role:string,userId:string){
  if(role==="ADMIN")return Prisma.sql`TRUE`;
  if(role==="MANAGER")return Prisma.sql`(c."teamLeadId" = ${userId} OR c."responsibleId" = ${userId})`;
  return Prisma.sql`c."responsibleId" = ${userId}`;
}

export async function PATCH(req:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Yetkisiz."},{status:401});
  const parsed=input.safeParse(await req.json());
  if(!parsed.success)return NextResponse.json({error:"Geçersiz istek."},{status:400});

  if(parsed.data.all){
    // Uyarılar on binlere çıkabiliyor. id'leri uygulamaya çekip createMany etmek istek
    // süresini aşıyordu; tek INSERT ... SELECT ile hiçbir satır belleğe alınmadan yazılıyor.
    const updated=await prisma.$executeRaw`
      INSERT INTO "AlertRead" ("alertId","userId","readAt")
      SELECT a.id, ${session.sub}, now()
      FROM "Alert" a JOIN "Channel" c ON c.id = a."channelId"
      WHERE ${channelScopeSql(session.role,session.sub)}
      ON CONFLICT DO NOTHING`;
    return NextResponse.json({updated});
  }

  const scope={channel:channelAccessWhere(session)};
  const alerts=await prisma.alert.findMany({where:{AND:[scope,{id:{in:parsed.data.ids||[]}}]},select:{id:true}});
  const result=await prisma.alertRead.createMany({data:alerts.map(alert=>({alertId:alert.id,userId:session.sub})),skipDuplicates:true});
  return NextResponse.json({updated:result.count});
}

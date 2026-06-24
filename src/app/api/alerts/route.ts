import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { channelAccessWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input=z.object({ids:z.array(z.string()).optional(),all:z.boolean().optional()});

export async function PATCH(req:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Yetkisiz."},{status:401});
  const parsed=input.safeParse(await req.json());
  if(!parsed.success)return NextResponse.json({error:"Geçersiz istek."},{status:400});
  const scope={channel:channelAccessWhere(session)};
  const alerts=await prisma.alert.findMany({where:parsed.data.all?scope:{AND:[scope,{id:{in:parsed.data.ids||[]}}]},select:{id:true}});
  const result=await prisma.alertRead.createMany({data:alerts.map(alert=>({alertId:alert.id,userId:session.sub})),skipDuplicates:true});
  return NextResponse.json({updated:result.count});
}

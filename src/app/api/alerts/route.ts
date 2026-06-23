import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input=z.object({ids:z.array(z.string()).optional(),all:z.boolean().optional()});

export async function PATCH(req:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Yetkisiz."},{status:401});
  const parsed=input.safeParse(await req.json());
  if(!parsed.success)return NextResponse.json({error:"Geçersiz istek."},{status:400});
  const result=await prisma.alert.updateMany({where:parsed.data.all?{read:false}:{id:{in:parsed.data.ids||[]}},data:{read:true}});
  return NextResponse.json({updated:result.count});
}

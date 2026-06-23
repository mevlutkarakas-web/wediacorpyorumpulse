import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession,taskAccessWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const input=z.object({status:z.enum(["IN_PROGRESS","DONE"])});
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();if(!session)return NextResponse.json({error:"Yetkisiz."},{status:401});
  const parsed=input.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:"Geçersiz durum."},{status:400});
  const {id}=await params;const task=await prisma.task.findFirst({where:{AND:[{id},taskAccessWhere(session)]},select:{id:true}});if(!task)return NextResponse.json({error:"Görev bulunamadı."},{status:404});
  await prisma.task.update({where:{id},data:{status:parsed.data.status}});return NextResponse.json({status:parsed.data.status});
}

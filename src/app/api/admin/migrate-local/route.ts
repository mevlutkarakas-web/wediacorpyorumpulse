import { NextResponse } from "next/server";
import { allow, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const entities=new Set(["user","channel","video","comment","insight","alert","task","syncJob","apiQuotaUsage","reminderEmailLog"]);

export async function POST(req:Request){
  const session=await getSession();
  if(!allow(session,["ADMIN"]))return NextResponse.json({error:"Yetkisiz."},{status:403});
  const body=await req.json() as {action?:string;entity?:string;rows?:Record<string,unknown>[]};
  if(body.action==="reset"){
    await prisma.$transaction([
      prisma.reminderEmailLog.deleteMany(),prisma.apiQuotaUsage.deleteMany(),prisma.syncJob.deleteMany(),
      prisma.task.deleteMany(),prisma.alert.deleteMany(),prisma.insight.deleteMany(),prisma.comment.deleteMany(),
      prisma.video.deleteMany(),prisma.channel.deleteMany(),prisma.user.deleteMany(),
    ]);
    return NextResponse.json({reset:true});
  }
  if(body.action==="linkCommentParents"&&Array.isArray(body.rows)){
    await prisma.$transaction(body.rows.map(row=>prisma.comment.update({where:{id:String(row.id)},data:{parentId:String(row.parentId)}})));
    return NextResponse.json({linked:body.rows.length});
  }
  if(body.action!=="import"||!body.entity||!entities.has(body.entity)||!Array.isArray(body.rows))
    return NextResponse.json({error:"Geçersiz istek."},{status:400});
  const rows=body.rows.map(row=>{
    const next={...row};
    for(const key of ["subscriberCount","totalViewCount","viewCount","likeCount"]){
      if(typeof next[key]==="string")next[key]=BigInt(next[key] as string);
    }
    return next;
  });
  const result=await (prisma as unknown as Record<string,{createMany(args:{data:Record<string,unknown>[];skipDuplicates:boolean}):Promise<{count:number}>}>)[body.entity].createMany({data:rows,skipDuplicates:true});
  return NextResponse.json({entity:body.entity,imported:result.count});
}

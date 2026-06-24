import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
export type Session={sub:string,email:string,role:"ADMIN"|"MANAGER"|"EDITOR",name:string};
const secret=()=>new TextEncoder().encode(process.env.JWT_SECRET||"development-secret-change-this-now");
export async function createSession(session:Session){return new SignJWT(session).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(secret())}
export async function getSession(){const token=(await cookies()).get("session")?.value;if(!token)return null;try{const payload=(await jwtVerify(token,secret())).payload as unknown as Session;const user=await prisma.user.findUnique({where:{id:payload.sub},select:{email:true,name:true,role:true,active:true}});if(!user?.active)return null;return{sub:payload.sub,email:user.email,name:user.name,role:user.role}}catch{return null}}
export function allow(session:Session|null,roles:Session["role"][]){return !!session&&roles.includes(session.role)}

export function channelAccessWhere(session:Session|null):Prisma.ChannelWhereInput{
  if(!session)return {id:"__none__"};
  if(session.role==="ADMIN")return {};
  if(session.role==="MANAGER")return {OR:[{teamLeadId:session.sub},{responsibleId:session.sub}]};
  return {responsibleId:session.sub};
}

export function taskAccessWhere(session:Session|null):Prisma.TaskWhereInput{
  if(!session)return {id:"__none__"};
  if(session.role==="ADMIN")return {};
  if(session.role==="MANAGER")return {OR:[{assigneeId:session.sub},{channel:{OR:[{teamLeadId:session.sub},{responsibleId:session.sub}]}}]};
  return {OR:[{assigneeId:session.sub},{channel:{responsibleId:session.sub}}]};
}

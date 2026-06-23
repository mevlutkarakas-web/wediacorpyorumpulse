import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { ensureBootstrapAdmins } from "@/lib/bootstrap-admins";
import { prisma } from "@/lib/prisma";

const input=z.object({email:z.string().email(),password:z.string().min(8)});

export async function POST(req:Request){
  try{
    const parsed=input.safeParse(await req.json());
    if(!parsed.success)return NextResponse.json({error:"Geçersiz bilgiler."},{status:400});
    await ensureBootstrapAdmins();
    const user=await prisma.user.findUnique({where:{email:parsed.data.email.toLowerCase()}});
    if(!user||!user.active||!await bcrypt.compare(parsed.data.password,user.passwordHash))return NextResponse.json({error:"E-posta veya parola hatalı."},{status:401});
    const token=await createSession({sub:user.id,email:user.email,name:user.name,role:user.role});
    const response=NextResponse.json({user:{name:user.name,email:user.email,role:user.role}});
    response.cookies.set("session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:43200});
    return response;
  }catch(error){
    console.error("login_failed",error);
    return NextResponse.json({error:"Veritabanı bağlantısı kurulamadı. Vercel DATABASE_URL ve Prisma şemasını kontrol edin."},{status:503});
  }
}

import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

type BootstrapAdmin={name:string;email:string;password:string};

export async function ensureBootstrapAdmins(){
  const value=process.env.BOOTSTRAP_ADMINS_JSON?.trim();
  const raw=value && ((value.startsWith("'")&&value.endsWith("'"))||(value.startsWith('"')&&value.endsWith('"')))
    ? value.slice(1,-1)
    : value;
  if(!raw)return 0;
  let admins:BootstrapAdmin[];
  try{admins=JSON.parse(raw) as BootstrapAdmin[]}catch{throw new Error("BOOTSTRAP_ADMINS_JSON geçerli JSON değil.")}
  let created=0;
  for(const admin of admins){
    if(!admin.name||!admin.email||!admin.password||admin.password.length<12)continue;
    const email=admin.email.trim().toLowerCase();
    const existing=await prisma.user.findUnique({where:{email},select:{id:true}});
    if(existing)continue;
    await prisma.user.create({data:{name:admin.name.trim(),email,passwordHash:await bcrypt.hash(admin.password,12),role:"ADMIN",active:true}});
    created++;
  }
  return created;
}

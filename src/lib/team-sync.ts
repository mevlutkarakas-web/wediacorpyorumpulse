import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

function slug(value:string){return value.toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,".").replace(/^\.|\.$/g,"")}

export async function syncTeamAccountsFromChannels(){
  let emailMap:Record<string,string>={};
  const mapValue=process.env.TEAM_EMAIL_MAP_JSON?.trim()||"{}";
  const mapJson=((mapValue.startsWith("'")&&mapValue.endsWith("'"))||(mapValue.startsWith('"')&&mapValue.endsWith('"')))
    ? mapValue.slice(1,-1)
    : mapValue;
  try{emailMap=JSON.parse(mapJson) as Record<string,string>}catch{throw new Error("TEAM_EMAIL_MAP_JSON geçerli JSON değil.")}
  const defaultPassword=process.env.TEAM_DEFAULT_PASSWORD;
  const channels=await prisma.channel.findMany({select:{teamLeadName:true,responsibleName:true}});
  const leaderNames=new Set(channels.map(channel=>channel.teamLeadName).filter((name):name is string=>Boolean(name)));
  const names=[...new Set(channels.flatMap(channel=>[channel.teamLeadName,channel.responsibleName]).filter((name):name is string=>Boolean(name)))];
  let created=0,linked=0;
  for(const name of names){
    const mapped=emailMap[name]?.trim().toLowerCase();
    const email=mapped||`${slug(name)}@yorumpulse.local`;
    let user=await prisma.user.findFirst({where:{OR:[{email},{name}]},orderBy:{role:"asc"}});
    if(!user&&defaultPassword){
      user=await prisma.user.create({data:{name,email,passwordHash:await bcrypt.hash(defaultPassword,12),role:leaderNames.has(name)?"MANAGER":"EDITOR",active:true}});created++;
    }
    if(!user)continue;
    if(user.role!=="ADMIN"&&leaderNames.has(name)&&user.role!=="MANAGER")user=await prisma.user.update({where:{id:user.id},data:{role:"MANAGER"}});
    const [leaders,responsibles]=await Promise.all([
      prisma.channel.updateMany({where:{teamLeadName:name},data:{teamLeadId:user.id}}),
      prisma.channel.updateMany({where:{responsibleName:name},data:{responsibleId:user.id}}),
    ]);
    linked+=leaders.count+responsibles.count;
  }
  return {created,linked,accounts:names.length};
}

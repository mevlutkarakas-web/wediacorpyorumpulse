import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { channelAccessWhere,getSession,taskAccessWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import "./globals.css";

const inter=Inter({subsets:["latin"],variable:"--font-inter"});
export const metadata:Metadata={title:"YorumPulse Beta — Community OS",description:"YouTube ve Facebook kanal ve yorum yönetimi — Beta sürüm"};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const session=await getSession();
  const channelWhere=channelAccessWhere(session);const [channels,facebookChannels,comments,tasks,alerts]=session?await Promise.all([prisma.channel.count({where:channelWhere}),prisma.channel.count({where:{AND:[channelWhere,{facebookUrl:{not:null}}]}}),prisma.comment.count({where:{video:{channel:channelWhere}}}),prisma.task.count({where:{AND:[taskAccessWhere(session),{status:{not:"DONE"}}]}}),prisma.alert.count({where:{AND:[{channel:channelWhere},{read:false}]}})]):[0,0,0,0,0];
  return <html lang="tr" suppressHydrationWarning><body className={inter.className}><ThemeProvider><AppShell user={session?{name:session.name,role:session.role}:null} counts={{channels,facebookChannels,comments,tasks,alerts}}>{children}</AppShell><Toaster richColors position="top-right"/></ThemeProvider></body></html>;
}

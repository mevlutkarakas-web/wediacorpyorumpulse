import { CommentCenter } from "@/components/comment-center";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere,getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommentsPage() {
  const session=await getSession();const channelWhere=channelAccessWhere(session);const commentWhere={video:{channel:channelWhere}};
  const select={id:true,platform:true,externalId:true,permalinkUrl:true,completed:true,authorName:true,text:true,likeCount:true,publishedAt:true,kind:true,confidence:true,topic:true,aiSummary:true,suggestedReply:true,video:{select:{permalinkUrl:true,title:true,channel:{select:{name:true,category:true}}}}} as const;
  const [youtubeRows, facebookRows, total, analyzed] = await Promise.all([
    prisma.comment.findMany({where:{AND:[commentWhere,{platform:"YOUTUBE"}]},orderBy:{publishedAt:"desc"},take:2000,select}),
    prisma.comment.findMany({where:{AND:[commentWhere,{platform:"FACEBOOK"}]},orderBy:{publishedAt:"desc"},take:2000,select}),
    prisma.comment.count({where:commentWhere}),
    prisma.comment.count({ where: {AND:[commentWhere,{ analyzedAt: { not: null } }] } }),
  ]);
  const rows=[...youtubeRows,...facebookRows].sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime());
  const version=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)||"local";
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><h1 className="text-3xl font-black">Yorum Merkezi</h1><p className="mt-1 text-sm text-slate-500">{total.toLocaleString("tr-TR")} gerçek yorum · {analyzed.toLocaleString("tr-TR")} AI analizi tamamlandı · canlı sürüm {version}</p></div><CommentCenter comments={rows.map(row => ({ ...row, publishedAt: row.publishedAt.toISOString() }))}/></div>;
}

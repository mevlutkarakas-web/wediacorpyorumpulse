import { Suspense } from "react";
import { CommentCenter } from "@/components/comment-center";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere,getSession } from "@/lib/auth";
import { isPlatform } from "@/lib/platform";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ platform?: string; page?: string }> }) {
  const { platform: rawPlatform, page: rawPage } = await searchParams;
  const platform = isPlatform(rawPlatform) ? rawPlatform : "YOUTUBE";
  const session=await getSession();const channelWhere=channelAccessWhere(session);const commentWhere={video:{channel:channelWhere}};
  const platformWhere={AND:[commentWhere,{platform}]};
  const select={id:true,platform:true,externalId:true,permalinkUrl:true,completed:true,authorName:true,text:true,likeCount:true,publishedAt:true,kind:true,confidence:true,topic:true,aiSummary:true,suggestedReply:true,video:{select:{permalinkUrl:true,title:true,channel:{select:{name:true,category:true}}}}} as const;
  const [youtubeTotal, facebookTotal, analyzed, kindRows] = await Promise.all([
    prisma.comment.count({where:{AND:[commentWhere,{platform:"YOUTUBE"}]}}),
    prisma.comment.count({where:{AND:[commentWhere,{platform:"FACEBOOK"}]}}),
    prisma.comment.count({ where: {AND:[commentWhere,{ analyzedAt: { not: null } }] } }),
    prisma.comment.groupBy({by:["kind"],where:platformWhere,_count:true}),
  ]);
  const totalCount = platform === "FACEBOOK" ? facebookTotal : youtubeTotal;
  const { skip, take, page, totalPages } = paginate(parsePage(rawPage), PAGE_SIZE.COMMENTS, totalCount);
  const rows = await prisma.comment.findMany({where:platformWhere,orderBy:{publishedAt:"desc"},skip,take,select});
  const kindCounts = Object.fromEntries(kindRows.map(row => [row.kind, row._count]));
  const total = youtubeTotal + facebookTotal;
  const version=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)||"local";
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><h1 className="text-3xl font-black">Yorum Merkezi</h1><p className="mt-1 text-sm text-slate-500">{total.toLocaleString("tr-TR")} gerçek yorum · {analyzed.toLocaleString("tr-TR")} AI analizi tamamlandı · canlı sürüm {version}</p></div><Suspense><CommentCenter
    comments={rows.map(row => ({ ...row, publishedAt: row.publishedAt.toISOString() }))}
    platform={platform}
    youtubeTotal={youtubeTotal}
    facebookTotal={facebookTotal}
    kindCounts={kindCounts}
    page={page}
    totalPages={totalPages}
    totalCount={totalCount}
  /></Suspense></div>;
}

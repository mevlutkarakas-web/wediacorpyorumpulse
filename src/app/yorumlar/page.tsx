import { CommentCenter } from "@/components/comment-center";
import { prisma } from "@/lib/prisma";

export default async function CommentsPage() {
  const [rows, total, analyzed] = await Promise.all([
    prisma.comment.findMany({ orderBy: { publishedAt: "desc" }, select: { id: true, platform: true, permalinkUrl: true, authorName: true, text: true, likeCount: true, publishedAt: true, kind: true, confidence: true, topic: true, aiSummary: true, suggestedReply: true, video: { select: { permalinkUrl: true, title: true, channel: { select: { name: true, category: true } } } } } }),
    prisma.comment.count(),
    prisma.comment.count({ where: { analyzedAt: { not: null } } }),
  ]);
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><h1 className="text-3xl font-black">Yorum Merkezi</h1><p className="mt-1 text-sm text-slate-500">{total.toLocaleString("tr-TR")} gerçek yorum · {analyzed.toLocaleString("tr-TR")} AI analizi tamamlandı</p></div><CommentCenter comments={rows.map(row => ({ ...row, publishedAt: row.publishedAt.toISOString() }))}/></div>;
}

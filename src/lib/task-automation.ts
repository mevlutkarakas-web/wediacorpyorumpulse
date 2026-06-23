import { prisma } from "./prisma";

const actionableKinds = new Set(["QUESTION", "COMPLAINT", "SUGGESTION"]);

export async function createAutomaticTasks(commentIds: string[]) {
  if (!commentIds.length) return { replies: 0, engagement: 0 };
  const creator = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (!creator) return { replies: 0, engagement: 0 };
  const [comments, existingTasks] = await Promise.all([
    prisma.comment.findMany({ where: { id: { in: commentIds }, analyzedAt: { not: null } }, select: { id: true, platform: true, kind: true, confidence: true, likeCount: true, text: true, suggestedReply: true, permalinkUrl: true, video: { select: { title: true, permalinkUrl: true, channel: { select: { id: true, name: true, responsibleId: true } } } } } }),
    prisma.task.findMany({ where: { commentId: { in: commentIds }, status: { not: "CANCELLED" } }, select: { commentId: true } }),
  ]);
  const existingCommentIds = new Set(existingTasks.map(task => task.commentId));
  const actionable = comments.filter(comment => !existingCommentIds.has(comment.id) && (actionableKinds.has(comment.kind) || (comment.kind === "NEGATIVE" && (comment.confidence || 0) >= 0.7) || (comment.kind === "POSITIVE" && comment.likeCount >= 5)));
  if (actionable.length) await prisma.task.createMany({ data: actionable.map(comment => {
    const platform = comment.platform === "FACEBOOK" ? "Facebook" : "YouTube";
    const link = comment.permalinkUrl || comment.video.permalinkUrl;
    const urgent = comment.kind === "COMPLAINT" || comment.kind === "NEGATIVE";
    return { title: `${platform} yorumuna cevap ver · ${comment.video.channel.name}`, description: [`Video: ${comment.video.title}`, `Yorum: ${comment.text.slice(0, 500)}`, comment.suggestedReply ? `Önerilen cevap: ${comment.suggestedReply}` : null, link ? `Bağlantı: ${link}` : null].filter(Boolean).join("\n"), priority: urgent ? "HIGH" as const : "MEDIUM" as const, channelId: comment.video.channel.id, commentId: comment.id, assigneeId: comment.video.channel.responsibleId, createdById: creator.id, dueAt: new Date(Date.now() + (urgent ? 24 : 48) * 60 * 60 * 1000) };
  }) });

  let engagement = 0;
  const channelIds = [...new Set(comments.map(comment => comment.video.channel.id))];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const channelId of channelIds) {
    const count = await prisma.comment.count({ where: { video: { channelId }, publishedAt: { gte: since } } });
    if (count < 20) continue;
    const channel = comments.find(comment => comment.video.channel.id === channelId)!.video.channel;
    const exists = await prisma.task.findFirst({ where: { channelId, title: { startsWith: "Yoğun ilgi:" }, createdAt: { gte: since }, status: { in: ["TODO", "IN_PROGRESS"] } }, select: { id: true } });
    if (exists) continue;
    await prisma.task.create({ data: { title: `Yoğun ilgi: ${channel.name} topluluğuyla iletişim kur`, description: `Bu kanal son 24 saatte ${count} yorum aldı. YouTube ve Facebook yorumlarını gözden geçirip toplulukla aktif iletişim kurun.`, priority: count >= 50 ? "HIGH" : "MEDIUM", channelId, assigneeId: channel.responsibleId, createdById: creator.id, dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    engagement++;
  }
  return { replies: actionable.length, engagement };
}

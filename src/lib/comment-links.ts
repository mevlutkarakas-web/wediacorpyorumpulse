export function directCommentUrl(input: {
  platform: "YOUTUBE" | "FACEBOOK";
  externalId: string | null;
  permalinkUrl: string | null;
  videoUrl: string | null;
}) {
  if (input.platform === "YOUTUBE") {
    if (input.videoUrl && input.externalId) {
      const url = new URL(input.videoUrl);
      url.searchParams.set("lc", input.externalId);
      return url.toString();
    }
    return input.permalinkUrl || input.videoUrl;
  }

  // Facebook: profil linkleri de izleme parametresi olarak comment_id taşıyabilir,
  // bu yüzden permalink yalnızca bir içerik URL'iyse (video/watch/reel/post) kabul edilir.
  const isContentUrl = (url: URL) =>
    /\/(videos?\/|watch|reel\/|posts\/|permalink\.php|story\.php)/.test(url.pathname) ||
    url.searchParams.has("v");
  let salvagedCommentId: string | null = null;
  if (input.permalinkUrl) {
    try {
      const url = new URL(input.permalinkUrl);
      if (isContentUrl(url) && (url.searchParams.has("comment_id") || url.pathname.includes("/comments/")))
        return url.toString();
      salvagedCommentId = url.searchParams.get("comment_id");
    } catch {}
  }
  if (!input.videoUrl) return null;
  const externalId = input.externalId;
  const commentId =
    salvagedCommentId ||
    (externalId && !externalId.startsWith("fbc_") ? externalId.split("_").at(-1) || externalId : null);
  if (!commentId) return null;
  try {
    const url = new URL(input.videoUrl);
    url.searchParams.set("comment_id", commentId);
    return url.toString();
  } catch {
    return null;
  }
}

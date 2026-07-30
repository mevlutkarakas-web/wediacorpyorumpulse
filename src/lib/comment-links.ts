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
  // comment_id parametresi bazen base64 kodlu gelir: "comment:<postId>_<yorumId>".
  // Facebook yalnızca sayısal yorum kimliğini tanır, bu yüzden çözülüp son parça alınır.
  const decodeCommentIdParam = (value: string | null) => {
    if (!value) return null;
    if (/^\d+(_\d+)*$/.test(value)) return value.split("_").at(-1) || value;
    try {
      const decoded = atob(value);
      if (decoded.startsWith("comment:")) return decoded.match(/(\d+)$/)?.[1] || null;
    } catch {}
    return null;
  };
  const extractVideoId = (value: string | null) =>
    value?.match(/\/(?:videos|reel)\/(\d+)/)?.[1] || value?.match(/[?&]v=(\d+)/)?.[1] || null;
  let salvagedCommentId: string | null = null;
  let suppliedContentUrl: string | null = null;
  if (input.permalinkUrl) {
    try {
      const url = new URL(input.permalinkUrl);
      if (isContentUrl(url) && (url.searchParams.has("comment_id") || url.pathname.includes("/comments/")))
        suppliedContentUrl = url.toString();
      salvagedCommentId = decodeCommentIdParam(url.searchParams.get("comment_id"));
    } catch {}
  }
  const externalId = input.externalId;
  const commentId =
    salvagedCommentId ||
    (externalId && !externalId.startsWith("fbc_") ? externalId.split("_").at(-1) || externalId : null);
  // "/<sayfa>/videos/<id>?comment_id=..." adresi watch yüzeyine yönlendirilirken
  // comment_id düşürülüyor; Facebook'un kendi yorum linkleri /reel/ formatını kullanıyor.
  const videoId = extractVideoId(input.videoUrl) || extractVideoId(input.permalinkUrl);
  if (videoId && commentId)
    return `https://www.facebook.com/reel/${videoId}/?comment_id=${commentId}`;
  if (suppliedContentUrl) return suppliedContentUrl;
  if (!input.videoUrl || !commentId) return null;
  try {
    const url = new URL(input.videoUrl);
    url.searchParams.set("comment_id", commentId);
    return url.toString();
  } catch {
    return null;
  }
}

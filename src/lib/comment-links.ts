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

  const supplied = input.permalinkUrl;
  if (supplied) {
    try {
      const url = new URL(supplied);
      if (url.searchParams.has("comment_id") || url.pathname.includes("/comments/"))
        return url.toString();
    } catch {}
  }
  if (!input.videoUrl || !input.externalId) return null;
  const url = new URL(input.videoUrl);
  url.searchParams.set("comment_id", input.externalId.split("_").at(-1) || input.externalId);
  return url.toString();
}

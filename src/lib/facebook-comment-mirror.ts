import type { FacebookComment } from "./facebook";
import { logger } from "./logger";

export async function mirrorFacebookComments(
  videoExternalId: string,
  comments: FacebookComment[],
) {
  const endpoint = process.env.FACEBOOK_COMMENT_MIRROR_URL?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!endpoint || !secret || !comments.length) return;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ videoExternalId, comments }),
  });
  if (!response.ok) {
    const body = await response.text();
    logger.error("facebook_comment_mirror_failed", {
      status: response.status,
      videoExternalId,
      body: body.slice(0, 300),
    });
  }
}

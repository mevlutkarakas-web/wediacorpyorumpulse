import type { FacebookComment } from "./facebook";
import { logger } from "./logger";

let sessionCookie: string | undefined;

async function mirrorSession(endpoint: string) {
  if (sessionCookie) return sessionCookie;
  const email = process.env.FACEBOOK_COMMENT_MIRROR_EMAIL?.trim();
  const password = process.env.FACEBOOK_COMMENT_MIRROR_PASSWORD;
  if (!email || !password) return undefined;
  const response = await fetch(new URL("/api/auth/login", endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return undefined;
  sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
  return sessionCookie;
}

export async function mirrorFacebookComments(
  videoExternalId: string,
  comments: FacebookComment[],
) {
  const endpoint = process.env.FACEBOOK_COMMENT_MIRROR_URL?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!endpoint || !comments.length) return;
  const cookie = await mirrorSession(endpoint);
  if (!secret && !cookie) return;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({ videoExternalId, comments }),
  });
  if (response.status === 401 && cookie) {
    sessionCookie = undefined;
  }
  if (!response.ok) {
    const body = await response.text();
    logger.error("facebook_comment_mirror_failed", {
      status: response.status,
      videoExternalId,
      body: body.slice(0, 300),
    });
  }
}

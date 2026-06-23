import { logger } from "./logger";

const DEFAULT_VERSION = "v24.0";

export function hasFacebookApiToken() {
  return Boolean(process.env.FACEBOOK_ACCESS_TOKEN?.trim());
}

type GraphPage<T> = { data: T[]; paging?: { next?: string } };

function config() {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) throw new Error("FACEBOOK_ACCESS_TOKEN tanımlı değil.");
  return { token, version: process.env.FACEBOOK_GRAPH_API_VERSION || DEFAULT_VERSION };
}

async function request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { token, version } = config();
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
  Object.entries({ ...params, access_token: token }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    logger.error("facebook_api_error", { status: response.status, path, body: body.slice(0, 500) });
    throw new Error(`Facebook Graph API hatası (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function facebookPageIdentifier(input: string) {
  const url = new URL(input.startsWith("http") ? input : `https://facebook.com/${input}`);
  const profileId = url.searchParams.get("id");
  if (profileId && /^\d+$/.test(profileId)) return profileId;
  const first = url.pathname.split("/").filter(Boolean)[0];
  if (!first || ["pages", "watch", "reel", "videos"].includes(first.toLowerCase())) {
    throw new Error("Facebook sayfa bağlantısından kimlik çözülemedi.");
  }
  return first;
}

export async function resolveFacebookPage(input: string) {
  const identifier = facebookPageIdentifier(input);
  return request<{ id: string; name?: string }>(identifier, { fields: "id,name" });
}

export type FacebookVideo = {
  id: string;
  title?: string;
  description?: string;
  created_time: string;
  permalink_url?: string;
  picture?: string;
  views?: number;
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
};

export async function fetchFacebookVideos(pageId: string) {
  return request<GraphPage<FacebookVideo>>(`${pageId}/videos`, {
    fields: "id,title,description,created_time,permalink_url,picture,views,likes.limit(0).summary(true),comments.limit(0).summary(true)",
    limit: "10",
  });
}

export type FacebookComment = {
  id: string;
  message?: string;
  from?: { id?: string; name?: string };
  created_time: string;
  like_count?: number;
  permalink_url?: string;
};

export async function fetchFacebookComments(videoId: string) {
  return request<GraphPage<FacebookComment>>(`${videoId}/comments`, {
    fields: "id,message,from,created_time,like_count,permalink_url",
    filter: "stream",
    order: "reverse_chronological",
    limit: "100",
  });
}

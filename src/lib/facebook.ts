import { logger } from "./logger";
import { ServiceHttpError } from "../worker/job-errors";

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
    let reason = "";
    try {
      reason = (JSON.parse(body) as { error?: { code?: number; message?: string } }).error?.message ?? "";
    } catch {}
    logger.error("facebook_api_error", { status: response.status, path, body: body.slice(0, 500) });
    throw new ServiceHttpError("facebook", response.status, reason);
  }
  return response.json() as Promise<T>;
}

// Sayfalama sınırsızdı: `paging.next` hiçbir üst sınır olmadan takip ediliyordu,
// yani tek bir iş yapısı gereği sınırsız sürebiliyordu.
const MAX_GRAPH_PAGES = Math.max(1, Number(process.env.FACEBOOK_MAX_GRAPH_PAGES || 20));

async function requestAllPages<T>(
  path: string,
  params: Record<string, string> = {},
  maxPages = MAX_GRAPH_PAGES,
) {
  const first = await request<GraphPage<T>>(path, params);
  const data = [...first.data];
  let next = first.paging?.next;
  const visited = new Set<string>();
  let pages = 1;

  while (next && !visited.has(next) && pages < maxPages) {
    visited.add(next);
    pages++;
    const response = await fetch(next, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.text();
      logger.error("facebook_api_paging_error", {
        status: response.status,
        path,
        body: body.slice(0, 500),
      });
      throw new ServiceHttpError("facebook", response.status);
    }
    const page = (await response.json()) as GraphPage<T>;
    data.push(...page.data);
    next = page.paging?.next;
  }
  if (next && pages >= maxPages)
    logger.warn("facebook_paging_truncated", { path, pages, maxPages });

  return { data };
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
  return requestAllPages<FacebookVideo>(`${pageId}/videos`, {
    fields: "id,title,description,created_time,permalink_url,picture,views,likes.limit(0).summary(true),comments.limit(0).summary(true)",
    limit: "100",
  });
}

export type FacebookComment = {
  id: string;
  message?: string;
  from?: { id?: string; name?: string };
  created_time: string;
  // Graph API tarihleri kesindir (alan tanımsız kalır); scraper kesin tarih
  // okuyamadığında false işaretler ve mevcut kayıtların tarihi ezilmez.
  created_time_exact?: boolean;
  like_count?: number;
  permalink_url?: string;
};

// `since` (unix saniye) verilirse Graph yalnızca o tarihten sonrasını döner —
// API yolu açıldığında artımlı senkronu doğrudan mümkün kılar.
export async function fetchFacebookComments(videoId: string, since?: Date) {
  return requestAllPages<FacebookComment>(`${videoId}/comments`, {
    fields: "id,message,from,created_time,like_count,permalink_url",
    filter: "stream",
    order: "reverse_chronological",
    ...(since ? { since: String(Math.floor(since.getTime() / 1000)) } : {}),
    limit: "100",
  });
}

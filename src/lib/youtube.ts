import { prisma } from "./prisma";
import { logger } from "./logger";
import { ServiceHttpError } from "../worker/job-errors";
const BASE="https://www.googleapis.com/youtube/v3";
const QUOTA_LIMIT=Math.max(1,Number(process.env.YOUTUBE_QUOTA_LIMIT||10000));
// Google kotayı Pasifik saatiyle gece yarısı sıfırlıyor; UTC günü kullanmak 7-8 saat kayma yaratıyordu.
export function youtubeQuotaDay(now=new Date()){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);const get=(type:string)=>parts.find(part=>part.type===type)?.value??"01";return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`)}
export async function youtubeQuotaUsage(){const day=youtubeQuotaDay();const row=await prisma.apiQuotaUsage.findUnique({where:{service_day:{service:"youtube",day}}});return{used:row?.units??0,limit:row?.limit??QUOTA_LIMIT,day}}
// limit `update` dalında da yazılır; aksi halde günün ilk satırındaki değerde donuyordu.
async function quota(units:number){const day=youtubeQuotaDay();const row=await prisma.apiQuotaUsage.upsert({where:{service_day:{service:"youtube",day}},create:{service:"youtube",day,units,limit:QUOTA_LIMIT},update:{units:{increment:units},limit:QUOTA_LIMIT}});if(row.units>row.limit*0.95)throw new Error("YouTube günlük API kotası güvenlik sınırına ulaştı.")}
async function request<T>(path:string,params:Record<string,string>,units=1):Promise<T>{const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error("YOUTUBE_API_KEY tanımlı değil.");await quota(units);const url=new URL(`${BASE}/${path}`);Object.entries({...params,key}).forEach(([k,v])=>url.searchParams.set(k,v));const res=await fetch(url,{next:{revalidate:0}});if(!res.ok){const text=await res.text();
  // reason gövdede geliyor ve sınıflandırma için gerekli (quotaExceeded -> QUOTA,
  // commentsDisabled -> BENIGN). Eskiden loglanıp atılıyordu.
  let reason="";try{reason=(JSON.parse(text) as {error?:{errors?:{reason?:string}[]}}).error?.errors?.[0]?.reason??""}catch{}
  const retryAfter=Number(res.headers.get("retry-after")||0);
  logger.error("youtube_api_error",{status:res.status,path,reason,body:text.slice(0,300)});
  throw new ServiceHttpError("youtube",res.status,reason,retryAfter>0?retryAfter*1000:undefined)}return res.json() as Promise<T>}
export async function resolveChannelId(input:string){const url=new URL(input.startsWith("http")?input:`https://youtube.com/${input}`);const direct=url.pathname.match(/\/channel\/(UC[\w-]+)/)?.[1];if(direct)return direct;const handle=url.pathname.match(/\/@([^/]+)/)?.[1];if(handle){const r=await request<{items?:{id:string}[]}>("channels",{part:"id",forHandle:handle});return r.items?.[0]?.id}const username=url.pathname.match(/\/(?:user|c)\/([^/]+)/)?.[1];if(username){const r=await request<{items?:{id:string}[]}>("channels",{part:"id",forUsername:username});return r.items?.[0]?.id}throw new Error("YouTube kanal bağlantısından kanal kimliği çözülemedi.")}
export async function fetchChannel(channelId:string){return request<{items:{id:string,snippet:{title:string,description:string,thumbnails:{high:{url:string}}},statistics:{subscriberCount:string,viewCount:string,videoCount:string},contentDetails:{relatedPlaylists:{uploads:string}}}[]}>("channels",{part:"snippet,statistics,contentDetails",id:channelId})}
export async function fetchPlaylistVideos(playlistId:string,pageToken?:string){return request<{nextPageToken?:string,items:{snippet:{resourceId:{videoId:string},title:string,description:string,publishedAt:string,thumbnails?:{high?:{url:string}}}}[]}>("playlistItems",{part:"snippet",playlistId,maxResults:"50",...(pageToken?{pageToken}:{})})}
export async function fetchVideoStats(ids:string[]){return request<{items:{id:string,statistics:{viewCount?:string,likeCount?:string,commentCount?:string}}[]}>("videos",{part:"statistics",id:ids.join(",")})}
export async function fetchComments(videoId:string,pageToken?:string){return request<{nextPageToken?:string,items:{id:string,snippet:{topLevelComment:{id:string,snippet:{textDisplay:string,authorDisplayName:string,authorChannelId?:{value:string},likeCount:number,publishedAt:string,updatedAt:string}}}}[]}>("commentThreads",{part:"snippet",videoId,maxResults:"100",textFormat:"plainText",order:"time",...(pageToken?{pageToken}:{})})}

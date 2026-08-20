import { Suspense } from "react";
import { ChannelManager } from "@/components/channel-manager";
import { prisma } from "@/lib/prisma";
import { channelAccessWhere, getSession } from "@/lib/auth";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

// Portföy ayrımı kategori adındaki "tmc" ibaresine dayanıyor (mevcut kural).
const TMC: Prisma.ChannelWhereInput = { category: { contains: "tmc", mode: "insensitive" } };
const PORTFOLIO: Record<string, Prisma.ChannelWhereInput> = { TMC, OTHER: { NOT: TMC } };

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; portfoy?: string; sahip?: string }> }) {
  const { page: rawPage, q: rawQuery, portfoy: rawPortfolio, sahip: rawOwner } = await searchParams;
  const session = await getSession();
  const scope = channelAccessWhere(session);
  const query = (rawQuery || "").trim();
  const portfolio = rawPortfolio === "TMC" || rawPortfolio === "OTHER" ? rawPortfolio : "ALL";
  const unassignedOnly = rawOwner === "yok";

  // Filtreleme sunucuda: daha önce yalnızca açık olan sayfa dilimi süzülüyordu,
  // bu yüzden 1. sayfada olmayan bir kanal aramayla bulunamıyordu.
  // Taban kapsam: yetki + arama. Segment sayıları bunun üzerinden hesaplanır ki
  // "TMC (37)" gibi etiketler seçili segmentten bağımsız, gerçek toplamı göstersin.
  const base: Prisma.ChannelWhereInput = {
    AND: [
      scope,
      query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { versionChannel: { contains: query, mode: "insensitive" } }, { category: { contains: query, mode: "insensitive" } }] } : {},
    ],
  };
  const where: Prisma.ChannelWhereInput = {
    AND: [base, portfolio === "ALL" ? {} : PORTFOLIO[portfolio], unassignedOnly ? { responsibleId: null } : {}],
  };
  const [totalCount, allCount, tmcCount, unassignedCount] = await Promise.all([
    prisma.channel.count({ where }),
    prisma.channel.count({ where: base }),
    prisma.channel.count({ where: { AND: [base, TMC] } }),
    prisma.channel.count({ where: { AND: [base, { responsibleId: null }] } }),
  ]);
  const { skip, take, page, totalPages } = paginate(parsePage(rawPage), PAGE_SIZE.CHANNELS, totalCount);
  const rows = await prisma.channel.findMany({ where, orderBy: { name: "asc" }, skip, take, select: { id: true, name: true, youtubeUrl: true, category: true, responsibleName: true, responsibleId: true, status: true, subscriberCount: true, totalViewCount: true, commentCount: true } });
  const channels = rows.map(row => ({ ...row, subscriberCount: Number(row.subscriberCount), totalViewCount: Number(row.totalViewCount) }));
  return <div className="mx-auto max-w-[1600px] space-y-6"><div><h1 className="text-3xl font-black tracking-tight">Kanallar</h1><p className="mt-1 text-sm text-slate-500">YouTube ve Facebook portföyünüzü yönetin.</p></div><Suspense><ChannelManager
    channels={channels} canImport={session?.role==="ADMIN"}
    page={page} totalPages={totalPages} totalCount={totalCount}
    filters={{ q: query, portfolio, unassignedOnly }}
    counts={{ all: allCount, tmc: tmcCount, other: allCount - tmcCount, unassigned: unassignedCount }}
  /></Suspense></div>;
}

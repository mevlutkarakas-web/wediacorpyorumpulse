import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractChannelRows } from "@/lib/channel-import";
import { getSession } from "@/lib/auth";
import { syncTeamAccountsFromChannels } from "@/lib/team-sync";

export const runtime = "nodejs";

const Row = z.object({
  Kanal: z.coerce.string().trim().min(1),
  CMS: z.any().optional(),
  Kategori: z.any().optional(),
  "Versiyon Kanal": z.any().optional(),
  "Dublaj/Altyazı": z.any().optional(),
  "YouTube Link": z.any().optional(),
  UC: z.any().optional(),
  "Facebook Link": z.any().optional(),
  Sorumlu: z.any().optional(),
  "Ekip Lideri": z.any().optional(),
  "FB Sayfa Açıldı mı?": z.any().optional(),
  Instagram: z.any().optional(),
  TikTok: z.any().optional(),
  Dailymotion: z.any().optional(),
  Notlar: z.any().optional(),
  "Eski Sorumlu": z.any().optional(),
});

const text = (value: unknown) => value == null ? undefined : String(value).trim() || undefined;
const yes = (value: unknown) => value === true || /^(evet|yes|true|1|x)$/i.test(String(value ?? "").trim());

export async function POST(req: Request) {
  try {
    const session=await getSession();
    if(session?.role!=="ADMIN")return NextResponse.json({error:"Excel aktarımını yalnızca admin yapabilir."},{status:403});
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Dosya seçilmedi." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Dosya 15 MB sınırını aşıyor." }, { status: 413 });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer() as never);
    const raw = extractChannelRows(workbook);
    if (!raw.length) throw new Error("Başlıklar bulundu ancak aktarılabilecek kanal satırı yok.");

    const valid = raw.map((row, index) => {
      const parsed = Row.safeParse(row);
      if (!parsed.success) throw new Error(`${index + 1}. kanal kaydında Kanal alanı eksik.`);
      return parsed.data;
    });

    let imported = 0;
    let updated = 0;
    const channelIds: string[] = [];
    for (const row of valid) {
      const youtubeUrl = text(row["YouTube Link"]);
      const facebookUrl = text(row["Facebook Link"]);
      const data = {
        name: row.Kanal,
        cms: text(row.CMS),
        category: text(row.Kategori),
        versionChannel: text(row["Versiyon Kanal"]),
        localization: text(row["Dublaj/Altyazı"]),
        youtubeUrl,
        uc: text(row.UC),
        facebookUrl,
        responsibleName: text(row.Sorumlu),
        teamLeadName: text(row["Ekip Lideri"]),
        facebookOpened: yes(row["FB Sayfa Açıldı mı?"]),
        instagramUrl: text(row.Instagram),
        tiktokUrl: text(row.TikTok),
        dailymotionUrl: text(row.Dailymotion),
        notes: text(row.Notlar),
        previousResponsible: text(row["Eski Sorumlu"]),
      };

      const found = youtubeUrl
        ? await prisma.channel.findFirst({ where: { youtubeUrl } })
        : facebookUrl
          ? await prisma.channel.findFirst({ where: { facebookUrl } })
          : null;
      if (found) {
        const channel = await prisma.channel.update({ where: { id: found.id }, data });
        channelIds.push(channel.id);
        updated++;
      } else {
        const channel = await prisma.channel.create({ data });
        channelIds.push(channel.id);
        imported++;
      }
    }

    if (channelIds.length) {
      const syncable = await prisma.channel.findMany({
        where: { id: { in: channelIds }, OR: [{ youtubeUrl: { not: null } }, { uc: { not: null } }, { facebookUrl: { not: null } }] },
        select: { id: true, youtubeUrl: true, uc: true, facebookUrl: true },
      });
      await prisma.syncJob.createMany({
        data: syncable.flatMap(channel => [
          ...(channel.youtubeUrl || channel.uc ? [{ channelId: channel.id, type: "SYNC_CHANNEL" as const }] : []),
          ...(channel.facebookUrl ? [{ channelId: channel.id, type: "SYNC_FACEBOOK_CHANNEL" as const }] : []),
        ]),
      });
      const queued = syncable.reduce((count, channel) => count + (channel.youtubeUrl || channel.uc ? 1 : 0) + (channel.facebookUrl ? 1 : 0), 0);
      const team=await syncTeamAccountsFromChannels();
      return NextResponse.json({ imported, updated, total: valid.length, queued, team });
    }
    return NextResponse.json({ imported, updated, total: valid.length, queued: 0 });
  } catch (error) {
    console.error("channel_import_failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Excel dosyası işlenemedi." },
      { status: 422 },
    );
  }
}

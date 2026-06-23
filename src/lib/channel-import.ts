import type ExcelJS from "exceljs";

export const channelColumns = [
  "CMS",
  "Kategori",
  "Kanal",
  "Versiyon Kanal",
  "Dublaj/Altyazı",
  "YouTube Link",
  "UC",
  "Facebook Link",
  "Sorumlu",
  "Ekip Lideri",
  "FB Sayfa Açıldı mı?",
  "Instagram",
  "TikTok",
  "Dailymotion",
  "Notlar",
  "Eski Sorumlu",
] as const;

export type ChannelColumn = (typeof channelColumns)[number];
export type ImportedChannelRow = Partial<Record<ChannelColumn, unknown>> & { Kanal: unknown };

const aliases: Record<string, ChannelColumn> = {};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function addAliases(column: ChannelColumn, ...names: string[]) {
  for (const name of [column, ...names]) aliases[normalizeHeader(name)] = column;
}

addAliases("CMS");
addAliases("Kategori", "Category");
addAliases("Kanal", "Kanal Adı", "Kanal İsmi", "Channel", "Channel Name");
addAliases("Versiyon Kanal", "Versiyon Kanalı", "Kanal Versiyonu");
addAliases("Dublaj/Altyazı", "Dublaj\\Altyazı", "Dublaj Altyazı", "Lokalizasyon");
addAliases("YouTube Link", "Youtube URL", "YouTube Kanal Linki", "Kanal Linki");
addAliases("UC", "YouTube Channel ID", "Kanal ID");
addAliases("Facebook Link", "Facebook URL");
addAliases("Sorumlu", "Kanal Sorumlusu");
addAliases("Ekip Lideri", "Takım Lideri");
addAliases("FB Sayfa Açıldı mı?", "Facebook Sayfa Açıldı mı?", "FB Açıldı mı?");
addAliases("Instagram", "Instagram Link", "Instagram URL");
addAliases("TikTok", "TikTok Link", "TikTok URL");
addAliases("Dailymotion", "Dailymotion Link", "Dailymotion URL");
addAliases("Notlar", "Not", "Açıklama");
addAliases("Eski Sorumlu", "Önceki Sorumlu");

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (!value || typeof value !== "object" || value instanceof Date) return value ?? "";
  if ("text" in value) return value.text;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("result" in value) return value.result ?? "";
  return String(value);
}

type HeaderCandidate = {
  sheet: ExcelJS.Worksheet;
  rowNumber: number;
  columns: Map<number, ChannelColumn>;
  score: number;
};

export function extractChannelRows(workbook: ExcelJS.Workbook): ImportedChannelRow[] {
  let best: HeaderCandidate | undefined;

  for (const sheet of workbook.worksheets) {
    const lastHeaderRow = Math.min(sheet.rowCount, 30);
    for (let rowNumber = 1; rowNumber <= lastHeaderRow; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const columns = new Map<number, ChannelColumn>();
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const column = aliases[normalizeHeader(cellValue(cell))];
        if (column && ![...columns.values()].includes(column)) columns.set(columnNumber, column);
      });
      const hasChannel = [...columns.values()].includes("Kanal");
      if (hasChannel && columns.size >= 2 && (!best || columns.size > best.score)) {
        best = { sheet, rowNumber, columns, score: columns.size };
      }
    }
  }

  if (!best) {
    throw new Error("Kanal başlık satırı bulunamadı. Dosyada en az 'Kanal' ve bir başka tanınan sütun olmalı.");
  }

  const rows: ImportedChannelRow[] = [];
  for (let rowNumber = best.rowNumber + 1; rowNumber <= best.sheet.rowCount; rowNumber++) {
    const row = best.sheet.getRow(rowNumber);
    const record: Partial<Record<ChannelColumn, unknown>> = {};
    for (const [columnNumber, column] of best.columns) record[column] = cellValue(row.getCell(columnNumber));
    if (String(record.Kanal ?? "").trim()) rows.push(record as ImportedChannelRow);
  }
  return rows;
}

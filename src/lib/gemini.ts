import {
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from "@google/generative-ai";
import { prisma } from "./prisma";
import { createAutomaticTasks } from "./task-automation";

const kinds = [
  "POSITIVE",
  "NEGATIVE",
  "NEUTRAL",
  "QUESTION",
  "COMPLAINT",
  "SUGGESTION",
  "SPAM",
] as const;
const schema: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.STRING },
      kind: { type: SchemaType.STRING, format: "enum", enum: [...kinds] },
      sentimentScore: { type: SchemaType.NUMBER },
      confidence: { type: SchemaType.NUMBER },
      topic: { type: SchemaType.STRING },
      clusterKey: { type: SchemaType.STRING },
      summary: { type: SchemaType.STRING },
      suggestedReply: { type: SchemaType.STRING },
    },
    required: [
      "id",
      "kind",
      "sentimentScore",
      "confidence",
      "topic",
      "clusterKey",
      "summary",
      "suggestedReply",
    ],
  },
};

type Analysis = {
  id: string;
  kind: (typeof kinds)[number];
  sentimentScore: number;
  confidence: number;
  topic: string;
  clusterKey: string;
  summary: string;
  suggestedReply: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const transient = (error: unknown) =>
  /\b(429|500|502|503|504)\b|high demand|temporar|timeout|fetch failed|ECONNRESET/i.test(
    String(error),
  );

async function generateWithRetry(client: GoogleGenerativeAI, prompt: string) {
  const models = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash",
    process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite",
  ];
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const model = models[attempt % models.length];
    try {
      return await client
        .getGenerativeModel({
          model,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.25,
          },
        })
        .generateContent(prompt);
    } catch (error) {
      lastError = error;
      if (!transient(error)) throw error;
      const delay =
        Math.min(30_000, 2_000 * Math.pow(2, attempt)) +
        Math.floor(Math.random() * 750);
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function analyzeComments(commentIds: string[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY tanımlı değil.");
  const comments = await prisma.comment.findMany({
    where: { id: { in: commentIds } },
    select: {
      id: true,
      text: true,
      authorName: true,
      video: { select: { title: true, channel: { select: { name: true } } } },
    },
  });
  if (!comments.length) return 0;
  const client = new GoogleGenerativeAI(key);
  const prompt = `Aşağıdaki gerçek YouTube ve Facebook yorumlarını analiz et.
- kind alanını verilen enum değerlerinden seç.
- sentimentScore -1 ile 1, confidence 0 ile 1 arasında olsun.
- topic kısa ve okunabilir Türkçe konu adı; clusterKey aynı niyetler için tutarlı snake_case olsun.
- summary yorumun tek cümlelik iç özetidir.
- Her yorumun dilini yorum metninden bağımsız olarak tespit et. suggestedReply KESİNLİKLE yorumla aynı dilde olmalı; Türkçe varsayma ve çeviri yapma. İspanyolca yoruma İspanyolca, Arapça yoruma Arapça, İngilizce yoruma İngilizce, Türkçe yoruma Türkçe cevap ver. Latin harfleriyle yazılmış yabancı yorumları da kendi dilinde yanıtla.
- suggestedReply kanal yöneticisinin doğrudan kullanabileceği, doğal, nazik ve en fazla 2 cümlelik cevap önerisidir. Yorum yalnızca emoji/GIF veya dili belirsiz içerikse kanalın/video başlığının dilini kullan.
- Bilinmeyen yayın tarihi, karar veya vaat uydurma. Gerekiyorsa “resmî duyuruları takip edebilirsiniz” de.
- SPAM için suggestedReply boş metin olsun.
- Şikâyette savunmacı olma; geri bildirimi kabul et ve ilgili ekibe iletileceğini söyle.
Veri:\n${JSON.stringify(comments)}`;
  const result = await generateWithRetry(client, prompt);
  const rows = JSON.parse(result.response.text()) as Analysis[];
  const allowed = new Set(comments.map((x) => x.id));
  const valid = rows.filter(
    (row) => allowed.has(row.id) && kinds.includes(row.kind),
  );
  await prisma.$transaction(
    valid.map((row) =>
      prisma.comment.update({
        where: { id: row.id },
        data: {
          kind: row.kind,
          sentimentScore: Math.max(-1, Math.min(1, row.sentimentScore)),
          confidence: Math.max(0, Math.min(1, row.confidence)),
          topic: row.topic.slice(0, 120),
          clusterKey: row.clusterKey.slice(0, 120),
          aiSummary: row.summary,
          suggestedReply: row.kind === "SPAM" ? null : row.suggestedReply,
          analyzedAt: new Date(),
        },
      }),
    ),
  );
  await createAutomaticTasks(valid.map((row) => row.id));
  return valid.length;
}

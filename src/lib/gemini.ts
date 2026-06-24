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

function fallbackAnalysis(comment: { id: string; text: string }): Analysis {
  const text = comment.text.toLocaleLowerCase("tr");
  const spam = /https?:\/\/|www\.|takip et|abone ol|follow me|dm me/.test(text);
  const complaint = /şikayet|rezalet|berbat|kötü|neden yok|çalışmıyor|hata|problem|sorun|complaint|terrible|bad/.test(text);
  const question = /\?|neden|nasıl|ne zaman|nerede|kim|why|how|when|where/.test(text);
  const suggestion = /öneri|bence|olmalı|yapın|suggest|should/.test(text);
  const positive = /teşekkür|harika|muhteşem|güzel|seviyorum|başarı|thanks|great|love|amazing/.test(text);
  const kind: Analysis["kind"] = spam ? "SPAM" : complaint ? "COMPLAINT" : question ? "QUESTION" : suggestion ? "SUGGESTION" : positive ? "POSITIVE" : "NEUTRAL";
  const english = /\b(the|this|that|why|how|when|thanks|love|great|please|video)\b/i.test(comment.text);
  const replies: Record<Analysis["kind"], string> = english ? {
    POSITIVE: "Thank you so much for your kind comment! 💜",
    NEGATIVE: "Thank you for sharing your feedback. We’ll pass it along to the relevant team.",
    NEUTRAL: "Thank you for sharing your thoughts with us. 💜",
    QUESTION: "Thanks for your question. Please follow our official announcements for the latest confirmed information.",
    COMPLAINT: "We’re sorry to hear about your experience. We’ll share your feedback with the relevant team.",
    SUGGESTION: "Thank you for the suggestion! We’ll share it with the relevant team.",
    SPAM: "",
  } : {
    POSITIVE: "Güzel yorumunuz için çok teşekkür ederiz! 💜",
    NEGATIVE: "Geri bildiriminizi paylaştığınız için teşekkür ederiz. İlgili ekibimize ileteceğiz.",
    NEUTRAL: "Düşüncelerinizi bizimle paylaştığınız için teşekkür ederiz. 💜",
    QUESTION: "Sorunuz için teşekkür ederiz. Kesinleşen güncel bilgiler için resmî duyurularımızı takip edebilirsiniz.",
    COMPLAINT: "Yaşadığınız deneyim için üzgünüz. Geri bildiriminizi ilgili ekibimize ileteceğiz.",
    SUGGESTION: "Öneriniz için teşekkür ederiz! İlgili ekibimizle paylaşacağız.",
    SPAM: "",
  };
  return { id: comment.id, kind, sentimentScore: complaint ? -0.75 : positive ? 0.8 : 0, confidence: 0.65, topic: question ? "Bilgi talebi" : complaint ? "Geri bildirim" : suggestion ? "Öneri" : positive ? "Olumlu yorum" : spam ? "Spam" : "Genel yorum", clusterKey: kind.toLocaleLowerCase("tr"), summary: comment.text.slice(0, 180), suggestedReply: replies[kind] };
}

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
      if (/quota exceeded|exceeded your current quota|PROHIBITED_CONTENT/i.test(String(error))) throw error;
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
  if (!key) {
    const rows = comments.map(fallbackAnalysis);
    await saveAnalyses(rows);
    return rows.length;
  }
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
  let rows: Analysis[];
  try {
    const result = await generateWithRetry(client, prompt);
    rows = JSON.parse(result.response.text()) as Analysis[];
  } catch (error) {
    if (!/429|quota|PROHIBITED_CONTENT|blocked/i.test(String(error))) throw error;
    rows = comments.map(fallbackAnalysis);
  }
  const allowed = new Set(comments.map((x) => x.id));
  const valid = rows.filter(
    (row) => allowed.has(row.id) && kinds.includes(row.kind),
  );
  await saveAnalyses(valid);
  return valid.length;
}

async function saveAnalyses(valid: Analysis[]) {
  const clean = (value: string) => value.replace(/[\uD800-\uDFFF]/g, "�").replace(/\u0000/g, "");
  await prisma.$transaction(
    valid.map((row) =>
      prisma.comment.update({
        where: { id: row.id },
        data: {
          kind: row.kind,
          sentimentScore: Math.max(-1, Math.min(1, row.sentimentScore)),
          confidence: Math.max(0, Math.min(1, row.confidence)),
          topic: clean(row.topic).slice(0, 120),
          clusterKey: clean(row.clusterKey).slice(0, 120),
          aiSummary: clean(row.summary),
          suggestedReply: row.kind === "SPAM" ? null : clean(row.suggestedReply),
          analyzedAt: new Date(),
        },
      }),
    ),
  );
  await createAutomaticTasks(valid.map((row) => row.id));
}

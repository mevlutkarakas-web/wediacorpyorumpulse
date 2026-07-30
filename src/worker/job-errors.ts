import { Prisma } from "@prisma/client";

/**
 * BENIGN: iş aslında yapılacak bir şey bulamadı ve bulamayacak (ör. yorumları
 * kapalı bir video). Hata değil; handler bunu başarı sayıp kaydı işaretlemeli,
 * yoksa sonsuza kadar yeniden denenir.
 */
export type ErrorKind = "TRANSIENT" | "PERMANENT" | "QUOTA" | "BENIGN";

export type Classification = {
  kind: ErrorKind;
  code?: string;
  retryAfterMs?: number;
};

/** Ağ/DNS/socket seviyesi, neredeyse her zaman geçici. */
const TRANSIENT_NODE_CODES =
  /^(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|EPIPE|EHOSTUNREACH|ENETUNREACH|ERR_SOCKET|UND_ERR_)/;

/**
 * Prisma'nın geçici hata kodları: erişilemeyen/kapanmış bağlantı, havuz zaman
 * aşımı (P2024 — eski kodda kalıcı sayıldığı için işler doğrudan FAILED oluyordu),
 * transaction hatası ve deadlock.
 */
const TRANSIENT_PRISMA_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1011",
  "P1017",
  "P2024",
  "P2028",
  "P2034",
]);

const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

export class PermanentJobError extends Error {}

/** Servis çağrılarının fırlattığı, sınıflandırılabilir HTTP hatası. */
export class ServiceHttpError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    readonly reason?: string,
    readonly retryAfterMs?: number,
  ) {
    super(`${service} API hatası (${status}${reason ? `: ${reason}` : ""})`);
    this.name = "ServiceHttpError";
  }
}

function classifyHttp(status: number, reason: string, retryAfterMs?: number): Classification {
  if (/quotaExceeded|rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded/i.test(reason))
    return { kind: "QUOTA", code: reason };
  // Kalıcı olarak "yapılacak iş yok" durumları.
  if (/commentsDisabled|videoNotFound|channelNotFound|playlistNotFound|forbidden/i.test(reason))
    return { kind: "BENIGN", code: reason };
  if (TRANSIENT_HTTP.has(status)) return { kind: "TRANSIENT", code: String(status), retryAfterMs };
  return { kind: "PERMANENT", code: reason || String(status) };
}

/**
 * Yapısal sınıflandırma. Eski `isTransientError` mesaj metnine regex uyguluyordu;
 * bu yüzden içinde "500" geçen her hata geçici, `P2024` ise kalıcı sayılıyordu.
 * Varsayılan bilinçli olarak PERMANENT: bilinmeyen bir kod hatası 8 kez denenmemeli.
 */
export function classifyJobError(error: unknown): Classification {
  if (error instanceof PermanentJobError) return { kind: "PERMANENT", code: "invariant" };

  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return TRANSIENT_PRISMA_CODES.has(error.code)
      ? { kind: "TRANSIENT", code: error.code }
      : { kind: "PERMANENT", code: error.code };
  if (error instanceof Prisma.PrismaClientInitializationError)
    return { kind: "TRANSIENT", code: error.errorCode || "prisma_init" };
  if (error instanceof Prisma.PrismaClientRustPanicError)
    return { kind: "TRANSIENT", code: "prisma_panic" };

  if (error instanceof ServiceHttpError)
    return classifyHttp(error.status, error.reason ?? "", error.retryAfterMs);

  const code = String((error as { code?: unknown })?.code ?? "");
  if (code && TRANSIENT_NODE_CODES.test(code)) return { kind: "TRANSIENT", code };

  const name = String((error as { name?: unknown })?.name ?? "");
  // Playwright zaman aşımları (tarama sırasında sık) yeniden denenebilir.
  if (name === "TimeoutError" || name === "AbortError")
    return { kind: "TRANSIENT", code: name };

  const message = error instanceof Error ? error.message : String(error);
  // Kota koruması youtube.ts içinde düz Error olarak fırlatılıyor.
  if (/kota|quota/i.test(message)) return { kind: "QUOTA", code: "quota_guard" };
  // Sağlayıcı istemcileri bazen yalnızca metin bırakıyor; dar bir güvenlik ağı.
  if (/\b(429|502|503|504)\b|fetch failed|socket hang up|high demand|temporar/i.test(message))
    return { kind: "TRANSIENT", code: "message_match" };

  return { kind: "PERMANENT" };
}

const RETRY_BASE_MS: Record<ErrorKind, number> = {
  TRANSIENT: 30_000,
  PERMANENT: 120_000,
  QUOTA: 30 * 60_000,
  BENIGN: 60_000,
};

const RETRY_CAP_MS: Record<ErrorKind, number> = {
  TRANSIENT: 15 * 60_000,
  PERMANENT: 30 * 60_000,
  QUOTA: 6 * 3_600_000,
  BENIGN: 60_000,
};

const TRANSIENT_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.JOB_TRANSIENT_MAX_ATTEMPTS || 8),
);

/**
 * `maxAttempts` kolonu ASLA yazılmaz — eski kod geçici bir hatada onu kalıcı
 * olarak 10'a yükseltiyordu, böylece sonraki kalıcı hatalar da 10 kez deneniyordu.
 * Limit her kararda türetilir.
 */
export function retryDecision(
  attempts: number,
  maxAttempts: number,
  classification: Classification,
  random: () => number = Math.random,
) {
  const { kind } = classification;
  const limit =
    kind === "TRANSIENT" || kind === "QUOTA"
      ? Math.max(maxAttempts, TRANSIENT_MAX_ATTEMPTS)
      : maxAttempts;
  const retry = attempts < limit;
  // Math.min(attempts, 8) tavansız 2^n patlamasını engeller; çarpımsal jitter
  // aynı anda başarısız olan yüzlerce işin aynı saniyede geri dönmesini önler.
  const raw = RETRY_BASE_MS[kind] * 2 ** Math.min(Math.max(attempts - 1, 0), 8);
  const capped = Math.min(RETRY_CAP_MS[kind], raw);
  const delayMs = Math.max(
    1_000,
    Math.round(Math.max(capped, classification.retryAfterMs ?? 0) * (0.5 + random())),
  );
  return { retry, delayMs, limit };
}

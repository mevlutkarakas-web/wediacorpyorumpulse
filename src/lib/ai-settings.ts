import { prisma } from "./prisma";
import { decryptSecret } from "./secret-box";

export type AiProvider = "AUTO" | "GROQ" | "OPENROUTER" | "GEMINI";

export async function getAiRuntimeSettings() {
  const stored = await prisma.aiSettings.findUnique({ where: { id: "default" } });
  let storedGroq: string | null = null;
  let storedOpenRouter: string | null = null;
  try {
    storedGroq = decryptSecret(stored?.groqApiKeyEncrypted);
    storedOpenRouter = decryptSecret(stored?.openRouterKeyEncrypted);
  } catch {}
  return {
    provider: (stored?.provider || process.env.AI_PROVIDER || "AUTO") as AiProvider,
    groqApiKey: storedGroq || process.env.GROQ_API_KEY?.trim() || null,
    openRouterApiKey: storedOpenRouter || process.env.OPENROUTER_API_KEY?.trim() || null,
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    groqModel: stored?.groqModel || process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    openRouterModel: stored?.openRouterModel || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  };
}

export async function getAiSettingsSummary() {
  const runtime = await getAiRuntimeSettings();
  return {
    provider: runtime.provider,
    groqConfigured: Boolean(runtime.groqApiKey),
    openRouterConfigured: Boolean(runtime.openRouterApiKey),
    geminiConfigured: Boolean(runtime.geminiApiKey),
    groqModel: runtime.groqModel,
    openRouterModel: runtime.openRouterModel,
  };
}

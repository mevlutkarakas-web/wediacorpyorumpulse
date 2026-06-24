import { prisma } from "./prisma";
import { decryptSecret } from "./secret-box";

export type AiProvider = "AUTO" | "GROQ" | "OPENROUTER" | "GEMINI";

const envSecret = (value: string | undefined) => value?.replace(/\\n$/g, "").trim() || null;

export async function getAiRuntimeSettings() {
  const stored = await prisma.aiSettings.findUnique({ where: { id: "default" } });
  let storedGroq: string | null = null;
  let storedOpenRouter: string | null = null;
  try {
    storedGroq = decryptSecret(stored?.groqApiKeyEncrypted);
    storedOpenRouter = decryptSecret(stored?.openRouterKeyEncrypted);
  } catch {}
  return {
    provider: (stored?.provider || envSecret(process.env.AI_PROVIDER) || "AUTO") as AiProvider,
    groqApiKey: storedGroq || envSecret(process.env.GROQ_API_KEY),
    openRouterApiKey: storedOpenRouter || envSecret(process.env.OPENROUTER_API_KEY),
    geminiApiKey: envSecret(process.env.GEMINI_API_KEY),
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

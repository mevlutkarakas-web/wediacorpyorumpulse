CREATE TABLE "AiSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "provider" TEXT NOT NULL DEFAULT 'AUTO',
  "groqApiKeyEncrypted" TEXT,
  "openRouterKeyEncrypted" TEXT,
  "groqModel" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  "openRouterModel" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

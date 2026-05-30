-- CreateEnum
CREATE TYPE "AiRagScope" AS ENUM ('MOOD_TEMPLATE', 'USER_MEMORY');

-- CreateEnum
CREATE TYPE "AiRagKind" AS ENUM ('TONE_EXAMPLE', 'USER_SIGNAL');

-- CreateTable
CREATE TABLE "AiMemoryPreference" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMemoryPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AiRagChunk" (
    "id" TEXT NOT NULL,
    "scope" "AiRagScope" NOT NULL,
    "userId" TEXT,
    "mood" "MoodIntent",
    "kind" "AiRagKind" NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "metadata" JSONB,
    "sourceConversationId" TEXT,
    "sourceKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRagChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRagChunk_scope_mood_idx" ON "AiRagChunk"("scope", "mood");

-- CreateIndex
CREATE INDEX "AiRagChunk_userId_scope_expiresAt_idx" ON "AiRagChunk"("userId", "scope", "expiresAt");

-- CreateIndex
CREATE INDEX "AiRagChunk_sourceConversationId_idx" ON "AiRagChunk"("sourceConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRagChunk_sourceKey_key" ON "AiRagChunk"("sourceKey");

-- AddForeignKey
ALTER TABLE "AiMemoryPreference" ADD CONSTRAINT "AiMemoryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRagChunk" ADD CONSTRAINT "AiRagChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

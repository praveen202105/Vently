-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "activeEndHour" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "activeStartHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bioEmbedding" JSONB;

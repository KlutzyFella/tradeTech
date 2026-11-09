-- AlterTable
ALTER TABLE "news_items" ADD COLUMN     "roundId" BIGINT;

-- AlterTable
ALTER TABLE "rounds" ADD COLUMN     "lastTickAt" TIMESTAMPTZ(3),
ADD COLUMN     "startedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "haltReason" TEXT,
ADD COLUMN     "reopensAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "rounds_status_idx" ON "rounds"("status");

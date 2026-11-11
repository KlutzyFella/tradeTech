-- CreateTable
CREATE TABLE "price_points" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "stockId" BIGINT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "mid" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "price_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_points_stockId_at_idx" ON "price_points"("stockId", "at");

-- CreateIndex
CREATE INDEX "price_points_roomId_at_idx" ON "price_points"("roomId", "at");

-- AddForeignKey
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_roomId_stockId_fkey" FOREIGN KEY ("roomId", "stockId") REFERENCES "stocks"("roomId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('draft', 'practice', 'live', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "RoundKind" AS ENUM ('practice', 'scored');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('pending', 'running', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "NewsKind" AS ENUM ('mechanical', 'information');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('draft', 'scheduled', 'published');

-- CreateEnum
CREATE TYPE "OrderIntent" AS ENUM ('buy', 'sell', 'short', 'cover');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('received', 'filled', 'rejected');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('active', 'frozen', 'disqualified');

-- CreateTable
CREATE TABLE "rooms" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'draft',
    "startingCashPaise" BIGINT NOT NULL,
    "rules" JSONB NOT NULL,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "randomSeed" TEXT NOT NULL,
    "marketVersion" BIGINT NOT NULL DEFAULT 0,
    "nextEventOffset" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "loginName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'active',
    "statusReason" TEXT,
    "cashPaise" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT '',
    "openingPrice" DOUBLE PRECISION NOT NULL,
    "anchor" DOUBLE PRECISION NOT NULL,
    "pressure" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noise" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depth" DOUBLE PRECISION NOT NULL,
    "sensitivity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "halfLifeMin" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "shortable" BOOLEAN NOT NULL DEFAULT true,
    "borrowPool" INTEGER NOT NULL,
    "borrowUsed" INTEGER NOT NULL DEFAULT 0,
    "bandReference" DOUBLE PRECISION NOT NULL,
    "bandFraction" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "halted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "RoundKind" NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'pending',
    "durationMs" INTEGER NOT NULL,
    "activeElapsedMs" INTEGER NOT NULL DEFAULT 0,
    "openingRefs" JSONB,
    "cutoffAt" TIMESTAMPTZ(3),

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_items" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "kind" "NewsKind" NOT NULL,
    "status" "NewsStatus" NOT NULL DEFAULT 'draft',
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "sourceLabel" TEXT,
    "impacts" JSONB NOT NULL DEFAULT '{}',
    "scheduledAtMs" INTEGER,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "teamId" BIGINT NOT NULL,
    "stockId" BIGINT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "acceptSeq" BIGINT NOT NULL,
    "intent" "OrderIntent" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "limitPrice" DOUBLE PRECISION,
    "status" "OrderStatus" NOT NULL,
    "avgPrice" DOUBLE PRECISION,
    "costPaise" BIGINT,
    "rejectReason" TEXT,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "roomId" BIGINT NOT NULL,
    "teamId" BIGINT NOT NULL,
    "stockId" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "costBasisPaise" BIGINT NOT NULL DEFAULT 0,
    "realizedPnlPaise" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("teamId","stockId")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "teamId" BIGINT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "cause" TEXT NOT NULL,
    "orderId" BIGINT,
    "eventOffset" BIGINT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_events" (
    "roomId" BIGINT NOT NULL,
    "offset" BIGINT NOT NULL,
    "marketVersion" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "room_events_pkey" PRIMARY KEY ("roomId","offset")
);

-- CreateTable
CREATE TABLE "final_scores" (
    "roomId" BIGINT NOT NULL,
    "teamId" BIGINT NOT NULL,
    "liquidationPaise" BIGINT NOT NULL,
    "rank" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "frozenAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "final_scores_pkey" PRIMARY KEY ("roomId","teamId")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE INDEX "teams_roomId_idx" ON "teams"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_roomId_loginName_key" ON "teams"("roomId", "loginName");

-- CreateIndex
CREATE UNIQUE INDEX "teams_roomId_id_key" ON "teams"("roomId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_roomId_name_key" ON "teams"("roomId", "name");

-- CreateIndex
CREATE INDEX "stocks_roomId_idx" ON "stocks"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_roomId_ticker_key" ON "stocks"("roomId", "ticker");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_roomId_id_key" ON "stocks"("roomId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_roomId_sequence_key" ON "rounds"("roomId", "sequence");

-- CreateIndex
CREATE INDEX "news_items_roomId_status_idx" ON "news_items"("roomId", "status");

-- CreateIndex
CREATE INDEX "orders_stockId_idx" ON "orders"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_teamId_requestId_key" ON "orders"("teamId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_roomId_id_key" ON "orders"("roomId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_roomId_acceptSeq_key" ON "orders"("roomId", "acceptSeq");

-- CreateIndex
CREATE INDEX "positions_roomId_idx" ON "positions"("roomId");

-- CreateIndex
CREATE INDEX "positions_stockId_idx" ON "positions"("stockId");

-- CreateIndex
CREATE INDEX "ledger_entries_teamId_idx" ON "ledger_entries"("teamId");

-- CreateIndex
CREATE INDEX "ledger_entries_roomId_idx" ON "ledger_entries"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_orderId_cause_key" ON "ledger_entries"("orderId", "cause");

-- CreateIndex
CREATE INDEX "room_events_publishedAt_idx" ON "room_events"("publishedAt");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_roomId_teamId_fkey" FOREIGN KEY ("roomId", "teamId") REFERENCES "teams"("roomId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_roomId_stockId_fkey" FOREIGN KEY ("roomId", "stockId") REFERENCES "stocks"("roomId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_roomId_teamId_fkey" FOREIGN KEY ("roomId", "teamId") REFERENCES "teams"("roomId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_roomId_stockId_fkey" FOREIGN KEY ("roomId", "stockId") REFERENCES "stocks"("roomId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_roomId_teamId_fkey" FOREIGN KEY ("roomId", "teamId") REFERENCES "teams"("roomId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_roomId_orderId_fkey" FOREIGN KEY ("roomId", "orderId") REFERENCES "orders"("roomId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_scores" ADD CONSTRAINT "final_scores_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_scores" ADD CONSTRAINT "final_scores_roomId_teamId_fkey" FOREIGN KEY ("roomId", "teamId") REFERENCES "teams"("roomId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "event_templates" (
    "id" BIGSERIAL NOT NULL,
    "hostId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_templates_hostId_idx" ON "event_templates"("hostId");

-- AddForeignKey
ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

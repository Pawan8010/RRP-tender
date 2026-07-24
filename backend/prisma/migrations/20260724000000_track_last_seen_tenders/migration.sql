ALTER TABLE "tenders" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "tenders" ADD COLUMN "lastSeenRunId" TEXT;

CREATE INDEX "tenders_lastSeenRunId_idx" ON "tenders"("lastSeenRunId");
CREATE INDEX "tenders_lastSeenAt_idx" ON "tenders"("lastSeenAt");

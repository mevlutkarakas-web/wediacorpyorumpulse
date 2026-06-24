ALTER TABLE "Comment"
  ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedById" TEXT;

ALTER TABLE "Alert" ADD COLUMN "commentId" TEXT;

CREATE INDEX "Comment_completed_publishedAt_idx" ON "Comment"("completed", "publishedAt");
CREATE UNIQUE INDEX "Alert_type_commentId_key" ON "Alert"("type", "commentId");

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

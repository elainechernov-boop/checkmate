-- A capped undo log for Parent Mode's most destructive actions. No FK
-- relations on purpose — a snapshot has to survive even if the rows it
-- references are gone by the time someone tries to undo it.

-- CreateTable
CREATE TABLE "UndoLogEntry" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "UndoLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UndoLogEntry_createdAt_idx" ON "UndoLogEntry"("createdAt");

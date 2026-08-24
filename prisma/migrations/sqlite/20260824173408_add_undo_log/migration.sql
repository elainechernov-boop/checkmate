-- CreateTable
CREATE TABLE "UndoLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" DATETIME
);

-- CreateIndex
CREATE INDEX "UndoLogEntry_createdAt_idx" ON "UndoLogEntry"("createdAt");

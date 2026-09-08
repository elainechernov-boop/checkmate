-- CreateIndex
CREATE INDEX "AssignmentInstance_familyId_dueDate_idx" ON "AssignmentInstance"("familyId", "dueDate");

-- CreateIndex
CREATE INDEX "AssignmentInstance_projectId_idx" ON "AssignmentInstance"("projectId");

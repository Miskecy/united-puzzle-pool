-- CreateIndex: speed up the full-table scan on status used by GET /block
CREATE INDEX "BlockAssignment_status_idx" ON "BlockAssignment"("status");

-- CreateIndex: cover queries that filter status and order by start_range
CREATE INDEX "BlockAssignment_status_start_range_idx" ON "BlockAssignment"("status", "start_range");

-- CreateIndex: cover per-user active-block lookups
CREATE INDEX "BlockAssignment_user_token_id_status_idx" ON "BlockAssignment"("user_token_id", "status");

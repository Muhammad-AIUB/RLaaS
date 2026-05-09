CREATE INDEX "request_logs_project_recent_idx"
ON "request_logs"("project_id", "created_at" DESC, "id" DESC);

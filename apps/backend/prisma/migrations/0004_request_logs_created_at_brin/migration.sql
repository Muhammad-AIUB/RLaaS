CREATE INDEX CONCURRENTLY "request_logs_created_at_brin_idx" ON "request_logs" USING BRIN ("created_at");

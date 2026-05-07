-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RuleScope" AS ENUM ('IP', 'API_KEY', 'USER_TIER', 'ENDPOINT', 'GLOBAL');

-- CreateEnum
CREATE TYPE "RuleAlgorithm" AS ENUM ('FIXED_WINDOW', 'SLIDING_WINDOW_LOG', 'SLIDING_WINDOW_COUNTER', 'TOKEN_BUCKET');

-- CreateEnum
CREATE TYPE "RequestDecision" AS ENUM ('ALLOWED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD');

-- CreateEnum
CREATE TYPE "SnapshotWindow" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "tier" "UserTier" NOT NULL DEFAULT 'FREE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "environment" VARCHAR(50) NOT NULL DEFAULT 'production',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "key_prefix" VARCHAR(24) NOT NULL,
    "hashed_key" VARCHAR(255) NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_rules" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL,
    "scope" "RuleScope" NOT NULL,
    "target_value" VARCHAR(255),
    "endpoint_pattern" VARCHAR(255),
    "method" "HttpMethod",
    "user_tier" "UserTier",
    "algorithm" "RuleAlgorithm" NOT NULL,
    "limit" INTEGER NOT NULL,
    "window_seconds" INTEGER NOT NULL,
    "burst_capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "api_key_id" UUID,
    "rule_id" UUID,
    "request_id" VARCHAR(120),
    "ip_address" VARCHAR(64) NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "method" "HttpMethod" NOT NULL,
    "user_tier" "UserTier",
    "decision" "RequestDecision" NOT NULL,
    "reason" VARCHAR(120),
    "algorithm" "RuleAlgorithm" NOT NULL,
    "limit" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "retry_after" INTEGER NOT NULL DEFAULT 0,
    "response_time_ms" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "window" "SnapshotWindow" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "allowed_requests" INTEGER NOT NULL DEFAULT 0,
    "blocked_requests" INTEGER NOT NULL DEFAULT 0,
    "block_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "top_offending_ips" JSONB,
    "most_used_endpoints" JSONB,
    "algorithm_performance_comparison" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashed_key_key" ON "api_keys"("hashed_key");

-- CreateIndex
CREATE INDEX "api_keys_project_id_idx" ON "api_keys"("project_id");

-- CreateIndex
CREATE INDEX "api_keys_status_idx" ON "api_keys"("status");

-- CreateIndex
CREATE INDEX "rate_limit_rules_project_id_is_active_idx" ON "rate_limit_rules"("project_id", "is_active");

-- CreateIndex
CREATE INDEX "rate_limit_rules_project_id_priority_idx" ON "rate_limit_rules"("project_id", "priority");

-- CreateIndex
CREATE INDEX "rate_limit_rules_scope_target_value_idx" ON "rate_limit_rules"("scope", "target_value");

-- CreateIndex
CREATE INDEX "request_logs_project_id_created_at_idx" ON "request_logs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "request_logs_api_key_id_created_at_idx" ON "request_logs"("api_key_id", "created_at");

-- CreateIndex
CREATE INDEX "request_logs_decision_created_at_idx" ON "request_logs"("decision", "created_at");

-- CreateIndex
CREATE INDEX "request_logs_ip_address_created_at_idx" ON "request_logs"("ip_address", "created_at");

-- CreateIndex
CREATE INDEX "request_logs_endpoint_method_idx" ON "request_logs"("endpoint", "method");

-- CreateIndex
CREATE INDEX "analytics_snapshots_project_id_period_start_period_end_idx" ON "analytics_snapshots"("project_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_project_id_window_period_start_period_e_key" ON "analytics_snapshots"("project_id", "window", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_limit_rules" ADD CONSTRAINT "rate_limit_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rate_limit_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


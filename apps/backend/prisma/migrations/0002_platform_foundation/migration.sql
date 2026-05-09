-- Create enums
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'ADMIN', 'VIEWER');
CREATE TYPE "WebhookEventType" AS ENUM ('HIGH_BLOCKED_ACTIVITY');

-- Alter existing tables
ALTER TABLE "api_keys"
ADD COLUMN "hash_version" VARCHAR(32) NOT NULL DEFAULT 'hmac-sha256-v1';

ALTER TABLE "request_logs"
ADD COLUMN "idempotency_key" VARCHAR(120);

CREATE INDEX "request_logs_project_id_idempotency_key_idx"
ON "request_logs"("project_id", "idempotency_key");

-- Create project members
CREATE TABLE "project_members" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "ProjectRole" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_members_project_id_user_id_key"
ON "project_members"("project_id", "user_id");

CREATE INDEX "project_members_user_id_idx"
ON "project_members"("user_id");

CREATE INDEX "project_members_project_id_role_idx"
ON "project_members"("project_id", "role");

ALTER TABLE "project_members"
ADD CONSTRAINT "project_members_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
ADD CONSTRAINT "project_members_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "project_members" ("id", "project_id", "user_id", "role", "created_at", "updated_at")
SELECT
  (
    substr(md5("id"::text || "owner_id"::text), 1, 8) || '-' ||
    substr(md5("id"::text || "owner_id"::text), 9, 4) || '-' ||
    substr(md5("id"::text || "owner_id"::text), 13, 4) || '-' ||
    substr(md5("id"::text || "owner_id"::text), 17, 4) || '-' ||
    substr(md5("id"::text || "owner_id"::text), 21, 12)
  )::uuid,
  "id",
  "owner_id",
  'OWNER'::"ProjectRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "projects"
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- Create audit logs
CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_id" UUID,
  "project_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "resource_type" VARCHAR(80) NOT NULL,
  "resource_id" VARCHAR(120),
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(255),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_id_created_at_idx"
ON "audit_logs"("actor_id", "created_at");

CREATE INDEX "audit_logs_project_id_created_at_idx"
ON "audit_logs"("project_id", "created_at");

CREATE INDEX "audit_logs_action_created_at_idx"
ON "audit_logs"("action", "created_at");

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Create webhook endpoints
CREATE TABLE "webhook_endpoints" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "signing_secret" VARCHAR(255),
  "event_type" "WebhookEventType" NOT NULL,
  "blocked_requests_threshold" INTEGER NOT NULL DEFAULT 25,
  "window_seconds" INTEGER NOT NULL DEFAULT 300,
  "cooldown_seconds" INTEGER NOT NULL DEFAULT 300,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_triggered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_endpoints_project_id_event_type_is_active_idx"
ON "webhook_endpoints"("project_id", "event_type", "is_active");

ALTER TABLE "webhook_endpoints"
ADD CONSTRAINT "webhook_endpoints_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

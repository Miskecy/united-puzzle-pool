-- Create shared_pool_tokens (id, token unique, pool_name, puzzle_address, timestamps)
CREATE TABLE IF NOT EXISTS "shared_pool_tokens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "pool_name" TEXT NOT NULL,
  "puzzle_address" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shared_pool_tokens_token_key" ON "shared_pool_tokens"("token");

-- Create app_config with shared_pool_api_enabled and timestamps
CREATE TABLE IF NOT EXISTS "app_config" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "shared_pool_api_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
INSERT OR IGNORE INTO "app_config" ("id", "shared_pool_api_enabled", "created_at", "updated_at")
VALUES ('singleton', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);


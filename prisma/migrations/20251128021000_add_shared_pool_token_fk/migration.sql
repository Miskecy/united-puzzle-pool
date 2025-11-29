-- Redefine block_assignments to add shared_pool_token_id with FK to shared_pool_tokens
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_block_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_token_id" TEXT NOT NULL,
    "start_range" TEXT NOT NULL,
    "end_range" TEXT NOT NULL,
    "checkwork_addresses" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" DATETIME NOT NULL,
    "puzzle_address_snapshot" TEXT,
    "puzzle_name_snapshot" TEXT,
    "shared_pool_token_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "new_block_assignments_user_token_id_fkey" FOREIGN KEY ("user_token_id") REFERENCES "user_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "new_block_assignments_shared_pool_token_id_fkey" FOREIGN KEY ("shared_pool_token_id") REFERENCES "shared_pool_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_block_assignments" (
    "id","user_token_id","start_range","end_range","checkwork_addresses","status","expires_at","puzzle_address_snapshot","puzzle_name_snapshot","created_at","updated_at"
) SELECT "id","user_token_id","start_range","end_range","checkwork_addresses","status","expires_at","puzzle_address_snapshot","puzzle_name_snapshot","created_at","updated_at" FROM "block_assignments";
DROP TABLE "block_assignments";
ALTER TABLE "new_block_assignments" RENAME TO "block_assignments";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


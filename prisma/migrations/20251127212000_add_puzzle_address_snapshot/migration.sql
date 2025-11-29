-- AlterTable
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "new_block_assignments_user_token_id_fkey" FOREIGN KEY ("user_token_id") REFERENCES "user_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_block_assignments" ("id","user_token_id","start_range","end_range","checkwork_addresses","status","expires_at","puzzle_address_snapshot","created_at","updated_at")
SELECT "id","user_token_id","start_range","end_range","checkwork_addresses","status","expires_at",NULL,"created_at","updated_at" FROM "block_assignments";
DROP TABLE "block_assignments";
ALTER TABLE "new_block_assignments" RENAME TO "block_assignments";
PRAGMA foreign_keys=ON;

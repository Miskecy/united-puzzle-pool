/*
  Warnings:

  - You are about to drop the `block_assignments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "block_assignments";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "BlockAssignment" (
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
    CONSTRAINT "BlockAssignment_user_token_id_fkey" FOREIGN KEY ("user_token_id") REFERENCES "user_tokens" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BlockAssignment_shared_pool_token_id_fkey" FOREIGN KEY ("shared_pool_token_id") REFERENCES "shared_pool_tokens" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_block_solutions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "block_assignment_id" TEXT NOT NULL,
    "private_keys" TEXT NOT NULL,
    "credits_awarded" DECIMAL NOT NULL,
    "puzzle_private_key" TEXT,
    "solved_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "block_solutions_block_assignment_id_fkey" FOREIGN KEY ("block_assignment_id") REFERENCES "BlockAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_block_solutions" ("block_assignment_id", "created_at", "credits_awarded", "id", "private_keys", "puzzle_private_key", "solved_at") SELECT "block_assignment_id", "created_at", "credits_awarded", "id", "private_keys", "puzzle_private_key", "solved_at" FROM "block_solutions";
DROP TABLE "block_solutions";
ALTER TABLE "new_block_solutions" RENAME TO "block_solutions";
CREATE UNIQUE INDEX "block_solutions_block_assignment_id_key" ON "block_solutions"("block_assignment_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Rollback Script: Restore decimal schema and data from miliunits
PRAGMA foreign_keys=OFF;

-- Option A: Restore from backup file if available
-- To restore the entire database file:
-- 1) Stop the application
-- 2) Replace prisma/dev.db with dev-backup-before-milliunits.db
--    (Windows Git Bash): cp -f dev-backup-before-milliunits.db prisma/dev.db
--    (PowerShell): Copy-Item -Force dev-backup-before-milliunits.db prisma/dev.db
-- Then restart.

-- Option B: Schema and data rollback in-place
PRAGMA defer_foreign_keys=ON;

-- block_solutions: convert credits_awarded INTEGER -> DECIMAL
CREATE TABLE "old_block_solutions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "block_assignment_id" TEXT NOT NULL,
    "private_keys" TEXT NOT NULL,
    "credits_awarded" DECIMAL NOT NULL,
    "puzzle_private_key" TEXT,
    "solved_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "old_block_solutions" ("id","block_assignment_id","private_keys","credits_awarded","puzzle_private_key","solved_at","created_at")
SELECT "id","block_assignment_id","private_keys", ("credits_awarded" / 1000.0), "puzzle_private_key","solved_at","created_at" FROM "block_solutions";
DROP TABLE "block_solutions";
ALTER TABLE "old_block_solutions" RENAME TO "block_solutions";
CREATE UNIQUE INDEX "block_solutions_block_assignment_id_key" ON "block_solutions"("block_assignment_id");

-- credit_transactions: convert amount INTEGER -> DECIMAL
CREATE TABLE "old_credit_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_token_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "old_credit_transactions" ("id","user_token_id","type","amount","description","created_at")
SELECT "id","user_token_id","type", ("amount" / 1000.0), "description","created_at" FROM "credit_transactions";
DROP TABLE "credit_transactions";
ALTER TABLE "old_credit_transactions" RENAME TO "credit_transactions";

PRAGMA defer_foreign_keys=OFF;
PRAGMA foreign_keys=ON;

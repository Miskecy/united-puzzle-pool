-- Data Safety: Backup should be performed externally prior to running this migration.
-- Recommended command (Git Bash): cp -f prisma/dev.db dev-backup-before-milliunits.db
-- Recommended command (PowerShell): Copy-Item -Force prisma/dev.db dev-backup-before-milliunits.db
PRAGMA foreign_keys=OFF;

-- Redefine block_solutions to store credits_awarded as INTEGER (miliunits)
PRAGMA defer_foreign_keys=ON;
CREATE TABLE "new_block_solutions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "block_assignment_id" TEXT NOT NULL,
    "private_keys" TEXT NOT NULL,
    "credits_awarded" INTEGER NOT NULL,
    "puzzle_private_key" TEXT,
    "solved_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "new_block_solutions_block_assignment_id_fkey" FOREIGN KEY ("block_assignment_id") REFERENCES "BlockAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_block_solutions" ("id","block_assignment_id","private_keys","credits_awarded","puzzle_private_key","solved_at","created_at")
SELECT "id","block_assignment_id","private_keys",ROUND("credits_awarded" * 1000),"puzzle_private_key","solved_at","created_at"
FROM "block_solutions";

DROP TABLE "block_solutions";
ALTER TABLE "new_block_solutions" RENAME TO "block_solutions";
CREATE UNIQUE INDEX "block_solutions_block_assignment_id_key" ON "block_solutions"("block_assignment_id");

-- Redefine credit_transactions to store amount as INTEGER (miliunits)
CREATE TABLE "new_credit_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_token_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "new_credit_transactions_user_token_id_fkey" FOREIGN KEY ("user_token_id") REFERENCES "user_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_credit_transactions" ("id","user_token_id","type","amount","description","created_at")
SELECT "id","user_token_id","type",ROUND("amount" * 1000),"description","created_at"
FROM "credit_transactions";

DROP TABLE "credit_transactions";
ALTER TABLE "new_credit_transactions" RENAME TO "credit_transactions";

PRAGMA defer_foreign_keys=OFF;
PRAGMA foreign_keys=ON;

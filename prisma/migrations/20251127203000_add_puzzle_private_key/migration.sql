-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_puzzles_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "puzzle_address" TEXT NOT NULL,
    "puzzle_start_range" TEXT NOT NULL,
    "puzzle_end_range" TEXT NOT NULL,
    "puzzle_private_key" TEXT,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_puzzles_config" ("id", "name", "puzzle_address", "puzzle_start_range", "puzzle_end_range", "puzzle_private_key", "solved", "active", "created_at", "updated_at")
SELECT "id", "name", "puzzle_address", "puzzle_start_range", "puzzle_end_range", NULL, "solved", "active", "created_at", "updated_at" FROM "puzzles_config";
DROP TABLE "puzzles_config";
ALTER TABLE "new_puzzles_config" RENAME TO "puzzles_config";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

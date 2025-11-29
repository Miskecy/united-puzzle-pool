-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_puzzles_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "puzzle_address" TEXT NOT NULL,
    "puzzle_start_range" TEXT NOT NULL,
    "puzzle_end_range" TEXT NOT NULL,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_puzzles_config" ("active", "created_at", "id", "name", "puzzle_address", "puzzle_end_range", "puzzle_start_range", "updated_at") SELECT "active", "created_at", "id", "name", "puzzle_address", "puzzle_end_range", "puzzle_start_range", "updated_at" FROM "puzzles_config";
DROP TABLE "puzzles_config";
ALTER TABLE "new_puzzles_config" RENAME TO "puzzles_config";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

/*
  Warnings:

  - You are about to drop the `app_config` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "app_config";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "puzzles_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "puzzle_address" TEXT NOT NULL,
    "puzzle_start_range" TEXT NOT NULL,
    "puzzle_end_range" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

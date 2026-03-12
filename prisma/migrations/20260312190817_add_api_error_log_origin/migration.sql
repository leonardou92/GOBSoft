/*
  Warnings:

  - Added the required column `origin` to the `ApiErrorLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `apierrorlog` ADD COLUMN `origin` VARCHAR(191) NOT NULL;

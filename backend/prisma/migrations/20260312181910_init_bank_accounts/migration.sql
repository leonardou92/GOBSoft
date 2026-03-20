-- AlterTable
ALTER TABLE `banktransaction` ADD COLUMN `kind` ENUM('TRF', 'DEP', 'P2P') NOT NULL DEFAULT 'TRF';

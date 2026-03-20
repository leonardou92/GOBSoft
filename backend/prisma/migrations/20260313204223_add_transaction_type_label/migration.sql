/*
  Warnings:

  - You are about to drop the column `operationType` on the `banktransaction` table. All the data in the column will be lost.
  - You are about to drop the column `transactionTypeCode` on the `banktransaction` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `BankTransaction_operationType_idx` ON `banktransaction`;

-- DropIndex
DROP INDEX `BankTransaction_transactionTypeCode_idx` ON `banktransaction`;

-- AlterTable
ALTER TABLE `banktransaction` DROP COLUMN `operationType`,
    DROP COLUMN `transactionTypeCode`;

-- CreateIndex
CREATE INDEX `BankTransaction_code_idx` ON `BankTransaction`(`code`);

-- CreateIndex
CREATE INDEX `BankTransaction_transactionTypeLabel_idx` ON `BankTransaction`(`transactionTypeLabel`);

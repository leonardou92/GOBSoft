-- AlterTable
ALTER TABLE `banktransaction` ADD COLUMN `operationType` VARCHAR(191) NULL,
    ADD COLUMN `transactionTypeCode` INTEGER NULL,
    ADD COLUMN `transactionTypeLabel` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `BankTransaction_transactionTypeCode_idx` ON `BankTransaction`(`transactionTypeCode`);

-- CreateIndex
CREATE INDEX `BankTransaction_operationType_idx` ON `BankTransaction`(`operationType`);

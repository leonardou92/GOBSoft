-- CreateTable
CREATE TABLE `BankTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bankAccountId` INTEGER NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `movementDate` DATETIME(3) NOT NULL,
    `controlNumber` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `bankCode` VARCHAR(191) NOT NULL,
    `debtorInstrument` VARCHAR(191) NULL,
    `concept` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `balanceDelta` VARCHAR(191) NOT NULL,
    `referenceA` VARCHAR(191) NULL,
    `referenceB` VARCHAR(191) NULL,
    `referenceC` VARCHAR(191) NULL,
    `referenceD` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BankTransaction_bankAccountId_idx`(`bankAccountId`),
    UNIQUE INDEX `BankTransaction_bankAccountId_referenceA_amount_movementDate_key`(`bankAccountId`, `referenceA`, `amount`, `movementDate`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

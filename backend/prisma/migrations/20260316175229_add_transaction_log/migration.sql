-- CreateTable
CREATE TABLE `TransactionLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `context` VARCHAR(191) NOT NULL,
    `operation` VARCHAR(191) NULL,
    `userId` INTEGER NULL,
    `accountNumber` VARCHAR(191) NULL,
    `amount` DOUBLE NULL,
    `reference` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `code` VARCHAR(191) NULL,
    `requestPayload` JSON NULL,
    `responsePayload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TransactionLog_context_idx`(`context`),
    INDEX `TransactionLog_userId_idx`(`userId`),
    INDEX `TransactionLog_accountNumber_idx`(`accountNumber`),
    INDEX `TransactionLog_reference_idx`(`reference`),
    INDEX `TransactionLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TransactionLog` ADD CONSTRAINT `TransactionLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

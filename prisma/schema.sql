-- =============================================================================
-- Tontine — script d'initialisation MariaDB 11.8 (phpMyAdmin Hostinger)
-- Dérivé de prisma/schema.prisma (Prisma 7.10). NE PAS MODIFIER À LA MAIN.
-- Régénération : npm run db:sql
--
-- Import : phpMyAdmin > sélectionner la base (colonne de gauche) > onglet SQL
--          > coller l'intégralité > Exécuter. À exécuter UNE fois, sur une base vide.
-- =============================================================================

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `phoneNumber` VARCHAR(20) NOT NULL,
    `phoneNumberVerified` BOOLEAN NOT NULL DEFAULT false,
    `platformRole` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    UNIQUE INDEX `user_phoneNumber_key`(`phoneNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` TEXT NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(36) NOT NULL,

    UNIQUE INDEX `session_token_key`(`token`),
    INDEX `session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(36) NOT NULL,
    `accountId` TEXT NOT NULL,
    `providerId` TEXT NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `account_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification` (
    `id` VARCHAR(36) NOT NULL,
    `identifier` TEXT NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verification_identifier_idx`(`identifier`(191)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tontine` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `contributionAmount` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'XAF',
    `frequency` ENUM('WEEKLY', 'BIWEEKLY', 'MONTHLY') NOT NULL,
    `startDate` DATE NOT NULL,
    `timezone` VARCHAR(50) NOT NULL DEFAULT 'Africa/Libreville',
    `beneficiaryContributes` BOOLEAN NOT NULL DEFAULT true,
    `penaltyAmount` INTEGER NOT NULL DEFAULT 0,
    `penaltyGraceDays` INTEGER NOT NULL DEFAULT 0,
    `payoutMode` ENUM('DRAW', 'MANUAL') NOT NULL,
    `drawSeed` VARCHAR(64) NULL,
    `drawAlgorithm` VARCHAR(30) NULL,
    `drawnAt` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `monthlyFee` INTEGER NOT NULL DEFAULT 5000,
    `activatedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdById` VARCHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tontine_createdById_idx`(`createdById`),
    INDEX `tontine_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tontine_member` (
    `id` VARCHAR(36) NOT NULL,
    `tontineId` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `role` ENUM('PRESIDENT', 'TREASURER', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `payoutPosition` INTEGER NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tontine_member_userId_idx`(`userId`),
    UNIQUE INDEX `tontine_member_tontineId_userId_key`(`tontineId`, `userId`),
    UNIQUE INDEX `tontine_member_tontineId_payoutPosition_key`(`tontineId`, `payoutPosition`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cycle` (
    `id` VARCHAR(36) NOT NULL,
    `tontineId` VARCHAR(36) NOT NULL,
    `cycleNumber` INTEGER NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `beneficiaryMemberId` VARCHAR(36) NOT NULL,
    `totalExpected` INTEGER NOT NULL,
    `totalCollected` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'COLLECTING', 'PAYOUT_DECLARED', 'PAID_OUT') NOT NULL DEFAULT 'PENDING',
    `payoutAmount` INTEGER NULL,
    `payoutMethod` ENUM('AIRTEL_MONEY', 'MOOV_MONEY', 'CASH', 'BANK_TRANSFER') NULL,
    `payoutReference` VARCHAR(100) NULL,
    `payoutDeclaredAt` DATETIME(3) NULL,
    `payoutDeclaredById` VARCHAR(36) NULL,
    `payoutConfirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cycle_beneficiaryMemberId_idx`(`beneficiaryMemberId`),
    INDEX `cycle_payoutDeclaredById_idx`(`payoutDeclaredById`),
    INDEX `cycle_status_dueDate_idx`(`status`, `dueDate`),
    UNIQUE INDEX `cycle_tontineId_cycleNumber_key`(`tontineId`, `cycleNumber`),
    UNIQUE INDEX `cycle_tontineId_beneficiaryMemberId_key`(`tontineId`, `beneficiaryMemberId`),
    UNIQUE INDEX `cycle_payoutMethod_payoutReference_key`(`payoutMethod`, `payoutReference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contribution` (
    `id` VARCHAR(36) NOT NULL,
    `cycleId` VARCHAR(36) NOT NULL,
    `memberId` VARCHAR(36) NOT NULL,
    `amountDue` INTEGER NOT NULL,
    `penaltyAmount` INTEGER NOT NULL DEFAULT 0,
    `penaltyAppliedAt` DATETIME(3) NULL,
    `amountPaid` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contribution_memberId_idx`(`memberId`),
    INDEX `contribution_status_idx`(`status`),
    UNIQUE INDEX `contribution_cycleId_memberId_key`(`cycleId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_declaration` (
    `id` VARCHAR(36) NOT NULL,
    `contributionId` VARCHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `method` ENUM('AIRTEL_MONEY', 'MOOV_MONEY', 'CASH', 'BANK_TRANSFER') NOT NULL,
    `operatorReference` VARCHAR(100) NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `note` VARCHAR(500) NULL,
    `status` ENUM('DECLARED', 'VALIDATED', 'REJECTED') NOT NULL DEFAULT 'DECLARED',
    `declaredById` VARCHAR(36) NOT NULL,
    `declaredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedById` VARCHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,

    INDEX `payment_declaration_contributionId_idx`(`contributionId`),
    INDEX `payment_declaration_declaredById_idx`(`declaredById`),
    INDEX `payment_declaration_reviewedById_idx`(`reviewedById`),
    INDEX `payment_declaration_status_idx`(`status`),
    UNIQUE INDEX `payment_declaration_method_operatorReference_key`(`method`, `operatorReference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reminder` (
    `id` VARCHAR(36) NOT NULL,
    `cycleId` VARCHAR(36) NOT NULL,
    `recipientMemberId` VARCHAR(36) NOT NULL,
    `kind` ENUM('DUE_SOON', 'OVERDUE', 'PAYOUT_CONFIRMATION') NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `channel` ENUM('WHATSAPP_API', 'WHATSAPP_LINK', 'SMS') NOT NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `scheduledFor` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(500) NULL,
    `providerMessageId` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reminder_recipientMemberId_idx`(`recipientMemberId`),
    INDEX `reminder_status_scheduledFor_idx`(`status`, `scheduledFor`),
    UNIQUE INDEX `reminder_cycleId_recipientMemberId_kind_sequence_key`(`cycleId`, `recipientMemberId`, `kind`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_invoice` (
    `id` VARCHAR(36) NOT NULL,
    `tontineId` VARCHAR(36) NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `amount` INTEGER NOT NULL,
    `dueDate` DATE NOT NULL,
    `status` ENUM('DUE', 'DECLARED', 'PAID', 'WAIVED') NOT NULL DEFAULT 'DUE',
    `method` ENUM('AIRTEL_MONEY', 'MOOV_MONEY', 'CASH', 'BANK_TRANSFER') NULL,
    `operatorReference` VARCHAR(100) NULL,
    `declaredAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `validatedById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `subscription_invoice_validatedById_idx`(`validatedById`),
    INDEX `subscription_invoice_status_dueDate_idx`(`status`, `dueDate`),
    UNIQUE INDEX `subscription_invoice_tontineId_periodStart_key`(`tontineId`, `periodStart`),
    UNIQUE INDEX `subscription_invoice_method_operatorReference_key`(`method`, `operatorReference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` VARCHAR(36) NOT NULL,
    `tontineId` VARCHAR(36) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(50) NULL,
    `entityId` VARCHAR(36) NULL,
    `performedById` VARCHAR(36) NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_tontineId_createdAt_idx`(`tontineId`, `createdAt`),
    INDEX `audit_log_performedById_idx`(`performedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tontine` ADD CONSTRAINT `tontine_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tontine_member` ADD CONSTRAINT `tontine_member_tontineId_fkey` FOREIGN KEY (`tontineId`) REFERENCES `tontine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tontine_member` ADD CONSTRAINT `tontine_member_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cycle` ADD CONSTRAINT `cycle_tontineId_fkey` FOREIGN KEY (`tontineId`) REFERENCES `tontine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cycle` ADD CONSTRAINT `cycle_beneficiaryMemberId_fkey` FOREIGN KEY (`beneficiaryMemberId`) REFERENCES `tontine_member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cycle` ADD CONSTRAINT `cycle_payoutDeclaredById_fkey` FOREIGN KEY (`payoutDeclaredById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution` ADD CONSTRAINT `contribution_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `cycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution` ADD CONSTRAINT `contribution_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `tontine_member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_declaration` ADD CONSTRAINT `payment_declaration_contributionId_fkey` FOREIGN KEY (`contributionId`) REFERENCES `contribution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_declaration` ADD CONSTRAINT `payment_declaration_declaredById_fkey` FOREIGN KEY (`declaredById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_declaration` ADD CONSTRAINT `payment_declaration_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reminder` ADD CONSTRAINT `reminder_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `cycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reminder` ADD CONSTRAINT `reminder_recipientMemberId_fkey` FOREIGN KEY (`recipientMemberId`) REFERENCES `tontine_member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_invoice` ADD CONSTRAINT `subscription_invoice_tontineId_fkey` FOREIGN KEY (`tontineId`) REFERENCES `tontine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_invoice` ADD CONSTRAINT `subscription_invoice_validatedById_fkey` FOREIGN KEY (`validatedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_tontineId_fkey` FOREIGN KEY (`tontineId`) REFERENCES `tontine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_performedById_fkey` FOREIGN KEY (`performedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

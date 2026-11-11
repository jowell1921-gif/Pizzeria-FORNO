-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'LOGGED';

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "bodyText" TEXT,
ADD COLUMN     "subject" TEXT;

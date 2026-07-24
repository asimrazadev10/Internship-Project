-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "editedAt" TIMESTAMPTZ(3);

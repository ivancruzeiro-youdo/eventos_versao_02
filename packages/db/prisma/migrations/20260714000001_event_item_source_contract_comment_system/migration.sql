-- Add sourceContractId to EventItem (tracks which contract contributed this item)
ALTER TABLE "EventItem" ADD COLUMN "sourceContractId" TEXT;

-- Make EventComment.userId nullable (for system auto-comments)
ALTER TABLE "EventComment" ALTER COLUMN "userId" DROP NOT NULL;

-- Add isSystem flag to EventComment
ALTER TABLE "EventComment" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

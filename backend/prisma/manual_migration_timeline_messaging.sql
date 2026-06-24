-- Manual migration for the 4-mandate upgrade (applied to SQLite dev.db).
-- Mirrors the additive model/column changes in schema.prisma /
-- schema.postgres.prisma. Production (PostgreSQL) is migrated via
-- `prisma db push --schema=schema.postgres.prisma` on deploy.

-- --- Note: Admin Remarks Log (Mandate 4B) ---
ALTER TABLE "Note" ADD COLUMN "tags" TEXT;
ALTER TABLE "Note" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT 0;

-- --- ClientProfile: Profile Centre (Mandate 4A) ---
ALTER TABLE "ClientProfile" ADD COLUMN "legalFirstName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "legalMiddleName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "legalLastName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "preferredName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "gender" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "visaSubclass" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "mobile" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "mailingAddress" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "sameAsResidential" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "ClientProfile" ADD COLUMN "employerName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "employmentStartDate" DATETIME;
ALTER TABLE "ClientProfile" ADD COLUMN "annualIncome" REAL;
ALTER TABLE "ClientProfile" ADD COLUMN "loanPurposePref" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "preferredLoanTerm" INTEGER;
ALTER TABLE "ClientProfile" ADD COLUMN "documentChecklist" TEXT;

-- --- ApplicationStage: Loan Application Status Timeline (Mandate 2) ---
CREATE TABLE IF NOT EXISTS "ApplicationStage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "group" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'upcoming',
  "completedAt" DATETIME,
  "dueDate" DATETIME,
  "note" TEXT,
  "hasDate" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ApplicationStage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- --- Message: Messaging Hub (Mandate 4C) ---
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientUserId" TEXT NOT NULL,
  "senderRole" TEXT NOT NULL,
  "body" TEXT,
  "type" TEXT NOT NULL DEFAULT 'text',
  "cardData" TEXT,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "resolved" BOOLEAN NOT NULL DEFAULT 0,
  "flagged" BOOLEAN NOT NULL DEFAULT 0,
  "reactions" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

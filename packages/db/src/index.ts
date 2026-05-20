import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import path from 'path';

// Load .env file from workspace root
config({ path: path.join(__dirname, '../../../.env') });

export * from '@prisma/client';

// Re-export Prisma enums explicitly
export type { EventStatus, GuestStatus, UserRole } from '@prisma/client';

// Create a singleton Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

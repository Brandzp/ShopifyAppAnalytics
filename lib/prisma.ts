// TODO: Re-enable strict PrismaClient typing after `npm run prisma:generate` is part of setup automation.
type PrismaModule = {
  PrismaClient: new (options?: { log?: string[] }) => unknown;
};

const globalForPrisma = globalThis as unknown as { prisma?: unknown };

function createPrismaClient() {
  try {
    const prismaModule = require("@prisma/client") as PrismaModule;
    return new prismaModule.PrismaClient({
      log: ["warn", "error"]
    });
  } catch {
    return null;
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

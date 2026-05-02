import { prisma } from "@/lib/prisma";

export function getDb() {
  return prisma as any;
}

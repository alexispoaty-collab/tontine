import type { Prisma, PrismaClient } from "../generated/prisma/client";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

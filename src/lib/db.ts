import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

// Variables DB_* écrites automatiquement par Hostinger à la création de la base.
const g = globalThis as unknown as { prisma?: PrismaClient };

const create = () =>
  new PrismaClient({
    adapter: new PrismaMariaDb({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      connectionLimit: 5,
    }),
  });

export const prisma = g.prisma ?? create();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

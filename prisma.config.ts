import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL est écrite par Hostinger (création de la base). Un placeholder
// permet `prisma generate` au build même avant que la base existe.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL ?? "mysql://placeholder@localhost:3306/placeholder" },
});

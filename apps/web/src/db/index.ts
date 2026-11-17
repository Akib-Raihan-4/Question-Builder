import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  // Small pool: on serverless hosting each function instance has its own (Neon's pooler does the rest).
  new Pool({ connectionString: process.env.DATABASE_URL, max: process.env.VERCEL ? 3 : 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };

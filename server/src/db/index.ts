import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/worldcup";

// One shared connection pool for the server + scripts.
export const sql = postgres(url, { max: 10 });
export const db = drizzle(sql, { schema });
export { schema };

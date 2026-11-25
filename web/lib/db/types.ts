import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Either the postgres-js database in production or PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

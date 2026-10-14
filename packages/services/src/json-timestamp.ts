import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * A timestamptz column rendered the way PostgREST returned it, through
 * `to_json` (`2026-10-01T10:05:00.123456+00:00`), rather than Postgres' text
 * output (`2026-10-01 10:05:00.123456+00`), so tool outputs keep their shape.
 */
export const jsonTimestamp = (column: AnyPgColumn): SQL<string | null> =>
  sql<string | null>`to_json(${column}) #>> '{}'`;

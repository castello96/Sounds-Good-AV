import { sql } from "drizzle-orm";
import { BUSINESS_TIME_ZONE } from "@shared/time";

/**
 * Converts a wall-clock time in the business's time zone, like
 * "2026-06-20T18:00", to a timestamptz. Postgres handles daylight saving.
 */
export const localToUtc = (local: string) =>
  sql<Date>`(${local.replace("T", " ")}::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE})`;

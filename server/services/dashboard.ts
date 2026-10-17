import { and, asc, desc, eq, gt, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { UPCOMING_DAYS, type Dashboard, type DashboardBooking, type DashboardStats } from "@shared/dashboard";
import { addDays, toLocalInput } from "@shared/time";
import { db } from "../db";
import { addresses, bookings, customers } from "../db/schema";
import { packedCount, paidCents, quantityTotal, summaryColumns, toSummary } from "./bookings";
import { emptyIssueCounts, listOutOfService } from "./gearIssues";
import { localToUtc } from "./time";

const balance = sql<number>`(${bookings.totalPriceCents} - ${paidCents})`;

function dashboardRows(where: SQL | undefined, ...order: SQL[]): Promise<DashboardBooking[]> {
  return db
    .select({
      ...summaryColumns,
      packed: packedCount,
      quantity: quantityTotal,
      venueName: addresses.venueName,
      city: addresses.city,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .leftJoin(addresses, eq(addresses.id, bookings.addressId))
    .where(where)
    .orderBy(...order, asc(bookings.id))
    .then((rows) =>
      rows.map((r) => ({ ...toSummary(r), packed: r.packed, quantity: r.quantity, venueName: r.venueName, city: r.city })),
    );
}

/** What needs attention today, as of `now`. */
export async function getDashboard(now = new Date()): Promise<Dashboard> {
  const today = toLocalInput(now.toISOString()).slice(0, 10);
  // Midnight business time, some days from today.
  const midnight = (days: number) => localToUtc(`${addDays(today, days)}T00:00`);
  const todayStart = midnight(0);
  const tomorrowStart = midnight(1);
  const confirmed = eq(bookings.status, "confirmed");
  // Confirmed bookings always have out and back times.
  const stillOut = gt(summaryColumns.gearOut, 0);

  // One after another rather than all at once, so a page load doesn't take
  // the whole connection pool. Each is a few milliseconds.
  const overdue = await dashboardRows(and(confirmed, stillOut, lt(bookings.backAt, now)), asc(bookings.backAt));
  const goingOut = await dashboardRows(
    and(
      confirmed,
      lt(bookings.outAt, tomorrowStart),
      sql`(${bookings.outAt} >= ${todayStart} or ${packedCount} < ${quantityTotal})`,
    ),
    asc(bookings.outAt),
  );
  const tomorrow = await dashboardRows(and(confirmed, gte(bookings.outAt, tomorrowStart), lt(bookings.outAt, midnight(2))));
  const comingBack = await dashboardRows(
    and(confirmed, stillOut, gte(bookings.backAt, now), lt(bookings.backAt, tomorrowStart)),
    asc(bookings.backAt),
  );
  const eventsToday = await dashboardRows(
    and(confirmed, lt(bookings.eventStartAt, tomorrowStart), gt(bookings.eventEndAt, todayStart)),
    asc(bookings.eventStartAt),
  );
  const upcoming = await dashboardRows(
    and(confirmed, gte(bookings.eventStartAt, tomorrowStart), lt(bookings.eventStartAt, midnight(UPCOMING_DAYS + 1))),
    asc(bookings.eventStartAt),
  );
  const inquiries = await dashboardRows(eq(bookings.status, "inquiry"), asc(bookings.createdAt));
  const balances = await dashboardRows(
    and(inArray(bookings.status, ["confirmed", "completed"]), gt(balance, 0)),
    desc(balance),
  );
  const outOfService = await listOutOfService();
  const stats = await getStats(Number(today.slice(0, 4)));

  const counts = emptyIssueCounts();
  for (const entry of outOfService) counts[entry.kind] += entry.quantity;

  return {
    today,
    overdue,
    goingOut,
    goingOutTomorrow: tomorrow.length,
    comingBack,
    eventsToday,
    upcoming,
    inquiries,
    balances,
    balanceTotalCents: balances.reduce((sum, b) => sum + b.totalPriceCents! - b.paidCents, 0),
    outOfService: counts,
    stats,
  };
}

/** Completed bookings and money earned, this year and all time, by event date. */
async function getStats(year: number): Promise<DashboardStats> {
  const thisYear = sql`${bookings.eventStartAt} >= ${localToUtc(`${year}-01-01T00:00`)}
    and ${bookings.eventStartAt} < ${localToUtc(`${year + 1}-01-01T00:00`)}`;
  const completed = sql`${bookings.status} = 'completed'`;
  // Cancelled bookings count too, for any deposit that wasn't refunded.
  const finished = sql`${bookings.status} in ('completed', 'cancelled')`;
  const open = sql`${bookings.status} in ('inquiry', 'quoted', 'confirmed')`;
  // Money totals can pass what an int holds, and come back from Postgres as strings.
  const total = (where: SQL) => sql<string>`coalesce(sum(${paidCents}) filter (where ${where}), 0)::bigint`;
  const count = (where: SQL) => sql<number>`(count(*) filter (where ${where}))::int`;

  const [row] = await db
    .select({
      completed: count(completed),
      completedThisYear: count(sql`${completed} and ${thisYear}`),
      earned: total(finished),
      earnedThisYear: total(sql`${finished} and ${thisYear}`),
      held: total(open),
      heldCount: count(sql`${open} and ${paidCents} > 0`),
    })
    .from(bookings);
  return {
    year,
    thisYear: { completed: row.completedThisYear, earnedCents: Number(row.earnedThisYear) },
    allTime: { completed: row.completed, earnedCents: Number(row.earned) },
    depositsHeldCents: Number(row.held),
    depositsHeldCount: row.heldCount,
  };
}

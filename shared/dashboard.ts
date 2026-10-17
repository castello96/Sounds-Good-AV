import type { BookingSummary } from "./bookings";
import type { IssueCounts } from "./gearIssues";

/** A booking on the dashboard, with what staff need to act on it at a glance. */
export interface DashboardBooking extends BookingSummary {
  // Units and counts packed so far (including any back already) out of everything booked.
  packed: number;
  quantity: number;
  // Where the event is. Null for pickups without a venue.
  venueName: string | null;
  city: string | null;
}

/**
 * What needs attention today. Every list holds confirmed bookings except
 * inquiries and balances. "Today" is the business's day in New York.
 */
export interface Dashboard {
  // "2026-06-20"
  today: string;
  // Gear still out past its back time. Most overdue first.
  overdue: DashboardBooking[];
  // Leaving today, plus bookings that were due out earlier and still aren't fully packed.
  goingOut: DashboardBooking[];
  // How many confirmed bookings go out tomorrow, to prep the night before.
  goingOutTomorrow: number;
  // Due back later today with gear still out.
  comingBack: DashboardBooking[];
  // Events running at any point today.
  eventsToday: DashboardBooking[];
  // Events starting in the next UPCOMING_DAYS days, not counting today.
  upcoming: DashboardBooking[];
  // Oldest first, so nobody waits longest.
  inquiries: DashboardBooking[];
  // Confirmed and completed bookings that still owe money. Largest first.
  balances: DashboardBooking[];
  balanceTotalCents: number;
  // Gear in repair or lost right now.
  outOfService: IssueCounts;
  stats: DashboardStats;
}

export interface PeriodStats {
  completed: number;
  // Payments less refunds on completed bookings and cancelled ones that kept a deposit.
  earnedCents: number;
}

/** Totals by event date. "This year" is the calendar year in New York. */
export interface DashboardStats {
  year: number;
  thisYear: PeriodStats;
  allTime: PeriodStats;
  // Paid on bookings that haven't happened or finished yet. Not earned until they're completed.
  depositsHeldCents: number;
  depositsHeldCount: number;
}

export const UPCOMING_DAYS = 14;

/** One line in a booking's history, newest first. */
export interface HistoryEntry {
  id: number;
  at: string;
  // The staff member who did it. Null when it came from the public site.
  actor: string | null;
  summary: string;
  // Extra detail, like the old and new price.
  detail: string | null;
}

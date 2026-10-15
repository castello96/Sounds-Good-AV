// The business operates in Long Island / NYC. Times staff and customers type
// are wall-clock times there, whatever time zone their device is in.
export const BUSINESS_TIME_ZONE = "America/New_York";

// A wall-clock date and time as typed into a datetime-local input.
export const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// A wall-clock date as typed into a date input.
export const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** An instant as business wall-clock time for a datetime-local input: "2026-06-20T18:00". */
export function toLocalInput(iso: string): string {
  const p = Object.fromEntries(partsFormat.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Today's date in business time: "2026-06-20". */
export const todayLocal = () => toLocalInput(new Date().toISOString()).slice(0, 10);

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** "Sat, Jun 20, 2026, 6:00 PM" in business time. */
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** "Sat, Jun 20, 2026" in business time. */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** "6:00 PM" in business time. */
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

/** "Sat, Jun 20, 2026, 6:00 PM to 11:00 PM", naming the end date only when it differs. */
export function formatRange(startIso: string, endIso: string): string {
  const sameDay = formatDate(startIso) === formatDate(endIso);
  return `${formatDateTime(startIso)} to ${sameDay ? timeFormat.format(new Date(endIso)) : formatDateTime(endIso)}`;
}

/** A wall-clock date some days later (or earlier): addDays("2026-06-30", 1) gives "2026-07-01". */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

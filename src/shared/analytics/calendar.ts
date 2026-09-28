/** Calendar dates use the selected IANA zone; storage and query boundaries remain UTC. */
export function calendarDay(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function offsetAt(timestamp: number, timezone: string) {
  const value =
    new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    })
      .formatToParts(timestamp)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(value);
  return match
    ? (match[1] === "-" ? -1 : 1) *
        (Number(match[2]) * 60 + Number(match[3])) *
        60000
    : 0;
}
export function calendarMidnight(day: string, timezone: string) {
  const nominal = Date.parse(`${day}T00:00:00.000Z`);
  let candidate = nominal - offsetAt(nominal, timezone);
  const seen = new Set<number>();
  for (let i = 0; i < 4; i++) {
    const next = nominal - offsetAt(candidate, timezone);
    if (next === candidate) return new Date(next).toISOString();
    if (seen.has(next))
      return new Date(Math.max(candidate, next)).toISOString(); // midnight skipped by a DST transition
    seen.add(candidate);
    candidate = next;
  }
  return new Date(candidate).toISOString();
}
export function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400_000)
    .toISOString()
    .slice(0, 10);
}
export function calendarWindow(
  days: number,
  timezone: string,
  now = new Date(),
  previous = false,
) {
  const today = calendarDay(now, timezone);
  const endDay = shiftDay(today, previous ? 1 - days : 1);
  const startDay = shiftDay(endDay, -days);
  return {
    from: calendarMidnight(startDay, timezone),
    to: new Date(
      Date.parse(calendarMidnight(endDay, timezone)) - 1,
    ).toISOString(),
  };
}
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

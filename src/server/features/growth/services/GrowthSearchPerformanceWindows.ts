const REQUEST_WINDOW_DAYS = 90;

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function growthSearchPerformanceRequestWindows(
  startDate: string,
  endDate: string,
) {
  const windows: Array<{ startDate: string; endDate: string }> = [];
  let windowStart = startDate;
  while (windowStart <= endDate) {
    const candidateEnd = addDays(windowStart, REQUEST_WINDOW_DAYS - 1);
    const windowEnd = candidateEnd < endDate ? candidateEnd : endDate;
    windows.push({ startDate: windowStart, endDate: windowEnd });
    windowStart = addDays(windowEnd, 1);
  }
  return windows;
}

import { parseISO, getDay } from "date-fns";

export function isWeekend(iso: string): boolean {
  const d = getDay(parseISO(iso));
  return d === 0 || d === 6;
}

export function isHolidayOrWeekend(
  iso: string,
  holidaySet: Set<string>
): boolean {
  return isWeekend(iso) || holidaySet.has(iso);
}

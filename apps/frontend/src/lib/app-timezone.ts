import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

let appTimezone = "UTC";

export function setAppTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    appTimezone = timezone;
  } catch {
    appTimezone = "UTC";
  }
}

export function getAppTimezone() {
  return appTimezone;
}

export function formatApp(
  value: Date | string | number,
  pattern: string,
  options?: Parameters<typeof formatInTimeZone>[3],
) {
  return formatInTimeZone(value, appTimezone, pattern, options);
}

export function todayInAppTimezone() {
  return formatInTimeZone(new Date(), appTimezone, "yyyy-MM-dd");
}

export function toUtcIsoInAppTimezone(localDateTime: string) {
  return fromZonedTime(localDateTime, appTimezone).toISOString();
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayIsoDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function parseGarminDate(value: string | undefined): Date {
  const date = value ?? todayIsoDate();
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`Expected date in YYYY-MM-DD format, received "${date}".`);
  }

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date "${date}".`);
  }

  return parsed;
}

export function toIsoDate(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

export function secondsToHours(seconds: unknown): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return null;
  }

  return Math.round((seconds / 3600) * 10) / 10;
}

type TimestampLike = {
  seconds?: number;
  _seconds?: number;
  toDate?: () => Date;
};

export function dateFromUnknown(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "object" && value !== null) {
    const timestamp = value as TimestampLike;

    if (typeof timestamp.toDate === "function") {
      const parsed = timestamp.toDate();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    const seconds =
      typeof timestamp.seconds === "number"
        ? timestamp.seconds
        : typeof timestamp._seconds === "number"
          ? timestamp._seconds
          : 0;

    if (seconds) {
      return new Date(seconds * 1000);
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
}

export function secondsFromUnknown(value: unknown) {
  const parsed = dateFromUnknown(value);
  return parsed ? Math.floor(parsed.getTime() / 1000) : 0;
}

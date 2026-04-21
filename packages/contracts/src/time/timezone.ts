let configuredTimeZone: string | undefined;

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

export function getZonedTimeParts(date: Date, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? '0'),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? '0'),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? '0'),
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? '0'),
    second: Number(parts.find((part) => part.type === 'second')?.value ?? '0'),
  };
}

function getOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getZonedTimeParts(date, timeZone);
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getMilliseconds(),
  );

  return Math.round((utcTime - date.getTime()) / 60000);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function configureTimeZone(timeZone?: string): void {
  if (timeZone && !isValidTimeZone(timeZone)) {
    throw new Error(`Invalid time zone '${timeZone}'`);
  }

  configuredTimeZone = timeZone;
}

export function getConfiguredTimeZone(): string | undefined {
  return configuredTimeZone;
}

export function createTimestamp(input: Date = new Date(), timeZone = configuredTimeZone): string {
  if (!timeZone) {
    return input.toISOString();
  }

  const parts = getZonedTimeParts(input, timeZone);
  const offsetMinutes = getOffsetMinutes(input, timeZone);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;

  return [
    `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`,
    'T',
    `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${pad(input.getMilliseconds(), 3)}`,
    `${sign}${pad(offsetHours)}:${pad(offsetRemainderMinutes)}`,
  ].join('');
}

export function parseTimestamp(value: string): number {
  return Date.parse(value);
}

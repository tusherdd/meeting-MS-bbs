const UNIT_SECONDS: Readonly<Record<string, number>> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

/**
 * "15m" → 900, "7d" → 604800. Same format the env schema accepts (JWT_*_TTL).
 * Throws on anything else so a bad value can never silently become "no expiry".
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new RangeError(`Invalid duration "${value}" (use e.g. 15m, 12h, 7d)`);
  }
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2]];
  if (seconds <= 0) {
    throw new RangeError(`Duration must be positive: "${value}"`);
  }
  return seconds;
}

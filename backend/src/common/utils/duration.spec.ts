import { parseDurationToSeconds } from './duration';

describe('parseDurationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['12h', 43_200],
    ['7d', 604_800],
  ])('%s → %d', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it.each(['', '15', 'm', '15 minutes', '-5m', '1w', '0m'])(
    'rejects "%s"',
    (input) => {
      expect(() => parseDurationToSeconds(input)).toThrow(RangeError);
    },
  );
});

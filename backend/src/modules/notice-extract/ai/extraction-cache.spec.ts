import type { NoticeExtraction } from '../notice-extract.types';
import { ExtractionCache } from './extraction-cache';

/** v1.21 part 2: the 1-hour LRU cache of AI results. */

function value(title: string): NoticeExtraction {
  return {
    method: 'AI',
    fields: {
      title,
      date: null,
      startTime: null,
      endTime: null,
      venue: null,
      agenda: null,
    },
    chairText: null,
    participants: [],
    warnings: [],
  };
}

describe('ExtractionCache', () => {
  it('returns a hit within the TTL and a copy (not the stored object)', () => {
    let now = 0;
    const cache = new ExtractionCache(1000, 10, () => now);
    cache.set('a', value('A'));
    now = 999;
    const hit = cache.get('a');
    expect(hit?.fields.title).toBe('A');
    hit!.fields.title = 'changed';
    expect(cache.get('a')?.fields.title).toBe('A');
  });

  it('expires after the TTL', () => {
    let now = 0;
    const cache = new ExtractionCache(1000, 10, () => now);
    cache.set('a', value('A'));
    now = 1000;
    expect(cache.get('a')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('drops the least recently used entry when full', () => {
    const cache = new ExtractionCache(60_000, 2);
    cache.set('a', value('A'));
    cache.set('b', value('B'));
    cache.get('a');
    cache.set('c', value('C'));
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });
});

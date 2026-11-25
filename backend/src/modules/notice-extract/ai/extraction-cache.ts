import type { NoticeExtraction } from '../notice-extract.types';

/** AI results are kept this long (v1.21 part 2, SPEC.md §6.12). */
export const AI_CACHE_TTL_MS = 60 * 60_000;
/** At most this many results (least recently used dropped first). */
export const AI_CACHE_MAX_ENTRIES = 100;

/**
 * In-memory LRU cache of AI extractions by the file's sha256 (+ model), so the same notice is
 * never sent to the AI twice within an hour. Lost on restart; never written to disk. Holds only
 * the extracted fields (no officer data, no file bytes). Returns copies.
 */
export class ExtractionCache {
  private readonly entries = new Map<
    string,
    { value: NoticeExtraction; expiresAt: number }
  >();

  constructor(
    private readonly ttlMs = AI_CACHE_TTL_MS,
    private readonly maxEntries = AI_CACHE_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): NoticeExtraction | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    // Most recently used goes to the end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }

  set(key: string, value: NoticeExtraction): void {
    this.entries.delete(key);
    this.entries.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + this.ttlMs,
    });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

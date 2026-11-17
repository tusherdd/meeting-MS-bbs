import { killOrphanPlaywrightBrowsers } from "./support/orphans";

/**
 * Runs once after the whole suite. Playwright closes the browsers it launched itself; this only
 * removes browser processes orphaned by an earlier hard-killed run, so none stay in memory.
 */
export default function globalTeardown(): void {
  const killed = killOrphanPlaywrightBrowsers();
  if (killed > 0) console.log(`[e2e] closed ${killed} orphan browser process(es)`);
}

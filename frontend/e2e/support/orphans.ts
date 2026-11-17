import { execFileSync } from "node:child_process";

/**
 * Kills Playwright browser processes left behind by an earlier, hard-killed run (e.g. Ctrl+C
 * twice, or the editor stopping the runner). Only processes whose binary lives in Playwright's
 * browser cache ("ms-playwright") AND whose parent is gone (re-parented to launchd/init, ppid 1)
 * are touched, together with their helper processes. Browsers of a running test run, the user's
 * own Chrome and Puppeteer's Chrome (PDF reports) are never affected.
 */
export function killOrphanPlaywrightBrowsers(): number {
  if (process.platform === "win32") return 0;
  let out: string;
  try {
    out = execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  } catch {
    return 0;
  }
  const rows = out
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));

  const isPlaywright = (cmd: string) => cmd.includes("ms-playwright");
  const victims = new Set(
    rows.filter((r) => r.ppid === 1 && isPlaywright(r.cmd)).map((r) => r.pid),
  );
  // Add their descendants (renderer/GPU helpers).
  let grew = victims.size > 0;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (!victims.has(r.pid) && victims.has(r.ppid)) {
        victims.add(r.pid);
        grew = true;
      }
    }
  }
  for (const pid of victims) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  return victims.size;
}

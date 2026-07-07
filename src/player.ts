// Plays a stream URL via a local player (mpv preferred, ffplay fallback).
// The child is DETACHED and tracked in the lock-guarded registry (registry.ts),
// so a later CLI invocation (e.g. `pause`) — a different process entirely — can
// find and kill it. stop() also runs an orphan sweep: any mpv/ffplay pointed at
// one of our stream hosts gets killed even if it somehow escaped the registry
// (crashed session, killed watchdog, lost-update race). That sweep is what
// guarantees "no music survives a stop".
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { now, readAnchor } from "./state.js";
import { hosts } from "./stations.js";
import { killPid, findOrphanPlayers } from "./proc.js";
import {
  addPlayer,
  addWatchdog,
  drainPlayers,
  drainWatchdogs,
  livePlayers,
} from "./registry.js";

type Player = "mpv" | "ffplay";

function detect(): Player | null {
  for (const p of ["mpv", "ffplay"] as Player[]) {
    try {
      // argv array, no MSYS flag mangling. `command` is a shell builtin, so on
      // unix we invoke it through sh; p comes from a fixed list, so no injection.
      if (process.platform === "win32") {
        execFileSync("where", [p], { stdio: "ignore", windowsHide: true });
      } else {
        execFileSync("sh", ["-c", `command -v ${p}`], { stdio: "ignore" });
      }
      return p;
    } catch {
      /* not found, try next */
    }
  }
  return null;
}

export function playerAvailable(): Player | null {
  return detect();
}

export function installHint(): string {
  return "No audio player found. Install mpv (recommended) or ffmpeg:\n" +
    "  macOS:   brew install mpv\n" +
    "  Windows: winget install mpv   (or scoop install mpv)\n" +
    "  Linux:   sudo apt install mpv  (or your package manager)";
}

// Kill every player/watchdog this or a prior CLI spawned, THEN sweep for any
// orphaned mpv/ffplay still pointed at our hosts. Best-effort throughout: a PID
// that's already gone is fine.
export function stop(): void {
  for (const p of drainPlayers()) killPid(p.pid);
  for (const w of drainWatchdogs()) killPid(w.pid);
  sweepOrphans();
}

// The safety net. Find any mpv/ffplay whose command line references one of our
// stream hosts and kill it — this is what catches players that the registry
// lost track of (the original "music keeps playing after terminal close" bug).
export function sweepOrphans(): void {
  for (const pid of findOrphanPlayers(hosts())) killPid(pid);
}

const here = dirname(fileURLToPath(import.meta.url));

// volume is 0-100. mpv takes --volume=0..100; ffplay takes -volume 0..256.
export function play(url: string, volume: number): void {
  const player = detect();
  if (!player) throw new Error(installHint());
  stop(); // kill previous stream + watchdog + any orphans first
  const args =
    player === "mpv"
      ? ["--no-video", "--really-quiet", `--volume=${volume}`, url]
      : ["-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", String(Math.round((volume / 100) * 256)), url];
  // detached + unref lets the child outlive this short-lived CLI process.
  const child = spawn(player, args, { stdio: "ignore", detached: true, windowsHide: true });
  child.unref();
  if (child.pid) {
    let host: string | undefined;
    try { host = new URL(url).host; } catch { /* leave undefined */ }
    addPlayer(child.pid, host);
    spawnWatchdog(child.pid);
  }
}

// Launch the detached watchdog that stops the player when the session anchor
// dies. No anchor (e.g. music started from a raw CLI call with no MCP server
// running) → skip it; there's no session to bind to.
function spawnWatchdog(playerPid: number): void {
  const anchor = readAnchor();
  if (!anchor) return;
  const wd = spawn(
    process.execPath,
    [
      join(here, "watchdog.js"),
      String(anchor.pid),
      anchor.token ?? "",
      String(playerPid),
    ],
    { stdio: "ignore", detached: true, windowsHide: true }
  );
  wd.unref();
  if (wd.pid) addWatchdog(wd.pid);
}

export function isPlaying(): boolean {
  return livePlayers().length > 0;
}

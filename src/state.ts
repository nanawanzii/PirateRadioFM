// Shared NowPlaying state. Persisted to disk so each CLI invocation sees the
// prior process's state (current genre, Spotify tokens). NOTE: player/watchdog
// PIDs deliberately do NOT live here anymore — they're in registry.ts under a
// cross-process lock, because two CLIs writing this file concurrently used to
// lost-update each other's PID and orphan the player.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { procStartToken, sameProcess } from "./proc.js";

export type PlayState = "stopped" | "playing" | "paused";
export type Source = "radio" | "spotify";

export interface NowPlaying {
  state: PlayState;
  source: Source | null;
  genre: string | null;
  stationName: string | null;
  stationIndex: number;
  title: string | null;
  volume: number;
  spotifyVerifier: string | null; // PKCE verifier held between /spotify-login and /spotify-complete
}

const stateDir = join(homedir(), ".pirate-radio");
const statePath = join(stateDir, "state.json");
// The MCP server writes its own PID + start-token here on startup. It is a child
// of the Claude Code session, so when the session/terminal closes (even a hard
// kill) this process dies. The watchdog polls this to know when to stop music.
// The token defeats PID reuse: a recycled anchor PID won't match the token, so
// the watchdog correctly treats the session as dead instead of "still alive".
const anchorPath = join(stateDir, "anchor.json");

const defaults: NowPlaying = {
  state: "stopped",
  source: null,
  genre: null,
  stationName: null,
  stationIndex: 0,
  title: null,
  volume: 80,
  spotifyVerifier: null,
};

// Mutable proxy of the on-disk state. tools.ts writes to this via `now.x = y`,
// then cli.ts calls saveState() before exiting.
export const now: NowPlaying = { ...defaults };

export function loadState(): void {
  if (!existsSync(statePath)) return;
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>;
    // Whitelist known keys only. Older state files carried mpvPid/watchdogPid;
    // copying raw wholesale would resurrect those dead fields and persist them
    // right back out. Pull each field explicitly, falling back to the default.
    const target = now as unknown as Record<string, unknown>;
    for (const key of Object.keys(defaults) as (keyof NowPlaying)[]) {
      target[key] = key in raw ? raw[key] : defaults[key];
    }
  } catch {
    // Corrupt state file — reset to defaults rather than crashing.
    Object.assign(now, defaults);
  }
}

// Atomic write (temp + rename) so a hard-killed process can't leave a truncated
// state.json that loadState would then discard as corrupt.
export function saveState(): void {
  mkdirSync(stateDir, { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(now, null, 2));
  renameSync(tmp, statePath);
}

// --- session anchor -------------------------------------------------------
// The MCP server calls writeAnchor(process.pid) on startup. The watchdog reads
// it via readAnchor() and polls anchorAlive() to detect session death.
export interface Anchor { pid: number; token: string | null; }

export function writeAnchor(pid: number): void {
  mkdirSync(stateDir, { recursive: true });
  const anchor: Anchor = { pid, token: procStartToken(pid) };
  const tmp = `${anchorPath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(anchor));
  renameSync(tmp, anchorPath);
  // Remove the pre-token legacy anchor file, if a prior version left one behind.
  try { unlinkSync(join(stateDir, "anchor.pid")); } catch { /* none — fine */ }
}

export function readAnchor(): Anchor | null {
  if (!existsSync(anchorPath)) return null;
  try {
    const a = JSON.parse(readFileSync(anchorPath, "utf8")) as Partial<Anchor>;
    if (typeof a.pid === "number" && a.pid > 0) {
      return { pid: a.pid, token: a.token ?? null };
    }
  } catch {
    /* corrupt anchor file */
  }
  return null;
}

// True iff the anchored session process is still the SAME live process. A reused
// PID (session died, OS handed the number to something else) fails the token
// check and returns false — which is what lets the watchdog stop the music.
export function anchorAlive(anchor: Anchor | null): boolean {
  if (!anchor) return false;
  return sameProcess(anchor.pid, anchor.token);
}

export function clearAnchor(): void {
  try { unlinkSync(anchorPath); } catch { /* already gone */ }
}

export function statePathFor(): string {
  return statePath;
}

export function describe(): string {
  if (now.state === "stopped") return "Stopped.";
  const what =
    now.source === "radio"
      ? `${now.genre} radio — ${now.stationName}`
      : `Spotify — ${now.title ?? "(unknown)"}`;
  return `${now.state === "paused" ? "Paused" : "Playing"}: ${what} (vol ${now.volume})`;
}

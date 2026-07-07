// Lock-guarded registry of the player + watchdog processes this tool has spawned.
//
// WHY THIS EXISTS: the MCP server and each slash-command CLI are *separate*
// processes that formerly tracked the mpv/ffplay PID inside the shared
// state.json. Two of them writing state.json concurrently lost-updated each
// other — one process's `play()` would record a PID that another process's
// `pause()` immediately overwrote with null, orphaning the player (nothing left
// pointing at it, so no stop/pause could ever find it). That was the root cause
// of "music keeps playing after the terminal closes".
//
// Fix: player PIDs live in their OWN file, and every mutation happens under an
// atomic lockfile so read-modify-write is serialized across processes. Entries
// carry a start-time token so a reused PID is never mistaken for a live player.
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  rmSync,
  rmdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pidAlive, sameProcess, procStartToken } from "./proc.js";

export interface ProcEntry {
  pid: number;
  token: string | null; // start-time fingerprint captured at spawn (PID-reuse guard)
  host?: string;         // stream host, for diagnostics
}
interface Registry {
  players: ProcEntry[];
  watchdogs: ProcEntry[];
}

const dir = join(homedir(), ".pirate-radio");
const registryPath = join(dir, "players.json");
const lockPath = join(dir, "players.lock");

function readRaw(): Registry {
  if (!existsSync(registryPath)) return { players: [], watchdogs: [] };
  try {
    const r = JSON.parse(readFileSync(registryPath, "utf8")) as Partial<Registry>;
    return { players: r.players ?? [], watchdogs: r.watchdogs ?? [] };
  } catch {
    return { players: [], watchdogs: [] };
  }
}

function writeRaw(r: Registry): void {
  mkdirSync(dir, { recursive: true });
  // Atomic write: a full write to a temp file then rename. rename is atomic on
  // win32/macOS/Linux, so a process killed mid-write (the whole point of this
  // tool — terminals get hard-killed) can never leave a truncated registry that
  // readRaw would parse as "no players" and orphan the stream.
  const tmp = `${registryPath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(r, null, 2));
  renameSync(tmp, registryPath);
}

// --- cross-process lock ----------------------------------------------------
// mkdir is atomic on win32/macOS/Linux: exactly one caller wins the create.
// We record the holder's PID inside so a crashed holder's lock can be broken.
const LOCK_STALE_MS = 15_000;
const LOCK_WAIT_MS = 5_000;

function sleep(ms: number): void {
  // Synchronous spin-free wait using Atomics — no busy loop, works everywhere.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withLock<T>(fn: (r: Registry) => T): T {
  mkdirSync(dir, { recursive: true });
  const holderFile = join(lockPath, "holder");
  const deadline = Date.now() + LOCK_WAIT_MS;
  // NOTE: Date.now() is fine here — this runs in the built dist, never inside a
  // Workflow script (the only place Date.now is stubbed).
  for (;;) {
    try {
      mkdirSync(lockPath); // atomic: throws EEXIST if held
      break;
    } catch {
      // Held. Break it if the holder is dead or the lock is ancient.
      let broke = false;
      try {
        const holderPid = Number(readFileSync(holderFile, "utf8").trim());
        if (!pidAlive(holderPid)) broke = true;
      } catch {
        // No holder file yet (racing creator) — treat age as the signal.
      }
      if (!broke) {
        try {
          const age = Date.now() - statMtime(lockPath);
          if (age > LOCK_STALE_MS) broke = true;
        } catch {
          /* lock vanished between check and stat — retry */
        }
      }
      if (broke) {
        forceReleaseLock();
        continue;
      }
      if (Date.now() > deadline) {
        // Give up waiting and steal it rather than deadlock the user's music controls.
        forceReleaseLock();
        continue;
      }
      sleep(50);
    }
  }
  try {
    writeFileSync(holderFile, String(process.pid));
    const reg = readRaw();
    const result = fn(reg);
    writeRaw(reg);
    return result;
  } finally {
    releaseLock();
  }
}

function statMtime(p: string): number {
  return statSync(p).mtimeMs;
}

function releaseLock(): void {
  try { rmSync(join(lockPath, "holder"), { force: true }); } catch { /* ignore */ }
  try { rmdirSync(lockPath); } catch { /* already gone */ }
}
function forceReleaseLock(): void {
  try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* ignore */ }
}

// --- public API (all lock-guarded) -----------------------------------------

// Record a freshly spawned player. Captures its start token for reuse-safety.
export function addPlayer(pid: number, host?: string): void {
  const token = procStartToken(pid);
  withLock((r) => {
    r.players = prune(r.players);
    r.players.push({ pid, token, host });
  });
}

export function addWatchdog(pid: number): void {
  const token = procStartToken(pid);
  withLock((r) => {
    r.watchdogs = prune(r.watchdogs);
    r.watchdogs.push({ pid, token });
  });
}

// Snapshot of currently-live players (reuse-verified). Used by isPlaying().
export function livePlayers(): ProcEntry[] {
  return withLock((r) => {
    r.players = prune(r.players);
    return [...r.players];
  });
}

export function liveWatchdogs(): ProcEntry[] {
  return withLock((r) => {
    r.watchdogs = prune(r.watchdogs);
    return [...r.watchdogs];
  });
}

// Remove entries and hand them back so the caller can kill them under no lock.
export function drainPlayers(): ProcEntry[] {
  return withLock((r) => {
    const live = prune(r.players);
    r.players = [];
    return live;
  });
}

export function drainWatchdogs(): ProcEntry[] {
  return withLock((r) => {
    const live = prune(r.watchdogs);
    r.watchdogs = [];
    return live;
  });
}

export function drainAll(): { players: ProcEntry[]; watchdogs: ProcEntry[] } {
  return withLock((r) => {
    const players = prune(r.players);
    const watchdogs = prune(r.watchdogs);
    r.players = [];
    r.watchdogs = [];
    return { players, watchdogs };
  });
}

// Drop dead/recycled entries. A null token means we couldn't fingerprint at
// spawn, so fall back to bare liveness (sameProcess handles this).
function prune(list: ProcEntry[]): ProcEntry[] {
  return list.filter((e) => sameProcess(e.pid, e.token));
}

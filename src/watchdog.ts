#!/usr/bin/env node
// Detached watchdog. Spawned by player.play() when music starts, it outlives the
// short-lived CLI process (like the player itself) and polls the session anchor
// written by the MCP server. When the anchor dies — the Claude Code session
// closed, the terminal was shut, or the process was hard-killed — the SessionEnd
// hook is NOT guaranteed to fire, so this loop is what actually stops the music.
//
// Two correctness fixes over the naive version:
//   1. PID-reuse guard: the anchor carries a start-time token. A bare PID probe
//      can be fooled when the OS recycles the anchor's PID onto an unrelated
//      process (music then plays forever). We re-verify the token so a recycled
//      PID counts as "session dead".
//   2. Sweep on death: instead of killing only the one player PID we were handed,
//      we kill EVERY registered player/watchdog and then orphan-sweep by host,
//      so nothing our tool started can survive the session.
//
// Invoked as: node dist/watchdog.js <anchorPid> <anchorToken> <playerPid>
import { clearAnchor, type Anchor } from "./state.js";
import { pidAlive, sameProcess, killPid, findOrphanPlayers } from "./proc.js";
import { hosts } from "./stations.js";
import { drainAll, livePlayers } from "./registry.js";

const anchorPid = Number(process.argv[2]);
const anchorToken = process.argv[3] ? process.argv[3] : null; // "" → null
const playerPid = Number(process.argv[4]);

if (!Number.isInteger(anchorPid) || !Number.isInteger(playerPid)) {
  process.exit(1);
}

const anchor: Anchor = { pid: anchorPid, token: anchorToken };

function stopEverything(): void {
  const { players, watchdogs } = drainAll();
  for (const p of players) killPid(p.pid);
  for (const w of watchdogs) {
    if (w.pid !== process.pid) killPid(w.pid); // don't kill ourselves early
  }
  // Safety net: anything pointed at our hosts that escaped the registry.
  for (const pid of findOrphanPlayers(hosts())) killPid(pid);
  clearAnchor();
}

// Re-verifying the start token every poll is relatively expensive (spawns ps /
// powershell on non-Linux). Do the cheap pidAlive check every tick and only pay
// for the token re-verify occasionally — enough to catch PID reuse promptly
// without hammering the system.
const POLL_MS = 2000;
const TOKEN_EVERY = 5; // re-verify token roughly every 10s
let tick = 0;

const timer = setInterval(() => {
  tick++;

  // Our specific player gone AND no other registered players left → nothing to
  // guard, exit. (Another play() may have replaced ours; keep guarding then.)
  if (!pidAlive(playerPid) && livePlayers().length === 0) {
    clearInterval(timer);
    process.exit(0);
  }

  // Cheap check first: PID clearly gone → session dead.
  const cheapDead = !pidAlive(anchor.pid);
  // Periodic authoritative check: PID alive but recycled onto another process.
  const reuseDead =
    !cheapDead && tick % TOKEN_EVERY === 0 && !sameProcess(anchor.pid, anchor.token);

  if (cheapDead || reuseDead) {
    stopEverything();
    clearInterval(timer);
    process.exit(0);
  }
}, POLL_MS);

// Do NOT unref() — we want this timer to keep the process alive.

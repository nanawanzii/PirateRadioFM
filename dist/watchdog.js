#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/state.ts
import { readFileSync as readFileSync2, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// src/proc.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
var isWin = process.platform === "win32";
var isMac = process.platform === "darwin";
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function procStartToken(pid) {
  if (!pidAlive(pid)) return null;
  try {
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const rest = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/);
      const starttime = rest[19];
      return starttime ? `l:${starttime}` : null;
    }
    if (isMac) {
      const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8",
        timeout: 4e3
      }).trim();
      return out ? `d:${out}` : null;
    }
    if (isWin) {
      const out = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue).CreationDate`
        ],
        { encoding: "utf8", timeout: 8e3 }
      ).trim();
      return out ? `w:${out}` : null;
    }
  } catch {
  }
  return null;
}
function sameProcess(pid, token) {
  if (!pidAlive(pid)) return false;
  if (!token) return true;
  const cur = procStartToken(pid);
  return cur === null ? true : cur === token;
}
function killPid(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return;
  try {
    if (isWin) {
      execFileSync("taskkill", ["/F", "/PID", String(pid), "/T"], {
        stdio: "ignore",
        timeout: 8e3
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
  }
}
function findOrphanPlayers(hosts2) {
  if (hosts2.length === 0) return [];
  const wanted = hosts2.map((h) => h.toLowerCase());
  const matches = (cmd) => {
    const c = cmd.toLowerCase();
    return wanted.some((h) => c.includes(h));
  };
  try {
    if (isWin) {
      const out2 = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='mpv.exe' OR Name='ffplay.exe'" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`
        ],
        { encoding: "utf8", timeout: 8e3 }
      );
      return parsePidLines(out2, "	", matches);
    }
    const out = execFileSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf8",
      timeout: 8e3
    });
    return parseUnixPs(out, matches);
  } catch {
    return [];
  }
}
function parsePidLines(out, sep, matches) {
  const pids = [];
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf(sep);
    if (i === -1) continue;
    const pid = Number(line.slice(0, i).trim());
    const cmd = line.slice(i + 1);
    if (Number.isInteger(pid) && pid > 0 && matches(cmd)) pids.push(pid);
  }
  return pids;
}
function parseUnixPs(out, matches) {
  const pids = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(" ");
    if (sp === -1) continue;
    const pid = Number(trimmed.slice(0, sp));
    const cmd = trimmed.slice(sp + 1);
    if (!/(^|\/)(mpv|ffplay)\b/.test(cmd)) continue;
    if (Number.isInteger(pid) && pid > 0 && matches(cmd)) pids.push(pid);
  }
  return pids;
}

// src/state.ts
var stateDir = join(homedir(), ".pirate-radio");
var statePath = join(stateDir, "state.json");
var anchorPath = join(stateDir, "anchor.json");
var defaults = {
  state: "stopped",
  source: null,
  genre: null,
  stationName: null,
  stationIndex: 0,
  title: null,
  volume: 80,
  spotifyVerifier: null
};
var now = { ...defaults };
function clearAnchor() {
  try {
    unlinkSync(anchorPath);
  } catch {
  }
}

// src/stations.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as join2 } from "node:path";
var here = dirname(fileURLToPath(import.meta.url));
var stations = JSON.parse(
  readFileSync3(join2(here, "..", "data", "stations.json"), "utf8")
);
var hostCache = null;
function hosts() {
  if (hostCache) return hostCache;
  const set = /* @__PURE__ */ new Set();
  for (const list of Object.values(stations)) {
    for (const st of list) {
      try {
        set.add(new URL(st.url).host.toLowerCase());
      } catch {
      }
    }
  }
  hostCache = [...set];
  return hostCache;
}

// src/registry.ts
import {
  readFileSync as readFileSync4,
  writeFileSync as writeFileSync2,
  renameSync as renameSync2,
  mkdirSync as mkdirSync2,
  rmSync,
  rmdirSync,
  existsSync as existsSync2,
  statSync
} from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
var dir = join3(homedir2(), ".pirate-radio");
var registryPath = join3(dir, "players.json");
var lockPath = join3(dir, "players.lock");
function readRaw() {
  if (!existsSync2(registryPath)) return { players: [], watchdogs: [] };
  try {
    const r = JSON.parse(readFileSync4(registryPath, "utf8"));
    return { players: r.players ?? [], watchdogs: r.watchdogs ?? [] };
  } catch {
    return { players: [], watchdogs: [] };
  }
}
function writeRaw(r) {
  mkdirSync2(dir, { recursive: true });
  const tmp = `${registryPath}.${process.pid}.tmp`;
  writeFileSync2(tmp, JSON.stringify(r, null, 2));
  renameSync2(tmp, registryPath);
}
var LOCK_STALE_MS = 15e3;
var LOCK_WAIT_MS = 5e3;
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function withLock(fn) {
  mkdirSync2(dir, { recursive: true });
  const holderFile = join3(lockPath, "holder");
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (; ; ) {
    try {
      mkdirSync2(lockPath);
      break;
    } catch {
      let broke = false;
      try {
        const holderPid = Number(readFileSync4(holderFile, "utf8").trim());
        if (!pidAlive(holderPid)) broke = true;
      } catch {
      }
      if (!broke) {
        try {
          const age = Date.now() - statMtime(lockPath);
          if (age > LOCK_STALE_MS) broke = true;
        } catch {
        }
      }
      if (broke) {
        forceReleaseLock();
        continue;
      }
      if (Date.now() > deadline) {
        forceReleaseLock();
        continue;
      }
      sleep(50);
    }
  }
  try {
    writeFileSync2(holderFile, String(process.pid));
    const reg = readRaw();
    const result = fn(reg);
    writeRaw(reg);
    return result;
  } finally {
    releaseLock();
  }
}
function statMtime(p) {
  return statSync(p).mtimeMs;
}
function releaseLock() {
  try {
    rmSync(join3(lockPath, "holder"), { force: true });
  } catch {
  }
  try {
    rmdirSync(lockPath);
  } catch {
  }
}
function forceReleaseLock() {
  try {
    rmSync(lockPath, { recursive: true, force: true });
  } catch {
  }
}
function livePlayers() {
  return withLock((r) => {
    r.players = prune(r.players);
    return [...r.players];
  });
}
function drainAll() {
  return withLock((r) => {
    const players = prune(r.players);
    const watchdogs = prune(r.watchdogs);
    r.players = [];
    r.watchdogs = [];
    return { players, watchdogs };
  });
}
function prune(list) {
  return list.filter((e) => sameProcess(e.pid, e.token));
}

// src/watchdog.ts
var anchorPid = Number(process.argv[2]);
var anchorToken = process.argv[3] ? process.argv[3] : null;
var playerPid = Number(process.argv[4]);
if (!Number.isInteger(anchorPid) || !Number.isInteger(playerPid)) {
  process.exit(1);
}
var anchor = { pid: anchorPid, token: anchorToken };
function stopEverything() {
  const { players, watchdogs } = drainAll();
  for (const p of players) killPid(p.pid);
  for (const w of watchdogs) {
    if (w.pid !== process.pid) killPid(w.pid);
  }
  for (const pid of findOrphanPlayers(hosts())) killPid(pid);
  clearAnchor();
}
var POLL_MS = 2e3;
var TOKEN_EVERY = 5;
var tick = 0;
var timer = setInterval(() => {
  tick++;
  if (!pidAlive(playerPid) && livePlayers().length === 0) {
    clearInterval(timer);
    process.exit(0);
  }
  const cheapDead = !pidAlive(anchor.pid);
  const reuseDead = !cheapDead && tick % TOKEN_EVERY === 0 && !sameProcess(anchor.pid, anchor.token);
  if (cheapDead || reuseDead) {
    stopEverything();
    clearInterval(timer);
    process.exit(0);
  }
}, POLL_MS);

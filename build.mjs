// Bundles each entrypoint into a single self-contained file under dist/, with the
// @modelcontextprotocol/sdk (and everything else) inlined. This is what lets the
// plugin ship ready-to-run from a GitHub marketplace: Claude Code copies dist/ +
// data/ as-is and runs `node dist/index.js` — no `npm install`, no build step.
//
// Node built-ins stay external (esbuild's "node" platform handles that). The three
// entrypoints stay separate files because they are spawned independently:
//   index.js    — MCP server (Codex / Hermes / natural language)
//   cli.js      — argv entry for slash commands
//   watchdog.js — detached session watchdog, spawned by player.js via join(here,"watchdog.js")
import { build } from "esbuild";
import { rm } from "node:fs/promises";

// Clean previous output (e.g. stale per-module .js from an earlier `tsc` build)
// so dist/ only ever contains the four self-contained bundles.
await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: [
    "src/index.ts",
    "src/cli.ts",
    "src/watchdog.ts",
    "src/selfcheck.ts",
  ],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: "dist",
  // ESM output that uses require() indirectly (some deps) needs this shim so the
  // bundled files still resolve CommonJS-style requires at runtime.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});

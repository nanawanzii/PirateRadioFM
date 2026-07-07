#!/usr/bin/env node
// pirate-radio argv entry. Invoked by each slash command as `node dist/cli.js <tool> [json-args]`.
// This replaces the MCP stdio server for slash-command use: no protocol handshake,
// no LLM tool selection — deterministic mapping from argv to a tool handler.
import { tools } from "./tools.js";
import { loadState, saveState } from "./state.js";

async function main(): Promise<void> {
  const [, , toolName, ...rest] = process.argv;
  if (!toolName) {
    console.error("Usage: cli.js <tool-name> [json-args]");
    console.error("Available tools: " + tools.map((t) => t.name).join(", "));
    process.exit(1);
  }

  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`);
    console.error("Available: " + tools.map((t) => t.name).join(", "));
    process.exit(1);
  }

  // Args come in two shapes:
  //   1. Single JSON blob:  node cli.js radio_play '{"genre":"jazz"}'
  //   2. Positional key=value pairs (friendlier from shell):  node cli.js radio_play genre=jazz
  let args: Record<string, unknown> = {};
  if (rest.length === 1 && rest[0].startsWith("{")) {
    args = JSON.parse(rest[0]);
  } else {
    for (const kv of rest) {
      const eq = kv.indexOf("=");
      if (eq === -1) continue;
      const k = kv.slice(0, eq);
      const v = kv.slice(eq + 1);
      // number-ish values get coerced so `level=50` works with numeric schemas
      args[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
  }

  loadState();
  try {
    const out = await tool.handler(args);
    saveState();
    process.stdout.write(out + "\n");
  } catch (e) {
    saveState(); // persist any partial state changes (e.g. verifier written before a failed fetch)
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();

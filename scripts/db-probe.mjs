#!/usr/bin/env node
// scripts/db-probe.mjs — is a database reachable?
//
// Spec 003 AC-24: `init.ps1` and `init.sh` must reach the SAME verdict about the
// database, so they must not each implement their own idea of "reachable". They both
// run this file.
//
// What it does NOT do:
//
//   * it does not query. Opening a TCP connection is enough to tell "no database here"
//     from "database here", and it keeps every database access in this feature inside
//     src/server/auth/ (AC-31);
//   * it does not print the connection string. The URL carries a user and a password;
//     the output names the host and nothing else (AC-24).
//
// Usage:  node scripts/db-probe.mjs [ENV_VAR_NAME]      (default TEST_DATABASE_URL)
// Exits:  0 = reachable, 1 = not set, unparseable, or unreachable within 10 seconds.

import { existsSync } from "node:fs";
import net from "node:net";

const TIMEOUT_MS = 10_000;
const DEFAULT_PORT = 5432;

// .env is gitignored and denied to agents; loading it programmatically is how every tool
// here reads it. Variables already in the environment win, which is what lets the
// verification runs point this at an unreachable host.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // An unreadable .env is not this script's problem; the variable check below reports it.
  }
}

const variable = process.argv[2] ?? "TEST_DATABASE_URL";
const value = process.env[variable];

if (typeof value !== "string" || value.trim() === "") {
  console.log(`[probe] ${variable} is not set`);
  process.exit(1);
}

let host;
let port;
try {
  const url = new URL(value);
  host = url.hostname;
  port = url.port === "" ? DEFAULT_PORT : Number(url.port);
} catch {
  // Never echo the value back: it is a credential even when it is malformed.
  console.log(`[probe] ${variable} is not a URL`);
  process.exit(1);
}

if (host === "") {
  console.log(`[probe] ${variable} has no host`);
  process.exit(1);
}

const socket = net.connect({ host, port });
socket.setTimeout(TIMEOUT_MS);

const finish = (code, message) => {
  socket.removeAllListeners();
  socket.destroy();
  console.log(message);
  process.exit(code);
};

socket.on("connect", () => finish(0, `[probe] reachable ${host}`));
socket.on("timeout", () => finish(1, `[probe] unreachable ${host}`));
socket.on("error", () => finish(1, `[probe] unreachable ${host}`));

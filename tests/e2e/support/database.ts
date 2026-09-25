import net from "node:net";

import type { TestInfo } from "@playwright/test";
import { test } from "@playwright/test";

/**
 * Spec 003 AC-28: `npm run test:e2e` exits 0 whether or not a database is reachable.
 * A spec that needs one skips itself, with an annotation saying why — silence would let
 * a missing database look like a passing suite.
 *
 * The reachability check here is a TCP connection to the URL's host and port: no session, no
 * query, and nothing about the URL is ever printed. It is NOT what `scripts/db-probe.mjs`
 * does. That probe was rewritten on 2026-09-17 (spec 003, post-approval amendments) to open a
 * real session and run `SELECT 1`, because an open port is not a database that answers.
 */
const PROBE_TIMEOUT_MS = 10_000;
const DEFAULT_PORT = 5432;

let cached: Promise<boolean> | undefined;

async function probe(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === "") return false;

  let host: string;
  let port: number;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = parsed.port === "" ? DEFAULT_PORT : Number(parsed.port);
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(PROBE_TIMEOUT_MS);

    const settle = (reachable: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.on("connect", () => settle(true));
    socket.on("timeout", () => settle(false));
    socket.on("error", () => settle(false));
  });
}

export async function databaseIsReachable(): Promise<boolean> {
  cached ??= probe();
  return cached;
}

/**
 * Call from a `beforeEach`. With a database, does nothing; without one, skips the test
 * and annotates it with `database unreachable`.
 */
export async function skipWithoutDatabase(testInfo: TestInfo): Promise<void> {
  if (await databaseIsReachable()) return;

  testInfo.annotations.push({ type: "skip", description: "database unreachable" });
  test.skip(true, "database unreachable");
}

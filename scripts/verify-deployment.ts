/**
 * `npm run verify:deploy` — the live check (spec 016 AC-13 to AC-15).
 *
 *   npm run verify:deploy -- --url <origin> [--expect-commit <sha>]   the anonymous pass
 *   npm run verify:deploy -- --url <origin> --signed-in               the signed-in pass
 *
 * It holds no secret (AC-14): it takes no credential, reads no settings, and prints no
 * cookie value and no part of a body. The signed-in pass opens a visible Chromium window
 * and waits for a person to sign in there; the PIN goes only into that page.
 *
 * The gate never runs this (AC-1). The coordinator runs it against the live address.
 */
import { main } from "./verify/cli";

main(process.argv.slice(2), {
  print: (line) => {
    console.log(line);
  },
  launchBrowser: async () => {
    const { chromium } = await import("@playwright/test");
    return chromium.launch({ headless: false });
  },
})
  .then((code) => {
    // Not `process.exit`: that can abort Node on Windows while a socket is still closing.
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`[verify] stopped: ${error instanceof Error ? error.name : "unknown error"}`);
    process.exitCode = 1;
  });

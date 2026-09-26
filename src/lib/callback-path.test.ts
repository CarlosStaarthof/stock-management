import { randomBytes, randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { safeCallbackPath } from "@/lib/callback-path";

/**
 * 021 AC-9's same-origin rule, with no browser: a `callbackUrl` survives only as a path and
 * query on the app's own origin.
 *
 * Every foreign host is drawn at runtime under `.invalid`, and every control character is
 * built from its code, so this file writes neither down.
 */

function foreignHost(): string {
  return `offsite-${randomBytes(6).toString("hex")}.invalid`;
}

const BACKSLASH = "\\";
const TAB = String.fromCharCode(9);

/** Where each origin sends a path: it must be the origin itself, every time. */
function staysOn(path: string): boolean {
  return ["http://localhost:3000", "https://stock.example.com"].every(
    (origin) => new URL(path, origin).origin === origin,
  );
}

describe("021 AC-9: a callbackUrl is honoured only on the app's own origin", () => {
  it("AC-9: a path of our own is kept, with its query", () => {
    expect(safeCallbackPath("/analysis")).toBe("/analysis");
    expect(safeCallbackPath("/analysis?yard=BOTH&period=2026-08")).toBe(
      "/analysis?yard=BOTH&period=2026-08",
    );
    expect(safeCallbackPath("/stock-takes/counts/abc")).toBe("/stock-takes/counts/abc");
    expect(safeCallbackPath("/")).toBe("/");
  });

  it("AC-9: the fragment is dropped: the redirect carries the path and the query alone", () => {
    expect(safeCallbackPath("/analysis?yard=DUBLIN#top")).toBe("/analysis?yard=DUBLIN");
  });

  it("AC-9: the reviewer's two shapes are refused — a slash then a backslash, and a slash, a tab and a second slash", () => {
    const host = foreignHost();
    const backslashed = ["/", BACKSLASH, host, "/x"].join("");
    const tabbed = ["/", TAB, "/", host, "/x"].join("");

    // What a browser makes of each: another host, though each begins with one slash.
    expect(new URL(backslashed, "http://localhost:3000").host).toBe(host);
    expect(new URL(tabbed, "http://localhost:3000").host).toBe(host);

    expect(safeCallbackPath(backslashed)).toBeNull();
    expect(safeCallbackPath(tabbed)).toBeNull();
  });

  it("AC-9: the // and https:// forms, and every other scheme, are refused", () => {
    const host = foreignHost();
    for (const value of [
      `//${host}/x`,
      `https://${host}/x`,
      `http://${host}/x`,
      `HTTPS://${host}/x`,
      `javascript:alert(1)`,
      `${host}/x`,
      "analysis",
      "",
    ]) {
      expect(safeCallbackPath(value), value).toBeNull();
    }
  });

  it("AC-9: a backslash anywhere, any ASCII control character, and any whitespace are refused", () => {
    const host = foreignHost();
    expect(safeCallbackPath(`/analysis${BACKSLASH}x`)).toBeNull();
    expect(safeCallbackPath(`/${BACKSLASH}${BACKSLASH}${host}`)).toBeNull();

    const controls = [...Array.from({ length: 32 }, (_, code) => code), 0x7f].map((code) =>
      String.fromCharCode(code),
    );
    const spaces = [" ", String.fromCharCode(0xa0), String.fromCharCode(0x2028), String.fromCharCode(0x3000)];
    for (const character of [...controls, ...spaces]) {
      const label = `U+${character.charCodeAt(0).toString(16)}`;
      expect(safeCallbackPath(`${character}/analysis`), label).toBeNull();
      expect(safeCallbackPath(`/${character}/${host}/x`), label).toBeNull();
      expect(safeCallbackPath(`/analysis${character}`), label).toBeNull();
    }
  });

  it("AC-9: percent-encoded forms of every refused shape are refused once decoded, as the page decodes them", () => {
    const host = foreignHost();
    for (const encoded of [
      `%2F%5C${host}%2Fx`,
      `%2F%09%2F${host}%2Fx`,
      `%2F%2F${host}%2Fx`,
      `https%3A%2F%2F${host}%2Fx`,
      `%2F%0A%2F${host}`,
      `%2F%20%2F${host}`,
    ]) {
      const decoded = new URLSearchParams(`callbackUrl=${encoded}`).get("callbackUrl");
      expect(decoded, encoded).not.toBeNull();
      expect(safeCallbackPath(decoded), encoded).toBeNull();
      expect(safeCallbackPath(decodeURIComponent(encoded)), encoded).toBeNull();
    }
  });

  it("AC-9: a value still encoded after decoding stays a path on our origin", () => {
    const host = foreignHost();
    for (const value of [`/%5C${host}/x`, `/%2F${host}/x`, `/%09/${host}/x`]) {
      const kept = safeCallbackPath(value);
      expect(kept, value).not.toBeNull();
      expect(staysOn(kept ?? "//"), value).toBe(true);
    }
  });

  it("AC-9: dot segments that would resolve to two leading slashes are refused", () => {
    const host = foreignHost();
    for (const value of [`/.//${host}/x`, `/..//${host}/x`, `/analysis/..//${host}`, `/%2e//${host}`]) {
      expect(new URL(value, "http://localhost:3000").pathname.startsWith("//"), value).toBe(true);
      expect(safeCallbackPath(value), value).toBeNull();
    }
  });

  it("AC-9: anything that is not a string is refused", () => {
    for (const value of [null, undefined, 42, {}, ["/analysis"], new Blob(["/analysis"])]) {
      expect(safeCallbackPath(value)).toBeNull();
    }
  });

  it("AC-9: for 5,000 random values built from the characters URLs turn on, whatever is kept stays on every origin", () => {
    const alphabet = ["/", BACKSLASH, ".", ":", "@", "%", "?", "#", "a", "5", "e", TAB, " ", "2", "F", "C"];
    let kept = 0;
    for (let round = 0; round < 5_000; round += 1) {
      const value = Array.from({ length: 1 + randomInt(10) }, () => alphabet[randomInt(alphabet.length)]).join("");
      const result = safeCallbackPath(value);
      if (result === null) continue;
      kept += 1;
      expect(result.startsWith("/") && !result.startsWith("//"), value).toBe(true);
      expect(result.includes(BACKSLASH) || /[\s]/u.test(result), value).toBe(false);
      expect(staysOn(result), value).toBe(true);
    }
    // Non-vacuity: the property was tested on values that were kept, not only on refusals.
    expect(kept).toBeGreaterThan(50);
  });
});

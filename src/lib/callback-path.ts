/**
 * Where a sign-in may send a person afterwards (021 AC-9): a path on this app's own origin,
 * or nothing.
 *
 * A `callbackUrl` is a redirect target anyone can put in a link, and it reaches `Location`
 * as given: a sign-in submitted with no JavaScript, or before the form hydrates, is answered
 * with a plain redirect, which the browser resolves by the URL Standard. That standard reads
 * a backslash as a slash and drops a tab or a newline wherever it stands, so a value that
 * begins with one slash can still name another host. Hence three steps:
 *
 *  1. a value holding a backslash, an ASCII control character or whitespace is refused
 *     before anything parses it;
 *  2. the rest must begin with exactly one slash, and is parsed against a fixed origin; it
 *     is kept only when that origin is unchanged;
 *  3. the result is rebuilt from the parsed path and query alone, and checked once more,
 *     because resolving dot segments can leave a path that begins with two slashes.
 */

/** Any fixed origin will do: it is compared with itself, never requested. */
const REFERENCE_ORIGIN = "http://callback.invalid";

const DEL = 0x7f;
const LAST_C0_CONTROL = 0x1f;

function hasRefusedCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= LAST_C0_CONTROL || code === DEL) return true;
    if (character === "\\" || /\s/u.test(character)) return true;
  }
  return false;
}

function beginsWithOneSlash(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

export function safeCallbackPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (hasRefusedCharacter(value) || !beginsWithOneSlash(value)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, REFERENCE_ORIGIN);
  } catch {
    // Not a URL at all: there is nowhere of ours to send anyone.
    return null;
  }
  if (parsed.origin !== REFERENCE_ORIGIN) return null;

  const path = `${parsed.pathname}${parsed.search}`;
  return beginsWithOneSlash(path) ? path : null;
}

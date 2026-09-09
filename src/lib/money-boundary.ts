/**
 * The money boundary, as an assertion anything can run.
 *
 * `specs/domain-model.md` Part 6 and `docs/verification.md` Level 3b: a YARD_STAFF
 * session must never be *sent* a monetary value. Hiding one in a component is not a
 * permission — it stays in the network response and in the page source. So the check is
 * made on the response body, and it walks the whole body: a price nested three levels
 * down is still a price.
 *
 * It ships with feature #3, before any money exists, so that #8 inherits a tested
 * mechanism rather than inventing one.
 */

/** Keys that mean money in this domain. `docs/verification.md` Level 3b quotes it. */
export const MONEY_KEY_PATTERN = /price|value|total|amount/i;

/**
 * Every key appearing anywhere in `value`, including inside arrays and nested objects.
 * Array indices are not keys, so `[{ price: 1 }]` reports `price`, not `0`.
 */
export function deepKeys(value: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<object>();

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const element of node) walk(element);
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      found.push(key);
      walk(child);
    }
  };

  walk(value);
  return found;
}

/** The keys of `value`, at any depth, that name money. Empty means the body is clean. */
export function moneyKeysIn(value: unknown): string[] {
  return deepKeys(value).filter((key) => MONEY_KEY_PATTERN.test(key));
}

/**
 * Throws when `value` carries a monetary key at any depth. `label` names the payload so
 * a failure says which response leaked, not merely that something did.
 */
export function assertNoMoneyKeys(value: unknown, label = "response"): void {
  const offenders = moneyKeysIn(value);
  if (offenders.length > 0) {
    throw new Error(
      `${label} carries monetary keys a YARD_STAFF session must never be sent: ${offenders.join(", ")}`,
    );
  }
}

/** The same walk, for the other thing a body must never carry (AC-20). */
export function passwordKeysIn(value: unknown): string[] {
  return deepKeys(value).filter((key) => /password/i.test(key));
}

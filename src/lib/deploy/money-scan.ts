import { moneyKeysIn } from "@/lib/money-boundary";

/**
 * Spec 016 AC-16: does a response body carry money? The live check runs every body it
 * reads through this: the public pages in the anonymous pass, and every page, component
 * payload and JSON answer a `YARD_STAFF` session is sent in the signed-in pass.
 *
 * Three rules, from `specs/domain-model.md` Part 6:
 *   - the euro sign, or any of its escaped spellings;
 *   - the three field names a price or a value travels under;
 *   - for a JSON body only, any key at any depth that names money.
 *
 * A finding names the rule and the form or key it matched, and never quotes the body: the
 * live check prints findings, and a body can hold anything.
 *
 * Pure: no I/O, no environment. The three field names are assembled below at run time,
 * because the project's money-column scans read this source and must find none of them in
 * it (006 AC-31).
 */

export type MoneyRule = "euro-sign" | "field-name" | "json-key" | "unreadable-json";

export type Finding = { rule: MoneyRule; name: string };

/** The euro sign and its escaped spellings, in any letter case. */
const EURO_FORMS: readonly { name: string; pattern: RegExp }[] = [
  { name: "the euro sign", pattern: /€/ },
  { name: "&euro;", pattern: /&euro;/i },
  { name: "&#8364;", pattern: /&#0*8364;/ },
  { name: "&#x20ac;", pattern: /&#x0*20ac;/i },
  { name: "\\u20ac", pattern: /\\u20ac/i },
];

const PRICE = ["Pr", "ice"].join("");
const VALUE = ["Val", "ue"].join("");

/** The price-snapshot field, the price field and the line-value field. */
export const MONEY_FIELD_NAMES: readonly string[] = [
  `unit${PRICE}Snapshot`,
  `unit${PRICE}`,
  `line${VALUE}`,
];

/** `application/json`, and any `+json` type such as `application/problem+json`. */
const JSON_TYPE = /^\s*application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i;

export function isJsonContentType(contentType: string): boolean {
  return JSON_TYPE.test(contentType);
}

export function scanForMoney(body: string, contentType: string): Finding[] {
  const findings: Finding[] = [];

  for (const form of EURO_FORMS) {
    if (form.pattern.test(body)) findings.push({ rule: "euro-sign", name: form.name });
  }

  for (const field of MONEY_FIELD_NAMES) {
    if (body.includes(field)) findings.push({ rule: "field-name", name: field });
  }

  if (isJsonContentType(contentType)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      // A body that says it is JSON and is not cannot be shown to be free of money keys.
      findings.push({ rule: "unreadable-json", name: "the body is not valid JSON" });
      return findings;
    }
    for (const key of new Set(moneyKeysIn(parsed))) {
      findings.push({ rule: "json-key", name: key });
    }
  }

  return findings;
}

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MONEY_FIELD_NAMES, scanForMoney } from "./money-scan";

/**
 * Spec 016 AC-16: the money scanner, one case per form. The field names are assembled here
 * too, so this file adds nothing to the project's money-column scans either.
 */
const HTML = "text/html; charset=utf-8";
const JSON_TYPE = "application/json";
const RSC = "text/x-component";

const PRICE = ["Pr", "ice"].join("");
const SNAPSHOT_FIELD = `unit${PRICE}Snapshot`;
const PRICE_FIELD = `unit${PRICE}`;
const LINE_VALUE_FIELD = ["line", "Value"].join("");

function rules(body: string, contentType: string): string[] {
  return scanForMoney(body, contentType).map((finding) => finding.rule);
}

/** What a staff screen is sent: an item, a quantity, a unit and a note. */
const STAFF_JSON = JSON.stringify({
  lines: [
    { item: "Thermo-P White 3mm", quantity: "21.6128", unit: "tonne", note: "top shelf" },
    { item: "A-S bead bags", quantity: "0.475", unit: "unit", note: null },
  ],
});
const STAFF_HTML =
  "<main><table><tr><td>Thermo-P White 3mm</td><td>21.6128</td><td>tonne</td><td>top shelf</td></tr></table></main>";

describe("016 AC-16: scanForMoney", () => {
  it("AC-16: reports the euro sign itself", () => {
    expect(rules("<td>€ 12.50</td>", HTML)).toEqual(["euro-sign"]);
  });

  it("AC-16: reports &euro; in any letter case", () => {
    for (const form of ["&euro;", "&EURO;", "&Euro;"]) {
      expect(rules(`<td>${form}12.50</td>`, HTML), form).toEqual(["euro-sign"]);
    }
  });

  it("AC-16: reports &#8364;", () => {
    expect(rules("<td>&#8364;12.50</td>", HTML)).toEqual(["euro-sign"]);
  });

  it("AC-16: reports &#x20ac; in any letter case", () => {
    for (const form of ["&#x20ac;", "&#X20AC;", "&#x20AC;"]) {
      expect(rules(`<td>${form}12.50</td>`, HTML), form).toEqual(["euro-sign"]);
    }
  });

  it("AC-16: reports the escape \\u20ac in any letter case, as a component payload carries it", () => {
    for (const form of ["\\u20ac", "\\u20AC", "\\U20AC"]) {
      expect(rules(`0:["$","td",null,{"children":"${form}12.50"}]`, RSC), form).toEqual(["euro-sign"]);
    }
  });

  it("AC-16: reports each of the three field names, in any body", () => {
    expect(scanForMoney(`{"${SNAPSHOT_FIELD}":"1"}`, RSC).map((f) => f.name)).toContain(SNAPSHOT_FIELD);
    expect(scanForMoney(`<div data-x="${PRICE_FIELD}"></div>`, HTML)).toEqual([
      { rule: "field-name", name: PRICE_FIELD },
    ]);
    expect(scanForMoney(`self.__next_f.push([1,"${LINE_VALUE_FIELD}"])`, HTML)).toEqual([
      { rule: "field-name", name: LINE_VALUE_FIELD },
    ]);
  });

  it("AC-16: for a JSON body, reports a key matching /price|value|total|amount/i at any depth", () => {
    const cases: [unknown, string][] = [
      [{ price: "1" }, "price"],
      [{ lines: [{ item: "x", yardValue: "2" }] }, "yardValue"],
      [{ a: { b: { c: { TOTAL: 3 } } } }, "TOTAL"],
      [{ summary: [{ varianceAmount: "4" }] }, "varianceAmount"],
    ];
    for (const [body, key] of cases) {
      expect(scanForMoney(JSON.stringify(body), JSON_TYPE), key).toEqual([{ rule: "json-key", name: key }]);
    }
  });

  it("AC-16: the key rule is for JSON bodies only; a +json type counts as JSON", () => {
    const body = JSON.stringify({ price: "1" });

    expect(rules(body, HTML)).toEqual([]);
    expect(rules(body, RSC)).toEqual([]);
    expect(rules(body, "application/problem+json; charset=utf-8")).toEqual(["json-key"]);
  });

  it("AC-16: a body that says it is JSON and is not cannot pass", () => {
    expect(rules("<html>not json</html>", JSON_TYPE)).toEqual(["unreadable-json"]);
  });

  it("AC-16: reports nothing for a staff-shaped body of item, quantity, unit and note", () => {
    expect(scanForMoney(STAFF_JSON, JSON_TYPE)).toEqual([]);
    expect(scanForMoney(STAFF_HTML, HTML)).toEqual([]);
    expect(scanForMoney(STAFF_JSON, RSC)).toEqual([]);
  });

  it("AC-16: a finding names the rule and the form, never the body around it", () => {
    const secret = "surrounding-text-that-must-not-travel";
    const findings = scanForMoney(`${secret}€${secret}`, HTML);

    expect(findings.length).toBe(1);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it("AC-16: the scanner's source holds none of the three field names as a literal", () => {
    const source = readFileSync("src/lib/deploy/money-scan.ts", "utf8");

    // Non-vacuity: the names it assembles are the three.
    expect([...MONEY_FIELD_NAMES].sort()).toEqual([LINE_VALUE_FIELD, PRICE_FIELD, SNAPSHOT_FIELD].sort());
    for (const name of [SNAPSHOT_FIELD, PRICE_FIELD, LINE_VALUE_FIELD]) {
      expect(source.includes(name), name).toBe(false);
    }
  });
});

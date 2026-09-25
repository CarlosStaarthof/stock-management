import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * THE ROOT LAYOUT KEEPS EVERY PAGE INSIDE `<HydrationGate>`, read from the source rather than
 * rendered. The gate renders exactly its children on the server, so no server output can show
 * whether it is there; and the browser test that shows it (the `#418` batches in
 * `tests/e2e/stock-entry-approve.spec.ts`) counts an intermittent failure over many loads.
 * This catches the likeliest regression, the gate removed from the layout or moved below
 * `<body>`, deterministically, with no browser and no database. Why the gate must sit there:
 * `src/components/HydrationGate.tsx`.
 */

const LAYOUT = fileURLToPath(new URL("./layout.tsx", import.meta.url));

function parsedLayout(): ts.SourceFile {
  return ts.createSourceFile(
    LAYOUT,
    readFileSync(LAYOUT, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** Every JSX element in the file whose tag is `tag`. */
function elementsNamed(source: ts.SourceFile, tag: string): ts.JsxElement[] {
  const found: ts.JsxElement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === tag) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * The children that render something. Whitespace between tags and a JSX comment (an empty
 * `{}` holding only a comment) render nothing, so they are not children in the sense that
 * matters here: the layout's own comment above the gate is one.
 */
function renderedChildren(element: ts.JsxElement): ts.JsxChild[] {
  return element.children.filter((child) => {
    if (ts.isJsxText(child)) return !child.containsOnlyTriviaWhiteSpaces;
    if (ts.isJsxExpression(child)) return child.expression !== undefined;
    return true;
  });
}

/** `<Tag>` for an element, `{expression}` for an expression, the text itself otherwise. */
function shapeOf(child: ts.JsxChild, source: ts.SourceFile): string {
  if (ts.isJsxElement(child)) return `<${child.openingElement.tagName.getText(source)}>`;
  if (ts.isJsxSelfClosingElement(child)) return `<${child.tagName.getText(source)} />`;
  if (ts.isJsxExpression(child) && child.expression !== undefined) {
    return `{${child.expression.getText(source)}}`;
  }
  return child.getText(source).trim();
}

describe("src/app/layout.tsx", () => {
  it("renders <HydrationGate>{children}</HydrationGate> as <body>'s only child", () => {
    const source = parsedLayout();

    const bodies = elementsNamed(source, "body");
    expect(bodies).toHaveLength(1);
    const [body] = bodies;

    const inBody = renderedChildren(body);
    expect(inBody.map((child) => shapeOf(child, source))).toEqual(["<HydrationGate>"]);

    const [gate] = inBody;
    if (!ts.isJsxElement(gate)) throw new Error("unreachable: the shape above is an element");
    expect(renderedChildren(gate).map((child) => shapeOf(child, source))).toEqual([
      "{children}",
    ]);
  });

  it("takes HydrationGate from src/components/HydrationGate, not from a stand-in", () => {
    const source = parsedLayout();

    const importers = source.statements
      .filter(ts.isImportDeclaration)
      .filter((statement) => {
        const bindings = statement.importClause?.namedBindings;
        return (
          bindings !== undefined &&
          ts.isNamedImports(bindings) &&
          bindings.elements.some((element) => element.name.text === "HydrationGate")
        );
      })
      .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);

    expect(importers).toEqual(["@/components/HydrationGate"]);
  });
});

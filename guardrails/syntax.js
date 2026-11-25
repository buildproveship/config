import ts from "typescript";
import { iterateComments } from "ts-api-utils";

/** Tolerant syntax only: no project, type checking, configuration loading or source execution.
 * @param {string} source
 * @param {string} path
 */
function parse(source, path) {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
}

/** @param {ts.Node} node @param {(node: ts.Node) => void} visit */
function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** @param {string} source @param {string} path */
export function commentsOf(source, path) {
  return Array.from(iterateComments(parse(source, path)), (comment) => ({
    index: comment.pos,
    raw: comment.text,
  }));
}

/** @param {ts.Expression} expression */
function terminalName(expression) {
  return ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : "";
}

/** @param {string} source @param {string} path */
export function skippedTestLines(source, path) {
  const file = parse(source, path);
  const lines = new Set();
  walk(file, (node) => {
    let skipped = false;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      skipped = ["xit", "xdescribe", "xtest"].includes(terminalName(callee));
      if (ts.isPropertyAccessExpression(callee)) {
        skipped ||=
          ["describe", "it", "test", "suite", "context"].includes(
            terminalName(callee.expression),
          ) && ["skip", "todo"].includes(callee.name.text);
      }
    } else if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ) {
      const value = node.initializer;
      skipped =
        ["skip", "todo"].includes(node.name.text) &&
        (value.kind === ts.SyntaxKind.TrueKeyword ||
          ts.isStringLiteral(value) ||
          ts.isNoSubstitutionTemplateLiteral(value) ||
          ts.isTemplateExpression(value));
    }
    if (skipped)
      lines.add(
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      );
  });
  return [...lines];
}

/** @param {string} source @param {string} path */
export function severityLocations(source, path) {
  const file = parse(source, path);
  /** @type {{ start: number; end: number }[]} */
  const ranges = [];
  walk(file, (node) => {
    if (!ts.isPropertyAssignment(node) || ts.isComputedPropertyName(node.name))
      return;
    const value = ts.isArrayLiteralExpression(node.initializer)
      ? node.initializer.elements[0]
      : node.initializer;
    if (!value) return;
    const container = node.parent.parent;
    const inRules =
      ts.isObjectLiteralExpression(node.parent) &&
      ts.isPropertyAssignment(container) &&
      !ts.isComputedPropertyName(container.name) &&
      container.name.getText(file).replace(/["']/g, "") === "rules";
    const disabled = ts.isStringLiteral(value)
      ? ["off", "warn"].includes(value.text)
      : ts.isNumericLiteral(value) &&
        (value.text === "0" || (inRules && value.text === "1"));
    if (!disabled) return;
    ranges.push({
      start: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      end: file.getLineAndCharacterOfPosition(node.end).line + 1,
    });
  });
  const commentLines = new Set();
  for (const comment of iterateComments(file)) {
    const start = file.getLineAndCharacterOfPosition(comment.pos).line + 1;
    const end = file.getLineAndCharacterOfPosition(comment.end).line + 1;
    for (let line = start; line <= end; line++) commentLines.add(line);
  }
  return { ranges, commentLines };
}

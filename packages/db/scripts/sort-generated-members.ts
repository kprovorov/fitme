/* eslint-disable unicorn/no-array-sort -- ES2022 types lack toSorted; each sort uses a fresh copy. */
import ts from "typescript";

const byName = (a: string, b: string) => (a < b ? -1 : Number(a > b));

const isStaticProperty = (
  property: ts.ObjectLiteralElementLike
): property is ts.PropertyAssignment =>
  ts.isPropertyAssignment(property) &&
  (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));

/** Drizzle's import and object member order varies between local databases. */
export const sortGeneratedMembers = (source: string): string => {
  const file = ts.createSourceFile(
    "schema.ts",
    source,
    ts.ScriptTarget.Latest,
    true
  );

  const result = ts.transform(file, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        const visited = ts.visitEachChild(node, visit, context);

        if (ts.isNamedImports(visited)) {
          return context.factory.updateNamedImports(
            visited,
            [...visited.elements].sort((a, b) =>
              byName(a.name.text, b.name.text)
            )
          );
        }

        // Generated object members are independent column/relationship definitions.
        // Leave spreads, methods and computed keys alone: their order can matter.
        if (
          ts.isObjectLiteralExpression(visited) &&
          visited.properties.every(isStaticProperty)
        ) {
          return context.factory.updateObjectLiteralExpression(
            visited,
            [...visited.properties].sort((a, b) =>
              byName(a.name.getText(file), b.name.getText(file))
            )
          );
        }

        return visited;
      };

      return (root) => ts.visitEachChild(root, visit, context);
    },
  ]);

  try {
    return ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printFile(result.transformed[0]);
  } finally {
    result.dispose();
  }
};

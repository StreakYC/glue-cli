import ts from "typescript";

export interface ParsedImport {
  moduleName: string;
  type: string | undefined;
}

export function parseImports(fileContent: string, fileName = "file.ts"): ParsedImport[] {
  const sc = ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.Latest, true);
  const results: ParsedImport[] = [];
  ts.forEachChild(sc, (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        return;
      }
      const moduleName = node.moduleSpecifier.text;
      let resourceType: string | undefined;
      const attrElements = node.attributes?.elements;
      if (attrElements) {
        for (const el of attrElements) {
          if (el.name.text === "type" && ts.isStringLiteral(el.value)) {
            resourceType = el.value.text;
            break;
          }
        }
      }
      results.push({ moduleName, type: resourceType });
    } else if (ts.isExportDeclaration(node)) {
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
        return;
      }
      const moduleName = node.moduleSpecifier.text;
      results.push({ moduleName, type: undefined });
    } else {
      getDynamicImports(node, results);
    }
  });
  return results;
}

function getDynamicImports(node: ts.Node, results: ParsedImport[]) {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length >= 1 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    const moduleName = node.arguments[0].text;
    results.push({ moduleName, type: undefined });
  } else {
    ts.forEachChild(node, (child) => getDynamicImports(child, results));
  }
}

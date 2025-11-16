import * as vscode from "vscode";
import { IntrospectionResult } from "../types";

export function registerDefinitionProvider(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
  cache: Map<string, IntrospectionResult>
) {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider("python", {
      provideDefinition(doc, position) {
        log(
          `Definition triggered at ${doc.fileName}:${position.line}:${position.character}`
        );
        const info = cache.get(doc.uri.toString());
        if (!info) return;

        const range = doc.getWordRangeAtPosition(position);
        if (!range) return;

        const word = doc.getText(range);
        const lineText = doc.lineAt(position.line).text;
        const beforeCursor = lineText.slice(0, position.character);

        const attrAccessMatch = /(\w+)\.(\w*)$/.exec(beforeCursor);
        if (attrAccessMatch) {
          const varName = attrAccessMatch[1];
          const fieldName = word;
          const pred = info.predictions[varName];
          if (pred) {
            const sig = info.signatures[pred.signature];
            if (sig) {
              const field = sig.outputs.find((f) => f.name === fieldName);
              if (field) {
                log(
                  `Finding definition for field: ${varName}.${fieldName} in signature ${sig.name}`
                );
                const text = doc.getText();
                const lines = text.split("\n");
                const classRegex = new RegExp(`^class\\s+${sig.name}\\s*\\(`);
                let classLineNum = -1;
                for (let i = 0; i < lines.length; i++) {
                  if (classRegex.test(lines[i].trim())) {
                    classLineNum = i;
                    break;
                  }
                }
                if (classLineNum >= 0) {
                  const fieldRegex = new RegExp(`^\\s*${fieldName}\\s*:`);
                  for (let i = classLineNum + 1; i < lines.length; i++) {
                    const line = lines[i];
                    if (/^class\s+/.test(line.trim())) {
                      break;
                    }
                    if (fieldRegex.test(line)) {
                      const col = line.indexOf(fieldName);
                      log(
                        `Found field definition at line ${i + 1}, col ${col}`
                      );
                      return new vscode.Location(
                        doc.uri,
                        new vscode.Position(i, col)
                      );
                    }
                  }
                }
              }
            }
          }
        }

        return;
      },
    })
  );
}

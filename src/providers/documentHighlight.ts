import * as vscode from "vscode";
import { IntrospectionResult } from "../types";

export function registerDocumentHighlightProvider(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
  cache: Map<string, IntrospectionResult>
) {
  context.subscriptions.push(
    vscode.languages.registerDocumentHighlightProvider("python", {
      provideDocumentHighlights(doc, position) {
        log(
          `Document highlights requested at ${doc.fileName}:${position.line}:${position.character}`
        );
        const info = cache.get(doc.uri.toString());
        if (!info) return;

        const range = doc.getWordRangeAtPosition(position);
        if (!range) return;

        const word = doc.getText(range);
        const line = doc.lineAt(position.line).text;
        const beforeCursor = line.slice(0, position.character);

        const attrAccessMatch = /(\w+)\.(\w*)$/.exec(beforeCursor);
        if (!attrAccessMatch) return;

        const varName = attrAccessMatch[1];
        const fieldName = word;
        const pred = info.predictions[varName];
        if (!pred) return;

        const sig = info.signatures[pred.signature];
        if (!sig) return;

        const field = sig.outputs.find((f) => f.name === fieldName);
        if (!field) return;

        const highlights: vscode.DocumentHighlight[] = [];
        const text = doc.getText();
        const lines = text.split("\n");
        const regex = new RegExp(`\\b${varName}\\.${fieldName}\\b`, "g");

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const lineText = lines[lineNum];
          let match;
          while ((match = regex.exec(lineText)) !== null) {
            const fieldStartCol = match.index + varName.length + 1;
            highlights.push(
              new vscode.DocumentHighlight(
                new vscode.Range(
                  new vscode.Position(lineNum, fieldStartCol),
                  new vscode.Position(lineNum, fieldStartCol + fieldName.length)
                ),
                vscode.DocumentHighlightKind.Read
              )
            );
          }
        }

        log(
          `Found ${highlights.length} highlights for ${varName}.${fieldName}`
        );
        return highlights;
      },
    })
  );
}

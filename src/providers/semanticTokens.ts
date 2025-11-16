import * as vscode from "vscode";
import { IntrospectionResult } from "../types";
import {
  cache as introspectionCache,
  onIntrospectionUpdated,
} from "../introspection";

export function registerSemanticTokensProvider(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
  cache: Map<string, IntrospectionResult>
) {
  const legend = new vscode.SemanticTokensLegend(["dspyField"], []);

  // Fire when our introspection cache updates so VS Code re-requests tokens
  const tokensChangedEmitter = new vscode.EventEmitter<void>();
  context.subscriptions.push(tokensChangedEmitter);

  // Rebuild tokens for a document (optionally limited to a range)
  const buildTokens = (
    doc: vscode.TextDocument,
    range?: vscode.Range
  ): vscode.SemanticTokens | undefined => {
    const info =
      cache.get(doc.uri.toString()) ??
      introspectionCache.get(doc.uri.toString());
    if (!info) {
      return;
    }

    const builder = new vscode.SemanticTokensBuilder(legend);
    const targetRange =
      range ??
      new vscode.Range(0, 0, doc.lineCount - 1, Number.MAX_SAFE_INTEGER);
    const text = doc.getText(targetRange);
    const lines = text.split("\n");
    const startLine = targetRange.start.line;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = startLine + i;
      const line = lines[i];

      const regex = /\b(\w+)\.(\w+)\b/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        const varName = match[1];
        const fieldName = match[2];
        const pred = info.predictions[varName];
        if (!pred) {
          continue;
        }

        const sig = info.signatures[pred.signature];
        if (!sig) {
          continue;
        }

        const field = sig.outputs.find((f) => f.name === fieldName);
        if (!field) {
          continue;
        }

        const fieldStartCol = match.index + varName.length + 1; // skip '.'
        log(`Marking ${varName}.${fieldName} as dspyField`);
        builder.push(
          new vscode.Range(
            new vscode.Position(lineNum, fieldStartCol),
            new vscode.Position(lineNum, fieldStartCol + fieldName.length)
          ),
          "dspyField",
          []
        );
      }
    }

    return builder.build();
  };

  // Listen for introspection cache updates and notify VS Code
  context.subscriptions.push(
    onIntrospectionUpdated(() => {
      tokensChangedEmitter.fire();
      // Re-fire shortly after to win over late-arriving providers (e.g., Pylance)
      setTimeout(() => tokensChangedEmitter.fire(), 300);
    })
  );

  // Nudge refresh when editors change; this helps keep our tokens applied
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      if (editors.some((e) => e.document.languageId === "python")) {
        tokensChangedEmitter.fire();
        setTimeout(() => tokensChangedEmitter.fire(), 300);
      }
    })
  );

  context.subscriptions.push(
    // Provide tokens for the whole document
    vscode.languages.registerDocumentSemanticTokensProvider(
      "python",
      {
        onDidChangeSemanticTokens: tokensChangedEmitter.event,
        provideDocumentSemanticTokens(doc) {
          log(`Semantic tokens requested for ${doc.fileName}`);
          return buildTokens(doc);
        },
      },
      legend
    )
  );

  context.subscriptions.push(
    // Provide tokens for visible ranges (some editors request ranges)
    vscode.languages.registerDocumentRangeSemanticTokensProvider(
      "python",
      {
        onDidChangeSemanticTokens: tokensChangedEmitter.event,
        provideDocumentRangeSemanticTokens(doc, range) {
          log(`Semantic range tokens requested for ${doc.fileName}`);
          return buildTokens(doc, range);
        },
      },
      legend
    )
  );
}

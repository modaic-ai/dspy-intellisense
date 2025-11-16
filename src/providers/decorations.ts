import * as vscode from "vscode";
import { IntrospectionResult } from "../types";
import {
  cache as introspectionCache,
  onIntrospectionUpdated,
} from "../introspection";

export function registerOutputDecorations(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
  cache: Map<string, IntrospectionResult>
) {
  const config = vscode.workspace.getConfiguration("dspyIntellisense");
  const enabled = config.get<boolean>("decorationHighlighting.enabled", true);
  if (!enabled) {
    return;
  }

  const colorSetting =
    config.get<string>("decorationHighlighting.color") ?? "#a5e075";

  const decorationType = vscode.window.createTextEditorDecorationType({
    color: colorSetting,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  context.subscriptions.push(decorationType);

  const getInfo = (doc: vscode.TextDocument): IntrospectionResult | undefined =>
    cache.get(doc.uri.toString()) ?? introspectionCache.get(doc.uri.toString());

  const computeRanges = (
    doc: vscode.TextDocument
  ): vscode.Range[] | undefined => {
    const info = getInfo(doc);
    if (!info) {
      return;
    }
    const ranges: vscode.Range[] = [];
    const text = doc.getText();
    const lines = text.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
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
        const startCol = match.index + varName.length + 1;
        const endCol = startCol + fieldName.length;
        ranges.push(
          new vscode.Range(
            new vscode.Position(lineNum, startCol),
            new vscode.Position(lineNum, endCol)
          )
        );
      }
    }
    return ranges;
  };

  const refreshEditor = (editor: vscode.TextEditor | undefined) => {
    if (!editor || editor.document.languageId !== "python") {
      return;
    }
    const ranges = computeRanges(editor.document) ?? [];
    editor.setDecorations(decorationType, ranges);
  };

  // Refresh visible editors initially and when things change
  vscode.window.visibleTextEditors.forEach(refreshEditor);

  context.subscriptions.push(
    onIntrospectionUpdated(() => {
      vscode.window.visibleTextEditors.forEach((e) => {
        refreshEditor(e);
        // double-nudge after Pylance updates
        setTimeout(() => refreshEditor(e), 300);
      });
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const active = vscode.window.visibleTextEditors.find(
        (ed) => ed.document.uri.toString() === e.document.uri.toString()
      );
      refreshEditor(active);
      setTimeout(() => refreshEditor(active), 300);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      editors.forEach((e) => {
        refreshEditor(e);
        setTimeout(() => refreshEditor(e), 300);
      });
    })
  );

  // React to configuration changes (color)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("dspyIntellisense.decorationHighlighting.color")
      ) {
        vscode.window.visibleTextEditors.forEach(refreshEditor);
      }
    })
  );
}

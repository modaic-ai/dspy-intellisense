import * as vscode from "vscode";
import { IntrospectionResult } from "../types";

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
  cache: Map<string, IntrospectionResult>
) {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      "python",
      {
        provideCompletionItems(
          doc: vscode.TextDocument,
          position: vscode.Position,
          _token: vscode.CancellationToken,
          _context: vscode.CompletionContext
        ): vscode.ProviderResult<
          vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>
        > {
          log(
            `Completion triggered at ${doc.fileName}:${position.line}:${position.character}`
          );
          const info = cache.get(doc.uri.toString());
          if (!info) {
            log(`No cache entry for completions`);
            return;
          }

          const lineText = doc.lineAt(position.line).text;
          const upToCursor = lineText.slice(0, position.character);
          log(`Line up to cursor: "${upToCursor}"`);

          const attrMatch = /(\w+)\.(\w*)$/.exec(upToCursor);
          if (attrMatch) {
            const varName = attrMatch[1];
            log(`Attribute completion for: ${varName}`);
            const pred = info.predictions[varName];
            if (pred) {
              const sig = info.signatures[pred.signature];
              if (!sig) {
                return;
              }
              const fields = sig.outputs;
              const items: vscode.CompletionItem[] = [];
              for (const f of fields) {
                const item = new vscode.CompletionItem(
                  f.name,
                  vscode.CompletionItemKind.Property
                );
                item.detail = `${f.name}: ${f.annotation ?? "Any"}`;
                item.documentation = new vscode.MarkdownString();
                if (f.annotation) {
                  item.documentation.appendCodeblock(
                    `(property): ${f.annotation ?? "Any"}`,
                    "python"
                  );
                }
                if (f.description) {
                  item.documentation.appendMarkdown(`\n${f.description}\n`);
                }
                items.push(item);
              }
              log(`Returning ${items.length} output field completions`);
              return items;
            }
          }

          const callMatch = /(\w+)\s*\([^()]*$/.exec(upToCursor);
          if (callMatch) {
            const calleeName = callMatch[1];
            log(`Call completion for: ${calleeName}`);
            const mod = info.modules[calleeName];
            if (!mod) {
              return;
            }

            const sig = info.signatures[mod.signature];
            if (!sig) {
              return;
            }

            const items: vscode.CompletionItem[] = [];
            for (const field of sig.inputs) {
              const label = `${field.name}=`;
              const item = new vscode.CompletionItem(
                label,
                vscode.CompletionItemKind.Field
              );
              item.insertText = label;
              item.detail = `${field.name}: ${field.annotation ?? "Any"}`;
              item.documentation = new vscode.MarkdownString();
              if (field.annotation) {
                item.documentation.appendCodeblock(
                  `(parameter): ${field.annotation ?? "Any"}`,
                  "python"
                );
              }
              if (field.description) {
                item.documentation.appendMarkdown(`\n${field.description}\n`);
              }
              items.push(item);
            }
            log(`Returning ${items.length} argument completions`);
            return items;
          }

          return;
        },
      },
      ".",
      "(",
      ",",
      " "
    )
  );
}

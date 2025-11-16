import * as vscode from "vscode";
import { IntrospectionResult } from "../types";

export function registerHoverProvider(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
  cache: Map<string, IntrospectionResult>
) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider("python", {
      provideHover(doc, position) {
        log(
          `Hover triggered at ${doc.fileName}:${position.line}:${position.character}`
        );
        const info = cache.get(doc.uri.toString());
        if (!info) {
          log(`No cache entry for ${doc.uri.toString()}`);
          return;
        }

        const range = doc.getWordRangeAtPosition(position);
        if (!range) return;

        const word = doc.getText(range);
        log(`Hover word: "${word}"`);

        const pred = info.predictions[word];
        if (pred) {
          log(`Found prediction: ${word} -> ${pred.signature}`);
          const sig = info.signatures[pred.signature];
          if (!sig) return;

          const fields = [...sig.outputs];
          const md = new vscode.MarkdownString();

          md.appendMarkdown(`**DSPy Signature**: \`${sig.name}\`\n\n`);

          if (fields.length) {
            md.appendMarkdown("**Fields:**\n");
            for (const f of fields) {
              const ann = f.annotation ?? "Any";
              md.appendMarkdown(`- \`${f.name}\`: \`${ann}\`\n`);
            }
          } else {
            md.appendMarkdown("_No output fields detected on this signature._");
          }

          md.isTrusted = true;
          return new vscode.Hover(md, range);
        }

        const mod = info.modules[word];
        if (mod) {
          log(`Found module: ${word} -> ${mod.signature}`);
          const sig = info.signatures[mod.signature];
          if (!sig) return;

          const inSig = sig.inputs
            .map((f) => `${f.name}: ${f.annotation ?? "Any"}`)
            .join(", ");
          const outFields = [...sig.outputs];
          const outSig = outFields
            .map((f) => `${f.name}: ${f.annotation ?? "Any"}`)
            .join(", ");

          const md = new vscode.MarkdownString();
          md.appendCodeblock(
            `(variable) def ${word}(*, ${inSig}) -> Prediction`,
            "python"
          );
          md.appendMarkdown("\n");
          md.appendMarkdown(`**DSPy Signature:** \`${sig.name}\`\n\n`);
          md.isTrusted = true;
          return new vscode.Hover(md, range);
        }

        const line = doc.lineAt(position.line).text;
        const beforeCursor = line.slice(0, position.character);
        const attrAccessMatch = /(\w+)\.(\w*)$/.exec(beforeCursor);

        if (attrAccessMatch) {
          const varName = attrAccessMatch[1];
          const fieldName = word;
          const predVar = info.predictions[varName];

          if (predVar) {
            const sig = info.signatures[predVar.signature];
            if (sig) {
              const field = sig.outputs.find((f) => f.name === fieldName);
              if (field) {
                log(`Found field: ${varName}.${fieldName}`);
                const md = new vscode.MarkdownString();
                md.appendCodeblock(
                  `(property) ${fieldName}: ${field.annotation ?? "Any"}`,
                  "python"
                );
                md.appendMarkdown(`\n${field.description ?? ""}\n`);
                md.isTrusted = true;
                return new vscode.Hover(md, range);
              }
            }
          }
        }

        log(`No match found for word: "${word}"`);
        return;
      },
    })
  );
}

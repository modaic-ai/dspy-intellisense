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
        if (!range) {
          return;
        }

        const word = doc.getText(range);
        log(`Hover word: "${word}"`);

        const pred = info.predictions[word];
        if (pred) {
          log(`Found prediction: ${word} -> ${pred.signature}`);
          const sig = info.signatures[pred.signature];
          if (!sig) {
            return;
          }

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
          if (!sig) {
            return;
          }

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

        // Hover on keyword-argument names inside a call, e.g., module(foo=...)
        // Detect if the word is followed by '=' (possibly with spaces)
        const rightOfWord = doc.getText(
          new vscode.Range(range.end, range.end.translate(0, 50))
        );
        const isKwArgName = /^\s*=/.test(rightOfWord);
        if (isKwArgName) {
          log(`Kwarg candidate detected for "${word}"`);
          // Find the nearest callee name preceding '(' within a small lookback window
          let calleeName: string | undefined;
          const lookbackLines = 5;
          for (
            let lineIdx = position.line;
            lineIdx >= Math.max(0, position.line - lookbackLines);
            lineIdx--
          ) {
            const textLine = doc.lineAt(lineIdx).text;
            const searchEnd =
              lineIdx === position.line
                ? range.start.character
                : textLine.length;
            const segment = textLine.slice(0, searchEnd);
            const parenIdx = segment.lastIndexOf("(");
            if (parenIdx !== -1) {
              const beforeParen = segment.slice(0, parenIdx);
              const m = /(\w+)\s*$/.exec(beforeParen);
              if (m) {
                calleeName = m[1];
                log(`Resolved callee for kwarg "${word}": ${calleeName}`);
                break;
              }
            }
          }

          if (calleeName) {
            const modInfo = info.modules[calleeName];
            if (modInfo) {
              log(`Detected kwarg "${word}" in call to ${calleeName}`);
              const sig = info.signatures[modInfo.signature];
              if (sig) {
                const inputField = sig.inputs.find((f) => f.name === word);
                if (inputField) {
                  const md = new vscode.MarkdownString();
                  md.appendCodeblock(
                    `(parameter) ${inputField.name}: ${
                      inputField.annotation ?? "Any"
                    }`,
                    "python"
                  );
                  if (inputField.description) {
                    md.appendMarkdown(`\n${inputField.description}\n`);
                  }
                  md.isTrusted = true;
                  return new vscode.Hover(md, range);
                }
                log(
                  `No input field named "${word}" found on signature ${sig.name}`
                );
              }
              log(
                `No signature found for module ${calleeName} -> ${modInfo.signature}`
              );
            } else {
              log(
                `Callee "${calleeName}" not present in modules map; attempting LHS prediction fallback`
              );
              // Fallback: try to resolve signature via LHS prediction variable on the same line
              const lineText = doc.lineAt(position.line).text;
              const lhsMatch = new RegExp(
                String.raw`(\w+)\s*=\s*${calleeName}\s*\($`
              ).exec(lineText.slice(0, range.start.character));
              if (lhsMatch) {
                const lhsVar = lhsMatch[1];
                const predInfo = info.predictions[lhsVar];
                if (predInfo) {
                  const sig = info.signatures[predInfo.signature];
                  if (sig) {
                    const inputField = sig.inputs.find((f) => f.name === word);
                    if (inputField) {
                      const md = new vscode.MarkdownString();
                      md.appendCodeblock(
                        `(parameter) ${inputField.name}: ${
                          inputField.annotation ?? "Any"
                        }`,
                        "python"
                      );
                      if (inputField.description) {
                        md.appendMarkdown(`\n${inputField.description}\n`);
                      }
                      md.isTrusted = true;
                      return new vscode.Hover(md, range);
                    }
                    log(
                      `No input field named "${word}" found on signature ${sig.name} (via LHS prediction)`
                    );
                  } else {
                    log(
                      `Prediction ${lhsVar} has unknown signature ${predInfo.signature}`
                    );
                  }
                } else {
                  log(
                    `No prediction info found for LHS variable ${lhsVar} (fallback)`
                  );
                }
              } else {
                log(
                  `Could not match pattern "lhs = ${calleeName}(" on current line for fallback`
                );
              }
            }
          }
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

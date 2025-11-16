import * as vscode from "vscode";
import { IntrospectionResult } from "../types";

export function registerSignatureHelpProvider(
  context: vscode.ExtensionContext,
  log: (message: string) => void,
  cache: Map<string, IntrospectionResult>
) {
  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(
      "python",
      {
        provideSignatureHelp(doc, position) {
          log(
            `Signature help triggered at ${doc.fileName}:${position.line}:${position.character}`
          );
          const info = cache.get(doc.uri.toString());
          if (!info) {
            log(`No cache entry for signature help`);
            return;
          }

          const lineText = doc.lineAt(position.line).text;
          const upToCursor = lineText.slice(0, position.character);

          const callMatch = /(\w+)\s*\([^()]*$/.exec(upToCursor);
          if (!callMatch) {
            return;
          }

          const calleeName = callMatch[1];
          log(`Signature help for: ${calleeName}`);

          const mod = info.modules[calleeName];
          if (!mod) {
            return;
          }

          const sig = info.signatures[mod.signature];
          if (!sig) {
            return;
          }

          const signatureHelp = new vscode.SignatureHelp();
          const signature = new vscode.SignatureInformation(
            `${calleeName}(${sig.inputs
              .map((f) => `${f.name}: ${f.annotation ?? "Any"}`)
              .join(", ")}) -> Prediction[${sig.name}]`
          );

          signature.documentation = new vscode.MarkdownString(
            `**DSPy Signature:** \`${sig.name}\`\n\nInputs for this predictor.`
          );

          for (const field of sig.inputs) {
            const paramInfo = new vscode.ParameterInformation(
              `${field.name}: ${field.annotation ?? "Any"}`,
              new vscode.MarkdownString(
                `**${field.name}**: \`${field.annotation ?? "Any"}\``
              )
            );
            signature.parameters.push(paramInfo);
          }

          signatureHelp.signatures.push(signature);
          signatureHelp.activeSignature = 0;

          const paramsText = upToCursor.slice(upToCursor.lastIndexOf("(") + 1);
          const commaCount = (paramsText.match(/,/g) || []).length;
          signatureHelp.activeParameter = Math.min(
            commaCount,
            sig.inputs.length - 1
          );

          log(
            `Returning signature help with ${signature.parameters.length} parameters`
          );
          return signatureHelp;
        },
      },
      "(",
      ","
    )
  );
}

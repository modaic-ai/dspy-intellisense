import * as vscode from "vscode";
import { execFileAsync } from "./utils";
import { IntrospectionResult } from "./types";

export const cache = new Map<string, IntrospectionResult>();

// Notify listeners when introspection data updates for a document (by URI string)
export const introspectionUpdatedEmitter = new vscode.EventEmitter<string>();
export const onIntrospectionUpdated = introspectionUpdatedEmitter.event;

export async function getPythonPath(): Promise<string> {
  try {
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");
    if (pythonExtension) {
      if (!pythonExtension.isActive) {
        await pythonExtension.activate();
      }
      const pythonPath =
        pythonExtension.exports.settings.getExecutionDetails?.()
          ?.execCommand?.[0];
      if (pythonPath) {
        return pythonPath;
      }
    }
  } catch (error) {
    console.log("Could not get Python path from extension:", error);
  }
  return process.platform === "win32" ? "python" : "python3";
}

export function createIntrospector(
  getPythonPathRef: () => string | null,
  scriptPath: string,
  log: (message: string) => void
) {
  const pending = new Map<string, NodeJS.Timeout>();

  const introspectDocument = async (doc: vscode.TextDocument) => {
    if (doc.languageId !== "python") {
      return;
    }
    const pythonPath = getPythonPathRef();
    if (!pythonPath) {
      log(`Skipping introspection for ${doc.fileName}: Python not initialized`);
      return;
    }
    log(`Running DSPy introspector for ${doc.fileName}`);
    try {
      const { stdout, stderr } = await execFileAsync(
        pythonPath,
        [scriptPath, doc.fileName],
        {
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          timeout: 10000,
        }
      );
      if (stderr) {
        log(`stderr: ${stderr}`);
      }
      const result = JSON.parse(stdout) as IntrospectionResult;
      cache.set(doc.uri.toString(), result);
      log(
        `Parsed ${Object.keys(result.signatures).length} signature(s), ${
          Object.keys(result.modules).length
        } module(s), ${
          Object.keys(result.predictions).length
        } prediction(s) from ${doc.fileName}`
      );
      // Signal that semantic tokens may need to refresh
      introspectionUpdatedEmitter.fire(doc.uri.toString());
    } catch (error: any) {
      log(`dspy_sig_introspect error for ${doc.fileName}: ${error.message}`);
      cache.delete(doc.uri.toString());
    }
  };

  const scheduleIntrospect = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    const existing = pending.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const handle = setTimeout(() => introspectDocument(doc), 250);
    pending.set(key, handle);
  };

  return { scheduleIntrospect, introspectDocument };
}

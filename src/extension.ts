import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execFileAsync } from "./utils";
import { cache, createIntrospector, getPythonPath } from "./introspection";
import { registerHoverProvider } from "./providers/hover";
import { registerCompletionProvider } from "./providers/completion";
import { registerSignatureHelpProvider } from "./providers/signatureHelp";
import { registerDefinitionProvider } from "./providers/definition";
import { registerDocumentHighlightProvider } from "./providers/documentHighlight";
import { registerOutputDecorations } from "./providers/decorations";

// ---------------------- Extension entrypoint ----------------------

export function activate(context: vscode.ExtensionContext) {
  console.log("DSPy IntelliSense activated");
  const outputChannel = vscode.window.createOutputChannel("DSPy IntelliSense");
  context.subscriptions.push(outputChannel);

  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}`;
    console.log(entry);
    outputChannel.appendLine(entry);
  };

  const scriptCandidates = [
    context.asAbsolutePath("dspy_sig_introspect.py"),
    path.join(context.extensionPath, "out", "dspy_sig_introspect.py"),
  ];
  const scriptPath = scriptCandidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!scriptPath) {
    log(
      "Could not find dspy_sig_introspect.py in extension root or out/ directory."
    );
    vscode.window.showErrorMessage(
      "DSPy IntelliSense: Python script not found. Please reinstall the extension."
    );
    return;
  }

  log(`Extension activated. Using introspection script at ${scriptPath}`);

  // Initialize Python path
  let pythonPath: string | null = null;

  // Setup introspector (debounced) now so it's available during init
  const { scheduleIntrospect } = createIntrospector(
    () => pythonPath,
    scriptPath,
    log
  );

  const initPython = async () => {
    try {
      pythonPath = await getPythonPath();
      log(`Using Python: ${pythonPath}`);

      // Test that Python works
      const { stdout } = await execFileAsync(pythonPath, ["--version"]);
      log(`Python version: ${stdout.trim()}`);

      // Trigger introspection on already-open docs after Python is ready
      vscode.workspace.textDocuments.forEach(scheduleIntrospect);
    } catch (error: any) {
      log(`Failed to initialize Python: ${error.message}`);
      vscode.window.showErrorMessage(
        "DSPy IntelliSense: Could not find Python. Please ensure Python is installed and accessible."
      );
    }
  };

  // Start Python initialization (non-blocking)
  initPython();

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(scheduleIntrospect),
    vscode.workspace.onDidSaveTextDocument(scheduleIntrospect),
    vscode.workspace.onDidChangeTextDocument((e) =>
      scheduleIntrospect(e.document)
    )
  );

  // Register providers
  registerHoverProvider(context, log, cache);
  registerCompletionProvider(context, log, cache);
  registerSignatureHelpProvider(context, log, cache);
  registerDefinitionProvider(context, log, cache);
  registerDocumentHighlightProvider(context, log, cache);
  registerOutputDecorations(context, log, cache);

  // Debug command to check status
  const debugCmd = vscode.commands.registerCommand(
    "dspyIntellisense.debug",
    () => {
      log(`=== DEBUG INFO ===`);
      log(`Python path: ${pythonPath}`);
      log(`Script path: ${scriptPath}`);
      log(`Cache size: ${cache.size}`);
      log(`Cached URIs: ${Array.from(cache.keys()).join(", ")}`);

      for (const [uri, data] of cache.entries()) {
        log(`  ${uri}:`);
        log(`    Signatures: ${Object.keys(data.signatures).join(", ")}`);
        log(`    Modules: ${Object.keys(data.modules).join(", ")}`);
        log(`    Predictions: ${Object.keys(data.predictions).join(", ")}`);
      }

      vscode.window.showInformationMessage(
        `DSPy IntelliSense: ${cache.size} files cached. Check Output for details.`
      );
    }
  );
  context.subscriptions.push(debugCmd);

  // Simple hello command
  const helloCmd = vscode.commands.registerCommand(
    "dspyIntellisense.hello",
    () => {
      vscode.window.showInformationMessage("DSPy IntelliSense is running!");
    }
  );
  context.subscriptions.push(helloCmd);
}

export function deactivate() {}

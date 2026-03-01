import * as vscode from "vscode";
import { AccountManager,
	AccountQuotaCache,
	AccountSyncAdapter,
	registerAccountCommands,
} from "./accounts";
import { InlineCompletionShim } from "./copilot/inlineCompletionShim";
import { AntigravityProvider } from "./providers/antigravity/provider";
import { CodexProvider } from "./providers/codex/codexProvider";
import { CompatibleProvider } from "./providers/compatible/compatibleProvider";
import { registerAllTools } from "./tools";
import { ProviderKey } from "./types/providerKeys";
import {
	registerSettingsPageCommand,
} from "./ui";
import {
	registerProvidersFromConfig,
	type RegisteredProvider,
} from "./utils/knownProviders";
import {
	ApiKeyManager,
	CompletionLogger,
	ConfigManager,
	JsonSchemaProvider,
	Logger,
	StatusLogger,
	TokenCounter,
} from "./utils";
import { CompatibleModelManager } from "./utils/compatibleModelManager";
import { StatusBarManager, LeaderElectionService } from "./status";

/**
 * Global variables - Store registered provider instances for cleanup on extension uninstall
 */
const registeredProviders: Record<string, RegisteredProvider> = {};
const registeredDisposables: vscode.Disposable[] = [];

// Inline completion provider instance (using lightweight Shim, lazy loading real completion engine)
let inlineCompletionProvider: InlineCompletionShim | undefined;

/**
 * Activate providers - dynamic registration based on config file using registry pattern
 */
async function activateProviders(
	context: vscode.ExtensionContext,
): Promise<void> {
	const configProvider = ConfigManager.getConfigProvider();

	if (!configProvider) {
		Logger.warn(
			"Provider configuration not found, skipping provider registration",
		);
		return;
	}

	// Set extension path (for tokenizer initialization)
	TokenCounter.setExtensionPath(context.extensionPath);

	// Register all providers using the registry (excludes Codex and Antigravity which are registered separately)
	const result = await registerProvidersFromConfig(
		context,
		configProvider,
		[ProviderKey.Codex, ProviderKey.Antigravity], // Exclude Codex and Antigravity - registered separately with specialized provider
	);

	// Store registered providers and disposables
	Object.assign(registeredProviders, result.providers);
	registeredDisposables.push(...result.disposables);
}

/**
 * Activate compatible provider
 */
async function activateCompatibleProvider(
	context: vscode.ExtensionContext,
): Promise<void> {
	try {
		Logger.trace("Registering compatible provider...");
		const providerStartTime = Date.now();

		// Create and activate compatible provider
		const result = CompatibleProvider.createAndActivate(context);
		const provider = result.provider;
		const disposables = result.disposables;

		// Store registered providers and disposables
		registeredProviders.compatible = provider;
		registeredDisposables.push(...disposables);

		const providerTime = Date.now() - providerStartTime;
		Logger.info(
			`Compatible Provider registered successfully (time: ${providerTime}ms)`,
		);
	} catch (error) {
		Logger.error("Failed to register compatible provider:", error);
	}

}

/**
 * Activate inline completion provider (lightweight Shim, lazy load the actual completion engine)
 */
async function activateInlineCompletionProvider(
	context: vscode.ExtensionContext,
): Promise<void> {
	try {
		Logger.trace("Registering inline completion provider (Shim mode)...");
		const providerStartTime = Date.now();

		// Create and activate lightweight Shim (no @vscode/chat-lib dependency)
		const result = InlineCompletionShim.createAndActivate(context);
		inlineCompletionProvider = result.provider;
		registeredDisposables.push(...result.disposables);

		const providerTime = Date.now() - providerStartTime;
		Logger.info(
			`Inline completion provider registered successfully - Shim mode (time: ${providerTime}ms)`,
		);
	} catch (error) {
		Logger.error("Failed to register inline completion provider:", error);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Store singleton instances in globalThis for use by modules in copilot.bundle.js
	globalThis.__chp_singletons = {
		CompletionLogger,
		ApiKeyManager,
		ConfigManager,
	};

	const activationStartTime = Date.now();

	try {
		Logger.initialize("Copilot ++"); // Initialize log manager
		StatusLogger.initialize("GitHub Copilot Models Provider Status"); // Initialize high-frequency status log manager
		LeaderElectionService.initialize(context); // Initialize leader election service for status bars
		CompletionLogger.initialize("Copilot ++Inline Completion"); // Initialize high-frequency inline completion log manager

		const isDevelopment =
			context.extensionMode === vscode.ExtensionMode.Development;
		Logger.info(
			`Copilot ++Extension Mode: ${isDevelopment ? "Development" : "Production"}`,
		);
		// Check and prompt VS Code log level settings
		if (isDevelopment) {
			Logger.checkAndPromptLogLevel();
		}

		Logger.info("⏱️ Starting Copilot ++extension activation...");

		// Step 1: Initialize API key manager
		let stepStartTime = Date.now();
		ApiKeyManager.initialize(context);
		Logger.trace(
			`⏱️ API key manager initialization complete (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 1.1: Initialize multi-account manager
		stepStartTime = Date.now();
		AccountManager.initialize(context);
		// Initialize Account Quota Cache
		AccountQuotaCache.initialize(context);
		// Initialize Status Bar Manager (includes quota and token usage status bars)
		StatusBarManager.initializeAll(context);
		const accountDisposables = registerAccountCommands(context);
		context.subscriptions.push(...accountDisposables);
		// Initialize account sync adapter and sync existing accounts
		const accountSyncAdapter = AccountSyncAdapter.initialize();
		context.subscriptions.push({ dispose: () => accountSyncAdapter.dispose() });
		// Asynchronously sync existing accounts (non-blocking startup)
		accountSyncAdapter
			.syncAllAccounts()
			.catch((err) => Logger.warn("Account sync failed:", err));

		// Listen to account changes and update AntigravityQuotaWatcher config
		const accountManager = AccountManager.getInstance();

		const updateAntigravityConfig = async () => {
			const activeAccount = accountManager.getActiveAccount(
				ProviderKey.Antigravity,
			);
			if (!activeAccount) {
				return;
			}

			const credentials = await accountManager.getCredentials(activeAccount.id);
			if (!credentials) {
				return;
			}

			// Extract token from credentials (supports both accessToken and apiKey formats)
			const token =
				(credentials as { accessToken?: string; apiKey?: string })
					.accessToken ??
				(credentials as { accessToken?: string; apiKey?: string }).apiKey;

			if (token) {
				const config = vscode.workspace.getConfiguration(
					"antigravityQuotaWatcher",
				);
				if (config.get("apiKey") !== token) {
					await config.update(
						"apiKey",
						token,
						vscode.ConfigurationTarget.Global,
					);
				}
			}
		};

		// Initial update
		updateAntigravityConfig();

		context.subscriptions.push(
			accountManager.onAccountChange(async (event) => {
				if (
					event.provider === ProviderKey.Antigravity &&
					(event.type === "switched" ||
						event.type === "updated" ||
						event.type === "added")
				) {
					await updateAntigravityConfig();
				}
			}),
		);

		Logger.trace(
			`⏱️ Multi-account manager initialization complete (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 1.2: Register settings page command
		stepStartTime = Date.now();
		const settingsPageDisposable = registerSettingsPageCommand(context);
		context.subscriptions.push(settingsPageDisposable);
		Logger.trace(
			`⏱️ Settings page command registered (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 2: Initialize configuration manager
		stepStartTime = Date.now();
		const configDisposable = ConfigManager.initialize();
		context.subscriptions.push(configDisposable);
		Logger.trace(
			`⏱️ Configuration manager initialized (time: ${Date.now() - stepStartTime}ms)`,
		);
		// Step 2.1: Initialize JSON Schema provider
		stepStartTime = Date.now();
		JsonSchemaProvider.initialize();
		context.subscriptions.push({ dispose: () => JsonSchemaProvider.dispose() });
		Logger.trace(
			`⏱️ JSON Schema provider initialized (time: ${Date.now() - stepStartTime}ms)`,
		);
		// Step 2.2: Initialize compatible model manager
		stepStartTime = Date.now();
		CompatibleModelManager.initialize();
		Logger.trace(
			`⏱️ Compatible model manager initialized (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 3: Activate providers (parallel optimization)
		stepStartTime = Date.now();
		await activateProviders(context);
		Logger.trace(
			`⏱️ Model provider registration complete (time: ${Date.now() - stepStartTime}ms)`,
		);
		// Step 3.1: Activate compatible provider
		stepStartTime = Date.now();
		await activateCompatibleProvider(context);
		Logger.trace(
			`⏱️ Compatible provider registration complete (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 4: Register tools
		stepStartTime = Date.now();
		registerAllTools(context);
		Logger.trace(`⏱️ Tools registered (time: ${Date.now() - stepStartTime}ms)`);

		// Step 4.1: Activate Antigravity Provider
		stepStartTime = Date.now();
		const antigravityResult = AntigravityProvider.createAndActivate(context);
		registeredProviders[ProviderKey.Antigravity] = antigravityResult.provider;
		registeredDisposables.push(...antigravityResult.disposables);
		Logger.trace(
			`⏱️ Antigravity Provider registered (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 4.2: Activate Codex Provider (OpenAI GPT-5)
		stepStartTime = Date.now();
		const codexResult = CodexProvider.createAndActivate(context);
		registeredProviders[ProviderKey.Codex] = codexResult.provider;
		registeredDisposables.push(...codexResult.disposables);
		Logger.trace(
			`⏱️ Codex Provider registered (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 5: Register inline completion provider (lightweight Shim, lazy load the actual completion engine)
		stepStartTime = Date.now();
		await activateInlineCompletionProvider(context);
		Logger.trace(
			`⏱️ NES inline completion provider registered (time: ${Date.now() - stepStartTime}ms)`,
		);

		// Step 6: Register Copilot helper commands
		stepStartTime = Date.now();
		const copilotAttachSelectionCmd = vscode.commands.registerCommand(
			"chp.copilot.attachSelection",
			async () => {
				try {
					const editor = vscode.window.activeTextEditor;
					if (!editor) {
						vscode.window.showWarningMessage("No active editor found.");
						return;
					}

					const selection = editor.selection;
					const document = editor.document;
					const fileName =
						document.fileName.split("/").pop() || document.fileName;

					let lineRange: string;
					if (selection.start.line === selection.end.line) {
						lineRange = `${selection.start.line + 1}`;
					} else {
						lineRange = `${selection.start.line + 1}-${selection.end.line + 1}`;
					}

					const referenceText = `@${fileName}:${lineRange} `;

					await vscode.commands.executeCommand(
						"workbench.panel.chat.view.copilot.focus",
					);
					await vscode.commands.executeCommand(
						"workbench.action.chat.insertIntoInput",
						referenceText,
					);
				} catch (error) {
					Logger.warn("Unable to execute Copilot attach selection:", error);
					vscode.window.showWarningMessage(
						"Failed to insert reference to Copilot Chat. Make sure GitHub Copilot Chat is installed.",
					);
				}
			},
		);
		context.subscriptions.push(copilotAttachSelectionCmd);

		// Command: Insert file handle reference with line range (format: #handle:filename:L1-L100)
		const copilotInsertHandleCmd = vscode.commands.registerCommand(
			"chp.copilot.insertHandle",
			async () => {
				try {
					const editor = vscode.window.activeTextEditor;
					if (!editor) {
						vscode.window.showWarningMessage("No active editor found.");
						return;
					}

					const selection = editor.selection;
					const document = editor.document;
					const fileName =
						document.fileName.split("/").pop() || document.fileName;

					let lineRange: string;
					if (selection.isEmpty) {
						// No selection - use current line
						lineRange = `L${selection.start.line + 1}`;
					} else if (selection.start.line === selection.end.line) {
						// Single line selection
						lineRange = `L${selection.start.line + 1}`;
					} else {
						// Multi-line selection
						lineRange = `L${selection.start.line + 1}-L${selection.end.line + 1}`;
					}

					// Format: #handle:filename:L1-L100 (e.g., #handle:extension.ts:L1-L100)
					const handleText = `#file:${fileName}:${lineRange} `;

					// Focus Copilot Chat panel
					await vscode.commands.executeCommand(
						"workbench.panel.chat.view.copilot.focus",
					);
					// Use 'type' command to insert text at cursor position (appends to existing text)
					await vscode.commands.executeCommand("type", { text: handleText });

					Logger.trace(`Inserted handle reference: ${handleText}`);
				} catch (error) {
					Logger.warn("Unable to insert handle reference:", error);
					vscode.window.showWarningMessage(
						"Failed to insert handle reference to Copilot Chat. Make sure GitHub Copilot Chat is installed.",
					);
				}
			},
		);
		context.subscriptions.push(copilotInsertHandleCmd);

		// Command: Insert file handle with full path reference (format: #handle:path/to/file.ts:L1-L100)
		const copilotInsertHandleFullPathCmd = vscode.commands.registerCommand(
			"chp.copilot.insertHandleFullPath",
			async () => {
				try {
					const editor = vscode.window.activeTextEditor;
					if (!editor) {
						vscode.window.showWarningMessage("No active editor found.");
						return;
					}

					const selection = editor.selection;
					const document = editor.document;

					// Get relative path from workspace
					const workspaceFolder = vscode.workspace.getWorkspaceFolder(
						document.uri,
					);
					let relativePath: string;
					if (workspaceFolder) {
						relativePath = vscode.workspace.asRelativePath(document.uri, false);
					} else {
						relativePath =
							document.fileName.split("/").pop() || document.fileName;
					}

					let lineRange: string;
					if (selection.isEmpty) {
						lineRange = `L${selection.start.line + 1}`;
					} else if (selection.start.line === selection.end.line) {
						lineRange = `L${selection.start.line + 1}`;
					} else {
						lineRange = `L${selection.start.line + 1}-L${selection.end.line + 1}`;
					}

					// Format: #handle:path/to/file.ts:L1-L100
					const handleText = `#handle:${relativePath}:${lineRange} `;

					// Focus Copilot Chat panel
					await vscode.commands.executeCommand(
						"workbench.panel.chat.view.copilot.focus",
					);
					// Use 'type' command to insert text at cursor position (appends to existing text)
					await vscode.commands.executeCommand("type", { text: handleText });
				} catch (error) {
					Logger.warn(
						"Unable to insert handle reference with full path:",
						error,
					);
					vscode.window.showWarningMessage(
						"Failed to insert handle reference to Copilot Chat.",
					);
				}
			},
		);
		context.subscriptions.push(copilotInsertHandleFullPathCmd);
		Logger.trace(
			`⏱️ Copilot helper commands registered (time: ${Date.now() - stepStartTime}ms)`,
		);

		const totalActivationTime = Date.now() - activationStartTime;
		Logger.info(
			`Copilot ++extension activation completed (total time: ${totalActivationTime}ms)`,
		);
	} catch (error) {
		const errorMessage = `Copilot ++extension activation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
		Logger.error(errorMessage, error instanceof Error ? error : undefined);

		// Try to display user-friendly error message
		vscode.window.showErrorMessage(
			"Copilot ++extension startup failed. Please check the output window for details.",
		);
		// Re-throw error to let VS Code know extension startup failed
		throw error;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	try {
		// Clean up all registered provider resources
		for (const [providerKey, provider] of Object.entries(registeredProviders)) {
			try {
				if (typeof provider.dispose === "function") {
					provider.dispose();
					Logger.trace(`Provider ${providerKey} resources cleaned up`);
				}
			} catch (error) {
				Logger.warn(
					`Error cleaning up provider ${providerKey} resources:`,
					error,
				);
			}
		}

		// Clean up inline completion provider
		if (inlineCompletionProvider) {
			inlineCompletionProvider.dispose();
			Logger.trace("Inline completion provider cleaned up");
		}

		// Clean up multi-account manager
		try {
			AccountManager.getInstance().dispose();
			Logger.trace("Multi-account manager cleaned up");
		} catch {
			// AccountManager may not be initialized
		}

		ConfigManager.dispose(); // Clean up configuration manager
		LeaderElectionService.stop(); // Clean up leader election service
		StatusLogger.dispose(); // Clean up status logger
		CompletionLogger.dispose(); // Clean up inline completion logger
		Logger.dispose(); // Dispose Logger only when extension is destroyed
	} catch (error) {
		Logger.error("Error during Copilot ++extension deactivation:", error);
	}
}

/**
 * Model Editor - Visual Form Interface
 * Provides a visual interface for creating and editing compatible models
 */

import * as vscode from "vscode";
import { configProviders } from "../providers/config";
import type { CompatibleModelConfig } from "../utils/compatibleModelManager";
import { KnownProviders } from "../utils/knownProviders";
import modelEditorCss from "./modelEditor.css?raw";
import modelEditorJs from "./modelEditor.js?raw";

/**
 * Delete model marker interface
 */
interface DeleteModelMarker {
	_deleteModel: true;
	modelId: string;
}

/**
 * Model Editor Class
 * Manages the visual form interface for creating and editing models
 */
export class ModelEditor {
	/**
	 * Show model editor
	 * @param model Model configuration to edit
	 * @param isCreateMode Whether it is in creation mode
	 * @returns Updated model configuration, or undefined if cancelled, or a delete marker object
	 */
	static async show(
		model: CompatibleModelConfig,
		isCreateMode: boolean = false,
	): Promise<CompatibleModelConfig | DeleteModelMarker | undefined> {
		const panel = vscode.window.createWebviewPanel(
			"compatibleModelEditor",
			isCreateMode
				? "Create New Model"
				: `Edit Model: ${model.name || "Unnamed Model"}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			},
		);

		// Generate form HTML
		panel.webview.html = ModelEditor.generateHTML(
			model,
			isCreateMode,
			panel.webview,
		);

		return new Promise<CompatibleModelConfig | DeleteModelMarker | undefined>(
			(resolve) => {
				const disposables: vscode.Disposable[] = [];

				disposables.push(
					panel.webview.onDidReceiveMessage(
						async (message) => {
							switch (message.command) {
								case "getProviders":
									// Return available providers list
									ModelEditor.sendProvidersList(panel.webview);
									break;
								case "save":
									// Validate the returned model object
									if (
										message.model &&
										typeof message.model === "object" &&
										message.model.id &&
										message.model.name &&
										message.model.provider
									) {
										resolve(message.model);
									} else {
										vscode.window.showErrorMessage("Invalid saved model data");
										resolve(undefined);
									}
									panel.dispose();
									break;
								case "delete":
									// Process delete operation - show confirmation dialog
									if (message.modelId && typeof message.modelId === "string") {
										const modelName = message.modelName || "this model";
										const confirmed = await vscode.window.showWarningMessage(
											`Are you sure you want to delete model "${modelName}"?`,
											{ modal: true },
											"Delete",
										);
										if (confirmed === "Delete") {
											// Return special delete marker object
											resolve({ _deleteModel: true, modelId: message.modelId });
											panel.dispose();
										}
										// If user cancels, do not close panel, continue editing
									} else {
										vscode.window.showErrorMessage(
											"Delete failed: Invalid model ID",
										);
									}
									break;
								case "cancel":
									resolve(undefined);
									panel.dispose();
									break;
							}
						},
						undefined,
						disposables,
					),
				);

				disposables.push(
					panel.onDidDispose(
						() => {
							disposables.forEach((d) => d.dispose());
						},
						undefined,
						disposables,
					),
				);
			},
		);
	}

	/**
	 * Generate model editor HTML
	 */
	private static generateHTML(
		model: CompatibleModelConfig,
		isCreateMode: boolean,
		webview: vscode.Webview,
	): string {
		const cspSource = webview.cspSource || "";

		// Prepare model data
		const modelData = {
			id: model?.id || "",
			name: model?.name || "",
			provider: model?.provider || "",
			sdkMode: model?.sdkMode || "openai",
			tooltip: model?.tooltip || "",
			baseUrl: model?.baseUrl || "",
			model: model?.model || "",
			maxInputTokens: model?.maxInputTokens || 128000,
			maxOutputTokens: model?.maxOutputTokens || 4096,
			toolCalling: model?.capabilities?.toolCalling || false,
			imageInput: model?.capabilities?.imageInput || false,
			outputThinking: model?.outputThinking !== false,
			includeThinking: model?.includeThinking !== false,
			customHeader: model?.customHeader
				? JSON.stringify(model.customHeader, null, 2)
				: "",
			extraBody: model?.extraBody
				? JSON.stringify(model.extraBody, null, 2)
				: "",
		};

		const pageTitle = isCreateMode
			? "Create New Model"
			: `Edit Model: ${ModelEditor.escapeHtml(modelData.name)}`;

		return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${pageTitle}</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' ${cspSource};" />
        <style>
            ${modelEditorCss}
        </style>
    </head>
    <body>
        <div class="container">
            <div id="app"></div>
        </div>
        <script>
            ${modelEditorJs}

            // Initialize data
            const initialModelData = ${JSON.stringify(modelData)};
            const initialIsCreateMode = ${isCreateMode};

            // Start editor
            document.addEventListener('DOMContentLoaded', function() {
                initializeEditor(initialModelData, initialIsCreateMode);
            });
        </script>
    </body>
</html>`;
	}

	/**
	 * HTML escape function
	 */
	private static escapeHtml(text: string): string {
		if (!text) {
			return "";
		}
		const map: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			// eslint-disable-next-line @stylistic/quotes
			"'": "&#039;",
		};
		return text.replace(/[&<>"']/g, (char) => map[char]);
	}

	/**
	 * Send providers list to webview
	 */
	private static sendProvidersList(webview: vscode.Webview) {
		const providersMap = new Map<string, { id: string; name: string }>();

		// Get providers from built-in configuration (configProviders)
		Object.entries(configProviders).forEach(([key, config]) => {
			providersMap.set(key, {
				id: key,
				name: config.displayName || key,
			});
		});

		// Add known providers (KnownProviders), avoiding duplicates
		Object.entries(KnownProviders).forEach(([key, config]) => {
			if (!providersMap.has(key)) {
				providersMap.set(key, {
					id: key,
					name: config.displayName || key,
				});
			}
		});

		webview.postMessage({
			command: "setProviders",
			providers: Array.from(providersMap.values()),
		});
	}
}

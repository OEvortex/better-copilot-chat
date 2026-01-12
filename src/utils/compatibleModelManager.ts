/*---------------------------------------------------------------------------------------------
 *  Custom Model Manager
 *  Used to manage custom models for independent compatible providers
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { configProviders } from "../providers/config";
import { ModelEditor } from "../ui/modelEditor";
import { ApiKeyManager } from "./apiKeyManager";
import { KnownProviders } from "./knownProviders";
import { Logger } from "./logger";

/**
 * Back button click event
 */
interface BackButtonClick {
	back: true;
}

/**
 * Check if it's a back button click
 */
function isBackButtonClick(value: unknown): value is BackButtonClick {
	return typeof value === "object" && (value as BackButtonClick)?.back === true;
}

/**
 * Custom model configuration interface
 */
export interface CompatibleModelConfig {
	/** Model ID */
	id: string;
	/** Model name */
	name: string;
	/** Provider identifier */
	provider: string;
	/** Model description */
	tooltip?: string;
	/** API base URL */
	baseUrl?: string;
	/** Model name used in API requests (optional) */
	model?: string;
	/** Maximum input tokens */
	maxInputTokens: number;
	/** Maximum output tokens */
	maxOutputTokens: number;
	/** SDK mode */
	sdkMode?: "anthropic" | "openai" | "openai-sse";
	/** Model capabilities */
	capabilities: {
		/** Tool calling */
		toolCalling: boolean;
		/** Image input */
		imageInput: boolean;
	};
	/** Custom HTTP headers (optional) */
	customHeader?: Record<string, string>;
	/** Additional request body parameters (optional) */
	extraBody?: Record<string, unknown>;
	/** Whether to display thinking process in chat interface (default true, recommended for thinking models) */
	outputThinking?: boolean;
	/** Whether to inject thinking content into context for multi-turn conversations (default true, required for thinking models) */
	includeThinking?: boolean;
	/** Whether created by wizard (internal marker, not persisted) */
	_isFromWizard?: boolean;
}

/**
 * Custom Model Manager Class
 */
export class CompatibleModelManager {
	private static models: CompatibleModelConfig[] = [];
	private static configListener: vscode.Disposable | null = null;
	private static _onDidChangeModels = new vscode.EventEmitter<void>();
	static readonly onDidChangeModels =
		CompatibleModelManager._onDidChangeModels.event;
	private static isSaving = false; // Mark whether currently saving, avoid triggering configuration listeners

	/**
	 * Initialize model manager
	 */
	static initialize(): void {
		CompatibleModelManager.loadModels();
		CompatibleModelManager.setupConfigListener();
		Logger.debug("Custom model manager initialized");
	}

	/**
	 * Clean up resources
	 */
	static dispose(): void {
		if (CompatibleModelManager.configListener) {
			CompatibleModelManager.configListener.dispose();
			CompatibleModelManager.configListener = null;
		}
		CompatibleModelManager._onDidChangeModels.dispose();
		Logger.trace("Custom model manager disposed");
	}

	/**
	 * Setup configuration file change listener
	 */
	private static setupConfigListener(): void {
		// Clean up old listener
		if (CompatibleModelManager.configListener) {
			CompatibleModelManager.configListener.dispose();
		}
		// Listen to chp configuration changes
		CompatibleModelManager.configListener =
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration("chp.compatibleModels")) {
					// If currently saving, ignore configuration changes (avoid reloading overriding in-memory data)
					if (CompatibleModelManager.isSaving) {
						Logger.debug("Saving configuration, skipping reload");
						return;
					}
					Logger.info(
						"Detected custom model configuration changes, reloading...",
					);
					CompatibleModelManager.loadModels();
					CompatibleModelManager._onDidChangeModels.fire();
				}
			});
	}

	/**
	 * Load models from configuration
	 */
	private static loadModels(): void {
		try {
			const config = vscode.workspace.getConfiguration("chp");
			const modelsData = config.get<CompatibleModelConfig[]>(
				"compatibleModels",
				[],
			);
			CompatibleModelManager.models = (modelsData || []).filter(
				(model) =>
					model != null &&
					typeof model === "object" &&
					model.id &&
					model.name &&
					model.provider,
			); // Filter out invalid models
			Logger.debug(
				`Loaded ${CompatibleModelManager.models.length} custom models`,
			);
		} catch (error) {
			Logger.error("Failed to load custom models:", error);
			CompatibleModelManager.models = [];
		}
	}

	/**
	 * Save models to configuration
	 */
	private static async saveModels(): Promise<void> {
		try {
			CompatibleModelManager.isSaving = true; // Set save marker
			const config = vscode.workspace.getConfiguration("chp");
			// Remove internal marker fields and fields with undefined or null values when saving
			const modelsToSave = CompatibleModelManager.models
				.filter((model) => model != null && typeof model === "object")
				.map((model) => {
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const { _isFromWizard, ...rest } = model;
					// Remove fields with undefined or null values (fields cleared by user)
					const cleaned: Record<string, unknown> = {};
					for (const [key, value] of Object.entries(rest)) {
						// Filter out undefined and null values
						if (value !== undefined && value !== null) {
							cleaned[key] = value;
						}
					}
					return cleaned;
				});

			Logger.debug(
				"Preparing to save models, cleaned data:",
				JSON.stringify(modelsToSave, null, 2),
			);

			await config.update(
				"compatibleModels",
				modelsToSave,
				vscode.ConfigurationTarget.Global,
			);
			Logger.debug("Custom models saved to configuration");

			// Immediately reload from configuration file after successful save to ensure memory sync with config file
			// This ensures cleared fields (undefined/null) are also removed from memory
			CompatibleModelManager.loadModels();

			// Manually trigger model change events to notify all listeners (such as CompatibleProvider)
			CompatibleModelManager._onDidChangeModels.fire();
			Logger.debug("Model change event triggered");
		} catch (error) {
			Logger.error("Failed to save custom models:", error);
			throw error;
		} finally {
			// Delay reset marker to ensure configuration change event has been triggered
			setTimeout(() => {
				CompatibleModelManager.isSaving = false;
			}, 100);
		}
	}

	/**
	 * Get all models
	 */
	static getModels(): CompatibleModelConfig[] {
		return CompatibleModelManager.models;
	}

	/**
	 * Get raw data of specified model from configuration file (unprocessed)
	 * @param modelId Model ID
	 * @returns Original model configuration, or undefined
	 */
	private static getRawModelFromConfig(
		modelId: string,
	): CompatibleModelConfig | undefined {
		try {
			const config = vscode.workspace.getConfiguration("chp");
			const modelsData = config.get<CompatibleModelConfig[]>(
				"compatibleModels",
				[],
			);
			const rawModel = modelsData.find(
				(model) => model && model.id === modelId,
			);

			// Return raw data without any processing (including not adding default tooltip)
			return rawModel;
		} catch (error) {
			Logger.error(
				"Failed to read raw model data from configuration file:",
				error,
			);
			return undefined;
		}
	}
	/**
	 * Add model
	 */
	static async addModel(model: CompatibleModelConfig): Promise<void> {
		// Check if model is empty
		if (!model) {
			throw new Error("Model configuration cannot be empty");
		}

		// Check required fields
		if (!model.id || !model.name || !model.provider) {
			throw new Error(
				"Model configuration missing required fields (id, name, provider)",
			);
		}

		// Check if model ID already exists
		if (CompatibleModelManager.models.some((m) => m.id === model.id)) {
			throw new Error(`Model ID "${model.id}" already exists`);
		}

		// Ensure model object is valid
		if (typeof model !== "object") {
			throw new Error("Model configuration must be a valid object");
		}

		// Ensure capabilities object exists
		if (!model.capabilities || typeof model.capabilities !== "object") {
			model.capabilities = {
				toolCalling: false,
				imageInput: false,
			};
		}

		CompatibleModelManager.models.push(model);
		await CompatibleModelManager.saveModels();
		Logger.info(
			`Added custom model: ${model.name} (${model.provider}, ${model.sdkMode})`,
		);
	}

	/**
	 * Update model
	 */
	static async updateModel(
		id: string,
		updates: Partial<CompatibleModelConfig>,
	): Promise<void> {
		// Check if update data is empty
		if (!updates) {
			throw new Error("Update data cannot be empty");
		}

		const index = CompatibleModelManager.models.findIndex((m) => m.id === id);
		if (index === -1) {
			throw new Error(`Model ID "${id}" not found`);
		}

		// Ensure existing model is not empty
		if (!CompatibleModelManager.models[index]) {
			throw new Error(`Model data corrupted, cannot update model ID "${id}"`);
		}

		CompatibleModelManager.models[index] = {
			...CompatibleModelManager.models[index],
			...updates,
		};
		await CompatibleModelManager.saveModels();
		Logger.info(`Updated custom model: ${id}`);
	}

	/**
	 * Delete model
	 */
	static async removeModel(id: string): Promise<void> {
		const index = CompatibleModelManager.models.findIndex((m) => m.id === id);
		if (index === -1) {
			throw new Error(`Model ID "${id}" not found`);
		}
		const removedModel = CompatibleModelManager.models[index];

		// Ensure model to be deleted is not empty
		if (!removedModel) {
			throw new Error(`Model data corrupted, cannot delete model ID "${id}"`);
		}

		CompatibleModelManager.models.splice(index, 1);
		await CompatibleModelManager.saveModels();
		Logger.info(`Deleted custom model: ${removedModel.name}`);
	}

	/**
	 * Delete multiple models at once
	 */
	static async removeModels(
		ids: string[],
	): Promise<{ success: number; failed: number }> {
		let success = 0;
		let failed = 0;

		// Filter out valid model IDs
		const validIds = ids.filter((id) =>
			CompatibleModelManager.models.some((m) => m.id === id),
		);

		// Remove models from array (in reverse order to maintain indices)
		for (const id of validIds) {
			const index = CompatibleModelManager.models.findIndex((m) => m.id === id);
			if (index !== -1) {
				const removedModel = CompatibleModelManager.models[index];
				CompatibleModelManager.models.splice(index, 1);
				Logger.info(`Deleted custom model: ${removedModel?.name || id}`);
				success++;
			} else {
				failed++;
			}
		}

		if (success > 0) {
			await CompatibleModelManager.saveModels();
		}

		return { success, failed };
	}

	/**
	 * Configure model or update API key (main entry point)
	 */
	static async configureModelOrUpdateAPIKey(): Promise<void> {
		// If no custom models, directly enter add flow
		if (CompatibleModelManager.models.length === 0) {
			Logger.info("No custom models, directly entering add flow");
			await CompatibleModelManager.configureModels();
			return;
		}

		interface BYOKQuickPickItem extends vscode.QuickPickItem {
			action: "apiKey" | "configureModels";
		}
		const options: BYOKQuickPickItem[] = [
			{
				label: "$(key) Manage API Keys",
				detail: "Update or configure provider or model API keys",
				action: "apiKey",
			},
			{
				label: "$(settings-gear) Configure Models",
				detail: "Add, edit, or delete model configurations",
				action: "configureModels",
			},
		];

		const quickPick = vscode.window.createQuickPick<BYOKQuickPickItem>();
		quickPick.title = "Manage OpenAI / Anthropic Compatible Models";
		quickPick.placeholder = "Select an action";
		quickPick.items = options;
		quickPick.ignoreFocusOut = true;

		const selected = await new Promise<BYOKQuickPickItem | undefined>(
			(resolve) => {
				quickPick.onDidAccept(() => {
					const selectedItem = quickPick.selectedItems[0];
					resolve(selectedItem);
					quickPick.hide();
				});
				quickPick.onDidHide(() => {
					resolve(undefined);
				});
				quickPick.show();
			},
		);

		if (selected?.action === "apiKey") {
			await CompatibleModelManager.promptAndSetApiKey();
		} else if (selected?.action === "configureModels") {
			await CompatibleModelManager.configureModels();
		}
	}

	/**
	 * Prompt and set API key - set by provider unit
	 */
	private static async promptAndSetApiKey(): Promise<void> {
		try {
			// Get all configured providers
			const providers = await CompatibleModelManager.getUniqueProviders();
			if (providers.length === 0) {
				vscode.window.showWarningMessage(
					"No custom model configurations, please add a model first",
				);
				return;
			}
			// If only one provider, directly set that provider's API key
			if (providers.length === 1) {
				await CompatibleModelManager.setApiKeyForProvider(providers[0]);
				return;
			}

			// Get historical custom providers
			const historicalProviders =
				await CompatibleModelManager.getHistoricalCustomProviders();

			const customProviders: string[] = [];
			const knownProviders: string[] = [];
			const builtinProviders: string[] = [];

			providers.forEach((provider) => {
				if (historicalProviders.includes(provider)) {
					customProviders.push(provider);
				} else if (provider in KnownProviders) {
					knownProviders.push(provider);
				} else if (provider in configProviders) {
					builtinProviders.push(provider);
				} else {
					// Default categorize as custom provider
					customProviders.push(provider);
				}
			});

			// Create selection items in order of custom, known, built-in, and add separators
			const providerChoices = [];

			// Custom providers
			if (customProviders.length > 0) {
				providerChoices.push(
					...customProviders.map((provider) => ({ label: provider })),
				);
			}

			// Known providers (add separator)
			if (knownProviders.length > 0) {
				if (customProviders.length > 0) {
					providerChoices.push({
						label: "Known Providers",
						kind: vscode.QuickPickItemKind.Separator,
					});
				}
				providerChoices.push(
					...knownProviders.map((provider) => ({
						label: provider,
						description: KnownProviders[provider]?.displayName,
					})),
				);
			}

			// Built-in providers (add separator)
			if (builtinProviders.length > 0) {
				if (customProviders.length > 0 || knownProviders.length > 0) {
					providerChoices.push({
						label: "Built-in Providers",
						kind: vscode.QuickPickItemKind.Separator,
					});
				}
				providerChoices.push(
					...builtinProviders.map((provider) => ({
						label: provider,
						description:
							configProviders[provider as keyof typeof configProviders]
								?.displayName,
					})),
				);
			}

			// If multiple providers, let user choose
			const selected = await vscode.window.showQuickPick(providerChoices, {
				placeHolder: "Select provider to set API key for",
			});
			if (!selected) {
				return;
			}
			await CompatibleModelManager.setApiKeyForProvider(selected.label);
		} catch (error) {
			Logger.error("Failed to set API key:", error);
			vscode.window.showErrorMessage(
				`Failed to set API key: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Get all unique provider list
	 */
	private static async getUniqueProviders(): Promise<string[]> {
		const providers = new Set<string>();
		// Get all providers from existing models
		for (const model of CompatibleModelManager.models) {
			if (model.provider?.trim()) {
				providers.add(model.provider.trim());
			} else {
				// If model doesn't specify provider, use 'compatible' as default
				providers.add("compatible");
			}
		}
		return Array.from(providers).sort();
	}

	/**
	 * Set API key for specified provider
	 */
	private static async setApiKeyForProvider(provider: string): Promise<void> {
		const apiKey = await vscode.window.showInputBox({
			prompt: `Please enter API key for "${provider}" (leave empty to clear key)`,
			placeHolder: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			password: true,
		});
		if (apiKey === undefined) {
			return;
		}

		if (apiKey.trim().length === 0) {
			// Clear key
			await ApiKeyManager.deleteApiKey(provider);
			Logger.info(`API key for provider "${provider}" has been cleared`);
		} else {
			// Save key
			await ApiKeyManager.setApiKey(provider, apiKey.trim());
			Logger.info(`API key for provider "${provider}" has been set`);
		}
	} /**
	 * Configure models - main configuration flow
	 */
	private static async configureModels(): Promise<void> {
		while (true) {
			interface ModelQuickPickItem extends vscode.QuickPickItem {
				modelId?: string;
				action?: "add" | "edit" | "bulkDelete";
			}
			const items: ModelQuickPickItem[] = [];
			// Add existing models
			for (const model of CompatibleModelManager.models) {
				const details: string[] = [
					`$(arrow-up) ${model.maxInputTokens} $(arrow-down) ${model.maxOutputTokens}`,
					`$(chip) ${model.sdkMode === "openai" ? "OpenAI" : "Anthropic"}`,
				];
				if (model.capabilities.toolCalling) {
					details.push("$(plug) Tool calling");
				}
				if (model.capabilities.imageInput) {
					details.push("$(circuit-board) Image understanding");
				}
				items.push({
					label: model.name,
					description: model.id,
					detail: details.join("\t"),
					modelId: model.id,
					action: "edit",
				});
			}
			// If no models, directly use visual editor to add
			if (items.length === 0) {
				const newModel =
					await CompatibleModelManager.showVisualModelEditorForCreate();
				if (newModel) {
					await CompatibleModelManager.addModel(newModel);
				}
				return;
			}

			// Add separator and operations
			if (items.length > 0) {
				const separator = {
					label: "",
					kind: vscode.QuickPickItemKind.Separator,
				};
				items.push(separator as ModelQuickPickItem);
			}
			items.push({
				label: "$(add) Add New Model",
				detail: "Create new custom model configuration",
				action: "add",
			});
			items.push({
				label: "$(trash) Bulk Delete Models",
				detail: "Select multiple models to delete at once",
				action: "bulkDelete",
			});

			const quickPick = vscode.window.createQuickPick<ModelQuickPickItem>();
			quickPick.title = "Custom Model Configuration";
			quickPick.placeholder = "Select a model to edit or add new model";
			quickPick.items = items;
			quickPick.ignoreFocusOut = true;

			const selected = await new Promise<
				ModelQuickPickItem | BackButtonClick | undefined
			>((resolve) => {
				const disposables: vscode.Disposable[] = [];
				disposables.push(
					quickPick.onDidAccept(() => {
						const selectedItem = quickPick.selectedItems[0];
						resolve(selectedItem);
						quickPick.hide();
					}),
				);
				disposables.push(
					quickPick.onDidHide(() => {
						resolve(undefined);
						disposables.forEach((d) => {
							d.dispose();
						});
					}),
				);
				quickPick.show();
			});

			if (!selected || isBackButtonClick(selected)) {
				return;
			}

			if (selected.action === "add") {
				const newModel =
					await CompatibleModelManager.showVisualModelEditorForCreate();
				if (newModel) {
					await CompatibleModelManager.addModel(newModel);
				}
			} else if (selected.action === "bulkDelete") {
				await CompatibleModelManager.showBulkDeletePicker();
			} else if (selected.action === "edit" && selected.modelId) {
				const model = CompatibleModelManager.models.find(
					(m) => m.id === selected.modelId,
				);
				if (model) {
					const result = await CompatibleModelManager._editModel(
						selected.modelId,
						model,
					);
					if (result) {
						if (result.action === "update" && result.config) {
							await CompatibleModelManager.updateModel(
								result.id,
								result.config,
							);
						} else if (result.action === "delete") {
							await CompatibleModelManager.removeModel(result.id);
						}
					}
				}
			}
		}
	}

	/**
	 * Show bulk delete picker - allows selecting multiple models to delete
	 */
	private static async showBulkDeletePicker(): Promise<void> {
		interface DeleteModelQuickPickItem extends vscode.QuickPickItem {
			modelId: string;
		}

		const items: DeleteModelQuickPickItem[] = CompatibleModelManager.models.map(
			(model) => ({
				label: model.name,
				description: model.id,
				detail: `$(chip) ${model.sdkMode === "openai" ? "OpenAI" : "Anthropic"} | Provider: ${model.provider || "compatible"}`,
				modelId: model.id,
			}),
		);

		if (items.length === 0) {
			vscode.window.showInformationMessage("No models to delete");
			return;
		}

		const quickPick = vscode.window.createQuickPick<DeleteModelQuickPickItem>();
		quickPick.title = "Bulk Delete Models";
		quickPick.placeholder =
			"Select models to delete (use Space to select, Enter to confirm)";
		quickPick.items = items;
		quickPick.canSelectMany = true;
		quickPick.ignoreFocusOut = true;

		const selectedItems = await new Promise<
			DeleteModelQuickPickItem[] | undefined
		>((resolve) => {
			quickPick.onDidAccept(() => {
				resolve([...quickPick.selectedItems]);
				quickPick.hide();
			});
			quickPick.onDidHide(() => {
				resolve(undefined);
			});
			quickPick.show();
		});

		if (!selectedItems || selectedItems.length === 0) {
			return;
		}

		// Confirm deletion
		const confirmMessage =
			selectedItems.length === 1
				? `Are you sure you want to delete "${selectedItems[0].label}"?`
				: `Are you sure you want to delete ${selectedItems.length} models?`;

		const confirm = await vscode.window.showWarningMessage(
			confirmMessage,
			{ modal: true },
			"Delete",
		);

		if (confirm !== "Delete") {
			return;
		}

		// Perform bulk delete
		const idsToDelete = selectedItems.map((item) => item.modelId);
		const result = await CompatibleModelManager.removeModels(idsToDelete);

		if (result.success > 0) {
			const message =
				result.failed > 0
					? `Deleted ${result.success} model(s), ${result.failed} failed`
					: `Successfully deleted ${result.success} model(s)`;
			vscode.window.showInformationMessage(message);
		} else {
			vscode.window.showErrorMessage("Failed to delete models");
		}
	}

	private static async _editModel(
		modelId: string,
		currentConfig: CompatibleModelConfig,
	): Promise<
		| {
				action: "update" | "delete";
				id: string;
				config?: Partial<CompatibleModelConfig>;
		  }
		| undefined
	> {
		// Read raw data from configuration file (unprocessed)
		const rawConfig = CompatibleModelManager.getRawModelFromConfig(modelId);
		// If unable to read raw data, use in-memory data as fallback
		const configToEdit = rawConfig || currentConfig;

		// Directly display visual form editor
		const updatedConfig =
			await CompatibleModelManager.showVisualModelEditor(configToEdit);
		if (updatedConfig) {
			return { action: "update", id: modelId, config: updatedConfig };
		}
		return undefined;
	}

	/**
	 * Show visual model editor (create mode)
	 * @returns New model configuration, or undefined if cancelled
	 */
	private static async showVisualModelEditorForCreate(): Promise<
		CompatibleModelConfig | undefined
	> {
		// Create default new model configuration
		const defaultModel: CompatibleModelConfig = {
			id: "", // Will be filled by user in form
			name: "", // Will be filled by user in form
			provider: "", // Will be selected and filled by user in form
			sdkMode: "openai",
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			capabilities: {
				toolCalling: true,
				imageInput: false,
			},
			outputThinking: true, // Default enabled - display thinking process in response
			includeThinking: true, // Default enabled - include thinking content in multi-turn conversations
		};

		return CompatibleModelManager.showVisualModelEditor(defaultModel, true);
	}

	/**
	 * Show visual model editor
	 * @param model Model configuration to edit
	 * @param isCreateMode Whether it's create mode
	 * @returns Updated model configuration, or undefined if cancelled
	 */
	private static async showVisualModelEditor(
		model: CompatibleModelConfig,
		isCreateMode: boolean = false,
	): Promise<CompatibleModelConfig | undefined> {
		const result = await ModelEditor.show(model, isCreateMode);

		// Check if it's a delete operation
		if (result && "_deleteModel" in result && result._deleteModel) {
			// Execute delete operation
			try {
				await CompatibleModelManager.removeModel(result.modelId);
				vscode.window.showInformationMessage("Model deleted");
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to delete model: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
			return undefined;
		}

		return result as CompatibleModelConfig | undefined;
	}

	/**
	 * Get historical custom provider list
	 */
	private static async getHistoricalCustomProviders(): Promise<string[]> {
		try {
			// Import provider configuration to get built-in provider list
			const { configProviders } = await import("../providers/config/index.js");
			const builtinProviders = Object.keys(configProviders);
			const knownProviders = Object.keys(KnownProviders);
			// Get all unique provider identifiers from existing models
			const allProviders = CompatibleModelManager.models
				.map((model) => model.provider)
				.filter((provider) => provider && provider.trim() !== "");
			// Deduplicate and exclude built-in providers and 'compatible'
			const customProviders = [...new Set(allProviders)].filter(
				(provider) =>
					provider !== "compatible" &&
					!builtinProviders.includes(provider) &&
					!knownProviders.includes(provider),
			);
			return customProviders;
		} catch (error) {
			Logger.error("Failed to get historical custom providers:", error);
			return [];
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  JSON Schema Provider
 *  Dynamically generates JSON Schema for Copilot ++ configuration, providing intellisense for settings.json
 *--------------------------------------------------------------------------------------------*/

import type { JSONSchema7 } from "json-schema";
import * as vscode from "vscode";
import { configProviders } from "../providers/config";
import type { ProviderConfig } from "../types/sharedTypes";
import { CompatibleModelManager } from "./compatibleModelManager";
import { ConfigManager } from "./configManager";
import { KnownProviders } from "./knownProviders";
import { Logger } from "./logger";

/**
 * Extended JSON Schema interface, supports VS Code specific enumDescriptions property
 */
declare module "json-schema" {
	interface JSONSchema7 {
		enumDescriptions?: string[];
	}
}

/**
 * JSON Schema Provider class
 * Dynamically generates JSON Schema for Copilot ++ configuration, providing intellisense for settings.json
 */
export class JsonSchemaProvider {
	private static readonly SCHEMA_URI = "chp-settings://root/schema.json";
	private static schemaProvider: vscode.Disposable | null = null;
	private static lastSchemaHash: string | null = null;

	/**
	 * Initialize JSON Schema provider
	 */
	static initialize(): void {
		if (JsonSchemaProvider.schemaProvider) {
			JsonSchemaProvider.schemaProvider.dispose();
		}

		// Register JSON Schema content provider, use correct scheme
		JsonSchemaProvider.schemaProvider =
			vscode.workspace.registerTextDocumentContentProvider("chp-settings", {
				provideTextDocumentContent: (uri: vscode.Uri): string => {
					if (uri.toString() === JsonSchemaProvider.SCHEMA_URI) {
						const schema = JsonSchemaProvider.getProviderOverridesSchema();
						return JSON.stringify(schema, null, 2);
					}
					return "";
				},
			});

		// Listen for filesystem access, dynamically update schema
		vscode.workspace.onDidOpenTextDocument((document) => {
			if (document.uri.scheme === "chp-settings") {
				JsonSchemaProvider.updateSchema();
			}
		});

		// Listen for configuration changes, update schema promptly
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("chp")) {
				JsonSchemaProvider.invalidateCache();
			}
		});

		Logger.info("Dynamic JSON Schema provider initialized");
	}

	/**
	 * Invalidate cache, trigger schema update
	 */
	private static invalidateCache(): void {
		JsonSchemaProvider.lastSchemaHash = null;
		JsonSchemaProvider.updateSchema();
	}

	/**
	 * Update Schema
	 */
	private static updateSchema(): void {
		try {
			// Generate new schema
			const newSchema = JsonSchemaProvider.getProviderOverridesSchema();
			const newHash = JsonSchemaProvider.generateSchemaHash(newSchema);

			// If schema hasn't changed, skip update
			if (JsonSchemaProvider.lastSchemaHash === newHash) {
				return;
			}

			JsonSchemaProvider.lastSchemaHash = newHash;

			// Trigger content update
			const uri = vscode.Uri.parse(JsonSchemaProvider.SCHEMA_URI);
			vscode.workspace.textDocuments.forEach((doc) => {
				if (doc.uri.toString() === JsonSchemaProvider.SCHEMA_URI) {
					// Regenerate schema content
					const newContent = JSON.stringify(newSchema, null, 2);
					const edit = new vscode.WorkspaceEdit();
					edit.replace(
						uri,
						new vscode.Range(0, 0, doc.lineCount, 0),
						newContent,
					);
					vscode.workspace.applyEdit(edit);
					Logger.info("JSON Schema updated");
				}
			});
		} catch (error) {
			Logger.error("Failed to update JSON Schema:", error);
		}
	}

	/**
	 * Generate schema hash for cache comparison
	 */
	private static generateSchemaHash(schema: JSONSchema7): string {
		return JSON.stringify(schema, Object.keys(schema).sort());
	}

	/**
	 * Get JSON Schema for provider override configuration
	 */
	static getProviderOverridesSchema(): JSONSchema7 {
		const providerConfigs = ConfigManager.getConfigProvider();
		const patternProperties: Record<string, JSONSchema7> = {};
		const propertyNames: JSONSchema7 = {
			type: "string",
			description: "Provider configuration key name",
			enum: Object.keys(providerConfigs),
			enumDescriptions: Object.entries(providerConfigs).map(
				([key, config]) => config.displayName || key,
			),
		};

		// Generate schema for each provider
		for (const [providerKey, config] of Object.entries(providerConfigs)) {
			patternProperties[`^${providerKey}$`] =
				JsonSchemaProvider.createProviderSchema(providerKey, config);
		}

		// Get all available provider IDs
		const { providerIds, enumDescriptions: allProviderDescriptions } =
			JsonSchemaProvider.getAllAvailableProviders();

		return {
			$schema: "http://json-schema.org/draft-07/schema#",
			$id: JsonSchemaProvider.SCHEMA_URI,
			title: "Copilot ++ Configuration Schema",
			description:
				"Schema for Copilot ++ configuration with dynamic model ID suggestions",
			type: "object",
			properties: {
				"chp.providerOverrides": {
					type: "object",
					description:
						"Provider configuration overrides. Allows overriding provider baseUrl and model configuration, supports adding new models or overriding existing model parameters.",
					patternProperties,
					propertyNames,
				},
				"chp.fimCompletion.modelConfig": {
					type: "object",
					description: "FIM (Fill-in-the-Middle) completion mode configuration",
					properties: {
						provider: {
							type: "string",
							description: "Provider ID used for FIM completion",
							enum: providerIds,
							enumDescriptions: allProviderDescriptions,
						},
					},
					additionalProperties: true,
				},
				"chp.nesCompletion.modelConfig": {
					type: "object",
					description:
						"NES (Next Edit Suggestion) completion mode configuration",
					properties: {
						provider: {
							type: "string",
							description: "Provider ID used for NES completion",
							enum: providerIds,
							enumDescriptions: allProviderDescriptions,
						},
					},
					additionalProperties: true,
				},
				"chp.compatibleModels": {
					type: "array",
					description: "Custom model configuration for Compatible Provider.",
					default: [],
					items: {
						type: "object",
						properties: {
							id: {
								type: "string",
								description: "Model ID",
								minLength: 1,
							},
							name: {
								type: "string",
								description: "Model display name",
								minLength: 1,
							},
							tooltip: {
								type: "string",
								description: "Model description",
							},
							provider: {
								type: "string",
								description:
									"Model provider identifier. Select an existing provider ID from the dropdown list, or enter a new ID to create a custom provider.",
								anyOf: [
									{
										type: "string",
										enum: providerIds,
										description: "Select existing provider ID",
									},
									{
										type: "string",
										minLength: 3,
										maxLength: 100,
										pattern: "^[a-zA-Z0-9_-]+$",
										description:
											"Add new custom provider ID (allows letters, numbers, underscores, hyphens)",
									},
								],
							},
							sdkMode: {
								type: "string",
								enum: ["openai", "anthropic", "gemini"],
								enumDescriptions: [
									"OpenAI SDK standard mode, uses official OpenAI SDK for request/response processing",
									"Anthropic SDK standard mode, uses official Anthropic SDK for request/response processing",
									"Gemini SDK standard mode, uses Gemini-compatible request/response processing",
								],
								description: "SDK mode defaults to openai.",
								default: "openai",
							},
							baseUrl: {
								type: "string",
								description: "API base URL",
								format: "uri",
							},
							model: {
								type: "string",
								description:
									"Model name used for API requests (optional, defaults to model ID)",
							},
							maxInputTokens: {
								type: "number",
								description: "Maximum input token count",
								minimum: 128,
							},
							maxOutputTokens: {
								type: "number",
								description: "Maximum output token count",
								minimum: 8,
							},
							outputThinking: {
								type: "boolean",
								description:
									"Whether to show thinking process in chat interface (recommended for thinking models like Claude Sonnet/Opus 4.5)",
								default: true,
							},
							includeThinking: {
								type: "boolean",
								description:
									"Whether to inject thinking content into context for multi-turn conversations (must be enabled for thinking models)\nDefaults to true, recommended for thinking models to maintain context\nMust be set to true when the model requires tool messages in multi-turn conversations to include thinking content",
								default: true,
							},
							capabilities: {
								type: "object",
								properties: {
									toolCalling: {
										type: "boolean",
										description: "Whether tool calling is supported",
									},
									imageInput: {
										type: "boolean",
										description: "Whether image input is supported",
									},
								},
								required: ["toolCalling", "imageInput"],
							},
							customHeader: {
								type: "object",
								description:
									"Custom HTTP header configuration, supports ${APIKEY} placeholder replacement",
								additionalProperties: {
									type: "string",
									description: "HTTP header value",
								},
							},
							extraBody: {
								type: "object",
								description:
									"Extra request body parameters, will be merged into the request body in API requests",
								additionalProperties: {
									description: "Extra request body parameter value",
								},
							},
						},
						required: [
							"id",
							"name",
							"maxInputTokens",
							"maxOutputTokens",
							"capabilities",
						],
					},
				},
			},
			additionalProperties: true,
		};
	}

	/**
	 * Create JSON Schema for a specific provider
	 */
	private static createProviderSchema(
		providerKey: string,
		config: ProviderConfig,
	): JSONSchema7 {
		const modelIds = config.models?.map((model) => model.id) || [];

		// Create schema for id property, supports selecting existing model ID or entering custom ID
		const idProperty: JSONSchema7 = {
			anyOf: [
				{
					type: "string",
					enum: modelIds,
					description: "Override existing model ID",
				},
				{
					type: "string",
					minLength: 3,
					maxLength: 100,
					pattern: "^[a-zA-Z0-9._-]+$",
					description:
						"Add new custom model ID (allows letters, numbers, underscores, hyphens, and dots)",
				},
			],
			description:
				"Select an existing model ID from the dropdown list, or enter a new ID to create a custom configuration",
		};

		const modelProperty: JSONSchema7 = {
			type: "string",
			minLength: 1,
			description: "Override model name or endpoint ID used for API requests",
		};

		return {
			type: "object",
			description: `${config.displayName || providerKey} configuration overrides`,
			properties: {
				baseUrl: {
					type: "string",
					description: "Override provider-level API base URL",
					format: "uri",
				},
				customHeader: {
					type: "object",
					description:
						"Provider-level custom HTTP headers, supports ${APIKEY} placeholder replacement",
					additionalProperties: {
						type: "string",
						description: "HTTP header value",
					},
				},
				models: {
					type: "array",
					description: "Model override configuration list",
					minItems: 1,
					items: {
						type: "object",
						properties: {
							id: idProperty,
							model: modelProperty,
							name: {
								type: "string",
								minLength: 1,
								description:
									"Friendly name displayed in model selector.\r\nValid for custom model IDs, will not override preset model names.",
							},
							tooltip: {
								type: "string",
								minLength: 1,
								description:
									"Detailed description displayed as hover tooltip.\r\nValid for custom model IDs, will not override preset model descriptions.",
							},
							maxInputTokens: {
								type: "number",
								minimum: 1,
								maximum: 2000000,
								description: "Override maximum input token count",
							},
							maxOutputTokens: {
								type: "number",
								minimum: 1,
								maximum: 200000,
								description: "Override maximum output token count",
							},
							sdkMode: {
								type: "string",
								enum: ["openai", "anthropic", "gemini"],
								description:
									"Override SDK mode: openai (OpenAI compatible format), anthropic (Anthropic compatible format), or gemini (Gemini-compatible format)",
							},
							baseUrl: {
								type: "string",
								description: "Override model-level API base URL",
								format: "uri",
							},
							outputThinking: {
								type: "boolean",
								description:
									"Whether to show thinking process in chat interface (recommended for thinking models, default true)",
								default: true,
							},
							capabilities: {
								type: "object",
								description: "Model capabilities configuration",
								properties: {
									toolCalling: {
										type: "boolean",
										description: "Whether tool calling is supported",
									},
									imageInput: {
										type: "boolean",
										description: "Whether image input is supported",
									},
								},
								required: ["toolCalling", "imageInput"],
								additionalProperties: false,
							},
							customHeader: {
								type: "object",
								description:
									"Model custom HTTP headers, supports ${APIKEY} placeholder replacement",
								additionalProperties: {
									type: "string",
									description: "HTTP header value",
								},
							},
							extraBody: {
								type: "object",
								description: "Extra request body parameters (optional)",
								additionalProperties: {
									description: "Extra request body parameter value",
								},
							},
						},
						required: ["id"],
						additionalProperties: false,
					},
				},
			},
			additionalProperties: false,
		};
	}

	/**
	 * Get all available provider IDs (including built-in, known, custom, and historical providers)
	 */
	private static getAllAvailableProviders(): {
		providerIds: string[];
		enumDescriptions: string[];
	} {
		const providerIds: string[] = [];
		const enumDescriptions: string[] = [];

		try {
			// 1. Get built-in providers
			for (const [providerId, config] of Object.entries(configProviders)) {
				providerIds.push(providerId);
				enumDescriptions.push(config.displayName || providerId);
			}

			// 2. Get known providers
			for (const [providerId, config] of Object.entries(KnownProviders)) {
				if (!providerIds.includes(providerId)) {
					providerIds.push(providerId);
					enumDescriptions.push(config.displayName || providerId);
				}
			}

			// 3. Get historical providers from custom models
			const customModels = CompatibleModelManager.getModels();
			const customProviders = new Set<string>();

			for (const model of customModels) {
				if (model.provider?.trim() && !providerIds.includes(model.provider)) {
					customProviders.add(model.provider.trim());
				}
			}

			// Add custom providers
			for (const providerId of Array.from(customProviders).sort()) {
				providerIds.push(providerId);
				enumDescriptions.push(`Custom Provider: ${providerId}`);
			}
		} catch (error) {
			Logger.error("Failed to get available provider list:", error);
		}

		return { providerIds, enumDescriptions };
	}

	/**
	 * Dispose resources
	 */
	static dispose(): void {
		if (JsonSchemaProvider.schemaProvider) {
			JsonSchemaProvider.schemaProvider.dispose();
			JsonSchemaProvider.schemaProvider = null;
		}
		Logger.trace("Dynamic JSON Schema provider cleaned up");
	}
}

/*---------------------------------------------------------------------------------------------
 *  API Key Secure Storage Manager
 *  Uses VS Code SecretStorage to securely manage API keys
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { ApiKeyValidation } from "../types/sharedTypes";
import { Logger } from "./logger";

/**
 * API Key Secure Storage Manager
 * Supports multi-provider mode
 */
export class ApiKeyManager {
	private static context: vscode.ExtensionContext;
	private static builtinProviders: Set<string> | null = null;

	/**
	 * Initialize API key manager
	 */
	static initialize(context: vscode.ExtensionContext): void {
		ApiKeyManager.context = context;
	}

	/**
	 * Get built-in provider list
	 */
	private static async getBuiltinProviders(): Promise<Set<string>> {
		if (ApiKeyManager.builtinProviders !== null) {
			return ApiKeyManager.builtinProviders;
		}
		try {
			const { configProviders } = await import("../providers/config/index.js");
			ApiKeyManager.builtinProviders = new Set(Object.keys(configProviders));
		} catch (error) {
			Logger.warn("Failed to get built-in provider list:", error);
			ApiKeyManager.builtinProviders = new Set();
		}
		return ApiKeyManager.builtinProviders;
	}

	/**
	 * Get provider's key storage key name
	 * For built-in providers, use their original key name
	 * For custom providers, use provider as key name
	 */
	private static getSecretKey(vendor: string): string {
		return `${vendor}.apiKey`;
	}

	/**
	 * Check if API key exists
	 */
	static async hasValidApiKey(vendor: string): Promise<boolean> {
		const secretKey = ApiKeyManager.getSecretKey(vendor);
		const apiKey = await ApiKeyManager.context.secrets.get(secretKey);
		return apiKey !== undefined && apiKey.trim().length > 0;
	}

	/**
	 * Get API key
	 * Built-in providers: directly use provider name as key name
	 * Custom providers: use provider as key name
	 */
	static async getApiKey(vendor: string): Promise<string | undefined> {
		const secretKey = ApiKeyManager.getSecretKey(vendor);
		return await ApiKeyManager.context.secrets.get(secretKey);
	}

	/**
	 * Validate API key
	 */
	static validateApiKey(apiKey: string, _vendor: string): ApiKeyValidation {
		// Empty values allowed, used for clearing keys
		if (!apiKey || apiKey.trim().length === 0) {
			return { isValid: true, isEmpty: true };
		}
		// Don't validate specific format, as long as it's not empty it's considered valid
		return { isValid: true };
	}

	/**
	 * Set API key to secure storage
	 */
	static async setApiKey(vendor: string, apiKey: string): Promise<void> {
		const secretKey = ApiKeyManager.getSecretKey(vendor);
		await ApiKeyManager.context.secrets.store(secretKey, apiKey);
	}

	/**
	 * Delete API key
	 */
	static async deleteApiKey(vendor: string): Promise<void> {
		const secretKey = ApiKeyManager.getSecretKey(vendor);
		await ApiKeyManager.context.secrets.delete(secretKey);
	}

	/**
	 * Ensure API key exists, prompt user to input if missing
	 * @param vendor Provider identifier
	 * @param displayName Display name
	 * @param throwError Whether to throw error when check fails, default true
	 * @returns Whether check succeeded
	 */
	static async ensureApiKey(
		vendor: string,
		displayName: string,
		throwError = true,
	): Promise<boolean> {
		if (await ApiKeyManager.hasValidApiKey(vendor)) {
			return true;
		}

		// Check if it's a built-in provider
		const builtinProviders = await ApiKeyManager.getBuiltinProviders();
		if (builtinProviders.has(vendor)) {
			// Built-in providers: trigger corresponding setup command, let Provider handle specific configuration
			const commandId = `chp.${vendor}.setApiKey`;
			await vscode.commands.executeCommand(commandId);
		} else {
			// Custom providers: directly prompt for API key input
			await ApiKeyManager.promptAndSetApiKey(
				vendor,
				vendor,
				"sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			);
		}

		// Validate if it's effective after setup
		const isValid = await ApiKeyManager.hasValidApiKey(vendor);
		if (!isValid && throwError) {
			throw new Error(`API key required to use ${displayName} model`);
		}
		return isValid;
	}

	/**
	 * Handle API key replacement in customHeader
	 * Replace ${APIKEY} with actual API key (case insensitive)
	 */
	static processCustomHeader(
		customHeader: Record<string, string> | undefined,
		apiKey: string,
	): Record<string, string> {
		if (!customHeader) {
			return {};
		}

		const processedHeader: Record<string, string> = {};
		for (const [key, value] of Object.entries(customHeader)) {
			// Case-insensitive replacement of ${APIKEY} with actual API key
			const processedValue = value.replace(/\$\{\s*APIKEY\s*\}/gi, apiKey);
			processedHeader[key] = processedValue;
		}
		return processedHeader;
	}

	/**
	 * Universal API key input and setup logic
	 */
	static async promptAndSetApiKey(
		vendor: string,
		displayName: string,
		placeHolder: string,
	): Promise<void> {
		const apiKey = await vscode.window.showInputBox({
			prompt: `Please enter your ${displayName} API key (leave empty to clear key)`,
			password: true,
			placeHolder: placeHolder,
		});
		if (apiKey !== undefined) {
			const validation = ApiKeyManager.validateApiKey(apiKey, vendor);
			if (validation.isEmpty) {
				await ApiKeyManager.deleteApiKey(vendor);
				vscode.window.showInformationMessage(`${displayName} API key cleared`);
			} else {
				await ApiKeyManager.setApiKey(vendor, apiKey.trim());
				vscode.window.showInformationMessage(`${displayName} API key set`);
			}
			// After API key changes, related components will automatically update through ConfigManager's configuration listeners
			Logger.debug(`API key updated: ${vendor}`);
		}
	}
}

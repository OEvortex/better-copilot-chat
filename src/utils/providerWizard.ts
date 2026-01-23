import * as vscode from 'vscode';
import type { ProviderOverride } from '../types/sharedTypes';
import { ApiKeyManager } from './apiKeyManager';
import { ConfigManager } from './configManager';
import { Logger } from './logger';

interface ProviderWizardOptions {
	providerKey: string;
	displayName: string;
	apiKeyTemplate?: string;
	supportsApiKey?: boolean;
	supportsBaseUrl?: boolean;
}

export class ProviderWizard {
	static async startWizard(options: ProviderWizardOptions): Promise<void> {
		const supportsApiKey = options.supportsApiKey !== false;
		const supportsBaseUrl = options.supportsBaseUrl !== false;
		const baseUrlInfo = ProviderWizard.getBaseUrlInfo(options.providerKey);

		const actions: Array<{
			label: string;
			detail?: string;
			description?: string;
			action: 'apiKey' | 'baseUrl';
		}> = [];

		if (supportsApiKey) {
			actions.push({
				label: `$(key) Configure ${options.displayName} API Key`,
				detail: `Set or clear ${options.displayName} API key`,
				action: 'apiKey'
			});
		}

		if (supportsBaseUrl) {
			const currentBaseUrl = baseUrlInfo.override || baseUrlInfo.defaultBaseUrl;
			actions.push({
				label: '$(globe) Configure Base URL (Proxy)',
				description: currentBaseUrl ? `Current: ${currentBaseUrl}` : 'Current: Default',
				detail: `Override ${options.displayName} endpoint (optional)`,
				action: 'baseUrl'
			});
		}

		if (actions.length === 0) {
			return;
		}

		const choice = await vscode.window.showQuickPick(actions, {
			title: `${options.displayName} Configuration`,
			placeHolder: 'Select an option to configure'
		});

		if (!choice) {
			return;
		}

		if (choice.action === 'apiKey') {
			await ProviderWizard.configureApiKey(options);
			return;
		}

		if (choice.action === 'baseUrl') {
			await ProviderWizard.configureBaseUrl(options.providerKey, options.displayName);
		}
	}

	static async configureApiKey(options: ProviderWizardOptions): Promise<void> {
		if (!options.apiKeyTemplate) {
			return;
		}
		await ApiKeyManager.promptAndSetApiKey(
			options.providerKey,
			options.displayName,
			options.apiKeyTemplate
		);
	}

	static async configureBaseUrl(
		providerKey: string,
		displayName: string
	): Promise<void> {
		const baseUrlInfo = ProviderWizard.getBaseUrlInfo(providerKey);
		const result = await vscode.window.showInputBox({
			prompt: `Enter ${displayName} base URL (leave empty to clear override)`,
			title: `${displayName} Base URL`,
			value: baseUrlInfo.override ?? '',
			placeHolder: baseUrlInfo.defaultBaseUrl || 'https://example.com/v1'
		});

		if (result === undefined) {
			return;
		}

		const updatedOverrides = ProviderWizard.buildUpdatedOverrides(
			providerKey,
			baseUrlInfo.overrides,
			result.trim()
		);

		try {
			const config = vscode.workspace.getConfiguration('chp');
			await config.update(
				'providerOverrides',
				updatedOverrides,
				vscode.ConfigurationTarget.Global
			);
			const message = result.trim()
				? `${displayName} base URL updated.`
				: `${displayName} base URL override cleared.`;
			vscode.window.showInformationMessage(message);
		} catch (error) {
			const message = `Failed to update ${displayName} base URL: ${error instanceof Error ? error.message : 'Unknown error'}`;
			Logger.error(message);
			vscode.window.showErrorMessage(message);
		}
	}

	private static getBaseUrlInfo(providerKey: string): {
		defaultBaseUrl?: string;
		override?: string;
		overrides: Record<string, ProviderOverride>;
	} {
		const providerConfigs = ConfigManager.getConfigProvider();
		const overrides = ConfigManager.getProviderOverrides();
		return {
			defaultBaseUrl: providerConfigs[providerKey]?.baseUrl,
			override: overrides[providerKey]?.baseUrl,
			overrides
		};
	}

	private static buildUpdatedOverrides(
		providerKey: string,
		overrides: Record<string, ProviderOverride>,
		baseUrl: string
	): Record<string, ProviderOverride> {
		const updated = { ...overrides };
		const trimmed = baseUrl.trim();
		const current = updated[providerKey] ? { ...updated[providerKey] } : {};

		if (trimmed) {
			current.baseUrl = trimmed;
			updated[providerKey] = current;
			return updated;
		}

		delete current.baseUrl;
		if (Object.keys(current).length === 0) {
			delete updated[providerKey];
		} else {
			updated[providerKey] = current;
		}

		return updated;
	}
}
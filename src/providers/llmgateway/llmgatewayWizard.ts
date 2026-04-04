/*---------------------------------------------------------------------------------------------
 *  LLMGateway Configuration Wizard
 *  Provides an interactive wizard to configure API key
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import { Logger } from '../../utils/logger';
import { ProviderWizard } from '../../utils/providerWizard';

export class LLMGatewayWizard {
    private static readonly PROVIDER_KEY = 'llmgateway';

    /**
     * Start configuration wizard
     */
    static async startWizard(
        displayName: string,
        apiKeyTemplate: string
    ): Promise<void> {
        try {
            const choice = await vscode.window.showQuickPick(
                [
                    {
                        label: `$(key) Configure ${displayName} API Key`,
                        detail: `Set or clear ${displayName} API Key`,
                        action: 'updateApiKey'
                    },
                    {
                        label: '$(globe) Configure Base URL (Proxy)',
                        detail: 'Override LLMGateway endpoint (optional)',
                        action: 'baseUrl'
                    }
                ],
                {
                    title: `${displayName} Configuration Menu`,
                    placeHolder: 'Select action to perform'
                }
            );

            if (!choice) {
                Logger.debug(
                    'User cancelled LLMGateway configuration wizard'
                );
                return;
            }

            if (choice.action === 'updateApiKey') {
                const hasApiKey = await ApiKeyManager.hasValidApiKey(
                    LLMGatewayWizard.PROVIDER_KEY
                );
                if (!hasApiKey) {
                    const apiKeySet = await LLMGatewayWizard.showSetApiKeyStep(
                        displayName,
                        apiKeyTemplate
                    );
                    if (!apiKeySet) {
                        return;
                    }
                } else {
                    const apiKeySet = await LLMGatewayWizard.showSetApiKeyStep(
                        displayName,
                        apiKeyTemplate
                    );
                    if (!apiKeySet) {
                        return;
                    }
                }
            } else if (choice.action === 'baseUrl') {
                await ProviderWizard.configureBaseUrl(
                    'llmgateway',
                    displayName
                );
            }
        } catch (error) {
            Logger.error(
                `LLMGateway configuration wizard error: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Show API key setup step
     */
    private static async showSetApiKeyStep(
        displayName: string,
        apiKeyTemplate: string
    ): Promise<boolean> {
        const result = await vscode.window.showInputBox({
            prompt: `Enter ${displayName} API Key (leave empty to clear)`,
            title: `Set ${displayName} API Key`,
            placeHolder: apiKeyTemplate,
            password: true,
            validateInput: () => null
        });

        if (result === undefined) {
            return false;
        }

        try {
            if (result.trim() === '') {
                Logger.info(`${displayName} API Key cleared`);
                await ApiKeyManager.deleteApiKey(
                    LLMGatewayWizard.PROVIDER_KEY
                );
            } else {
                await ApiKeyManager.setApiKey(
                    LLMGatewayWizard.PROVIDER_KEY,
                    result.trim()
                );
                Logger.info(`${displayName} API Key set`);
            }
            return true;
        } catch (error) {
            Logger.error(
                `API Key operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return false;
        }
    }
}

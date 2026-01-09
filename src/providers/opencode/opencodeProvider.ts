/*---------------------------------------------------------------------------------------------
 *  OpenCode Dedicated Provider
 *  Handles OpenCode specific logic and optimizations
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    Progress,
    ProvideLanguageModelChatResponseOptions
} from 'vscode';
import { GenericModelProvider } from '../common/genericModelProvider';
import { ProviderConfig } from '../../types/sharedTypes';
import { Logger, ApiKeyManager } from '../../utils';

/**
 * OpenCode dedicated model provider class
 */
export class OpenCodeProvider extends GenericModelProvider implements LanguageModelChatProvider {
    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig) {
        super(context, providerKey, providerConfig);
    }

    /**
     * Static factory method - Create and activate OpenCode provider
     */
    static override createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: OpenCodeProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} dedicated model extension activated!`);
        // Create provider instance
        const provider = new OpenCodeProvider(context, providerKey, providerConfig);
        // Register language model chat provider
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(`chp.${providerKey}`, provider);

        // Register command to set API key
        const setApiKeyCommand = vscode.commands.registerCommand(`chp.${providerKey}.setApiKey`, async () => {
            await ApiKeyManager.promptAndSetApiKey(
                providerKey,
                providerConfig.displayName,
                providerConfig.apiKeyTemplate
            );
            // Clear cache after API key change
            await provider.modelInfoCache?.invalidateCache(providerKey);
            // Trigger model information change event
            provider._onDidChangeLanguageModelChatInformation.fire();
        });

        const disposables = [providerDisposable, setApiKeyCommand];
        disposables.forEach(disposable => context.subscriptions.push(disposable));
        return { provider, disposables };
    }

    /**
     * Override: Provide language model chat response
     */
    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        try {
            Logger.info(`[OpenCode] Starting request for model: ${model.name}`);
            await super.provideLanguageModelChatResponse(model, messages, options, progress, token);
        } catch (error) {
            Logger.error(`[OpenCode] Request failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}

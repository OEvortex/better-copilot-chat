/*---------------------------------------------------------------------------------------------
 *  Chutes Dedicated Provider
 *  Handles global request limit tracking for Chutes provider
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
import { ProviderConfig, ModelConfig } from '../../types/sharedTypes';
import { Logger, ApiKeyManager } from '../../utils';
import { StatusBarManager } from '../../status';

/**
 * Chutes dedicated model provider class
 */
export class ChutesProvider extends GenericModelProvider implements LanguageModelChatProvider {
    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig) {
        super(context, providerKey, providerConfig);
    }

    /**
     * Static factory method - Create and activate Chutes provider
     */
    static override createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: ChutesProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} dedicated model extension activated!`);
        // Create provider instance
        const provider = new ChutesProvider(context, providerKey, providerConfig);
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
     * Override: Provide language model chat response - track global request count
     */
    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        try {
            await super.provideLanguageModelChatResponse(model, messages, options, progress, token);
        } finally {
            // After request completes (success or failure), update global request count
            this.incrementRequestCount();
        }
    }

    /**
     * Increment global request count and update status bar
     */
    private incrementRequestCount(): void {
        const cacheKey = 'chutes.requestCount';
        const lastResetKey = 'chutes.lastResetDate';
        const today = new Date().toDateString();

        let count = this.context?.globalState.get<number>(cacheKey) || 0;
        const lastReset = this.context?.globalState.get<string>(lastResetKey);

        if (lastReset !== today) {
            count = 1;
            this.context?.globalState.update(lastResetKey, today);
        } else {
            count++;
        }

        this.context?.globalState.update(cacheKey, count);
        Logger.debug(`[Chutes] Global request count: ${count}/5000`);

        // Trigger status bar update
        StatusBarManager.delayedUpdate('chutes', 100);
    }
}

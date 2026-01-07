/*---------------------------------------------------------------------------------------------
 *  Gemini CLI Provider
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
import { Logger } from '../../utils/logger';
import { GeminiOAuthManager } from './auth';
import { GeminiHandler } from './handler';

export class GeminiCliProvider extends GenericModelProvider implements LanguageModelChatProvider {
    private readonly geminiHandler: GeminiHandler;

    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig) {
        super(context, providerKey, providerConfig);
        this.geminiHandler = new GeminiHandler(providerConfig.displayName);
    }

    static override createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: GeminiCliProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);
        const provider = new GeminiCliProvider(context, providerKey, providerConfig);
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(`chp.${providerKey}`, provider);

        const loginCommand = vscode.commands.registerCommand(`chp.${providerKey}.login`, async () => {
            try {
                await GeminiOAuthManager.getInstance().ensureAuthenticated(true);
                vscode.window.showInformationMessage(`${providerConfig.displayName} login successful!`);
                await provider.modelInfoCache?.invalidateCache(providerKey);
                provider._onDidChangeLanguageModelChatInformation.fire();
            } catch (error) {
                vscode.window.showErrorMessage(`${providerConfig.displayName} login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });

        const disposables = [providerDisposable, loginCommand];
        disposables.forEach(disposable => context.subscriptions.push(disposable));
        return { provider, disposables };
    }

    override async provideLanguageModelChatInformation(
        options: { silent: boolean },
        _token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        // Always return models immediately without any async checks
        // This prevents the UI from refreshing/flickering when trying to add models
        // Authentication check will happen when user tries to use the model
        return this.providerConfig.models.map(model => this.modelConfigToInfo(model));
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart2>,
        token: CancellationToken
    ): Promise<void> {
        const modelConfig = this.providerConfig.models.find((m: ModelConfig) => m.id === model.id);
        if (!modelConfig) {
            throw new Error(`Model not found: ${model.id}`);
        }

        try {
            const { accessToken, baseURL } = await GeminiOAuthManager.getInstance().ensureAuthenticated();
            
            // Update handler with latest credentials
            // Pass accessToken as apiKey so OpenAIHandler uses it for Authorization header
            const configWithAuth: ModelConfig = {
                ...modelConfig,
                baseUrl: baseURL,
                apiKey: accessToken,
                customHeader: modelConfig.customHeader
            };

            // Use GeminiHandler for Gemini CLI models as they use the same protocol
            await this.geminiHandler.handleRequest(
                model,
                configWithAuth,
                messages,
                options,
                progress,
                token,
                accessToken
            );
        } catch (error) {
            if (error instanceof Error && error.message.includes('401')) {
                // Try refreshing once on 401
                try {
                    const { accessToken, baseURL } = await GeminiOAuthManager.getInstance().ensureAuthenticated(true);
                    const configWithAuth: ModelConfig = {
                        ...modelConfig,
                        baseUrl: baseURL,
                        customHeader: {
                            ...modelConfig.customHeader,
                            'Authorization': `Bearer ${accessToken}`
                        }
                    };
                    await this.geminiHandler.handleRequest(
                        model,
                        configWithAuth,
                        messages,
                        options,
                        progress,
                        token,
                        accessToken
                    );
                    return;
                } catch (retryError) {
                    throw retryError;
                }
            }
            throw error;
        }
    }
}

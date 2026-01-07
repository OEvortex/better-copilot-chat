/*---------------------------------------------------------------------------------------------
 *  Qwen Code CLI Provider
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
import { QwenOAuthManager } from './auth';

export class QwenCliProvider extends GenericModelProvider implements LanguageModelChatProvider {
    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig) {
        super(context, providerKey, providerConfig);
    }

    static override createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: QwenCliProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);
        const provider = new QwenCliProvider(context, providerKey, providerConfig);
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(`chp.${providerKey}`, provider);

        const loginCommand = vscode.commands.registerCommand(`chp.${providerKey}.login`, async () => {
            try {
                await QwenOAuthManager.getInstance().ensureAuthenticated(true);
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
        try {
            await QwenOAuthManager.getInstance().ensureAuthenticated();
        } catch (error) {
            if (!options.silent) {
                const action = await vscode.window.showErrorMessage(
                    `${this.providerConfig.displayName} requires login via CLI.`,
                    'Login',
                    'Cancel'
                );
                if (action === 'Login') {
                    await vscode.commands.executeCommand(`chp.${this.providerKey}.login`);
                }
            }
            return [];
        }

        return super.provideLanguageModelChatInformation(options, _token);
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        const modelConfig = this.providerConfig.models.find((m: ModelConfig) => m.id === model.id);
        if (!modelConfig) {
            throw new Error(`Model not found: ${model.id}`);
        }

        try {
            const { accessToken, baseURL } = await QwenOAuthManager.getInstance().ensureAuthenticated();
            
            // Update handler with latest credentials
            const configWithAuth: ModelConfig = {
                ...modelConfig,
                baseUrl: baseURL,
                customHeader: {
                    ...modelConfig.customHeader,
                    'Authorization': `Bearer ${accessToken}`
                }
            };

            await this.openaiHandler.handleRequest(model, configWithAuth, messages, options, progress, token);
        } catch (error) {
            if (error instanceof Error && error.message.includes('401')) {
                // Try refreshing once on 401
                try {
                    const { accessToken, baseURL } = await QwenOAuthManager.getInstance().ensureAuthenticated(true);
                    const configWithAuth: ModelConfig = {
                        ...modelConfig,
                        baseUrl: baseURL,
                        customHeader: {
                            ...modelConfig.customHeader,
                            'Authorization': `Bearer ${accessToken}`
                        }
                    };
                    await this.openaiHandler.handleRequest(model, configWithAuth, messages, options, progress, token);
                    return;
                } catch (retryError) {
                    throw retryError;
                }
            }
            throw error;
        }
    }
}

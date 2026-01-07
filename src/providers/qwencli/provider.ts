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

class ThinkingBlockParser {
    private inThinkingBlock = false;
    private buffer = '';

    parse(text: string): { regular: string; thinking: string } {
        let regular = '';
        let thinking = '';
        this.buffer += text;

        while (true) {
            if (this.inThinkingBlock) {
                const endIdx = this.buffer.indexOf('</think>');
                if (endIdx !== -1) {
                    thinking += this.buffer.substring(0, endIdx);
                    this.buffer = this.buffer.substring(endIdx + 8);
                    this.inThinkingBlock = false;
                } else {
                    thinking += this.buffer;
                    this.buffer = '';
                    break;
                }
            } else {
                const startIdx = this.buffer.indexOf('<think>');
                if (startIdx !== -1) {
                    regular += this.buffer.substring(0, startIdx);
                    this.buffer = this.buffer.substring(startIdx + 7);
                    this.inThinkingBlock = true;
                } else {
                    regular += this.buffer;
                    this.buffer = '';
                    break;
                }
            }
        }
        return { regular, thinking };
    }
}

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
            const { accessToken, baseURL } = await QwenOAuthManager.getInstance().ensureAuthenticated();
            
            // Update handler with latest credentials
            // Pass accessToken as apiKey so OpenAIHandler uses it for Authorization header
            const configWithAuth: ModelConfig = {
                ...modelConfig,
                baseUrl: baseURL,
                apiKey: accessToken,
                customHeader: modelConfig.customHeader
            };

            const thinkingParser = new ThinkingBlockParser();
            let currentThinkingId: string | null = null;

            let functionCallsBuffer = '';
            const wrappedProgress: Progress<vscode.LanguageModelResponsePart2> = {
                report: (part) => {
                    if (part instanceof vscode.LanguageModelTextPart) {
                        // First, parse thinking blocks
                        const { regular, thinking } = thinkingParser.parse(part.value);

                        if (thinking) {
                            if (!currentThinkingId) {
                                currentThinkingId = `qwen_thinking_${Date.now()}`;
                            }
                            progress.report(new vscode.LanguageModelThinkingPart(thinking, currentThinkingId));
                        }

                        // Next, handle function_calls XML embedded in regular text
                        let textToHandle = functionCallsBuffer + (regular || '');
                        // Extract complete <function_calls>...</function_calls> blocks
                        const funcCallsRegex = /<function_calls>[\s\S]*?<\/function_calls>/g;
                        let lastIdx = 0;
                        let fm: RegExpExecArray | null;
                        while ((fm = funcCallsRegex.exec(textToHandle)) !== null) {
                            const before = textToHandle.slice(lastIdx, fm.index);
                            if (before && before.length > 0) {
                                // End thinking if needed before reporting text
                                if (currentThinkingId) {
                                    progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId));
                                    currentThinkingId = null;
                                }
                                progress.report(new vscode.LanguageModelTextPart(before));
                            }

                            // Parse tool calls inside block
                            const block = fm[0];
                            const toolCallRegex = /<tool_call\s+name="([^"]+)"\s+arguments='([^']*)'\s*\/>/g;
                            let tm: RegExpExecArray | null;
                            while ((tm = toolCallRegex.exec(block)) !== null) {
                                const name = tm[1];
                                let argsString = tm[2] || '';
                                let argsObj: Record<string, unknown> = {};
                                try {
                                    argsObj = JSON.parse(argsString);
                                } catch {
                                    argsObj = { value: argsString };
                                }
                                const callId = `qwen_call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                                // Make sure thinking is ended before tool call
                                if (currentThinkingId) {
                                    progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId));
                                    currentThinkingId = null;
                                }
                                progress.report(new vscode.LanguageModelToolCallPart(callId, name, argsObj));
                            }

                            lastIdx = funcCallsRegex.lastIndex;
                        }

                        const trailing = textToHandle.slice(lastIdx);
                        // If trailing contains start of a <function_calls> but no close, keep it buffered
                        const openStart = trailing.indexOf('<function_calls>');
                        const closeEnd = trailing.indexOf('</function_calls>');
                        if (openStart !== -1 && closeEnd === -1) {
                            // Emit text before openStart
                            const beforeOpen = trailing.slice(0, openStart);
                            if (beforeOpen && beforeOpen.length > 0) {
                                if (currentThinkingId) {
                                    progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId));
                                    currentThinkingId = null;
                                }
                                progress.report(new vscode.LanguageModelTextPart(beforeOpen));
                            }
                            functionCallsBuffer = trailing.slice(openStart);
                        } else {
                            functionCallsBuffer = '';
                            if (trailing && trailing.length > 0) {
                                if (currentThinkingId) {
                                    progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId));
                                    currentThinkingId = null;
                                }
                                progress.report(new vscode.LanguageModelTextPart(trailing));
                            }
                        }
                    } else {
                        // Forward other parts unchanged
                        progress.report(part);
                    }
                }
            };

            await this.openaiHandler.handleRequest(model, configWithAuth, messages, options, wrappedProgress, token);
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

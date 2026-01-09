import * as vscode from 'vscode';
import {
    LanguageModelChatProvider,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    ProvideLanguageModelChatResponseOptions,
    Progress,
    CancellationToken
} from 'vscode';
import { ProviderConfig } from '../../types/sharedTypes';
import { Logger, ApiKeyManager } from '../../utils';
import { GenericModelProvider } from '../common/genericModelProvider';
import { StatusBarManager } from '../../status';

/**
 * DeepInfra dedicated model provider class
 * Uses OpenAI-compatible endpoints: https://api.deepinfra.com/v1/openai
 */
export class DeepInfraProvider extends GenericModelProvider implements LanguageModelChatProvider {
    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig) {
        super(context, providerKey, providerConfig);
    }

    static createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: DeepInfraProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);
        const ext = vscode.extensions.getExtension('OEvortex.better-copilot-chat');
        const extVersion = ext?.packageJSON?.version ?? 'unknown';
        const vscodeVersion = vscode.version;
        const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

        const provider = new DeepInfraProvider(context, providerKey, providerConfig);
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(`chp.${providerKey}`, provider);

        // Register set ApiKey command (GenericModelProvider normally registers this in createAndActivate, but keep parity)
        const setApiKeyCommand = vscode.commands.registerCommand(`chp.${providerKey}.setApiKey`, async () => {
            try {
                const apiKey = await vscode.window.showInputBox({
                    prompt: `Enter API key for ${providerConfig.displayName}`,
                    placeHolder: providerConfig.apiKeyTemplate || 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    ignoreFocusOut: true
                });
                if (apiKey !== undefined) {
                    await ApiKeyManager.setApiKey(providerKey, apiKey || '');
                    vscode.window.showInformationMessage(`${providerConfig.displayName} API key saved.`);
                }
            } catch (err) {
                Logger.error(`Failed to set API key for ${providerKey}:`, err);
                vscode.window.showErrorMessage(`Failed to set API key: ${err instanceof Error ? err.message : String(err)}`);
            }
        });

        const disposables: vscode.Disposable[] = [providerDisposable, setApiKeyCommand];
        disposables.forEach(d => context.subscriptions.push(d));
        Logger.debug(`${providerConfig.displayName} provider registered with ${disposables.length} disposables`);
        return { provider, disposables };
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: LanguageModelChatMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        try {
            Logger.info(`[DeepInfra] Starting request for model: ${model.name}`);
            await super.provideLanguageModelChatResponse(model, messages, options, progress, token);
        } catch (error) {
            Logger.error(`[DeepInfra] Request failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        } finally {
            // Trigger status bar update if needed
            StatusBarManager.delayedUpdate('deepinfra', 100);
        }
    }
}

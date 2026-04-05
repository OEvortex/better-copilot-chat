/*---------------------------------------------------------------------------------------------
 *  MoonshotAI Configuration Wizard
 *  Provides an interactive wizard to configure Moonshot API key and coding/normal plan mode
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import { ConfigManager } from '../../utils/configManager';
import { Logger } from '../../utils/logger';
import { ProviderWizard } from '../../utils/providerWizard';

export class MoonshotWizard {
    private static readonly PROVIDER_KEY = 'moonshot';

    static async startWizard(
        displayName: string,
        apiKeyTemplate: string
    ): Promise<void> {
        try {
            const currentPlan = ConfigManager.getMoonshotPlan();
            const planLabel =
                currentPlan === 'coding' ? 'Coding Plan' : 'Normal';

            const choice = await vscode.window.showQuickPick(
                [
                    {
                        label: '$(key) Configure Moonshot API Key',
                        detail: 'API key for MoonshotAI normal plan and Kimi models',
                        value: 'moonshot'
                    },
                    {
                        label: '$(code) Set Plan Type',
                        description: `Current: ${planLabel}`,
                        detail: 'Coding Plan uses https://api.kimi.com/coding/v1, Normal uses https://api.moonshot.ai/v1',
                        value: 'plan'
                    },
                    {
                        label: '$(globe) Configure Base URL (Proxy)',
                        detail: 'Override MoonshotAI endpoint (optional)',
                        value: 'baseUrl'
                    }
                ],
                {
                    title: `${displayName} Configuration Menu`,
                    placeHolder: 'Select action to perform'
                }
            );

            if (!choice) {
                Logger.debug(
                    'User cancelled the MoonshotAI configuration wizard'
                );
                return;
            }

            if (choice.value === 'moonshot') {
                await MoonshotWizard.setMoonshotApiKey(
                    displayName,
                    apiKeyTemplate
                );
            }

            if (choice.value === 'plan') {
                await MoonshotWizard.setPlan(displayName);
            }

            if (choice.value === 'baseUrl') {
                await ProviderWizard.configureBaseUrl('moonshot', displayName);
            }
        } catch (error) {
            Logger.error(
                `MoonshotAI configuration wizard error: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    static async setMoonshotApiKey(
        displayName: string,
        apiKeyTemplate: string
    ): Promise<void> {
        const result = await vscode.window.showInputBox({
            prompt: `Enter ${displayName} API Key (leave empty to clear)`,
            title: `Set ${displayName} API Key`,
            placeHolder: apiKeyTemplate,
            password: true
        });

        if (result === undefined) {
            return;
        }

        try {
            if (result.trim() === '') {
                Logger.info(`${displayName} API Key cleared`);
                await ApiKeyManager.deleteApiKey(MoonshotWizard.PROVIDER_KEY);
                vscode.window.showInformationMessage(
                    `${displayName} API Key cleared`
                );
            } else {
                await ApiKeyManager.setApiKey(
                    MoonshotWizard.PROVIDER_KEY,
                    result.trim()
                );
                Logger.info(`${displayName} API Key set`);
                vscode.window.showInformationMessage(
                    `${displayName} API Key set`
                );
            }
        } catch (error) {
            Logger.error(
                `Moonshot API Key operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            vscode.window.showErrorMessage(
                `Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    static async setPlan(displayName: string): Promise<void> {
        const currentPlan = ConfigManager.getMoonshotPlan();
        const planLabel = currentPlan === 'coding' ? 'Coding Plan' : 'Normal';

        const choice = await vscode.window.showQuickPick(
            [
                {
                    label: '$(code) Coding Plan',
                    detail: 'Use https://api.kimi.com/coding/v1 for Kimi coding-plan access',
                    value: 'coding'
                },
                {
                    label: '$(globe) Normal',
                    detail: 'Use https://api.moonshot.ai/v1 for standard MoonshotAI access',
                    value: 'normal'
                }
            ],
            {
                title: `${displayName} Plan Type Selection`,
                placeHolder: `Current: ${planLabel}`
            }
        );

        if (!choice) {
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('chp');
            await config.update(
                'moonshot.plan',
                choice.value,
                vscode.ConfigurationTarget.Global
            );
            Logger.info(`MoonshotAI plan set to ${choice.value}`);
            vscode.window.showInformationMessage(
                `MoonshotAI plan set to ${choice.value === 'coding' ? 'Coding Plan' : 'Normal'}`
            );
        } catch (error) {
            const errorMessage = `Failed to set plan: ${error instanceof Error ? error.message : 'Unknown error'}`;
            Logger.error(errorMessage);
            vscode.window.showErrorMessage(errorMessage);
        }
    }
}

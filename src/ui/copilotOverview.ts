import * as vscode from 'vscode';
import copilotCss from './copilotOverview.css?raw';
import copilotJs from './copilotOverview.js?raw';
import { TokenUsageData, TokenUsageStatusBar } from '../status/tokenUsageStatusBar';
import { ApiKeyManager } from '../utils/apiKeyManager';

export class CopilotOverview {
    private static currentPanel?: vscode.WebviewPanel;
    private static context?: vscode.ExtensionContext;

    static async show(context: vscode.ExtensionContext) {
        CopilotOverview.context = context;
        if (CopilotOverview.currentPanel) {
            CopilotOverview.currentPanel.reveal(vscode.ViewColumn.Active);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'chpCopilotOverview',
            'Copilot ++ Overview',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'ui')]
            }
        );
        CopilotOverview.currentPanel = panel;

        panel.webview.html = CopilotOverview.generateHTML(panel.webview);

        const disp = panel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'ready':
                    await CopilotOverview.sendStateUpdate(panel.webview);
                    break;
                case 'managePaidRequests':
                    // Open settings to payments or show info
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'chp');
                    break;
                case 'refresh':
                    await CopilotOverview.sendStateUpdate(panel.webview);
                    break;
            }
        });

        panel.onDidDispose(() => {
            disp.dispose();
            CopilotOverview.currentPanel = undefined;
            // remove token listener
            CopilotOverview.detachTokenListener();
        });

        // attach token usage listener
        CopilotOverview.attachTokenListener(panel.webview);

        // initial update
        await CopilotOverview.sendStateUpdate(panel.webview);
    }

    private static generateHTML(webview: vscode.Webview): string {
        const csp = webview.cspSource;
        return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'unsafe-inline' ${csp};" /><style>${copilotCss}</style></head><body><div class="container"><div class="header"><h2>Copilot Usage</h2><button class="button" onclick="refresh()">Refresh</button></div><div class="section"><div class="label-row"><div class="small">Inline Suggestions</div><div id="inline-val">Included</div></div></div><div class="section"><div class="label-row"><div class="small">Chat messages</div><div id="token-model">No requests yet</div></div><div class="progress"><div id="bar" class="bar"></div></div></div><div class="section"><button class="button" onclick="managePaid()">Manage paid premium requests</button></div><hr/><div class="providers"><h3 style="margin:0;">Providers</h3><div id="providers-list"></div></div><div class="footer">Allowance resets TBD</div></div><script>${copilotJs}</script></body></html>`;
    }

    private static async sendStateUpdate(webview: vscode.Webview) {
        try {
            const providers = ['deepseek','chutes','opencode','huggingface','deepinfra','minimax','zhipu','antigravity','codex','compatible'];
            const providerStatuses: Record<string,string> = {};
            await Promise.all(providers.map(async p => {
                try {
                    const has = await ApiKeyManager.hasValidApiKey(p);
                    providerStatuses[p] = has ? 'Configured' : 'Not configured';
                } catch {
                    providerStatuses[p] = 'Unknown';
                }
            }));

            const tokenBar = TokenUsageStatusBar.getInstance();
            const tokenData = tokenBar?.getCurrentData();

            const inlineEnabled = vscode.workspace.getConfiguration('editor').get<boolean>('inlineSuggest.enabled', true);
            const fimEnabled = vscode.workspace.getConfiguration('chp').get<boolean>('fimCompletion.enabled', false);
            const nesEnabled = vscode.workspace.getConfiguration('chp').get<boolean>('nesCompletion.enabled', false);

            webview.postMessage({ command: 'updateState', data: {
                providers: providerStatuses,
                tokenUsage: tokenData ? { modelName: tokenData.modelName, percentage: tokenData.percentage } : null,
                inlineEnabled, fimEnabled, nesEnabled
            }});
        } catch (e) {
            console.error('sendStateUpdate failed', e);
        }
    }

    private static tokenListener?: vscode.Disposable;
    private static attachTokenListener(webview: vscode.Webview) {
        // subscribe to token usage event
        this.tokenListener = TokenUsageStatusBar.onDidChangeActiveModel(data => {
            webview.postMessage({ command: 'tokenUpdate', data });
        });
    }

    private static detachTokenListener() {
        if (this.tokenListener) {
            this.tokenListener.dispose();
            this.tokenListener = undefined;
        }
    }
}

export function registerCopilotOverviewCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('chp.copilot.openOverview', async () => {
        await CopilotOverview.show(context);
    });
}

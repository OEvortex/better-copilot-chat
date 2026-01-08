/*---------------------------------------------------------------------------------------------
 *  Antigravity Quota Popup
 *  Shows Antigravity quota information in a popup
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AntigravityStatusBar, AntigravityQuotaData } from './antigravityStatusBar';
import { AntigravityAuth } from '../providers/antigravity/auth';
import { Logger } from '../utils/logger';
import { StatusBarManager } from './statusBarManager';

const COMBINED_QUOTA_COMMAND = 'chp.showCombinedQuotaDetails';

/**
 * Register the combined quota popup command
 */
export function registerCombinedQuotaCommand(context: vscode.ExtensionContext): vscode.Disposable {
    const disposable = vscode.commands.registerCommand(COMBINED_QUOTA_COMMAND, async () => {
        await showCombinedQuotaPopup();
    });
    context.subscriptions.push(disposable);
    return disposable;
}

/**
 * Show combined quota popup with Antigravity information
 */
async function showCombinedQuotaPopup(): Promise<void> {
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'Antigravity Quota Details';
    quickPick.placeholder = 'Loading quota information...';
    quickPick.busy = true;
    quickPick.show();

    try {
        const items: vscode.QuickPickItem[] = [];

        // ==================== ANTIGRAVITY SECTION ====================
        const isAntigravityLoggedIn = await AntigravityAuth.isLoggedIn();

        if (isAntigravityLoggedIn) {
            items.push({
                label: '$(cloud) Antigravity (Cloud Code)',
                kind: vscode.QuickPickItemKind.Separator
            });

            // Get Antigravity quota data
            const antigravityStatusBar = StatusBarManager.antigravity as AntigravityStatusBar | undefined;
            const antigravityData = antigravityStatusBar?.getLastStatusData()?.data;

            if (antigravityData) {
                if (antigravityData.email) {
                    items.push({
                        label: `$(account) ${antigravityData.email}`,
                        description: antigravityData.projectId ? `Project: ${antigravityData.projectId}` : ''
                    });
                }

                // Show Gemini quota
                if (antigravityData.geminiQuota !== undefined) {
                    const icon =
                        antigravityData.geminiQuota > 50
                            ? '$(check)'
                            : antigravityData.geminiQuota > 20
                              ? '$(warning)'
                              : '$(error)';
                    items.push({
                        label: `${icon} Gemini`,
                        description: `${antigravityData.geminiQuota}% remaining`
                    });
                }

                // Show Claude quota
                if (antigravityData.claudeQuota !== undefined) {
                    const icon =
                        antigravityData.claudeQuota > 50
                            ? '$(check)'
                            : antigravityData.claudeQuota > 20
                              ? '$(warning)'
                              : '$(error)';
                    items.push({
                        label: `${icon} Claude`,
                        description: `${antigravityData.claudeQuota}% remaining`
                    });
                }

                // Show model details
                if (antigravityData.modelQuotas && antigravityData.modelQuotas.length > 0) {
                    items.push({
                        label: '$(symbol-class) Model Details',
                        kind: vscode.QuickPickItemKind.Separator
                    });

                    for (const model of antigravityData.modelQuotas) {
                        const pct = Math.round(model.remainingFraction * 100);
                        const icon = pct > 50 ? 'OK' : pct > 20 ? 'WARN' : 'FAIL';
                        let detail = '';
                        if (model.resetTime) {
                            const resetDate = new Date(model.resetTime);
                            detail = `Resets: ${resetDate.toLocaleString()}`;
                        }
                        items.push({
                            label: `$(sparkle) ${model.displayName}`,
                            description: `${icon} ${pct}%`,
                            detail: detail || undefined
                        });
                    }
                }
            } else {
                items.push({
                    label: '$(info) No quota data available',
                    description: 'Click Refresh to update'
                });
            }
        }

        // ==================== ACTIONS SECTION ====================
        items.push({
            label: '$(gear) Actions',
            kind: vscode.QuickPickItemKind.Separator
        });

        if (isAntigravityLoggedIn) {
            items.push({
                label: '$(refresh) Refresh Antigravity Quota',
                description: 'Update Antigravity quota information'
            });

            items.push({
                label: '$(sync) Refresh Antigravity Models',
                description: 'Fetch latest available models'
            });

            items.push({
                label: '$(sign-out) Logout Antigravity',
                description: 'Sign out from Antigravity'
            });
        } else {
            items.push({
                label: '$(sign-in) Login to Antigravity',
                description: 'Sign in to view Antigravity quota'
            });
        }

        items.push({
            label: '$(gear) Open Account Manager',
            description: 'Manage accounts and settings'
        });

        quickPick.busy = false;
        quickPick.placeholder = 'Select an action or view details';
        quickPick.items = items;

        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            quickPick.hide();

            if (!selected) {
                return;
            }

            const label = selected.label;

            if (label.includes('Refresh Antigravity Quota')) {
                const antigravityStatusBar = StatusBarManager.antigravity as AntigravityStatusBar | undefined;
                if (antigravityStatusBar) {
                    await antigravityStatusBar.checkAndShowStatus();
                    vscode.window.showInformationMessage('Antigravity quota refreshed');
                }
            } else if (label.includes('Refresh Antigravity Models')) {
                const newModels = await AntigravityAuth.refreshModels();
                vscode.window.showInformationMessage(`Refreshed ${newModels.length} Antigravity models`);
            } else if (label.includes('Logout Antigravity')) {
                await AntigravityAuth.logout();
                vscode.window.showInformationMessage('Logged out from Antigravity');
            } else if (label.includes('Login to Antigravity')) {
                await vscode.commands.executeCommand('chp.antigravity.login');
            } else if (label.includes('Open Account Manager')) {
                await vscode.commands.executeCommand('chp.accounts.openManager');
            }
        });

        quickPick.onDidHide(() => quickPick.dispose());
    } catch (error) {
        quickPick.hide();
        Logger.error('[CombinedQuotaPopup] Failed to show quota popup:', error);
        vscode.window.showErrorMessage(`Failed to load quota data: ${error}`);
    }
}

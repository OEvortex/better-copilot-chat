/*---------------------------------------------------------------------------------------------
 *  Combined Quota Popup
 *  Shows both Antigravity and Codex quota information in a single popup
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AntigravityStatusBar, AntigravityQuotaData } from './antigravityStatusBar';
import { CodexRateLimitStatusBar, AccountRateLimitData } from './codexRateLimitStatusBar';
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
 * Show combined quota popup with both Antigravity and Codex information
 */
async function showCombinedQuotaPopup(): Promise<void> {
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'Quota Details';
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

        // ==================== CODEX SECTION ====================
        const codexStatusBar = CodexRateLimitStatusBar.getInstance();
        const codexSnapshots = codexStatusBar.getAllAccountSnapshots();

        if (codexSnapshots.length > 0) {
            items.push({
                label: '$(pulse) Codex (OpenAI)',
                kind: vscode.QuickPickItemKind.Separator
            });

            for (const accountData of codexSnapshots) {
                const accountLabel = accountData.accountName || accountData.accountId;
                const snapshot = accountData.snapshot;

                // Primary window
                if (snapshot.primary) {
                    const remaining = 100 - snapshot.primary.usedPercent;
                    const label = formatWindowLabel(snapshot.primary.windowMinutes);
                    const icon = remaining < 30 ? '$(warning)' : '$(check)';
                    let detail = '';
                    if (snapshot.primary.resetsAt) {
                        detail = `Resets: ${formatResetTime(snapshot.primary.resetsAt)}`;
                    }
                    items.push({
                        label: `${icon} ${label}`,
                        description: `${remaining.toFixed(0)}% remaining`,
                        detail: detail || `Account: ${accountLabel}`
                    });
                }

                // Secondary window
                if (snapshot.secondary) {
                    const remaining = 100 - snapshot.secondary.usedPercent;
                    const label = formatWindowLabel(snapshot.secondary.windowMinutes);
                    const icon = remaining < 30 ? '$(warning)' : '$(check)';
                    let detail = '';
                    if (snapshot.secondary.resetsAt) {
                        detail = `Resets: ${formatResetTime(snapshot.secondary.resetsAt)}`;
                    }
                    items.push({
                        label: `${icon} ${label}`,
                        description: `${remaining.toFixed(0)}% remaining`,
                        detail: detail || `Account: ${accountLabel}`
                    });
                }

                // Credits info
                if (snapshot.credits) {
                    if (snapshot.credits.unlimited) {
                        items.push({
                            label: '$(star-full) Credits',
                            description: 'Unlimited'
                        });
                    } else if (snapshot.credits.balance) {
                        const balance = formatCreditBalance(snapshot.credits.balance);
                        if (balance) {
                            items.push({
                                label: '$(credit-card) Credits',
                                description: balance
                            });
                        }
                    }
                }
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

            if (!selected) return;

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

function formatWindowLabel(minutes?: number): string {
    if (!minutes) {
        return '5h';
    }
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    if (days === 7) {
        return 'Weekly';
    }
    return `${days}d`;
}

function formatResetTime(timestampSeconds: number): string {
    const resetDate = new Date(timestampSeconds * 1000);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    if (diffMs <= 0) {
        return 'now';
    }

    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffMinutes < 60) {
        return `in ${diffMinutes}m`;
    }

    if (diffHours < 24) {
        const mins = diffMinutes % 60;
        if (mins > 0) {
            return `in ${diffHours}h ${mins}m`;
        }
        return `in ${diffHours}h`;
    }

    return resetDate.toLocaleString();
}

function formatCreditBalance(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }

    const floatValue = parseFloat(trimmed);
    if (!isNaN(floatValue) && floatValue > 0) {
        return Math.round(floatValue).toLocaleString();
    }

    return null;
}

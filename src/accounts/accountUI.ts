/*---------------------------------------------------------------------------------------------
 *  Account UI Service
 *  Giao diện người dùng để quản lý nhiều tài khoản
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AccountManager } from './accountManager';
import { Account } from './types';
import { Logger } from '../utils/logger';
import { ProviderKey } from '../types/providerKeys';
import { AntigravityAuth } from '../providers/antigravity/auth';
import { CodexAuth } from '../providers/codex/codexAuth';

/**
 * Extended QuickPickItem với account data
 */
interface AccountQuickPickItem extends vscode.QuickPickItem {
    account: Account;
}

/**
 * Account UI - Giao diện quản lý tài khoản
 */
export class AccountUI {
    private static instance: AccountUI;
    private accountManager: AccountManager;

    private constructor() {
        this.accountManager = AccountManager.getInstance();
    }

    /**
     * Lấy instance
     */
    static getInstance(): AccountUI {
        if (!AccountUI.instance) {
            AccountUI.instance = new AccountUI();
        }
        return AccountUI.instance;
    }

    /**
     * Hiển thị menu quản lý tài khoản chính
     */
    async showAccountManager(): Promise<void> {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(window) Open Account Manager',
                description: 'Open full account management page',
                detail: 'Visual interface for managing all accounts'
            },
            {
                label: '$(add) Add New Account',
                description: 'Add a new account for any provider',
                detail: 'Add API Key or OAuth account'
            },
            {
                label: '$(list-unordered) View All Accounts',
                description: 'View and manage all accounts',
                detail: `${this.accountManager.getAllAccounts().length} accounts configured`
            },
            {
                label: '$(arrow-swap) Switch Account',
                description: 'Switch active account for a provider',
                detail: 'Change which account is used for requests'
            },
            {
                label: '$(trash) Remove Account',
                description: 'Remove an existing account',
                detail: 'Delete account and its credentials'
            },
            {
                label: '$(settings) Antigravity Model Routing',
                description: 'Assign Antigravity models to accounts',
                detail: 'Choose which account handles each model'
            },
            {
                label: '$(pulse) Antigravity Load Balance',
                description: this.accountManager.getLoadBalanceEnabled(ProviderKey.Antigravity) ? 'Enabled' : 'Disabled',
                detail: 'Auto switch accounts when quota is hit'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Account Manager',
            placeHolder: 'Select an action'
        });

        if (!selected) {
            return;
        }

        switch (selected.label) {
            case '$(window) Open Account Manager':
                await vscode.commands.executeCommand('chp.accounts.openManager');
                break;
            case '$(add) Add New Account':
                await this.showAddAccountFlow();
                break;
            case '$(list-unordered) View All Accounts':
                await this.showAllAccounts();
                break;
            case '$(arrow-swap) Switch Account':
                await this.showSwitchAccountFlow();
                break;
            case '$(trash) Remove Account':
                await this.showRemoveAccountFlow();
                break;
            case '$(settings) Antigravity Model Routing':
                await this.showAntigravityModelRouting();
                break;
            case '$(pulse) Antigravity Load Balance':
                await this.showAntigravityLoadBalanceToggle();
                break;
        }
    }

    /**
     * Flow thêm tài khoản mới
     */
    async showAddAccountFlow(): Promise<void> {
        // Chọn provider
        const providers = [
            { label: 'Antigravity (Google)', value: ProviderKey.Antigravity, authType: 'oauth' as const },
            { label: 'Codex (OpenAI)', value: ProviderKey.Codex, authType: 'oauth' as const },
            { label: 'ZhipuAI', value: ProviderKey.Zhipu, authType: 'apiKey' as const },
            { label: 'Moonshot', value: ProviderKey.Moonshot, authType: 'apiKey' as const },
            { label: 'MiniMax', value: ProviderKey.MiniMax, authType: 'apiKey' as const },
            { label: 'DeepSeek', value: 'deepseek', authType: 'apiKey' as const },
            { label: 'Compatible (Custom)', value: ProviderKey.Compatible, authType: 'apiKey' as const }
        ];

        const providerItems = providers.map(p => ({
            label: p.label,
            description: p.authType === 'oauth' ? 'OAuth Login' : 'API Key',
            provider: p.value,
            authType: p.authType
        }));

        const selectedProvider = await vscode.window.showQuickPick(providerItems, {
            title: 'Add Account - Select Provider',
            placeHolder: 'Choose a provider'
        });

        if (!selectedProvider) {
            return;
        }

        if (selectedProvider.authType === 'oauth') {
            await this.addOAuthAccount(selectedProvider.provider);
        } else {
            await this.addApiKeyAccount(selectedProvider.provider, selectedProvider.label);
        }
    }

    /**
     * Thêm tài khoản API Key
     */
    async addApiKeyAccount(provider: string, providerLabel: string): Promise<void> {
        // Nhập tên hiển thị
        const displayName = await vscode.window.showInputBox({
            title: `Add ${providerLabel} Account`,
            prompt: 'Enter a display name for this account',
            placeHolder: 'e.g., Work Account, Personal, etc.',
            validateInput: value => {
                if (!value || value.trim().length === 0) {
                    return 'Display name is required';
                }
                return undefined;
            }
        });

        if (!displayName) {
            return;
        }

        // Nhập API Key
        const apiKey = await vscode.window.showInputBox({
            title: `Add ${providerLabel} Account`,
            prompt: `Enter your ${providerLabel} API Key`,
            password: true,
            placeHolder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            validateInput: value => {
                if (!value || value.trim().length === 0) {
                    return 'API Key is required';
                }
                return undefined;
            }
        });

        if (!apiKey) {
            return;
        }

        // Hỏi về endpoint tùy chỉnh (cho compatible provider)
        let endpoint: string | undefined;
        if (provider === 'compatible') {
            endpoint = await vscode.window.showInputBox({
                title: `Add ${providerLabel} Account`,
                prompt: 'Enter custom endpoint URL (optional)',
                placeHolder: 'https://api.example.com/v1'
            });
        }

        // Thêm tài khoản
        const result = await this.accountManager.addApiKeyAccount(provider, displayName.trim(), apiKey.trim(), {
            endpoint
        });

        if (result.success) {
            vscode.window.showInformationMessage(`✅ Account "${displayName}" added successfully for ${providerLabel}`);
        } else {
            vscode.window.showErrorMessage(`❌ Failed to add account: ${result.error}`);
        }
    }

    /**
     * Thêm tài khoản OAuth (Antigravity)
     */
    async addOAuthAccount(provider: string): Promise<void> {
        if (provider === ProviderKey.Antigravity) {
            // Force add new account using the dedicated function
            try {
                const { doAntigravityLoginForNewAccount } = await import('../providers/antigravity/auth.js');
                await doAntigravityLoginForNewAccount();
            } catch (error) {
                Logger.error('OAuth login failed:', error);
                vscode.window.showErrorMessage('OAuth login failed. Please try again.');
            }
        } else if (provider === ProviderKey.Codex) {
            // Codex OAuth login
            try {
                const { doCodexLoginForNewAccount } = await import('../providers/codex/codexAuth.js');
                await doCodexLoginForNewAccount();
            } catch (error) {
                Logger.error('Codex OAuth login failed:', error);
                vscode.window.showErrorMessage('Codex OAuth login failed. Please try again.');
            }
        }
    }

    /**
     * Hiển thị tất cả tài khoản
     */
    async showAllAccounts(): Promise<void> {
        const accounts = this.accountManager.getAllAccounts();

        if (accounts.length === 0) {
            const action = await vscode.window.showInformationMessage('No accounts configured yet.', 'Add Account');
            if (action === 'Add Account') {
                await this.showAddAccountFlow();
            }
            return;
        }

        // Nhóm theo provider
        const accountsByProvider = new Map<string, Account[]>();
        for (const account of accounts) {
            const list = accountsByProvider.get(account.provider) || [];
            list.push(account);
            accountsByProvider.set(account.provider, list);
        }

        const items: vscode.QuickPickItem[] = [];
        for (const [provider, providerAccounts] of accountsByProvider) {
            // Header cho provider
            items.push({
                label: provider.toUpperCase(),
                kind: vscode.QuickPickItemKind.Separator
            });

            for (const account of providerAccounts) {
                const isActive = account.isDefault;
                const statusIcon = this.getStatusIcon(account.status);
                const activeIcon = isActive ? '$(check) ' : '';

                items.push({
                    label: `${activeIcon}${statusIcon} ${account.displayName}`,
                    description: account.email || account.authType,
                    detail: `Created: ${new Date(account.createdAt).toLocaleDateString()} | Status: ${account.status}`
                });
            }
        }

        await vscode.window.showQuickPick(items, {
            title: 'All Accounts',
            placeHolder: 'View your configured accounts'
        });
    }

    /**
     * Flow chuyển đổi tài khoản
     */
    async showSwitchAccountFlow(): Promise<void> {
        // Lấy danh sách providers có nhiều hơn 1 account
        const accounts = this.accountManager.getAllAccounts();
        const providerCounts = new Map<string, number>();

        for (const account of accounts) {
            providerCounts.set(account.provider, (providerCounts.get(account.provider) || 0) + 1);
        }

        const providersWithMultiple = Array.from(providerCounts.entries())
            .filter(([_, count]) => count > 1)
            .map(([provider]) => provider);

        if (providersWithMultiple.length === 0) {
            vscode.window.showInformationMessage('No providers have multiple accounts. Add more accounts first.');
            return;
        }

        // Chọn provider
        const providerItems = providersWithMultiple.map(p => ({
            label: p.charAt(0).toUpperCase() + p.slice(1),
            description: `${providerCounts.get(p)} accounts`,
            provider: p
        }));

        const selectedProvider = await vscode.window.showQuickPick(providerItems, {
            title: 'Switch Account - Select Provider',
            placeHolder: 'Choose a provider'
        });

        if (!selectedProvider) {
            return;
        }

        // Hiển thị danh sách tài khoản của provider
        const providerAccounts = this.accountManager.getAccountsByProvider(selectedProvider.provider);
        const accountItems: AccountQuickPickItem[] = providerAccounts.map(account => ({
            label: `${account.isDefault ? '$(check) ' : ''}${account.displayName}`,
            description: account.email || account.authType,
            detail: account.isDefault ? 'Currently active' : 'Click to switch',
            account
        }));

        const selectedAccount = await vscode.window.showQuickPick(accountItems, {
            title: `Switch ${selectedProvider.label} Account`,
            placeHolder: 'Select an account to switch to'
        });

        if (!selectedAccount || selectedAccount.account.isDefault) {
            return;
        }

        const success = await this.accountManager.switchAccount(selectedProvider.provider, selectedAccount.account.id);

        if (success) {
            vscode.window.showInformationMessage(`✅ Switched to "${selectedAccount.account.displayName}"`);
        } else {
            vscode.window.showErrorMessage(`❌ Failed to switch to "${selectedAccount.account.displayName}"`);
        }
    }

    /**
     * Flow xóa tài khoản
     */
    async showRemoveAccountFlow(): Promise<void> {
        const accounts = this.accountManager.getAllAccounts();

        if (accounts.length === 0) {
            vscode.window.showInformationMessage('No accounts to remove.');
            return;
        }

        const accountItems: AccountQuickPickItem[] = accounts.map(account => ({
            label: `${account.displayName}`,
            description: `${account.provider} - ${account.email || account.authType}`,
            detail: account.isDefault ? '⚠️ This is the active account' : undefined,
            account
        }));

        const selectedAccount = await vscode.window.showQuickPick(accountItems, {
            title: 'Remove Account',
            placeHolder: 'Select an account to remove'
        });

        if (!selectedAccount) {
            return;
        }

        // Xác nhận
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${selectedAccount.account.displayName}"?`,
            { modal: true },
            'Remove'
        );

        if (confirm !== 'Remove') {
            return;
        }

        const success = await this.accountManager.removeAccount(selectedAccount.account.id);

        if (success) {
            vscode.window.showInformationMessage(`✅ Account "${selectedAccount.account.displayName}" removed`);
        } else {
            vscode.window.showErrorMessage('Failed to remove account');
        }
    }

    /**
     * Hiển thị quick pick để chọn tài khoản cho một provider
     */
    async showAccountPicker(provider: string): Promise<Account | undefined> {
        const accounts = this.accountManager.getAccountsByProvider(provider);

        if (accounts.length === 0) {
            const action = await vscode.window.showInformationMessage(
                `No ${provider} accounts configured.`,
                'Add Account'
            );
            if (action === 'Add Account') {
                await this.addApiKeyAccount(provider, provider);
                return this.accountManager.getActiveAccount(provider);
            }
            return undefined;
        }

        if (accounts.length === 1) {
            return accounts[0];
        }

        const accountItems: AccountQuickPickItem[] = accounts.map(account => ({
            label: `${account.isDefault ? '$(check) ' : ''}${account.displayName}`,
            description: account.email || account.authType,
            account
        }));

        const selected = await vscode.window.showQuickPick(accountItems, {
            title: `Select ${provider} Account`,
            placeHolder: 'Choose an account'
        });

        return selected?.account;
    }

    /**
     * Chọn account cho từng model Antigravity
     */
    private async showAntigravityModelRouting(): Promise<void> {
        const provider = ProviderKey.Antigravity;
        const accounts = this.accountManager.getAccountsByProvider(provider);
        if (accounts.length === 0) {
            vscode.window.showInformationMessage('No Antigravity accounts configured. Add an account first.');
            return;
        }

        let models = await AntigravityAuth.getCachedModels();
        if (models.length === 0) {
            models = await AntigravityAuth.getModels();
        }
        if (models.length === 0) {
            vscode.window.showWarningMessage('No Antigravity models available. Please login and refresh models.');
            return;
        }

        const assignments = this.accountManager.getModelAccountAssignments(provider);

        interface ModelPickItem extends vscode.QuickPickItem {
            modelId: string;
        }

        const modelItems: ModelPickItem[] = models.map(model => {
            const assignedId = assignments[model.id];
            const assignedAccount = accounts.find(acc => acc.id === assignedId);
            return {
                label: model.displayName || model.name,
                description: model.id,
                detail: assignedAccount
                    ? `Assigned to ${assignedAccount.displayName}`
                    : 'Auto (use active account or load balance)',
                modelId: model.id
            };
        });

        const selectedModel = await vscode.window.showQuickPick(modelItems, {
            title: 'Antigravity Model Routing',
            placeHolder: 'Select a model to assign'
        });

        if (!selectedModel) {
            return;
        }

        interface AccountPickItem extends vscode.QuickPickItem {
            accountId?: string;
        }

        const accountItems: AccountPickItem[] = [
            {
                label: '$(circle-outline) Auto',
                description: 'Use active account or load balance',
                accountId: undefined
            },
            ...accounts.map(account => ({
                label: `${account.isDefault ? '$(check) ' : ''}${account.displayName}`,
                description: account.email || account.authType,
                detail: account.status === 'active' ? undefined : `Status: ${account.status}`,
                accountId: account.id
            }))
        ];

        const selectedAccount = await vscode.window.showQuickPick(accountItems, {
            title: `Assign Account for ${selectedModel.label}`,
            placeHolder: 'Select an account'
        });

        if (!selectedAccount) {
            return;
        }

        await this.accountManager.setAccountForModel(provider, selectedModel.modelId, selectedAccount.accountId);
        const resultLabel = selectedAccount.accountId ? selectedAccount.label.replace(/^\$\(check\)\s*/, '') : 'Auto';
        vscode.window.showInformationMessage(`Updated routing for ${selectedModel.label}: ${resultLabel}`);
    }

    /**
     * Bật/tắt load balance cho Antigravity
     */
    private async showAntigravityLoadBalanceToggle(): Promise<void> {
        const provider = ProviderKey.Antigravity;
        const enabled = this.accountManager.getLoadBalanceEnabled(provider);

        const action = await vscode.window.showQuickPick(
            [
                {
                    label: enabled ? 'Disable Load Balance' : 'Enable Load Balance',
                    description: enabled ? 'Keep current account selection' : 'Auto switch on quota limits'
                }
            ],
            {
                title: 'Antigravity Load Balance',
                placeHolder: 'Toggle load balance'
            }
        );

        if (!action) {
            return;
        }

        await this.accountManager.setLoadBalanceEnabled(provider, !enabled);
        vscode.window.showInformationMessage(`Antigravity load balance ${!enabled ? 'enabled' : 'disabled'}.`);
    }

    /**
     * 🚀 Quick Switch - Chuyển đổi tài khoản nhanh với 1 click
     * Hiển thị tất cả tài khoản theo provider, cho phép chuyển đổi ngay lập tức
     */
    async showQuickSwitch(): Promise<void> {
        const accounts = this.accountManager.getAllAccounts();

        if (accounts.length === 0) {
            const action = await vscode.window.showInformationMessage(
                'No accounts configured. Add your first account?',
                'Add Account'
            );
            if (action === 'Add Account') {
                await this.showAddAccountFlow();
            }
            return;
        }

        // Nhóm theo provider
        const accountsByProvider = new Map<string, Account[]>();
        for (const account of accounts) {
            const list = accountsByProvider.get(account.provider) || [];
            list.push(account);
            accountsByProvider.set(account.provider, list);
        }

        // Tạo QuickPick với buttons
        const quickPick = vscode.window.createQuickPick<AccountQuickPickItem & { provider?: string }>();
        quickPick.title = '⚡ Quick Switch Account';
        quickPick.placeholder = 'Select an account to switch to (or type to filter)';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        const items: (AccountQuickPickItem & { provider?: string })[] = [];

        // Thêm các tài khoản theo provider
        for (const [provider, providerAccounts] of accountsByProvider) {
            // Separator cho provider
            items.push({
                label: `$(folder) ${this.getProviderDisplayName(provider)}`,
                kind: vscode.QuickPickItemKind.Separator,
                account: null as unknown as Account,
                provider
            });

            for (const account of providerAccounts) {
                const isActive = account.isDefault;
                const statusIcon = this.getStatusIcon(account.status);

                items.push({
                    label: `${isActive ? '$(check) ' : '    '}${statusIcon} ${account.displayName}`,
                    description: `${provider}${account.email ? ` • ${account.email}` : ''}`,
                    detail: isActive ? '$(star-full) Currently active' : '$(arrow-right) Click to switch',
                    account,
                    provider,
                    buttons: isActive
                        ? []
                        : [
                              {
                                  iconPath: new vscode.ThemeIcon('arrow-swap'),
                                  tooltip: 'Switch to this account'
                              }
                          ]
                });
            }
        }

        // Thêm actions ở cuối
        items.push({
            label: '',
            kind: vscode.QuickPickItemKind.Separator,
            account: null as unknown as Account
        });
        items.push({
            label: '$(add) Add New Account',
            description: 'Add a new account for any provider',
            account: null as unknown as Account,
            alwaysShow: true
        } as AccountQuickPickItem & { provider?: string; alwaysShow?: boolean });
        items.push({
            label: '$(settings-gear) Open Account Manager',
            description: 'Full account management interface',
            account: null as unknown as Account,
            alwaysShow: true
        } as AccountQuickPickItem & { provider?: string; alwaysShow?: boolean });
        items.push({
            label: '$(gear) Open Settings',
            description: 'Configure Copilot ++ extension settings',
            account: null as unknown as Account,
            alwaysShow: true
        } as AccountQuickPickItem & { provider?: string; alwaysShow?: boolean });

        quickPick.items = items;

        // Xử lý selection
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            quickPick.hide();

            if (!selected) {
                return;
            }

            if (selected.label === '$(add) Add New Account') {
                await this.showAddAccountFlow();
                return;
            }

            if (selected.label === '$(settings-gear) Open Account Manager') {
                await vscode.commands.executeCommand('chp.accounts.openManager');
                return;
            }

            if (selected.label === '$(gear) Open Settings') {
                await vscode.commands.executeCommand('chp.openSettings');
                return;
            }

            if (selected.account && !selected.account.isDefault) {
                await this.switchToAccount(selected.account);
            }
        });

        // Xử lý button click
        quickPick.onDidTriggerItemButton(async e => {
            const item = e.item as AccountQuickPickItem;
            if (item.account && !item.account.isDefault) {
                quickPick.hide();
                await this.switchToAccount(item.account);
            }
        });

        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    }

    /**
     * 🚀 Quick Switch cho một provider cụ thể
     * Hiển thị chỉ các tài khoản của provider đó
     */
    async showQuickSwitchForProvider(provider: string): Promise<void> {
        const accounts = this.accountManager.getAccountsByProvider(provider);

        if (accounts.length === 0) {
            const action = await vscode.window.showInformationMessage(
                `No ${this.getProviderDisplayName(provider)} accounts configured.`,
                'Add Account'
            );
            if (action === 'Add Account') {
                await this.showAddAccountFlow();
            }
            return;
        }

        if (accounts.length === 1) {
            vscode.window.showInformationMessage(
                `Only one ${this.getProviderDisplayName(provider)} account configured: ${accounts[0].displayName}`
            );
            return;
        }

        const quickPick = vscode.window.createQuickPick<AccountQuickPickItem>();
        quickPick.title = `⚡ Switch ${this.getProviderDisplayName(provider)} Account`;
        quickPick.placeholder = 'Select an account to switch to';

        const items: AccountQuickPickItem[] = accounts.map(account => {
            const isActive = account.isDefault;
            const statusIcon = this.getStatusIcon(account.status);

            return {
                label: `${isActive ? '$(check) ' : ''}${statusIcon} ${account.displayName}`,
                description: account.email || account.authType,
                detail: isActive ? '$(star-full) Currently active' : '$(arrow-right) Click to switch',
                account
            };
        });

        quickPick.items = items;

        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            quickPick.hide();

            if (selected?.account && !selected.account.isDefault) {
                await this.switchToAccount(selected.account);
            }
        });

        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    }

    /**
     * Chuyển đổi sang tài khoản được chọn
     */
    private async switchToAccount(account: Account): Promise<void> {
        const success = await this.accountManager.switchAccount(account.provider, account.id);

        if (success) {
            // Hiển thị notification với animation
            const message = `$(check) Switched to "${account.displayName}"`;
            vscode.window.setStatusBarMessage(message, 3000);

            // Cũng hiển thị information message
            vscode.window.showInformationMessage(
                `✅ Now using: ${account.displayName} (${this.getProviderDisplayName(account.provider)})`
            );
        } else {
            vscode.window.showErrorMessage(`❌ Failed to switch to "${account.displayName}"`);
        }
    }

    /**
     * Lấy tên hiển thị của provider
     */
    private getProviderDisplayName(provider: string): string {
        const names: Record<string, string> = {
            antigravity: 'Antigravity (Google)',
            codex: 'Codex (OpenAI)',
            zhipu: 'ZhipuAI',
            moonshot: 'Moonshot',
            minimax: 'MiniMax',
            deepseek: 'DeepSeek',
            compatible: 'Compatible'
        };
        return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
    }

    /**
     * Lấy icon trạng thái
     */
    private getStatusIcon(status: string): string {
        switch (status) {
            case 'active':
                return '$(pass-filled)';
            case 'inactive':
                return '$(circle-outline)';
            case 'expired':
                return '$(warning)';
            case 'error':
                return '$(error)';
            default:
                return '$(question)';
        }
    }
}

/**
 * Đăng ký các commands cho Account UI
 */
export function registerAccountCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Command mở Account Manager
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.manage', async () => {
            const ui = AccountUI.getInstance();
            await ui.showAccountManager();
        })
    );

    // Command thêm tài khoản
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.add', async () => {
            const ui = AccountUI.getInstance();
            await ui.showAddAccountFlow();
        })
    );

    // Command chuyển đổi tài khoản
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.switch', async () => {
            const ui = AccountUI.getInstance();
            await ui.showSwitchAccountFlow();
        })
    );

    // Command xóa tài khoản
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.remove', async () => {
            const ui = AccountUI.getInstance();
            await ui.showRemoveAccountFlow();
        })
    );

    // Command xem tất cả tài khoản
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.list', async () => {
            const ui = AccountUI.getInstance();
            await ui.showAllAccounts();
        })
    );

    // Command mở Account Manager Page (WebView)
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.openManager', async () => {
            const { AccountManagerPage } = await import('./accountManagerPage.js');
            const page = AccountManagerPage.getInstance();
            await page.show();
        })
    );

    // 🚀 Command Quick Switch - Chuyển đổi nhanh với 1 click
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.quickSwitch', async () => {
            const ui = AccountUI.getInstance();
            await ui.showQuickSwitch();
        })
    );

    // 🚀 Command Quick Switch cho provider cụ thể
    disposables.push(
        vscode.commands.registerCommand('chp.accounts.quickSwitchProvider', async (provider?: string) => {
            const ui = AccountUI.getInstance();
            if (provider) {
                await ui.showQuickSwitchForProvider(provider);
            } else {
                await ui.showQuickSwitch();
            }
        })
    );

    return disposables;
}

/**
 * Account Manager Page JavaScript
 * Handles all UI interactions for the Account Manager WebView
 */

// VS Code API
const vscode = acquireVsCodeApi();

// State
let accounts = [];
let providers = [];
let selectedProvider = null;
let antigravityQuota = null;
let antigravityQuotaTimer = null;
let codexRateLimits = [];
let accountQuotaStates = [];
let providerImageUris = {};

/**
 * Initialize the Account Manager
 */
function initializeAccountManager(initialAccounts, initialProviders, initialAntigravityQuota, initialCodexRateLimits, initialAccountQuotaStates, initialProviderImageUris) {
    accounts = initialAccounts || [];
    providers = initialProviders || [];
    antigravityQuota = normalizeAntigravityQuota(initialAntigravityQuota);
    codexRateLimits = initialCodexRateLimits || [];
    accountQuotaStates = initialAccountQuotaStates || [];
    providerImageUris = initialProviderImageUris || {};

    // Restore selected provider from persisted state if possible
    try {
        const state = vscode.getState() || {};
        if (typeof state.selectedProvider === 'string') {
            selectedProvider = state.selectedProvider;
        }
    } catch {
        // Ignore state restore failures
    }
    ensureSelectedProvider();

    renderPage();
    setupEventListeners();
}

/**
 * Render the entire page
 */
function renderPage() {
    const app = document.getElementById('app');
    if (!app) {
        console.error('Account Manager: app element not found');
        return;
    }
    ensureSelectedProvider();
    app.innerHTML = `
        <div class="shell">
            ${renderHeader()}
            ${renderQuotaBanner()}
            ${renderMainLayout()}
            <div id="modal-container"></div>
            <div class="toast-container" id="toast-container"></div>
        </div>
    `;
    startQuotaCountdown();
}

/**
 * Render header section
 */
function renderHeader() {
    const totalAccounts = accounts.length;
    const providersWithAccounts = [...new Set(accounts.map(a => a.provider))].length;
    const subtitle = `${totalAccounts} account${totalAccounts !== 1 ? 's' : ''} · ${providersWithAccounts} provider${providersWithAccounts !== 1 ? 's' : ''}`;
    return `
        <div class="topbar">
            <div class="topbar-title">
                <div class="topbar-title-text">Account Manager</div>
                <div class="topbar-subtitle">${escapeHtml(subtitle)}</div>
            </div>
            <div class="topbar-actions">
                <a class="settings-link" href="#" onclick="openGCMPSettings(); return false;" title="Configure load balancing and advanced settings for AI Chat Models">
                    <span class="settings-icon"></span>
                    <span class="settings-text">GCMP Settings</span>
                </a>
                <button class="btn btn-primary" onclick="showAddAccountModal()">Add account</button>
                <button class="btn btn-ghost" onclick="refreshAccounts()">Refresh</button>
            </div>
        </div>
    `;
}

/**
 * Open GCMP Settings page
 */
function openGCMPSettings() {
    vscode.postMessage({
        command: 'openSettings'
    });
}

/**
 * Render Antigravity quota banner
 */
function renderQuotaBanner() {
    if (!antigravityQuota) {
        return '';
    }

    const remaining = antigravityQuota.resetAt - Date.now();
    if (remaining <= 0) {
        return '';
    }

    const modelLabel = antigravityQuota.modelName ? escapeHtml(antigravityQuota.modelName) : 'Unknown model';
    const accountLabel = antigravityQuota.accountName ? escapeHtml(antigravityQuota.accountName) : '';

    return `
        <div class="notice notice-warning" id="quota-banner">
            <div class="notice-title">Quota exceeded</div>
            <div class="notice-body">
                <div><strong>${modelLabel}</strong> ${accountLabel ? `· ${accountLabel}` : ''}</div>
                <div class="notice-meta">Retry in <span class="quota-countdown" id="quota-countdown">${formatCountdown(remaining)}</span></div>
            </div>
        </div>
    `;
}

function renderMainLayout() {
    const providerSummary = getProviderSummary();
    if (providerSummary.length === 0) {
        return `
            <div class="layout">
                <div class="surface sidebar">
                    <div class="sidebar-header">
                        <div class="sidebar-title">Providers</div>
                    </div>
                    <div class="sidebar-empty">No providers</div>
                </div>
                <div class="surface content">
                    ${renderEmptyState()}
                </div>
            </div>
        `;
    }

    // Ensure selected provider exists
    const selected = providerSummary.find(p => p.id === selectedProvider) || providerSummary[0];
    if (selected && selected.id !== selectedProvider) {
        setSelectedProvider(selected.id);
    }

    const providerAccounts = accounts.filter(a => a.provider === selectedProvider);

    return `
        <div class="layout">
            ${renderSidebar(providerSummary)}
            ${renderContent(selected, providerAccounts)}
        </div>
    `;
}

function renderSidebar(providerSummary) {
    return `
        <div class="surface sidebar">
            <div class="sidebar-header">
                <div class="sidebar-title">Providers</div>
            </div>
            <div class="provider-list">
                ${providerSummary.map(p => {
        const isActive = p.id === selectedProvider;
        return `
                        <button class="provider-item ${isActive ? 'active' : ''}" onclick="setSelectedProvider('${p.id}')" title="${escapeHtml(p.name)}">
                            <span class="provider-item-icon">${getProviderIcon(p.id)}</span>
                            <span class="provider-item-name">${escapeHtml(p.name)}</span>
                            <span class="provider-item-count">${p.count}</span>
                        </button>
                    `;
    }).join('')}
            </div>
            <div class="sidebar-footer">
                <button class="btn btn-ghost btn-block" onclick="showAddAccountModal()">Add account</button>
            </div>
        </div>
    `;
}

function renderContent(selectedProviderInfo, providerAccounts) {
    if (!selectedProviderInfo) {
        return `<div class="surface content">${renderEmptyState()}</div>`;
    }

    const title = escapeHtml(selectedProviderInfo.name);
    const countLabel = `${providerAccounts.length} account${providerAccounts.length !== 1 ? 's' : ''}`;

    return `
        <div class="surface content">
            <div class="content-header">
                <div>
                    <div class="content-title">${title}</div>
                    <div class="content-subtitle">${escapeHtml(countLabel)}</div>
                </div>
                <div class="content-actions">
                    <button class="btn btn-ghost" onclick="addAccountForProvider('${selectedProviderInfo.id}')">Add</button>
                </div>
            </div>

            ${providerAccounts.length > 0
            ? `<div class="account-cards">${providerAccounts.map(account => renderAccountCard(account)).join('')}</div>`
            : renderProviderEmptyState(selectedProviderInfo.id)
        }
        </div>
    `;
}

/**
 * Get quota state for a specific account
 */
function getAccountQuotaState(accountId) {
    console.log('[DEBUG] getAccountQuotaState called with accountId:', accountId);
    console.log('[DEBUG] Available accountQuotaStates:', accountQuotaStates.map(qs => ({ accountId: qs.accountId, provider: qs.provider, successCount: qs.successCount })));
    const state = accountQuotaStates.find(qs => qs.accountId === accountId);
    console.log('[DEBUG] Found state for accountId', accountId, ':', state ? { successCount: state.successCount, failureCount: state.failureCount } : null);
    return state || null;
}

/**
 * Check if account is in quota cooldown
 */
function isAccountInQuotaCooldown(accountId) {
    const state = getAccountQuotaState(accountId);
    if (!state || !state.quotaExceeded || !state.quotaResetAt) {
        return false;
    }
    return Date.now() < state.quotaResetAt;
}

/**
 * Render quota state info for an account
 */
function renderAccountQuotaState(accountId) {
    const state = getAccountQuotaState(accountId);
    if (!state) {
        return '';
    }

    const isInCooldown = isAccountInQuotaCooldown(accountId);
    const remaining = isInCooldown ? state.quotaResetAt - Date.now() : 0;

    // Calculate success rate
    const totalRequests = state.successCount + state.failureCount;
    const successRate = totalRequests > 0 ? Math.round((state.successCount / totalRequests) * 100) : 100;

    let statusClass = 'success';
    if (isInCooldown) {
        statusClass = 'warning';
    } else if (successRate < 50) {
        statusClass = 'error';
    } else if (successRate < 80) {
        statusClass = 'warning';
    }

    return `
        <div class="account-quota-state ${statusClass}">
            <div class="quota-state-header">
                <span class="quota-state-icon">${isInCooldown ? 'WAIT' : 'STATS'}</span>
                <span class="quota-state-title">Quota Status</span>
            </div>
            <div class="quota-state-content">
                ${isInCooldown ? `
                    <div class="quota-state-row warning">
                        <span class="quota-state-label">Cooldown:</span>
                        <span class="quota-state-value account-quota-countdown" data-reset-at="${state.quotaResetAt}">${formatCountdown(remaining)}</span>
                    </div>
                    ${state.affectedModel ? `
                        <div class="quota-state-row">
                            <span class="quota-state-label">Model:</span>
                            <span class="quota-state-value">${escapeHtml(state.affectedModel)}</span>
                        </div>
                    ` : ''}
                ` : ''}
                <div class="quota-state-row">
                    <span class="quota-state-label">Success:</span>
                    <span class="quota-state-value">${state.successCount} requests</span>
                </div>
                <div class="quota-state-row">
                    <span class="quota-state-label">Failures:</span>
                    <span class="quota-state-value">${state.failureCount} requests</span>
                </div>
                <div class="quota-state-row">
                    <span class="quota-state-label">Rate:</span>
                    <span class="quota-state-value ${statusClass}">${successRate}%</span>
                </div>
                ${state.lastSuccessAt ? `
                    <div class="quota-state-row">
                        <span class="quota-state-label">Last success:</span>
                        <span class="quota-state-value">${formatTimeAgo(state.lastSuccessAt)}</span>
                    </div>
                ` : ''}
                ${state.lastError ? `
                    <div class="quota-state-row error">
                        <span class="quota-state-label">Last error:</span>
                        <span class="quota-state-value">${escapeHtml(state.lastError)}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * Get rate limit for a specific account
 */
function getCodexRateLimitForAccount(accountId) {
    return codexRateLimits.find(rl => rl.accountId === accountId) || null;
}

/**
 * Render rate limit info for a Codex account
 */
function renderAccountRateLimit(accountId) {
    const rateLimit = getCodexRateLimitForAccount(accountId);
    if (!rateLimit) {
        return '';
    }

    const primaryRemaining = rateLimit.primary ? 100 - rateLimit.primary.usedPercent : null;
    const secondaryRemaining = rateLimit.secondary ? 100 - rateLimit.secondary.usedPercent : null;
    const minRemaining = Math.min(primaryRemaining ?? 100, secondaryRemaining ?? 100);
    const isWarning = minRemaining < 30;

    const formatWindowLabel = (minutes) => {
        if (!minutes) { return '5h'; }
        if (minutes < 60) { return `${minutes}m`; }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) { return `${hours}h`; }
        const days = Math.floor(hours / 24);
        if (days === 7) { return 'Weekly'; }
        return `${days}d`;
    };

    const renderProgressBar = (percent) => {
        const filled = Math.round((percent / 100) * 10);
        const empty = 10 - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    };

    let content = '';
    if (rateLimit.primary) {
        const label = formatWindowLabel(rateLimit.primary.windowMinutes);
        const remaining = (100 - rateLimit.primary.usedPercent).toFixed(0);
        const bar = renderProgressBar(100 - rateLimit.primary.usedPercent);
        content += `<div class="rate-limit-row"><span class="rate-limit-label">${label}:</span><span class="rate-limit-bar">[${bar}]</span><span class="rate-limit-value ${isWarning && remaining < 30 ? 'warning' : ''}">${remaining}%</span></div>`;
    }
    if (rateLimit.secondary) {
        const label = formatWindowLabel(rateLimit.secondary.windowMinutes);
        const remaining = (100 - rateLimit.secondary.usedPercent).toFixed(0);
        const bar = renderProgressBar(100 - rateLimit.secondary.usedPercent);
        const rowWarning = remaining < 30;
        content += `<div class="rate-limit-row"><span class="rate-limit-label">${label}:</span><span class="rate-limit-bar">[${bar}]</span><span class="rate-limit-value ${rowWarning ? 'warning' : ''}">${remaining}%</span></div>`;
    }

    const updatedAt = rateLimit.capturedAt ? new Date(rateLimit.capturedAt).toLocaleTimeString() : '';

    return `
        <div class="account-rate-limit ${isWarning ? 'warning' : ''}">
            <div class="rate-limit-header-inline">
                <span class="rate-limit-icon"></span>
                <span class="rate-limit-title-small">Rate Limit</span>
                ${updatedAt ? `<span class="rate-limit-updated">${updatedAt}</span>` : ''}
            </div>
            <div class="rate-limit-content">
                ${content}
            </div>
        </div>
    `;
}

/**
 * Render provider sections
 */
function renderProviderSections() {
    // Group accounts by provider
    const accountsByProvider = {};
    for (const account of accounts) {
        if (!accountsByProvider[account.provider]) {
            accountsByProvider[account.provider] = [];
        }
        accountsByProvider[account.provider].push(account);
    }

    // Get all providers (including those without accounts)
    const allProviders = [...new Set([...providers.map(p => p.id), ...Object.keys(accountsByProvider)])];

    if (allProviders.length === 0) {
        return renderEmptyState();
    }

    return allProviders.map(providerId => {
        const providerInfo = providers.find(p => p.id === providerId) || { id: providerId, name: providerId };
        const providerAccounts = accountsByProvider[providerId] || [];
        const isCollapsed = collapsedProviders[providerId];

        return `
            <div class="provider-section" data-provider="${providerId}">
                <div class="provider-header" onclick="toggleProvider('${providerId}')">
                    <div class="provider-title">
                        <span class="provider-icon">${getProviderIcon(providerId)}</span>
                        <span class="provider-name">${escapeHtml(providerInfo.name || providerId)}</span>
                        <span class="provider-badge">${providerAccounts.length} account${providerAccounts.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="provider-actions">
                        <button class="btn btn-icon" onclick="event.stopPropagation(); addAccountForProvider('${providerId}')" title="Add account">
                            +
                        </button>
                        <span style="font-size: 12px; opacity: 0.6;">${isCollapsed ? '▸' : '▾'}</span>
                    </div>
                </div>
                <div class="provider-content ${isCollapsed ? 'collapsed' : ''}">
                    ${providerAccounts.length > 0
                ? renderAccountList(providerAccounts)
                : renderProviderEmptyState(providerId)
            }
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render account list for a provider
 */
function renderAccountList(providerAccounts) {
    return `
        <div class="account-list">
            ${renderAccountListHeader()}
            ${providerAccounts.map(account => renderAccountCard(account)).join('')}
        </div>
    `;
}

/**
 * Render account list header
 */
function renderAccountListHeader() {
    return `
        <div class="account-list-header">
            <div class="account-col account-col-name">👤 Account</div>
            <div class="account-col account-col-status">Status</div>
            <div class="account-col account-col-auth">Auth Type</div>
            <div class="account-col account-col-created">Created</div>
            <div class="account-col account-col-actions">Actions</div>
        </div>
    `;
}

/**
 * Render a single account card - Simplified UI
 */
function renderAccountCard(account) {
    const initials = getInitials(account.displayName);
    const isDefault = account.isDefault;
    const isQuotaLimited = antigravityQuota &&
        account.provider === 'antigravity' &&
        antigravityQuota.accountId === account.id;
    const isCodexAccount = account.provider === 'codex';
    const codexRateLimit = isCodexAccount ? getCodexRateLimitForAccount(account.id) : null;

    // Check account quota state from cache
    const quotaState = getAccountQuotaState(account.id);
    const isInQuotaCooldown = isAccountInQuotaCooldown(account.id);

    const statusClass = escapeHtml(account.status);
    const authLabel = account.authType === 'oauth' ? 'OAuth' : 'API Key';

    // Calculate success rate for compact display
    let statsText = '';
    if (quotaState) {
        const total = quotaState.successCount + quotaState.failureCount;
        const rate = total > 0 ? Math.round((quotaState.successCount / total) * 100) : 100;
        statsText = `${quotaState.successCount}/${quotaState.failureCount}`;
    }

    return `
        <div class="account-card-simple ${isDefault ? 'active' : ''} ${isQuotaLimited || isInQuotaCooldown ? 'quota-limited' : ''}" data-account-id="${account.id}">
            <div class="account-card-left" onclick="handleAccountCardClick(event, '${account.id}', ${isDefault})">
                <div class="account-avatar">${initials}</div>
                <div class="account-info-compact">
                    <div class="account-name-row">
                        <span class="account-name">${escapeHtml(account.displayName)}</span>
                        ${isDefault ? '<span class="badge badge-primary">Current</span>' : ''}
                        <span class="badge badge-muted">${escapeHtml(authLabel)}</span>
                        <span class="status-dot-inline ${statusClass}"></span>
                    </div>
                    ${account.email && account.email !== account.displayName ? `<div class="account-email-compact">${escapeHtml(account.email)}</div>` : ''}
                    <div class="account-meta-compact">
                        <span>Created ${formatDate(account.createdAt)}</span>
                        ${statsText ? `<span class="account-stats">${statsText}</span>` : ''}
                    </div>
                </div>
            </div>
            ${isQuotaLimited || isInQuotaCooldown ? `
                <div class="quota-badge-compact">
                    <span class="quota-countdown-compact account-quota-countdown" data-reset-at="${isQuotaLimited ? antigravityQuota.resetAt : quotaState.quotaResetAt}">${formatCountdown((isQuotaLimited ? antigravityQuota.resetAt : quotaState.quotaResetAt) - Date.now())}</span>
                </div>
            ` : ''}
            <div class="account-actions-compact">
                ${!isDefault ? `<button class="btn-action btn-use" onclick="event.stopPropagation(); setDefaultAccount('${account.id}')" title="Use this account">Use</button>` : ''}
                <button class="btn-action btn-info" onclick="event.stopPropagation(); showAccountDetails('${account.id}')" title="View details">ℹ</button>
                <button class="btn-action btn-delete" onclick="event.stopPropagation(); confirmDeleteAccount('${account.id}', '${escapeHtml(account.displayName)}')" title="Delete account">✕</button>
            </div>
        </div>
    `;
}

/**
 * Render empty state when no accounts
 */
function renderEmptyState() {
    return `
        <div class="empty-state">
            <div class="empty-state-title">No Accounts Configured</div>
            <div class="empty-state-description">
                Add your first account to start using AI models from different providers.
            </div>
            <button class="btn btn-primary" onclick="showAddAccountModal()">
                + Add Your First Account
            </button>
        </div>
    `;
}

/**
 * Render empty state for a specific provider
 */
function renderProviderEmptyState(providerId) {
    return `
        <div class="empty-state" style="padding: 24px;">
            <div class="empty-state-description">No accounts for this provider yet.</div>
            <button class="btn btn-ghost" onclick="addAccountForProvider('${providerId}')">Add</button>
        </div>
    `;
}

/**
 * Show add account modal
 */
function showAddAccountModal() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2 class="modal-title">Add New Account</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 16px; color: var(--vscode-descriptionForeground);">
                        Select a provider to add an account:
                    </p>
                   
                    <div class="provider-select-grid">
                        ${providers.map(p => `
                            <div class="provider-select-item" onclick="selectProviderForAdd('${p.id}')" data-provider="${p.id}">
                                <div class="provider-select-icon">${getProviderIcon(p.id)}</div>
                                <div class="provider-select-info">
                                    <div class="provider-select-name">${escapeHtml(p.name)}</div>
                                    <div class="provider-select-type">${p.authType === 'oauth' ? 'OAuth Login' : 'API Key'}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Select provider and show appropriate form
 */
function selectProviderForAdd(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    if (provider.authType === 'oauth') {
        // Trigger OAuth login
        vscode.postMessage({
            command: 'addOAuthAccount',
            provider: providerId
        });
        closeModal();
    } else {
        showApiKeyForm(providerId, provider.name);
    }
}

/**
 * Show API Key form
 */
function showApiKeyForm(providerId, providerName) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2 class="modal-title">Add ${escapeHtml(providerName)} Account</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="add-account-form" onsubmit="submitAddAccount(event, '${providerId}')">
                        <div class="form-group">
                            <label class="form-label">Display Name *</label>
                            <input type="text" class="form-input" id="displayName" 
                                   placeholder="e.g., Work Account, Personal" required>
                            <div class="form-hint">A friendly name to identify this account</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">API Key *</label>
                            <input type="password" class="form-input" id="apiKey" 
                                   placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx" required>
                            <div class="form-hint">Your ${escapeHtml(providerName)} API key</div>
                        </div>
                        ${providerId === 'compatible' ? `
                            <div class="form-group">
                                <label class="form-label">Custom Endpoint (Optional)</label>
                                <input type="url" class="form-input" id="endpoint" 
                                       placeholder="https://api.example.com/v1">
                                <div class="form-hint">Custom API endpoint URL</div>
                            </div>
                        ` : ''}
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="document.getElementById('add-account-form').requestSubmit()">
                        Add Account
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Submit add account form
 */
function submitAddAccount(event, providerId) {
    event.preventDefault();

    const displayName = document.getElementById('displayName').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const endpointEl = document.getElementById('endpoint');
    const endpoint = endpointEl ? endpointEl.value.trim() : undefined;

    if (!displayName || !apiKey) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    vscode.postMessage({
        command: 'addApiKeyAccount',
        provider: providerId,
        displayName: displayName,
        apiKey: apiKey,
        endpoint: endpoint
    });

    closeModal();
}

/**
 * Add account for specific provider
 */
function addAccountForProvider(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        // If provider not in list, assume API key
        showApiKeyForm(providerId, capitalizeFirst(providerId));
        return;
    }

    if (provider.authType === 'oauth') {
        vscode.postMessage({
            command: 'addOAuthAccount',
            provider: providerId
        });
    } else {
        showApiKeyForm(providerId, provider.name);
    }
}

/**
 * Set account as default
 */
function setDefaultAccount(accountId) {
    const account = accounts.find(a => a.id === accountId);

    // Check quota for Antigravity accounts before switching
    if (account && account.provider === 'antigravity') {
        checkQuotaBeforeSwitch(accountId);
    } else {
        // For non-Antigravity accounts, switch immediately
        vscode.postMessage({
            command: 'setDefaultAccount',
            accountId: accountId
        });
    }
}

/**
 * Check quota before switching to Antigravity account
 */
function checkQuotaBeforeSwitch(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    // Show loading state on the Use button
    const useButton = document.querySelector(`[data-account-id="${accountId}"] .btn-use`);
    if (useButton) {
        useButton.disabled = true;
        useButton.textContent = 'Checking...';
    }

    // Request quota check from backend
    vscode.postMessage({
        command: 'checkQuota',
        accountId: accountId
    });
}

/**
 * Handle quota check result from backend
 */
function handleQuotaCheckResult(message) {
    const { accountId, success, quotaData, error, message: resultMessage } = message;
    const account = accounts.find(a => a.id === accountId);

    // Restore button state
    const useButton = document.querySelector(`[data-account-id="${accountId}"] .btn-use`);
    if (useButton) {
        useButton.disabled = false;
        useButton.textContent = 'Use';
    }

    if (success) {
        if (quotaData) {
            // Show quota info in toast with color coding
            const minQuota = quotaData.minQuota;
            let toastType = 'success';
            let icon = 'OK';

            if (minQuota < 10) {
                toastType = 'error';
                icon = 'WARN';
            } else if (minQuota < 30) {
                toastType = 'warning';
                icon = 'WARN';
            }
            const quotaMsg = `${icon} Quota refreshed - Gemini: ${quotaData.geminiQuota}%, Claude: ${quotaData.claudeQuota}%`;
            showToast(quotaMsg, toastType);
        } else if (resultMessage) {
            showToast(resultMessage, 'info');
        }

        // Proceed with account switch
        vscode.postMessage({
            command: 'setDefaultAccount',
            accountId: accountId
        });
    } else {
        // Show error
        showToast(error || 'Failed to check quota', 'error');
    }
}

function handleAccountCardClick(event, accountId, isDefault) {
    if (isDefault) {
        return;
    }
    setDefaultAccount(accountId);
}

/**
 * Show account details
 */
function showAccountDetails(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    const isQuotaLimited = antigravityQuota &&
        account.provider === 'antigravity' &&
        antigravityQuota.accountId === account.id;

    const quotaSection = isQuotaLimited ? `
        <div style="margin-top: 16px; padding: 12px; background: rgba(255, 196, 0, 0.1); border-radius: 8px; border: 1px solid rgba(255, 196, 0, 0.3);">
            <div style="font-weight: 600; color: var(--vscode-notificationsWarningForeground, #ffc400); margin-bottom: 8px;">
                Quota Exceeded
            </div>
            <div style="display: grid; gap: 8px; font-size: 13px;">
                <div>
                    <strong>Model:</strong> ${escapeHtml(antigravityQuota.modelName || 'Unknown')}
                </div>
                <div>
                    <strong>Retry in:</strong> <span style="font-weight: 600; color: var(--vscode-notificationsWarningForeground, #ffc400);">${formatCountdown(antigravityQuota.resetAt - Date.now())}</span>
                </div>
                <div>
                    <strong>Reset at:</strong> ${formatDateTime(new Date(antigravityQuota.resetAt).toISOString())}
                </div>
            </div>
        </div>
    ` : '';

    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2 class="modal-title">Account Details</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                        <div class="account-avatar" style="width: 64px; height: 64px; font-size: 24px;">
                            ${getInitials(account.displayName)}
                        </div>
                        <div>
                            <div style="font-size: 18px; font-weight: 600;">${escapeHtml(account.displayName)}</div>
                            ${account.email ? `<div style="color: var(--vscode-descriptionForeground);">${escapeHtml(account.email)}</div>` : ''}
                        </div>
                    </div>
                    ${quotaSection}
                    <div style="display: grid; gap: 12px; ${isQuotaLimited ? 'margin-top: 16px;' : ''}">
                        <div>
                            <strong>Provider:</strong> ${capitalizeFirst(account.provider)}
                        </div>
                        <div>
                            <strong>Auth Type:</strong> ${account.authType === 'oauth' ? 'OAuth' : 'API Key'}
                        </div>
                        <div>
                            <strong>Status:</strong> 
                            <span class="account-status ${account.status}" style="display: inline-flex;">
                                <span class="status-dot ${account.status}"></span>
                                ${capitalizeFirst(account.status)}
                            </span>
                        </div>
                        <div>
                            <strong>Created:</strong> ${formatDateTime(account.createdAt)}
                        </div>
                        <div>
                            <strong>Last Updated:</strong> ${formatDateTime(account.updatedAt)}
                        </div>
                        ${account.expiresAt ? `
                            <div>
                                <strong>Expires:</strong> ${formatDateTime(account.expiresAt)}
                            </div>
                        ` : ''}
                        <div>
                            <strong>Default:</strong> ${account.isDefault ? 'Yes ⭐' : 'No'}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Confirm delete account
 */
function confirmDeleteAccount(accountId, displayName) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2 class="modal-title">Delete Account</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Are you sure you want to delete the account "<strong>${escapeHtml(displayName)}</strong>"?</p>
                    <p style="color: var(--vscode-errorForeground); margin-top: 12px;">
                        This action cannot be undone. All credentials will be permanently removed.
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-danger" onclick="deleteAccount('${accountId}')">
                        Delete Account
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Delete account
 */
function deleteAccount(accountId) {
    vscode.postMessage({
        command: 'deleteAccount',
        accountId: accountId
    });
    closeModal();
}

function ensureSelectedProvider() {
    const providerSummary = getProviderSummary();
    if (providerSummary.length === 0) {
        selectedProvider = null;
        return;
    }
    // If selected provider not present anymore, fall back
    const exists = selectedProvider && providerSummary.some(p => p.id === selectedProvider);
    if (!exists) {
        selectedProvider = providerSummary[0].id;
        try {
            vscode.setState({ ...(vscode.getState() || {}), selectedProvider });
        } catch {
            // Ignore
        }
    }
}

function setSelectedProvider(providerId) {
    selectedProvider = providerId;
    try {
        vscode.setState({ ...(vscode.getState() || {}), selectedProvider });
    } catch {
        // Ignore
    }
    renderPage();
}

/**
 * Refresh accounts
 */
function refreshAccounts() {
    vscode.postMessage({
        command: 'refresh'
    });
}

/**
 * Close modal
 */
function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-container').innerHTML = '';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? 'OK' : type === 'error' ? 'ERR' : 'INFO'}</span>
        <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * Update accounts data
 */
function updateAccounts(newAccounts) {
    accounts = newAccounts || [];
    ensureSelectedProvider();
    renderPage();
}

/**
 * Update Antigravity quota notice
 */
function updateAntigravityQuota(notice) {
    antigravityQuota = normalizeAntigravityQuota(notice);
    renderPage();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'updateAccounts':
                updateAccounts(message.accounts);
                break;
            case 'showToast':
                showToast(message.message, message.type);
                break;
            case 'updateAntigravityQuota':
                updateAntigravityQuota(message.notice);
                break;
            case 'updateAccountQuotaState':
                updateAccountQuotaState(message.accountId, message.state);
                break;
            case 'quotaCheckResult':
                handleQuotaCheckResult(message);
                break;
        }
    });
}

/**
 * Update account quota state from extension
 */
function updateAccountQuotaState(accountId, state) {
    if (!state) {
        // Remove state
        accountQuotaStates = accountQuotaStates.filter(s => s.accountId !== accountId);
    } else {
        // Update or add state
        const existingIndex = accountQuotaStates.findIndex(s => s.accountId === accountId);
        if (existingIndex >= 0) {
            accountQuotaStates[existingIndex] = state;
        } else {
            accountQuotaStates.push(state);
        }
    }

    // Re-render the affected account card
    const accountCard = document.querySelector(`[data-account-id="${accountId}"]`);
    if (accountCard) {
        const account = accounts.find(a => a.id === accountId);
        if (account) {
            accountCard.outerHTML = renderAccountCard(account);
        }
    }
}

// Utility functions
function getProviderIcon(providerId) {
    // Use image if available, otherwise fallback to emoji
    // if (providerImageUris[providerId]) {
    //     return `<img src="${providerImageUris[providerId]}" alt="${providerId}" class="provider-icon-img" />`;
    // }

    // Fallback emoji icons
    const icons = {
        'antigravity': '🌐',
        'codex': '✨',
        'zhipu': '🧠',
        'moonshot': '🌙',
        'minimax': '🔷',
        'deepseek': '🔍',
        'deepinfra': '🚀',
        'compatible': '⚙️'
    };
    return icons[providerId] || '🤖';
}

function getProviderSummary() {
    const accountsByProvider = {};
    for (const account of accounts) {
        accountsByProvider[account.provider] = (accountsByProvider[account.provider] || 0) + 1;
    }

    const allProviderIds = [...new Set([...providers.map(p => p.id), ...Object.keys(accountsByProvider)])];
    const summary = allProviderIds.map(id => {
        const info = providers.find(p => p.id === id);
        return {
            id,
            name: (info && info.name) ? info.name : capitalizeFirst(id),
            authType: info && info.authType ? info.authType : 'apiKey',
            count: accountsByProvider[id] || 0
        };
    });

    // Sort: providers with accounts first, then by name
    summary.sort((a, b) => {
        if (a.count !== b.count) {
            return b.count - a.count;
        }
        return a.name.localeCompare(b.name);
    });

    return summary;
}

function getInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        return new Date(dateStr).toLocaleDateString();
    } catch {
        return 'N/A';
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        return new Date(dateStr).toLocaleString();
    } catch {
        return 'N/A';
    }
}

function normalizeAntigravityQuota(notice) {
    if (!notice || typeof notice.resetAt !== 'number') {
        return null;
    }
    const modelName = typeof notice.modelName === 'string' ? notice.modelName : '';
    const accountId = typeof notice.accountId === 'string' ? notice.accountId : '';
    const accountName = typeof notice.accountName === 'string' ? notice.accountName : '';
    return { resetAt: notice.resetAt, modelName, accountId, accountName };
}

function startQuotaCountdown() {
    stopQuotaCountdown();
    if (!antigravityQuota) {
        return;
    }
    updateQuotaCountdown();
}

function stopQuotaCountdown() {
    if (antigravityQuotaTimer) {
        clearTimeout(antigravityQuotaTimer);
        antigravityQuotaTimer = null;
    }
}

function updateQuotaCountdown() {
    if (!antigravityQuota) {
        return;
    }
    const remaining = antigravityQuota.resetAt - Date.now();
    if (remaining <= 0) {
        antigravityQuota = null;
        renderPage();
        return;
    }

    // Update main banner countdown
    const countdownEl = document.getElementById('quota-countdown');
    if (countdownEl) {
        countdownEl.textContent = formatCountdown(remaining);
    }

    // Update account card countdown
    const accountCountdowns = document.querySelectorAll('.account-quota-countdown');
    accountCountdowns.forEach(el => {
        const resetAt = parseInt(el.dataset.resetAt, 10);
        if (resetAt) {
            const accountRemaining = resetAt - Date.now();
            if (accountRemaining > 0) {
                el.textContent = formatCountdown(accountRemaining);
            }
        }
    });

    antigravityQuotaTimer = setTimeout(updateQuotaCountdown, getCountdownUpdateInterval(remaining));
}

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const days = Math.floor(totalSeconds / 86400);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

function getCountdownUpdateInterval(remainingMs) {
    if (remainingMs >= 60 * 60 * 1000) {
        return 60 * 1000;
    }
    return 1000;
}

/**
 * Account Manager Page JavaScript - Ultra Modern Refactor
 */

// VS Code API
const vscode = acquireVsCodeApi();

// State
let accounts = [];
let providers = [];
let antigravityQuota = null;
let codexRateLimits = [];
let accountQuotaStates = [];
let selectedProviderId = null;
let accountSearchQuery = "";

// Initialization
function initializeAccountManager(
    initialAccounts,
    initialProviders,
    initialAntigravityQuota,
    initialCodexRateLimits,
    initialAccountQuotaStates,
    initialProviderImageUris
) {
    accounts = initialAccounts || [];
    providers = initialProviders || [];
    antigravityQuota = initialAntigravityQuota;
    codexRateLimits = initialCodexRateLimits || [];
    accountQuotaStates = initialAccountQuotaStates || [];
    void initialProviderImageUris;

    // Auto-select first provider if none selected
    if (!selectedProviderId && providers.length > 0) {
        selectedProviderId = providers[0].id;
    }

    renderPage();
}

/**
 * Main render function
 */
function renderPage() {
    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `
        <div class="shell">
            ${renderTopBar()}
            <div class="layout">
                ${renderSidebar()}
                ${renderContent()}
            </div>
            <div id="modal-container"></div>
            <div class="toast-container" id="toast-container"></div>
        </div>
    `;
}

function renderTopBar() {
    return `
        <div class="topbar">
            <div class="topbar-title">
                <span class="topbar-title-text">Account Manager</span>
                <span class="topbar-subtitle">Manage AI provider accounts and routing</span>
            </div>
            <div class="topbar-actions">
                <button class="btn btn-ghost" onclick="refreshAccounts()">
                    <span class="codicon codicon-refresh"></span> Refresh
                </button>
            </div>
        </div>
    `;
}

function renderSidebar() {
    return `
        <div class="sidebar">
            <div class="sidebar-header">Providers</div>
            <div class="provider-list">
                ${providers.map(p => {
        const count = accounts.filter(a => a.provider === p.id).length;
        const isActive = selectedProviderId === p.id;
        return `
                        <div class="provider-item ${isActive ? 'active' : ''}" onclick="selectProvider('${p.id}')">
                            <span class="provider-item-icon">${getProviderIcon(p.id)}</span>
                            <span class="provider-item-name">${p.name}</span>
                            ${count > 0 ? `<span class="provider-item-count">${count}</span>` : ''}
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;
}

function renderContent() {
    if (!selectedProviderId) {
        return `
            <div class="content">
                <div class="content-scrollable">
                    <div class="empty-state">
                        <span class="empty-state-icon codicon codicon-hubot"></span>
                        <div class="empty-state-title">No Provider Selected</div>
                        <p class="empty-state-description">Select an AI provider from the sidebar to manage your accounts, API keys, and configurations.</p>
                    </div>
                </div>
            </div>
        `;
    }

    const provider = providers.find(p => p.id === selectedProviderId);
    const providerAccounts = accounts.filter(a => a.provider === selectedProviderId);
    const filteredAccounts = providerAccounts.filter(account => {
        if (!accountSearchQuery) {
            return true;
        }
        const q = accountSearchQuery.toLowerCase();
        return (
            (account.displayName || "").toLowerCase().includes(q) ||
            (account.email || "").toLowerCase().includes(q) ||
            (account.id || "").toLowerCase().includes(q)
        );
    });

    const escapedProviderName = escapeHtml(provider ? provider.name : selectedProviderId);
    return `
        <div class="content">
            <div class="content-scrollable">
                <div class="content-header">
                    <div>
                        <h2 class="content-title">${escapedProviderName}</h2>
                        <p class="content-subtitle">${providerAccounts.length} account${providerAccounts.length === 1 ? '' : 's'} configured for this provider</p>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-secondary" onclick="configModelsForProvider('${selectedProviderId}')">
                            <span class="codicon codicon-settings"></span> Models
                        </button>
                        <button class="btn btn-primary" onclick="addAccountForProvider('${selectedProviderId}')">
                            <span class="codicon codicon-add"></span> Add Account
                        </button>
                    </div>
                </div>

                <div class="filter-row">
                    <div class="search-box">
                        <span class="codicon codicon-search"></span>
                        <input
                            type="text"
                            class="search-input"
                            placeholder="Search accounts by name, email, or ID"
                            value="${escapeHtml(accountSearchQuery)}"
                            oninput="setAccountSearch(this.value)"
                        >
                    </div>
                    <span class="result-count">${filteredAccounts.length} shown</span>
                </div>

                ${renderAntigravityNotice()}

                <div class="account-list">
                    ${filteredAccounts.length > 0
            ? filteredAccounts.map(renderAccountCard).join('')
            : `<div class="empty-state" style="grid-column: 1 / -1;">
                            <span class="empty-state-icon codicon codicon-account"></span>
                            <div class="empty-state-title">${providerAccounts.length === 0 ? "No Accounts Configured" : "No Matching Accounts"}</div>
                            <p class="empty-state-description">${providerAccounts.length === 0
                                ? `Add your first account for ${escapedProviderName} to get started.`
                                : "Try another search term or clear the filter."}</p>
                            <button class="btn btn-primary" onclick="addAccountForProvider('${selectedProviderId}')">
                                <span class="codicon codicon-add"></span> ${providerAccounts.length === 0 ? "Add First Account" : "Add Account"}
                            </button>
                           </div>`
        }
                </div>
            </div>
        </div>
    `;
}

function renderAccountCard(account) {
    const isDefault = account.isDefault;
    const quotaState = accountQuotaStates.find(s => s.accountId === account.id);
    const isLimited = quotaState && quotaState.quotaExceeded;

    // Determine avatar initials
    const initials = (account.displayName || account.email || account.provider || 'A').substring(0, 2).toUpperCase();
    const providerName = escapeHtml(providers.find(p => p.id === account.provider)?.name || account.provider || "Unknown");
    const displayName = escapeHtml(account.displayName || 'Unnamed Account');
    const secondary = escapeHtml(account.email || account.id || "");

    return `
        <div class="account-item ${isDefault ? 'active' : ''}">
            <div class="account-item-main">
                <div class="account-avatar-modern">${initials}</div>
                <div class="account-details">
                    <div class="account-name-row">
                        <div class="account-name">${displayName}</div>
                        ${isDefault ? '<span class="badge badge-primary">Default</span>' : ''}
                        <span class="badge badge-muted">${account.authType === 'oauth' ? 'OAuth' : 'API Key'}</span>
                    </div>
                    <div class="account-meta">
                        <span>${secondary}</span>
                        <span class="meta-sep">•</span>
                        <span>${providerName}</span>
                    </div>
                </div>
            </div>

            ${isLimited ? `
                <div class="quota-notice compact">
                    <span class="codicon codicon-warning"></span>
                    <span style="font-size: 12px;">Quota Limited - Resets in <span class="quota-countdown-compact" data-reset-at="${quotaState.quotaResetAt}">...</span></span>
                </div>
            ` : ''}

            <div class="account-actions inline">
                ${!isDefault ? `
                    <button class="btn btn-ghost" onclick="setDefaultAccount('${account.id}')">
                        <span class="codicon codicon-check"></span> Set Active
                    </button>
                ` : `
                    <button class="btn btn-secondary" disabled style="opacity: 0.7; cursor: not-allowed;">
                        <span class="codicon codicon-star-full"></span> Active
                    </button>
                `}
                <button class="btn-action-icon" title="View Details" onclick="showAccountDetails('${account.id}')">
                    <span class="codicon codicon-info"></span>
                </button>
                <button class="btn-action-icon danger" title="Remove Account" onclick="confirmDeleteAccount('${account.id}')">
                    <span class="codicon codicon-trash"></span>
                </button>
            </div>
        </div>
    `;
}

function setAccountSearch(query) {
    accountSearchQuery = query || "";
    renderPage();
}

function escapeHtml(value) {
    return (value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderAntigravityNotice() {
    if (selectedProviderId !== 'antigravity' || !antigravityQuota) return '';
    const modelName = escapeHtml(antigravityQuota.modelName || 'Gemini models');

    return `
        <div class="quota-notice">
            <span class="quota-notice-icon codicon codicon-info"></span>
            <div class="quota-notice-text">
                <strong>Global Quota Notice:</strong> The quota for ${modelName} will reset in 
                <span class="quota-countdown" data-reset-at="${antigravityQuota.resetAt}">...</span>.
            </div>
        </div>
    `;
}

// Helpers
function getProviderIcon(providerId) {
    const icons = {
        antigravity: "<span class=\"codicon codicon-globe\"></span>",
        codex: "<span class=\"codicon codicon-symbol-method\"></span>",
        zhipu: "<span class=\"codicon codicon-symbol-key\"></span>",
        deepseek: "<span class=\"codicon codicon-search\"></span>",
        moonshot: "<span class=\"codicon codicon-circle-large-outline\"></span>",
        minimax: "<span class=\"codicon codicon-layers\"></span>",
        kilo: "<span class=\"codicon codicon-dashboard\"></span>",
        deepinfra: "<span class=\"codicon codicon-rocket\"></span>",
        openai: "<span class=\"codicon codicon-hubot\"></span>",
        mistral: "<span class=\"codicon codicon-symbol-event\"></span>",
        compatible: "<span class=\"codicon codicon-settings-gear\"></span>",
        geminicli: "<span class=\"codicon codicon-terminal\"></span>",
        qwencli: "<span class=\"codicon codicon-terminal\"></span>"
    };
    return icons[providerId] || "<span class=\"codicon codicon-settings-gear\"></span>";
}

// Actions
function selectProvider(id) {
    selectedProviderId = id;
    renderPage();
}

function refreshAccounts() {
    vscode.postMessage({ command: "refresh" });
}

function setDefaultAccount(id) {
    vscode.postMessage({ command: "setDefaultAccount", accountId: id });
}

function confirmDeleteAccount(id) {
    const account = accounts.find(a => a.id === id);
    if (confirm(`Are you sure you want to remove the account "${account.displayName}"?\nThis action cannot be undone.`)) {
        vscode.postMessage({ command: "deleteAccount", accountId: id });
    }
}

function configModelsForProvider(id) {
    vscode.postMessage({ command: "configModels", provider: id });
}

function addAccountForProvider(id) {
    const provider = providers.find(p => p.id === id);
    if (provider.authType === 'oauth') {
        vscode.postMessage({ command: "addOAuthAccount", provider: id });
    } else {
        showAddApiKeyModal(id);
    }
}

function showAddApiKeyModal(providerId) {
    const provider = providers.find(p => p.id === providerId);
    const providerName = escapeHtml(provider?.name || providerId);
    const container = document.getElementById("modal-container");

    container.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-title">Add ${providerName} Account</span>
                    <button class="modal-close" onclick="closeModal()">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Display Name</label>
                        <input type="text" id="add-display-name" class="form-input" placeholder="e.g., Personal, Work, Project X" autofocus>
                    </div>
                    <div class="form-group">
                        <label class="form-label">API Key</label>
                        <input type="password" id="add-api-key" class="form-input" placeholder="Enter your secret API key">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Custom Endpoint (Optional)</label>
                        <input type="text" id="add-endpoint" class="form-input" placeholder="https://api.your-proxy.com/v1">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitApiKeyAccount('${providerId}')">
                        <span class="codicon codicon-add"></span> Add Account
                    </button>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const input = document.getElementById("add-display-name");
        if (input) input.focus();
    }, 100);
}

function submitApiKeyAccount(providerId) {
    const displayName = document.getElementById("add-display-name").value;
    const apiKey = document.getElementById("add-api-key").value;
    const endpoint = document.getElementById("add-endpoint").value;

    if (!displayName || !apiKey) {
        showToast("Display Name and API Key are required", "error");
        return;
    }

    vscode.postMessage({
        command: "addApiKeyAccount",
        provider: providerId,
        displayName,
        apiKey,
        endpoint
    });
    closeModal();
}

function closeModal() {
    document.getElementById("modal-container").innerHTML = "";
}

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'pass';
    if (type === 'error') icon = 'error';

    toast.innerHTML = `
        <span class="codicon codicon-${icon}" style="font-size: 18px;"></span>
        <span style="flex: 1;">${message}</span>
        <button class="modal-close" style="width: 24px; height: 24px;" onclick="this.parentElement.remove()">
            <span class="codicon codicon-close" style="font-size: 12px;"></span>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'toastSlideOut 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Communication from Host
window.addEventListener("message", event => {
    const message = event.data;
    switch (message.command) {
        case "updateAccounts":
            accounts = message.accounts || [];
            if (message.antigravityQuota !== undefined) {
                antigravityQuota = message.antigravityQuota;
            }
            if (message.accountQuotaStates !== undefined) {
                accountQuotaStates = message.accountQuotaStates;
            }
            renderPage();
            break;
        case "showToast":
            showToast(message.message, message.type);
            break;
        case "updateAccountQuotaState":
            const idx = accountQuotaStates.findIndex(s => s.accountId === message.accountId);
            if (idx !== -1) {
                accountQuotaStates[idx] = message.state;
            } else {
                accountQuotaStates.push(message.state);
            }
            renderPage();
            break;
        case "updateAntigravityQuota":
            antigravityQuota = message.notice;
            renderPage();
            break;
    }
});

// Update countdowns
setInterval(() => {
    const elements = document.querySelectorAll('.quota-countdown, .quota-countdown-compact');
    elements.forEach(el => {
        const resetAt = parseInt(el.getAttribute('data-reset-at'));
        if (isNaN(resetAt)) return;

        const remaining = resetAt - Date.now();
        if (remaining <= 0) {
            el.textContent = 'Ready';
            return;
        }

        const seconds = Math.floor(remaining / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    });
}, 1000);

function _showAccountDetails(id) {
    const account = accounts.find(a => a.id === id);
    if (!account) return;
    const providerName = escapeHtml(providers.find(p => p.id === account.provider)?.name || account.provider || "");
    const displayName = escapeHtml(account.displayName || "");
    const accountId = escapeHtml(account.id || "");
    const authType = escapeHtml((account.authType || "").toUpperCase());
    const status = escapeHtml((account.status || "").toUpperCase());
    const email = escapeHtml(account.email || "");

    const container = document.getElementById("modal-container");
    container.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-title">Account Details</span>
                    <button class="modal-close" onclick="closeModal()">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Display Name</label>
                        <input type="text" class="form-input" value="${displayName}" readonly>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Provider</label>
                        <input type="text" class="form-input" value="${providerName}" readonly>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Account ID</label>
                        <input type="text" class="form-input" value="${accountId}" readonly style="font-family: monospace; font-size: 12px;">
                    </div>
                    <div class="form-group" style="display: flex; gap: 16px;">
                        <div style="flex: 1;">
                            <label class="form-label">Auth Type</label>
                            <span class="badge badge-muted">${authType}</span>
                        </div>
                        <div style="flex: 1;">
                            <label class="form-label">Status</label>
                            <span class="badge ${account.status === 'active' ? 'badge-primary' : 'badge-muted'}">${status}</span>
                        </div>
                    </div>
                    ${account.email ? `
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="text" class="form-input" value="${email}" readonly>
                    </div>` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="closeModal()">Done</button>
                </div>
            </div>
        </div>
    `;
}

// Global Exposure
window.initializeAccountManager = initializeAccountManager;
window.selectProvider = selectProvider;
window.setAccountSearch = setAccountSearch;
window.refreshAccounts = refreshAccounts;
window.setDefaultAccount = setDefaultAccount;
window.confirmDeleteAccount = confirmDeleteAccount;
window.showAccountDetails = _showAccountDetails;
window.addAccountForProvider = addAccountForProvider;
window.showAddAccountModal = () => {
    if (selectedProviderId) {
        addAccountForProvider(selectedProviderId);
    } else {
        showToast("Please select a provider from the sidebar first.", "info");
    }
};
window.submitApiKeyAccount = submitApiKeyAccount;
window.closeModal = closeModal;
window.configModelsForProvider = configModelsForProvider;

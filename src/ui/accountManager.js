/**
 * Account Manager Page JavaScript - Modern Refactor
 * Handles all UI interactions for the Account Manager WebView
 */

// VS Code API
const vscode = acquireVsCodeApi();

// State
let accounts = [];
let providers = [];
let antigravityQuota = null;
let codexRateLimits = [];
let accountQuotaStates = [];
let providerImageUris = {};
let selectedProviderId = null;

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
    providerImageUris = initialProviderImageUris || {};

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
                <span class="topbar-subtitle">Manage your multi-account AI ecosystem</span>
            </div>
            <div class="topbar-actions">
                <button class="btn btn-ghost" onclick="refreshAccounts()">
                    <span class="codicon codicon-refresh"></span> Refresh
                </button>
                <button class="btn btn-primary" onclick="showAddAccountModal()">
                    <span class="codicon codicon-add"></span> Add Account
                </button>
            </div>
        </div>
    `;
}

function renderSidebar() {
    return `
        <div class="surface sidebar">
            <div class="sidebar-header">
                <span class="sidebar-title">Providers</span>
            </div>
            <div class="provider-list">
                ${providers.map(p => {
                    const count = accounts.filter(a => a.provider === p.id).length;
                    const isActive = selectedProviderId === p.id;
                    return `
                        <button class="provider-item ${isActive ? 'active' : ''}" onclick="selectProvider('${p.id}')">
                            <span class="provider-item-icon">${getProviderIcon(p.id)}</span>
                            <span class="provider-item-name">${p.name}</span>
                            ${count > 0 ? `<span class="provider-item-count">${count}</span>` : ''}
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderContent() {
    if (!selectedProviderId) {
        return `
            <div class="surface content">
                <div class="empty-state">
                    <div class="empty-state-title">No Provider Selected</div>
                    <p class="empty-state-description">Select a provider from the sidebar to manage your accounts.</p>
                </div>
            </div>
        `;
    }

    const provider = providers.find(p => p.id === selectedProviderId);
    const providerAccounts = accounts.filter(a => a.provider === selectedProviderId);

    return `
        <div class="surface content">
            <div class="content-header">
                <div>
                    <h2 class="content-title">${provider ? provider.name : selectedProviderId}</h2>
                    <p class="topbar-subtitle">${providerAccounts.length} account(s) configured</p>
                </div>
                <div class="content-actions">
                    <button class="btn btn-ghost" onclick="configModelsForProvider('${selectedProviderId}')">
                        <span class="codicon codicon-settings"></span> Config Models
                    </button>
                    <button class="btn btn-primary" onclick="addAccountForProvider('${selectedProviderId}')">
                        <span class="codicon codicon-add"></span> Add
                    </button>
                </div>
            </div>

            ${renderAntigravityNotice()}

            <div class="account-cards">
                ${providerAccounts.length > 0 
                    ? providerAccounts.map(renderAccountCard).join('')
                    : `<div class="empty-state">
                        <div class="empty-state-title">No Accounts</div>
                        <p class="empty-state-description">You haven't added any accounts for ${provider ? provider.name : selectedProviderId} yet.</p>
                        <button class="btn btn-primary" onclick="addAccountForProvider('${selectedProviderId}')">Add First Account</button>
                       </div>`
                }
            </div>
        </div>
    `;
}

function renderAccountCard(account) {
    const isDefault = account.isDefault;
    const quotaState = accountQuotaStates.find(s => s.accountId === account.id);
    const isLimited = quotaState && quotaState.quotaExceeded;
    
    return `
        <div class="account-card-simple ${isDefault ? 'active' : ''} ${isLimited ? 'quota-limited' : ''}">
            <div class="account-card-top">
                <div class="account-avatar">
                    ${(account.displayName || 'A')[0]}
                </div>
                <div class="account-info-compact">
                    <div class="account-name-row">
                        <span class="account-name">${account.displayName}</span>
                        ${isDefault ? '<span class="badge badge-primary">Default</span>' : ''}
                        <span class="badge badge-muted">${account.authType}</span>
                    </div>
                    <div class="account-email-compact">${account.email || 'API Key Account'}</div>
                </div>
            </div>

            ${isLimited ? `
                <div class="quota-badge-compact">
                    <span class="codicon codicon-warning"></span>
                    <span>Quota Limited - Resets in <span class="quota-countdown-compact" data-reset-at="${quotaState.quotaResetAt}">...</span></span>
                </div>
            ` : ''}

            <div class="account-actions-compact">
                ${!isDefault ? `
                    <button class="btn-action btn-use" onclick="setDefaultAccount('${account.id}')">
                        <span class="codicon codicon-check"></span> Set as Default
                    </button>
                ` : `
                    <button class="btn-action btn-use" disabled style="opacity: 0.5; cursor: default;">
                        <span class="codicon codicon-star-full"></span> Current Default
                    </button>
                `}
                <button class="btn-action" title="Details" onclick="showAccountDetails('${account.id}')">
                    <span class="codicon codicon-info"></span>
                </button>
                <button class="btn-action btn-delete" title="Delete" onclick="confirmDeleteAccount('${account.id}')">
                    <span class="codicon codicon-trash"></span>
                </button>
            </div>
        </div>
    `;
}

function renderAntigravityNotice() {
    if (selectedProviderId !== 'antigravity' || !antigravityQuota) return '';
    
    return `
        <div class="quota-badge-compact" style="margin-bottom: 20px; padding: 12px;">
            <span class="codicon codicon-info"></span>
            <div style="flex: 1">
                <strong>Global Quota Notice:</strong> ${antigravityQuota.modelName || 'Gemini'} quota resets in 
                <span class="quota-countdown" data-reset-at="${antigravityQuota.resetAt}">...</span>
            </div>
        </div>
    `;
}

// Helpers
function getProviderIcon(providerId) {
    const icons = {
        antigravity: "🌌",
        codex: "🧠",
        zhipu: "💠",
        deepseek: "🔍",
        moonshot: "🌙",
        minimax: "🔷",
        kilo: "⚖️",
        deepinfra: "🚀",
        openai: "🤖",
        mistral: "🌪️",
        compatible: "🧩"
    };
    return icons[providerId] || "⚙️";
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
    if (confirm(`Are you sure you want to delete account "${account.displayName}"?`)) {
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
    const container = document.getElementById("modal-container");
    
    container.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-title">Add ${provider.name} Account</span>
                    <button class="modal-close" onclick="closeModal()">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Display Name</label>
                        <input type="text" id="add-display-name" class="form-input" placeholder="e.g. Work Account">
                    </div>
                    <div class="form-group">
                        <label class="form-label">API Key</label>
                        <input type="password" id="add-api-key" class="form-input" placeholder="sk-...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Endpoint (Optional)</label>
                        <input type="text" id="add-endpoint" class="form-input" placeholder="https://api.example.com/v1">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitApiKeyAccount('${providerId}')">Add Account</button>
                </div>
            </div>
        </div>
    `;
}

function submitApiKeyAccount(providerId) {
    const displayName = document.getElementById("add-display-name").value;
    const apiKey = document.getElementById("add-api-key").value;
    const endpoint = document.getElementById("add-endpoint").value;

    if (!displayName || !apiKey) {
        showToast("Name and API Key are required", "error");
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
    toast.innerHTML = `
        <span class="codicon codicon-${type === 'success' ? 'check' : type === 'error' ? 'error' : 'info'}"></span>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Communication from Host
window.addEventListener("message", event => {
    const message = event.data;
    switch (message.command) {
        case "updateAccounts":
            accounts = message.accounts || [];
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
                        <label class="form-label">Account ID</label>
                        <input type="text" class="form-input" value="${account.id}" readonly>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Display Name</label>
                        <input type="text" class="form-input" value="${account.displayName}" readonly>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Provider</label>
                        <input type="text" class="form-input" value="${account.provider}" readonly>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Auth Type</label>
                        <input type="text" class="form-input" value="${account.authType}" readonly>
                    </div>
                    ${account.email ? `
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="text" class="form-input" value="${account.email}" readonly>
                    </div>` : ''}
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <div class="badge ${account.status === 'active' ? 'badge-primary' : 'badge-muted'}">${account.status}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="closeModal()">Close</button>
                </div>
            </div>
        </div>
    `;
}

// Global Exposure
window.initializeAccountManager = initializeAccountManager;
window.selectProvider = selectProvider;
window.refreshAccounts = refreshAccounts;
window.setDefaultAccount = setDefaultAccount;
window.confirmDeleteAccount = confirmDeleteAccount;
window.showAccountDetails = _showAccountDetails;
window.addAccountForProvider = addAccountForProvider;
window.showAddAccountModal = () => {
    // Show a modal to select provider first if none selected
    if (selectedProviderId) {
        addAccountForProvider(selectedProviderId);
    } else {
        showToast("Select a provider first", "info");
    }
};
window.submitApiKeyAccount = submitApiKeyAccount;
window.closeModal = closeModal;
window.configModelsForProvider = configModelsForProvider;

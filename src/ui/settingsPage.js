/* GCMP Settings Page - JavaScript */

// VS Code API
const vscode = acquireVsCodeApi();

// State management
let settingsState = {
    providers: [],
    loadBalanceSettings: {},
    loadBalanceStrategies: {},
    loading: true
};

// Available load balance strategies
const LOAD_BALANCE_STRATEGIES = [
    { id: 'round-robin', name: 'Round Robin', description: 'Distribute requests evenly across accounts' },
    { id: 'quota-aware', name: 'Quota Aware', description: 'Prioritize accounts with more remaining quota' },
    { id: 'failover', name: 'Failover Only', description: 'Use primary account, switch on errors' }
];

/**
 * Initialize the settings page
 */
function initializeSettingsPage(initialData) {
    settingsState = {
        ...settingsState,
        ...initialData,
        loading: false
    };
    renderPage();
}

/**
 * Render the entire page
 */
function renderPage() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        ${renderHeader()}
        ${renderLoadBalanceSection()}
        ${renderAdvancedSection()}
        ${renderInfoSection()}
    `;

    attachEventListeners();
}

/**
 * Render header section
 */
function renderHeader() {
    return `
        <div class="settings-header">
            <h1>
                <span class="icon"></span>
                GCMP Settings
            </h1>
            <p>Configure load balancing and advanced settings for AI Chat Models</p>
        </div>
    `;
}

/**
 * Render load balance section
 */
function renderLoadBalanceSection() {
    const providers = settingsState.providers || [];

    // Filter providers that have accounts
    const providersWithAccounts = providers.filter(p => p.accountCount > 0);

    if (providersWithAccounts.length === 0) {
        return `
            <div class="settings-section">
                <h2 class="section-title">
                    ⚖️ Load Balance Settings
                    <span class="badge">Multi-Account</span>
                </h2>
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>No Accounts Configured</h3>
                    <p>Add accounts to providers to enable load balancing features</p>
                    <button class="action-button" onclick="openAccountManager()">
                        👤 Manage Accounts
                    </button>
                </div>
            </div>
        `;
    }

    return `
        <div class="settings-section">
            <h2 class="section-title">
                ⚖️ Load Balance Settings
                <span class="badge">Multi-Account</span>
            </h2>
            <div class="card-grid">
                ${providersWithAccounts.map(provider => renderProviderCard(provider)).join('')}
            </div>
        </div>
    `;
}

/**
 * Render a provider card
 */
function renderProviderCard(provider) {
    const isEnabled = settingsState.loadBalanceSettings[provider.id] || false;
    const currentStrategy = settingsState.loadBalanceStrategies[provider.id] || 'round-robin';
    const accountCount = provider.accountCount || 0;
    const statusClass = isEnabled ? 'enabled' : 'disabled';
    const statusText = isEnabled ? 'Enabled' : 'Disabled';
    const canEnable = accountCount >= 2;

    return `
        <div class="settings-card" data-provider="${provider.id}">
            <div class="card-header">
                <div class="card-title">
                    <div class="provider-icon">${getProviderIcon(provider.id)}</div>
                    <h3>${escapeHtml(provider.displayName)}</h3>
                </div>
                <span class="status-indicator ${statusClass}">
                    <span class="status-dot"></span>
                    ${statusText}
                </span>
            </div>
            <div class="card-description">
                ${getProviderDescription(provider.id)}
            </div>
            <div class="account-info">
                <span class="account-badge">
                    👤 ${accountCount} account${accountCount !== 1 ? 's' : ''}
                </span>
                ${accountCount >= 2 ? '<span class="account-badge success">Ready for LB</span>' : '<span class="account-badge warning">Need 2+ accounts</span>'}
            </div>
            <div class="toggle-container">
                <div class="toggle-label">
                    <span class="label-text">Enable Load Balancing</span>
                    <span class="label-hint">${canEnable ? 'Distribute requests across accounts' : 'Requires 2+ accounts'}</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           id="toggle-${provider.id}" 
                           ${isEnabled ? 'checked' : ''} 
                           ${!canEnable ? 'disabled' : ''}
                           onchange="handleToggleChange('${provider.id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            ${isEnabled && canEnable ? renderStrategySelector(provider.id, currentStrategy) : ''}
        </div>
    `;
}

/**
 * Render strategy selector
 */
function renderStrategySelector(providerId, currentStrategy) {
    return `
        <div class="strategy-container">
            <div class="strategy-label">
                <span class="label-text">Load Balance Strategy</span>
            </div>
            <div class="strategy-options">
                ${LOAD_BALANCE_STRATEGIES.map(strategy => `
                    <label class="strategy-option ${currentStrategy === strategy.id ? 'selected' : ''}">
                        <input type="radio" 
                               name="strategy-${providerId}" 
                               value="${strategy.id}"
                               ${currentStrategy === strategy.id ? 'checked' : ''}
                               onchange="handleStrategyChange('${providerId}', '${strategy.id}')">
                        <div class="strategy-content">
                            <span class="strategy-name">${strategy.name}</span>
                            <span class="strategy-desc">${strategy.description}</span>
                        </div>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Render advanced section
 */
function renderAdvancedSection() {
    return `
        <div class="settings-section">
            <h2 class="section-title">
                Quick Actions
            </h2>
            <div class="action-buttons">
                <button class="action-button" onclick="openAccountManager()">
                    👤 Manage Accounts
                </button>
                <button class="action-button secondary" onclick="refreshSettings()">
                    Refresh
                </button>
            </div>
        </div>
    `;
}

/**
 * Render info section
 */
function renderInfoSection() {
    return `
        <div class="divider"></div>
        <div class="info-box">
            <span class="info-icon"></span>
            <div class="info-content">
                <p><strong>About Load Balancing:</strong></p>
                <p>When enabled, requests will be distributed across multiple accounts to optimize quota usage and improve reliability. 
                If one account hits its quota limit, the system will automatically switch to another available account.</p>
            </div>
        </div>
        <div class="info-box" style="margin-top: 12px;">
            <span class="info-icon"></span>
            <div class="info-content">
                <p><strong>Load Balance Strategies:</strong></p>
                <p>• <strong>Round Robin:</strong> Requests are distributed evenly across accounts<br>
                • <strong>Quota Aware:</strong> Prioritizes accounts with more remaining quota<br>
                • <strong>Failover Only:</strong> Uses primary account, switches only on errors</p>
            </div>
        </div>
    `;
}

/**
 * Get provider icon
 */
function getProviderIcon(providerId) {
    const icons = {
        'antigravity': '',
        'codex': '🤖',
        'zhipu': '🧠',
        'moonshot': '🌙',
        'minimax': '',
        'deepseek': '',
        'compatible': ''
    };
    return icons[providerId] || '🤖';
}

/**
 * Get provider description
 */
function getProviderDescription(providerId) {
    const descriptions = {
        'antigravity': 'Google Cloud Code powered AI models with OAuth authentication',
        'codex': 'OpenAI Codex models with OAuth authentication',
        'zhipu': 'ZhipuAI GLM models with Coding Plan support',
        'moonshot': 'MoonshotAI Kimi models for coding assistance',
        'minimax': 'MiniMax models with Coding Plan features',
        'deepseek': 'DeepSeek AI models for code generation',
        'compatible': 'OpenAI/Anthropic compatible custom models'
    };
    return descriptions[providerId] || 'AI model provider';
}

/**
 * Handle toggle change
 */
function handleToggleChange(providerId, enabled) {
    // Update local state
    settingsState.loadBalanceSettings[providerId] = enabled;

    // Send message to extension
    vscode.postMessage({
        command: 'setLoadBalance',
        providerId: providerId,
        enabled: enabled
    });

    // Re-render to show/hide strategy selector
    renderPage();
    showToast(enabled ? 'Load balancing enabled' : 'Load balancing disabled', 'success');
}

/**
 * Handle strategy change
 */
function handleStrategyChange(providerId, strategy) {
    // Update local state
    settingsState.loadBalanceStrategies[providerId] = strategy;

    // Send message to extension
    vscode.postMessage({
        command: 'setLoadBalanceStrategy',
        providerId: providerId,
        strategy: strategy
    });

    // Update UI
    renderPage();
    showToast(`Strategy changed to ${strategy}`, 'success');
}

/**
 * Open account manager
 */
function openAccountManager() {
    vscode.postMessage({
        command: 'openAccountManager'
    });
}

/**
 * Refresh settings
 */
function refreshSettings() {
    vscode.postMessage({
        command: 'refresh'
    });
    showToast('Refreshing settings...', 'success');
}

/**
 * Update card status indicator
 */
function updateCardStatus(providerId, enabled) {
    const card = document.querySelector(`[data-provider="${providerId}"]`);
    if (!card) return;

    const statusIndicator = card.querySelector('.status-indicator');
    if (statusIndicator) {
        statusIndicator.className = `status-indicator ${enabled ? 'enabled' : 'disabled'}`;
        statusIndicator.innerHTML = `
            <span class="status-dot"></span>
            ${enabled ? 'Enabled' : 'Disabled'}
        `;
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? 'OK' : 'NO'}</span>
        <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
    // Add any additional event listeners here
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, char => map[char]);
}

/**
 * Handle messages from extension
 */
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateState':
            settingsState = {
                ...settingsState,
                ...message.data
            };
            renderPage();
            break;
        case 'showToast':
            showToast(message.message, message.type);
            break;
    }
});

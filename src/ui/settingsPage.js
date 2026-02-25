/* GCMP Settings Page - JavaScript */

// VS Code API
const vscode = acquireVsCodeApi();

// State management
let settingsState = {
	providers: [],
	loadBalanceSettings: {},
	loadBalanceStrategies: {},
	providerSearchQuery: "",
	loading: true,
};

// Available load balance strategies
const LOAD_BALANCE_STRATEGIES = [
	{
		id: "round-robin",
		name: "Round Robin",
		description: "Distribute requests evenly across accounts",
	},
	{
		id: "quota-aware",
		name: "Quota Aware",
		description: "Prioritize accounts with more remaining quota",
	},
	{
		id: "failover",
		name: "Failover Only",
		description: "Use primary account, switch on errors",
	},
];

/**
 * Initialize the settings page
 */
function _initializeSettingsPage(initialData) {
	settingsState = {
		...settingsState,
		...initialData,
		loading: false,
	};
	renderPage();
}

/**
 * Render the entire page
 */
function renderPage() {
	const app = document.getElementById("app");
	if (!app) return;

	app.innerHTML = `
        ${renderHeader()}
        ${renderLoadBalanceSection()}
	${renderProviderCatalogSection()}
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
	const providersWithAccounts = providers.filter((p) => p.accountCount > 0);

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
                ${providersWithAccounts.map((provider) => renderProviderCard(provider)).join("")}
            </div>
        </div>
    `;
}

function renderProviderCatalogSection() {
	const providers = settingsState.providers || [];
	const query = (settingsState.providerSearchQuery || "").trim().toLowerCase();
	const filteredProviders = providers.filter((provider) => {
		if (!query) {
			return true;
		}
		return (
			provider.id.toLowerCase().includes(query) ||
			provider.displayName.toLowerCase().includes(query) ||
			(provider.description || "").toLowerCase().includes(query)
		);
	});

	const grouped = groupProvidersByCategory(filteredProviders);
	const hasResults = filteredProviders.length > 0;

	return `
        <div class="settings-section">
            <h2 class="section-title">
                🧩 Provider Configuration
                <span class="badge">Unified</span>
            </h2>
            <div class="provider-catalog-toolbar">
                <input
                    class="provider-search-input"
                    id="provider-search-input"
                    type="text"
                    placeholder="Search provider by name, id, or description"
                    value="${escapeHtml(settingsState.providerSearchQuery || "")}" />
            </div>
            ${
							hasResults
								? Object.entries(grouped)
										.map(
											([category, categoryProviders]) => `
                    <div class="provider-category-group">
                        <h3 class="provider-category-title">${getCategoryLabel(category)}</h3>
                        <div class="provider-list-grid">
                            ${categoryProviders.map((provider) => renderProviderCatalogItem(provider)).join("")}
                        </div>
                    </div>
                `,
										)
										.join("")
								: `<div class="empty-state compact"><p>No providers match your search.</p></div>`
						}
        </div>
    `;
}

function renderProviderCatalogItem(provider) {
	const accountCount = provider.accountCount || 0;
	const capabilityBadges = [
		provider.supportsApiKey ? "API Key" : null,
		provider.supportsOAuth ? "OAuth" : null,
		provider.supportsBaseUrl ? "Base URL" : null,
	]
		.filter(Boolean)
		.map((badge) => `<span class="account-badge">${badge}</span>`)
		.join("");

	return `
        <div class="provider-catalog-item" data-provider-item="${provider.id}">
            <div class="provider-catalog-head">
                <div class="provider-title-wrap">
					<div class="provider-icon">${escapeHtml(provider.icon || "🤖")}</div>
                    <div>
                        <h4>${escapeHtml(provider.displayName)}</h4>
						<p>${escapeHtml(provider.description || "AI model provider")}</p>
                    </div>
                </div>
                <span class="account-badge">👤 ${accountCount}</span>
            </div>
            <div class="provider-capabilities">${capabilityBadges}</div>
			${renderProviderEditor(provider)}
            <div class="provider-actions">
                <button class="action-button secondary compact" onclick="openProviderSettings('${provider.id}')">
                    Open Settings
                </button>
                ${
									provider.supportsConfigWizard
										? `<button class="action-button compact" onclick="runProviderWizard('${provider.id}')">Run Wizard</button>`
										: ""
								}
            </div>
        </div>
    `;
}

function renderProviderEditor(provider) {
	const endpointOptions = getEndpointOptions(provider.id);
	const endpointField = endpointOptions.length
		? `
			<div class="provider-editor-field">
				<label for="provider-endpoint-${provider.id}">Endpoint</label>
				<select id="provider-endpoint-${provider.id}">
					${endpointOptions
						.map(
							(option) => `
						<option value="${option.value}" ${provider.endpoint === option.value ? "selected" : ""}>${option.label}</option>
					`,
						)
						.join("")}
				</select>
			</div>
		`
		: "";

	const apiKeyField = provider.supportsApiKey
		? `
			<div class="provider-editor-field">
				<label for="provider-apikey-${provider.id}">API Key</label>
				<input
					id="provider-apikey-${provider.id}"
					type="password"
					placeholder="${provider.hasApiKey ? "Stored (enter to replace / leave blank to keep)" : "Enter API key"}" />
			</div>
		`
		: "";

	const baseUrlField = provider.supportsBaseUrl
		? `
			<div class="provider-editor-field">
				<label for="provider-baseurl-${provider.id}">Base URL</label>
				<input
					id="provider-baseurl-${provider.id}"
					type="text"
					value="${escapeHtml(provider.baseUrl || "")}"
					placeholder="Leave empty to use default" />
			</div>
		`
		: "";

	return `
		<div class="provider-editor-grid" data-provider-editor="${provider.id}">
			${apiKeyField}
			${baseUrlField}
			${endpointField}
			<div class="provider-editor-actions">
				<button class="action-button compact" onclick="saveProviderSettings('${provider.id}')">
					Save
				</button>
			</div>
		</div>
	`;
}

function groupProvidersByCategory(providers) {
	return providers.reduce((acc, provider) => {
		const category = provider.category || "other";
		if (!acc[category]) {
			acc[category] = [];
		}
		acc[category].push(provider);
		return acc;
	}, {});
}

function getCategoryLabel(category) {
	const labels = {
		openai: "OpenAI SDK",
		anthropic: "Anthropic SDK",
		oauth: "OAuth Required",
	};
	return labels[category] || "Other";
}

/**
 * Render a provider card
 */
function renderProviderCard(provider) {
	const isEnabled = settingsState.loadBalanceSettings[provider.id] || false;
	const currentStrategy =
		settingsState.loadBalanceStrategies[provider.id] || "round-robin";
	const accountCount = provider.accountCount || 0;
	const statusClass = isEnabled ? "enabled" : "disabled";
	const statusText = isEnabled ? "Enabled" : "Disabled";
	const canEnable = accountCount >= 2;

	return `
        <div class="settings-card" data-provider="${provider.id}">
            <div class="card-header">
                <div class="card-title">
					<div class="provider-icon">${escapeHtml(provider.icon || "🤖")}</div>
                    <h3>${escapeHtml(provider.displayName)}</h3>
                </div>
                <span class="status-indicator ${statusClass}">
                    <span class="status-dot"></span>
                    ${statusText}
                </span>
            </div>
            <div class="card-description">
				${escapeHtml(provider.description || "AI model provider")}
            </div>
            <div class="account-info">
                <span class="account-badge">
                    👤 ${accountCount} account${accountCount !== 1 ? "s" : ""}
                </span>
                ${accountCount >= 2 ? '<span class="account-badge success">Ready for LB</span>' : '<span class="account-badge warning">Need 2+ accounts</span>'}
            </div>
            <div class="toggle-container">
                <div class="toggle-label">
                    <span class="label-text">Enable Load Balancing</span>
                    <span class="label-hint">${canEnable ? "Distribute requests across accounts" : "Requires 2+ accounts"}</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           id="toggle-${provider.id}" 
                           ${isEnabled ? "checked" : ""} 
                           ${!canEnable ? "disabled" : ""}
                           onchange="handleToggleChange('${provider.id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            ${isEnabled && canEnable ? renderStrategySelector(provider.id, currentStrategy) : ""}
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
                ${LOAD_BALANCE_STRATEGIES.map(
									(strategy) => `
                    <label class="strategy-option ${currentStrategy === strategy.id ? "selected" : ""}">
                        <input type="radio" 
                               name="strategy-${providerId}" 
                               value="${strategy.id}"
                               ${currentStrategy === strategy.id ? "checked" : ""}
                               onchange="handleStrategyChange('${providerId}', '${strategy.id}')">
                        <div class="strategy-content">
                            <span class="strategy-name">${strategy.name}</span>
                            <span class="strategy-desc">${strategy.description}</span>
                        </div>
                    </label>
                `,
								).join("")}
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

function getEndpointOptions(providerId) {
	if (providerId === "zhipu") {
		return [
			{ label: "open.bigmodel.cn (CN)", value: "open.bigmodel.cn" },
			{ label: "api.z.ai (Global)", value: "api.z.ai" },
		];
	}
	if (providerId === "minimax") {
		return [
			{ label: "minimaxi.com (CN)", value: "minimaxi.com" },
			{ label: "minimax.io (Global)", value: "minimax.io" },
		];
	}
	return [];
}

function _saveProviderSettings(providerId) {
	const provider = (settingsState.providers || []).find(
		(p) => p.id === providerId,
	);
	if (!provider) {
		return;
	}

	const apiKeyInput = document.getElementById(`provider-apikey-${providerId}`);
	const baseUrlInput = document.getElementById(
		`provider-baseurl-${providerId}`,
	);
	const endpointInput = document.getElementById(
		`provider-endpoint-${providerId}`,
	);

	const payload = {};
	if (provider.supportsApiKey && apiKeyInput) {
		const nextApiKey = (apiKeyInput.value || "").trim();
		if (nextApiKey) {
			payload.apiKey = nextApiKey;
		}
	}
	if (provider.supportsBaseUrl && baseUrlInput) {
		payload.baseUrl = baseUrlInput.value;
	}
	if (endpointInput) {
		payload.endpoint = endpointInput.value;
	}

	vscode.postMessage({
		command: "saveProviderSettings",
		providerId,
		payload,
	});
}

function _openProviderSettings(providerId) {
	vscode.postMessage({
		command: "openProviderSettings",
		providerId,
	});
}

function _runProviderWizard(providerId) {
	vscode.postMessage({
		command: "runProviderWizard",
		providerId,
	});
}

/**
 * Handle toggle change
 */
function _handleToggleChange(providerId, enabled) {
	// Update local state
	settingsState.loadBalanceSettings[providerId] = enabled;

	// Send message to extension
	vscode.postMessage({
		command: "setLoadBalance",
		providerId: providerId,
		enabled: enabled,
	});

	// Re-render to show/hide strategy selector
	renderPage();
	showToast(
		enabled ? "Load balancing enabled" : "Load balancing disabled",
		"success",
	);
}

/**
 * Handle strategy change
 */
function _handleStrategyChange(providerId, strategy) {
	// Update local state
	settingsState.loadBalanceStrategies[providerId] = strategy;

	// Send message to extension
	vscode.postMessage({
		command: "setLoadBalanceStrategy",
		providerId: providerId,
		strategy: strategy,
	});

	// Update UI
	renderPage();
	showToast(`Strategy changed to ${strategy}`, "success");
}

/**
 * Open account manager
 */
function _openAccountManager() {
	vscode.postMessage({
		command: "openAccountManager",
	});
}

/**
 * Refresh settings
 */
function _refreshSettings() {
	vscode.postMessage({
		command: "refresh",
	});
	showToast("Refreshing settings...", "success");
}

/**
 * Show toast notification
 */
function showToast(message, type = "success") {
	// Remove existing toast
	const existingToast = document.querySelector(".toast");
	if (existingToast) {
		existingToast.remove();
	}

	const toast = document.createElement("div");
	toast.className = `toast ${type}`;
	toast.innerHTML = `
        <span>${type === "success" ? "OK" : "NO"}</span>
        <span>${escapeHtml(message)}</span>
    `;
	document.body.appendChild(toast);

	// Auto remove after 3 seconds
	setTimeout(() => {
		toast.style.animation = "slideIn 0.3s ease reverse";
		setTimeout(() => toast.remove(), 300);
	}, 3000);
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
	const searchInput = document.getElementById("provider-search-input");
	if (searchInput) {
		searchInput.addEventListener("input", (event) => {
			const target = event.target;
			settingsState.providerSearchQuery = target?.value || "";
			renderPage();
		});
	}
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
	if (!text) return "";
	const map = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#039;",
	};
	return String(text).replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Handle messages from extension
 */
window.addEventListener("message", (event) => {
	const message = event.data;
	switch (message.command) {
		case "updateState":
			settingsState = {
				...settingsState,
				...message.data,
			};
			renderPage();
			break;
		case "showToast":
			showToast(message.message, message.type);
			break;
	}
});

// Expose handlers for inline HTML event attributes
window.initializeSettingsPage = _initializeSettingsPage;
window.handleToggleChange = _handleToggleChange;
window.handleStrategyChange = _handleStrategyChange;
window.openAccountManager = _openAccountManager;
window.openProviderSettings = _openProviderSettings;
window.refreshSettings = _refreshSettings;
window.runProviderWizard = _runProviderWizard;
window.saveProviderSettings = _saveProviderSettings;

// Ask extension for current state when the page loads
window.addEventListener("DOMContentLoaded", () => {
	vscode.postMessage({
		command: "refresh",
	});
});

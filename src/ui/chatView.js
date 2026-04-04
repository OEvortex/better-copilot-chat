/* Copilot ++ Chat View */
const vscode = acquireVsCodeApi();

const defaultState = {
    providers: [],
    activeProviderId: '',
    snapshots: {},
    busy: false,
    statusText: 'Loading providers...',
    workspaceContext: null,
    promptMode: 'general'
};

let state = vscode.getState() || defaultState;

function initializeChatView() {
    state = normalizeState(state);
    render();
    window.addEventListener('message', (event) => {
        handleMessage(event.data);
    });
    vscode.postMessage({ command: 'ready' });
}

function normalizeState(value) {
    const next = {
        ...defaultState,
        ...(value || {})
    };
    next.providers = Array.isArray(next.providers) ? next.providers : [];
    next.snapshots =
        next.snapshots && typeof next.snapshots === 'object' ? next.snapshots : {};
    return next;
}

function getActiveSnapshot() {
    return (
        state.snapshots?.[state.activeProviderId] || {
            providerId: state.activeProviderId,
            modelId: '',
            models: [],
            messages: []
        }
    );
}

function persistState() {
    vscode.setState(state);
}

function handleMessage(message) {
    if (!message || typeof message !== 'object') {
        return;
    }

    switch (message.command) {
        case 'bootstrap': {
            const payload = message.payload || {};
            state.providers = Array.isArray(payload.providers)
                ? payload.providers
                : state.providers;
            state.activeProviderId = payload.activeProviderId || state.activeProviderId;
            state.snapshots = {
                ...state.snapshots,
                [payload.snapshot.providerId]: payload.snapshot
            };
            state.workspaceContext = payload.snapshot.workspaceContext || null;
            state.promptMode = payload.snapshot.promptMode || 'general';
            state.statusText = buildStatusText(payload.snapshot);
            state.busy = false;
            break;
        }
        case 'providerSnapshot': {
            const payload = message.payload || {};
            state.activeProviderId = payload.providerId || state.activeProviderId;
            state.snapshots = {
                ...state.snapshots,
                [payload.providerId]: payload
            };
            state.workspaceContext = payload.workspaceContext || state.workspaceContext;
            state.promptMode = payload.promptMode || state.promptMode;
            if (!state.busy) {
                state.statusText = buildStatusText(payload);
            }
            break;
        }
        case 'requestStarted': {
            const payload = message.payload || {};
            const snapshot = getActiveSnapshot();
            const messages = Array.isArray(snapshot.messages)
                ? [...snapshot.messages]
                : [];
            messages.push({
                role: 'user',
                content: payload.prompt || '',
                requestId: payload.requestId
            });
            messages.push({
                role: 'assistant',
                content: '',
                requestId: payload.requestId,
                isStreaming: true
            });
            state.snapshots = {
                ...state.snapshots,
                [payload.providerId]: {
                    ...snapshot,
                    providerId: payload.providerId,
                    messages
                }
            };
            state.activeProviderId = payload.providerId || state.activeProviderId;
            state.busy = true;
            state.statusText = 'Generating response...';
            break;
        }
        case 'requestThinking': {
            const payload = message.payload || {};
            appendMessage({
                role: 'assistant',
                content: payload.thinking || '',
                requestId: payload.requestId,
                kind: 'thinking'
            });
            break;
        }
        case 'requestToolCall': {
            const payload = message.payload || {};
            appendMessage({
                role: 'assistant',
                content: JSON.stringify(payload.toolInput || {}, null, 2),
                requestId: payload.requestId,
                kind: 'tool',
                toolName: payload.toolName,
                toolCallId: payload.toolCallId
            });
            break;
        }
        case 'requestDelta': {
            const payload = message.payload || {};
            updateStreamingMessage(payload.requestId, payload.delta || '');
            break;
        }
        case 'requestComplete': {
            const payload = message.payload || {};
            finalizeStreamingMessage(payload.requestId);
            state.busy = false;
            state.statusText = 'Response ready.';
            break;
        }
        case 'requestFailed': {
            const payload = message.payload || {};
            if (payload.rollback) {
                removeRequestMessages(payload.requestId);
            } else {
                finalizeStreamingMessage(payload.requestId, payload.message, true);
            }
            state.busy = false;
            state.statusText = payload.cancelled
                ? 'Request cancelled.'
                : payload.message || 'Request failed.';
            break;
        }
    }

    persistState();
    render();
}

function appendMessage(entry) {
    const snapshot = getActiveSnapshot();
    const messages = Array.isArray(snapshot.messages)
        ? [...snapshot.messages, entry]
        : [entry];
    state.snapshots = {
        ...state.snapshots,
        [state.activeProviderId]: {
            ...snapshot,
            messages
        }
    };
}

function updateStreamingMessage(requestId, delta) {
    const snapshot = getActiveSnapshot();
    const messages = Array.isArray(snapshot.messages)
        ? [...snapshot.messages]
        : [];
    const index = messages.findIndex(
        (message) => message.requestId === requestId && message.role === 'assistant'
    );
    if (index >= 0) {
        messages[index] = {
            ...messages[index],
            content: `${messages[index].content || ''}${delta}`,
            isStreaming: true
        };
    }
    state.snapshots = {
        ...state.snapshots,
        [state.activeProviderId]: {
            ...snapshot,
            messages
        }
    };
}

function finalizeStreamingMessage(requestId, fallbackText = '', isError = false) {
    const snapshot = getActiveSnapshot();
    const messages = Array.isArray(snapshot.messages)
        ? [...snapshot.messages]
        : [];
    const index = messages.findIndex(
        (message) => message.requestId === requestId && message.role === 'assistant'
    );
    if (index >= 0) {
        messages[index] = {
            ...messages[index],
            content: messages[index].content || fallbackText,
            isStreaming: false,
            isError
        };
    }
    state.snapshots = {
        ...state.snapshots,
        [state.activeProviderId]: {
            ...snapshot,
            messages
        }
    };
}

function removeRequestMessages(requestId) {
    const snapshot = getActiveSnapshot();
    const messages = Array.isArray(snapshot.messages)
        ? snapshot.messages.filter((message) => message.requestId !== requestId)
        : [];
    state.snapshots = {
        ...state.snapshots,
        [state.activeProviderId]: {
            ...snapshot,
            messages
        }
    };
}

function buildStatusText(snapshot) {
    if (!snapshot) {
        return 'Loading...';
    }
    const provider = state.providers.find((item) => item.id === snapshot.providerId);
    const model = snapshot.models?.find((item) => item.id === snapshot.modelId);
    if (!provider) {
        return 'Select a provider to begin.';
    }
    if (!model) {
        return `${provider.displayName}: choose a model.`;
    }
    const mode = snapshot.promptMode ? ` · ${snapshot.promptMode}` : '';
    return `${provider.displayName} · ${model.name}${mode}`;
}

function render() {
    const app = document.getElementById('app');
    if (!app) {
        return;
    }

    const snapshot = getActiveSnapshot();
    const providersHtml = renderProviderOptions(state.providers, state.activeProviderId);
    const modelsHtml = renderModelOptions(snapshot.models || [], snapshot.modelId || '');
    const activeMode = snapshot.promptMode || state.promptMode || 'general';
    const modesHtml = renderModeOptions(activeMode);
    const messagesHtml = renderMessages(snapshot.messages || []);
    const contextHtml = renderWorkspaceContext(
        state.workspaceContext,
        snapshot,
        activeMode
    );

    app.innerHTML = `
        <div class="chat-card">
            <div class="chat-toolbar">
                <div class="chat-field">
                    <label for="provider-select">Provider</label>
                    <select id="provider-select" ${
                        state.busy ? 'disabled' : ''
                    }>${providersHtml}</select>
                </div>
                <div class="chat-field">
                    <label for="model-select">Model</label>
                    <select
                        id="model-select"
                        ${snapshot.models?.length && !state.busy ? '' : 'disabled'}
                    >
                        ${modelsHtml}
                    </select>
                </div>
                <div class="chat-field">
                    <label for="mode-select">Mode</label>
                    <select id="mode-select" ${state.busy ? 'disabled' : ''}>
                        ${modesHtml}
                    </select>
                </div>
                <div class="chat-field">
                    <label>&nbsp;</label>
                    <button id="clear-button" type="button" class="secondary" ${
                        state.busy ? 'disabled' : ''
                    }>Clear</button>
                </div>
                <div class="chat-field">
                    <label>&nbsp;</label>
                    <button id="stop-button" type="button" ${
                        state.busy ? '' : 'disabled'
                    }>Stop</button>
                </div>
            </div>
            <div class="chat-status">${escapeHtml(state.statusText || '')}</div>
            <div class="chat-context">${contextHtml}</div>
            <div id="messages" class="chat-messages">
                ${messagesHtml}
            </div>
            <form id="composer" class="chat-composer">
                <textarea
                    id="prompt"
                    placeholder="Ask a question or describe the change you want..."
                    ${state.busy ? 'disabled' : ''}
                ></textarea>
                <div class="chat-composer-actions">
                    <button id="send-button" type="submit" ${state.busy ? 'disabled' : ''}>
                        Send
                    </button>
                </div>
            </form>
            <div class="chat-footer">
                <span>Use <code>Shift+Enter</code> for a new line.</span>
                <span>${state.busy ? 'Working...' : 'Ready'}</span>
            </div>
        </div>
    `;

    attachListeners();
    scrollMessagesToBottom();
}

function renderProviderOptions(providers, activeProviderId) {
    if (!providers.length) {
        return '<option value="">No providers available</option>';
    }

    return providers
        .map(
            (provider) => `
                <option value="${escapeHtml(provider.id)}" ${
                provider.id === activeProviderId ? 'selected' : ''
            }>
                    ${escapeHtml(provider.displayName)}
                </option>
            `
        )
        .join('');
}

function renderModelOptions(models, activeModelId) {
    if (!models.length) {
        return '<option value="">No models available</option>';
    }

    return models
        .map(
            (model) => `
                <option value="${escapeHtml(model.id)}" ${
                model.id === activeModelId ? 'selected' : ''
            }>
                    ${escapeHtml(model.name)}
                </option>
            `
        )
        .join('');
}

function renderModeOptions(activeMode) {
    return ['general', 'plan', 'implement', 'debug', 'explain']
        .map(
            (mode) => `
                <option value="${escapeHtml(mode)}" ${
                mode === activeMode ? 'selected' : ''
            }>
                    ${escapeHtml(mode.charAt(0).toUpperCase() + mode.slice(1))}
                </option>
            `
        )
        .join('');
}

function renderWorkspaceContext(context, snapshot, promptMode) {
    const parts = [];
    if (context?.workspaceName) {
        parts.push(`<span class="chat-chip">Workspace: ${escapeHtml(context.workspaceName)}</span>`);
    }
    if (context?.activeFile) {
        parts.push(`<span class="chat-chip">File: ${escapeHtml(context.activeFile)}</span>`);
    }
    if (context?.selectionRange) {
        parts.push(
            `<span class="chat-chip">Selection: ${escapeHtml(context.selectionRange)}</span>`
        );
    }
    if (snapshot?.includeWorkspaceContext === false) {
        parts.push('<span class="chat-chip chat-chip-muted">Workspace context off</span>');
    }
    if (snapshot?.includeSelection === false) {
        parts.push('<span class="chat-chip chat-chip-muted">Selection off</span>');
    }
    if (snapshot?.promptMode) {
        parts.push(
            `<span class="chat-chip chat-chip-accent">Mode: ${escapeHtml(snapshot.promptMode)}</span>`
        );
    }
    if (promptMode && !snapshot?.promptMode) {
        parts.push(
            `<span class="chat-chip chat-chip-accent">Mode: ${escapeHtml(promptMode)}</span>`
        );
    }
    parts.push(
        `<button type="button" class="chat-chip-button" data-toggle-context="workspace">${
            snapshot?.includeWorkspaceContext === false
                ? 'Include workspace'
                : 'Exclude workspace'
        }</button>`
    );
    parts.push(
        `<button type="button" class="chat-chip-button" data-toggle-context="selection">${
            snapshot?.includeSelection === false
                ? 'Include selection'
                : 'Exclude selection'
        }</button>`
    );
    return parts.length
        ? `<div class="chat-context-row">${parts.join('')}</div>`
        : '<div class="chat-empty chat-empty-compact">No editor context available.</div>';
}

function renderMessages(messages) {
    if (!messages.length) {
        return `
            <div class="chat-empty">
                Pick a provider and model, then start a conversation. This view uses the
                models registered by the extension instead of Copilot Chat.
            </div>
        `;
    }

    return messages
        .map((message) => {
            const classes = [
                'chat-message',
                message.role === 'user' ? 'chat-message-user' : 'chat-message-assistant',
                message.isError ? 'chat-message-error' : '',
                message.isStreaming ? 'chat-message-streaming' : '',
                message.kind === 'thinking' ? 'chat-message-thinking' : '',
                message.kind === 'tool' ? 'chat-message-tool' : ''
            ]
                .filter(Boolean)
                .join(' ');

            const label =
                message.kind === 'tool'
                    ? message.toolName || 'Tool call'
                    : message.kind === 'thinking'
                        ? 'Thinking'
                        : message.role === 'user'
                            ? 'You'
                            : 'Assistant';
            return `
                <div class="${classes}">
                    <strong>${label}</strong>
                    <div>${
                        message.kind === 'tool'
                            ? `<pre>${escapeHtml(message.content || '')}</pre>`
                            : escapeHtml(message.content || '') || '&nbsp;'
                    }</div>
                </div>
            `;
        })
        .join('');
}

function attachListeners() {
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    const modeSelect = document.getElementById('mode-select');
    const composer = document.getElementById('composer');
    const prompt = document.getElementById('prompt');
    const clearButton = document.getElementById('clear-button');
    const stopButton = document.getElementById('stop-button');
    const contextButtons = document.querySelectorAll('[data-toggle-context]');

    providerSelect?.addEventListener('change', (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLSelectElement)) {
            return;
        }
        vscode.postMessage({
            command: 'selectProvider',
            providerId: target.value
        });
    });

    modelSelect?.addEventListener('change', (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLSelectElement)) {
            return;
        }
        vscode.postMessage({
            command: 'selectModel',
            providerId: state.activeProviderId,
            modelId: target.value
        });
    });

    modeSelect?.addEventListener('change', (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLSelectElement)) {
            return;
        }
        state.promptMode = target.value;
        persistState();
        render();
        vscode.postMessage({
            command: 'setPromptMode',
            providerId: state.activeProviderId,
            mode: target.value
        });
    });

    composer?.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = prompt;
        if (!(input instanceof HTMLTextAreaElement)) {
            return;
        }

        const text = input.value.trim();
        if (!text || state.busy) {
            return;
        }

        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        state.busy = true;
        state.statusText = 'Sending...';
        persistState();
        render();
        vscode.postMessage({
            command: 'sendMessage',
            providerId: state.activeProviderId,
            requestId,
            text
        });
        input.value = '';
    });

    prompt?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            composer?.requestSubmit();
        }
    });

    clearButton?.addEventListener('click', () => {
        if (state.busy) {
            return;
        }
        vscode.postMessage({
            command: 'clearConversation',
            providerId: state.activeProviderId
        });
    });

    contextButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            if (state.busy) {
                return;
            }
            const target = event.currentTarget;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const kind = target.dataset.toggleContext;
            vscode.postMessage({
                command: 'toggleContext',
                providerId: state.activeProviderId,
                kind
            });
        });
    });

    stopButton?.addEventListener('click', () => {
        vscode.postMessage({ command: 'cancelRequest' });
    });
}

function scrollMessagesToBottom() {
    const messages = document.getElementById('messages');
    if (messages) {
        messages.scrollTop = messages.scrollHeight;
    }
}

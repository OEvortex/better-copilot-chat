import * as vscode from 'vscode';
import { getAllProviders } from '../utils';
import chatViewCss from './chatView.css?raw';
import chatViewJs from './chatView.js?raw';

type ChatRole = 'user' | 'assistant';
type PromptMode = 'general' | 'plan' | 'implement' | 'debug' | 'explain';

interface ChatMessageEntry {
    role: ChatRole;
    content: string;
    requestId?: string;
    isStreaming?: boolean;
    isError?: boolean;
    kind?: 'text' | 'thinking' | 'tool';
    toolName?: string;
    toolCallId?: string;
}

interface ChatProviderInfo {
    id: string;
    displayName: string;
    description?: string;
    vendor: string;
}

interface ChatModelInfo {
    id: string;
    name: string;
    vendor: string;
    family?: string;
    version?: string;
    detail?: string;
    isDefault?: boolean;
}

interface WorkspaceContextSummary {
    workspaceName?: string;
    activeFile?: string;
    activeFileLanguage?: string;
    selection?: string;
    selectionRange?: string;
}

interface ProviderSession {
    modelId?: string;
    promptMode: PromptMode;
    includeWorkspaceContext: boolean;
    includeSelection: boolean;
    messages: ChatMessageEntry[];
}

interface SerializedProviderSnapshot {
    providerId: string;
    modelId?: string;
    models: ChatModelInfo[];
    messages: ChatMessageEntry[];
    promptMode: PromptMode;
    workspaceContext: WorkspaceContextSummary;
    includeWorkspaceContext: boolean;
    includeSelection: boolean;
}

interface BootstrapPayload {
    providers: ChatProviderInfo[];
    activeProviderId: string;
    snapshot: SerializedProviderSnapshot;
}

const PROMPT_MODES: Record<PromptMode, { label: string; instruction: string }> =
    {
        general: {
            label: 'General',
            instruction:
                'Answer the user directly and keep the response concise.'
        },
        plan: {
            label: 'Plan',
            instruction:
                'First outline a clear implementation plan, risks, and affected files.'
        },
        implement: {
            label: 'Implement',
            instruction:
                'Focus on code changes, file edits, and concrete implementation details.'
        },
        debug: {
            label: 'Debug',
            instruction:
                'Diagnose root cause first, then propose or apply the smallest fix.'
        },
        explain: {
            label: 'Explain',
            instruction:
                'Explain the code or issue clearly and include concise context.'
        }
    };

function toLanguageModelMessages(
    messages: ChatMessageEntry[]
): vscode.LanguageModelChatMessage[] {
    return messages
        .filter(
            (message) => message.kind !== 'thinking' && message.kind !== 'tool'
        )
        .map((message) =>
            message.role === 'user'
                ? vscode.LanguageModelChatMessage.User(message.content)
                : vscode.LanguageModelChatMessage.Assistant(message.content)
        );
}

function serializeModel(model: vscode.LanguageModelChat): ChatModelInfo {
    return {
        id: model.id,
        name: model.name,
        vendor: model.vendor,
        family: model.family,
        version: model.version,
        detail: model.detail,
        isDefault: model.isDefault
    };
}

function getModeInstruction(mode: PromptMode): string {
    return PROMPT_MODES[mode]?.instruction || PROMPT_MODES.general.instruction;
}

function formatWorkspaceContext(context: WorkspaceContextSummary): string {
    const lines: string[] = [];
    if (context.workspaceName) {
        lines.push(`Workspace: ${context.workspaceName}`);
    }
    if (context.activeFile) {
        lines.push(`Active file: ${context.activeFile}`);
    }
    if (context.activeFileLanguage) {
        lines.push(`Language: ${context.activeFileLanguage}`);
    }
    if (context.selectionRange) {
        lines.push(`Selection range: ${context.selectionRange}`);
    }
    if (context.selection) {
        lines.push(`Selection:\n${context.selection}`);
    }
    return lines.join('\n');
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'copilotHelperChatView';

    private readonly context: vscode.ExtensionContext;
    private view: vscode.WebviewView | undefined;
    private readonly sessions = new Map<string, ProviderSession>();
    private readonly providers: ChatProviderInfo[];
    private activeProviderId: string;
    private currentRequest?: vscode.CancellationTokenSource;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.providers = getAllProviders()
            .slice()
            .sort((a, b) =>
                a.displayName.localeCompare(b.displayName, undefined, {
                    sensitivity: 'base'
                })
            )
            .map((provider) => ({
                id: provider.id,
                displayName: provider.displayName,
                description: provider.description,
                vendor: `chp.${provider.id}`
            }));

        const storedProviderId = context.globalState.get<string>(
            'chp.chat.activeProviderId'
        );
        this.activeProviderId =
            storedProviderId &&
            this.providers.some((provider) => provider.id === storedProviderId)
                ? storedProviderId
                : this.providers[0]?.id || '';

        context.subscriptions.push(
            vscode.lm.onDidChangeChatModels(() => {
                void this.refreshActiveProviderSnapshot();
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                void this.refreshActiveProviderSnapshot();
            }),
            vscode.window.onDidChangeTextEditorSelection(() => {
                void this.refreshActiveProviderSnapshot();
            })
        );
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            retainContextWhenHidden: true
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        const messageDisposable = webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message?.command) {
                    case 'ready':
                        await this.postBootstrap();
                        break;
                    case 'selectProvider':
                        await this.handleSelectProvider(
                            String(message.providerId || '')
                        );
                        break;
                    case 'selectModel':
                        await this.handleSelectModel(
                            String(message.providerId || ''),
                            String(message.modelId || '')
                        );
                        break;
                    case 'setPromptMode':
                        await this.handleSetPromptMode(
                            String(message.providerId || ''),
                            String(message.mode || 'general') as PromptMode
                        );
                        break;
                    case 'toggleContext':
                        await this.handleToggleContext(
                            String(message.providerId || ''),
                            message.kind === 'selection'
                                ? 'selection'
                                : 'workspace'
                        );
                        break;
                    case 'sendMessage':
                        await this.handleSendMessage({
                            providerId: String(message.providerId || ''),
                            requestId: String(message.requestId || ''),
                            text: String(message.text || '')
                        });
                        break;
                    case 'cancelRequest':
                        this.currentRequest?.cancel();
                        break;
                    case 'clearConversation':
                        await this.handleClearConversation(
                            String(message.providerId || '')
                        );
                        break;
                }
            }
        );

        webviewView.onDidDispose(() => {
            messageDisposable.dispose();
            this.currentRequest?.dispose();
            this.currentRequest = undefined;
            this.view = undefined;
        });
    }

    private async postBootstrap(): Promise<void> {
        if (!this.view) {
            return;
        }

        const snapshot = await this.getProviderSnapshot(this.activeProviderId);
        const payload: BootstrapPayload = {
            providers: this.providers,
            activeProviderId: this.activeProviderId,
            snapshot
        };
        await this.postMessage({
            command: 'bootstrap',
            payload
        });
    }

    private async refreshActiveProviderSnapshot(): Promise<void> {
        if (!this.view) {
            return;
        }

        const snapshot = await this.getProviderSnapshot(this.activeProviderId);
        await this.postMessage({
            command: 'providerSnapshot',
            payload: snapshot
        });
    }

    private getOrCreateSession(providerId: string): ProviderSession {
        const existing = this.sessions.get(providerId);
        if (existing) {
            return existing;
        }

        const session: ProviderSession = { messages: [] };
        session.promptMode = 'general';
        session.includeWorkspaceContext = true;
        session.includeSelection = true;
        this.sessions.set(providerId, session);
        return session;
    }

    private async getProviderSnapshot(
        providerId: string
    ): Promise<SerializedProviderSnapshot> {
        if (!providerId) {
            return {
                providerId: '',
                modelId: undefined,
                models: [],
                messages: []
            };
        }

        const session = this.getOrCreateSession(providerId);
        const models = await this.getModels(providerId);
        const selectedModelId =
            (session.modelId &&
                models.some((model) => model.id === session.modelId) &&
                session.modelId) ||
            models.find((model) => model.isDefault)?.id ||
            models[0]?.id;

        if (selectedModelId && session.modelId !== selectedModelId) {
            session.modelId = selectedModelId;
        }

        return {
            providerId,
            modelId: session.modelId,
            models,
            messages: session.messages,
            promptMode: session.promptMode,
            workspaceContext: this.collectWorkspaceContext(),
            includeWorkspaceContext: session.includeWorkspaceContext,
            includeSelection: session.includeSelection
        };
    }

    private async getModels(providerId: string): Promise<ChatModelInfo[]> {
        if (!providerId) {
            return [];
        }

        const vendor = `chp.${providerId}`;
        const models = await vscode.lm.selectChatModels({ vendor });
        return models.map((model) => serializeModel(model));
    }

    private async handleSelectProvider(providerId: string): Promise<void> {
        if (
            !providerId ||
            !this.providers.some((provider) => provider.id === providerId)
        ) {
            return;
        }

        this.activeProviderId = providerId;
        void this.context.globalState.update(
            'chp.chat.activeProviderId',
            providerId
        );

        if (this.currentRequest) {
            this.currentRequest.cancel();
        }

        if (this.view) {
            const snapshot = await this.getProviderSnapshot(providerId);
            await this.postMessage({
                command: 'providerSnapshot',
                payload: snapshot
            });
        }
    }

    private async handleSelectModel(
        providerId: string,
        modelId: string
    ): Promise<void> {
        if (!providerId) {
            return;
        }

        const session = this.getOrCreateSession(providerId);
        session.modelId = modelId || undefined;

        if (this.view) {
            const snapshot = await this.getProviderSnapshot(providerId);
            await this.postMessage({
                command: 'providerSnapshot',
                payload: snapshot
            });
        }
    }

    private async handleSetPromptMode(
        providerId: string,
        mode: PromptMode
    ): Promise<void> {
        if (!providerId || !(mode in PROMPT_MODES)) {
            return;
        }

        const session = this.getOrCreateSession(providerId);
        session.promptMode = mode;

        if (this.view) {
            const snapshot = await this.getProviderSnapshot(providerId);
            await this.postMessage({
                command: 'providerSnapshot',
                payload: snapshot
            });
        }
    }

    private async handleToggleContext(
        providerId: string,
        kind: 'workspace' | 'selection'
    ): Promise<void> {
        if (!providerId) {
            return;
        }

        const session = this.getOrCreateSession(providerId);
        if (kind === 'workspace') {
            session.includeWorkspaceContext = !session.includeWorkspaceContext;
        } else {
            session.includeSelection = !session.includeSelection;
        }

        if (this.view) {
            const snapshot = await this.getProviderSnapshot(providerId);
            await this.postMessage({
                command: 'providerSnapshot',
                payload: snapshot
            });
        }
    }

    private async handleClearConversation(providerId: string): Promise<void> {
        if (!providerId) {
            return;
        }

        if (this.currentRequest) {
            this.currentRequest.cancel();
        }

        const session = this.getOrCreateSession(providerId);
        session.messages = [];

        if (this.view) {
            const snapshot = await this.getProviderSnapshot(providerId);
            await this.postMessage({
                command: 'providerSnapshot',
                payload: snapshot
            });
        }
    }

    private async handleSendMessage(input: {
        providerId: string;
        requestId: string;
        text: string;
    }): Promise<void> {
        const providerId = input.providerId || this.activeProviderId;
        const requestId = input.requestId || `${Date.now()}`;
        const prompt = input.text.trim();

        if (!providerId || !prompt) {
            return;
        }

        const provider = this.providers.find((item) => item.id === providerId);
        if (!provider) {
            await this.postMessage({
                command: 'requestFailed',
                payload: {
                    requestId,
                    message: 'Unknown provider selected.',
                    rollback: false
                }
            });
            return;
        }

        if (this.currentRequest) {
            await this.postMessage({
                command: 'requestFailed',
                payload: {
                    requestId,
                    message: 'Another request is already running.',
                    rollback: false
                }
            });
            return;
        }

        const session = this.getOrCreateSession(providerId);
        const snapshotBeforeRequest = session.messages.slice();
        const workspaceContext = this.collectWorkspaceContext();
        const contextualPrompt = this.buildPromptWithContext(
            prompt,
            session.promptMode,
            session.includeWorkspaceContext ? workspaceContext : undefined,
            session.includeSelection ? workspaceContext.selection : undefined
        );
        session.messages = [
            ...session.messages,
            { role: 'user', content: contextualPrompt, requestId },
            { role: 'assistant', content: '', requestId, isStreaming: true }
        ];

        await this.postMessage({
            command: 'requestStarted',
            payload: {
                requestId,
                providerId,
                prompt: contextualPrompt
            }
        });

        const availableModels = await vscode.lm.selectChatModels({
            vendor: provider.vendor
        });
        const models = availableModels.map((model) => serializeModel(model));
        const selectedModelId =
            (session.modelId &&
                models.some((model) => model.id === session.modelId) &&
                session.modelId) ||
            models.find((model) => model.isDefault)?.id ||
            models[0]?.id;
        const selectedModel = selectedModelId
            ? availableModels.find((model) => model.id === selectedModelId)
            : undefined;

        if (!selectedModel) {
            session.messages = snapshotBeforeRequest;
            await this.postMessage({
                command: 'requestFailed',
                payload: {
                    requestId,
                    message: `No chat models are currently available for ${provider.displayName}.`,
                    rollback: true
                }
            });
            return;
        }

        session.modelId = selectedModel.id;
        this.currentRequest = new vscode.CancellationTokenSource();

        try {
            const response = await selectedModel.sendRequest(
                toLanguageModelMessages(
                    session.messages.filter((message) => !message.isStreaming)
                ),
                undefined,
                this.currentRequest.token
            );

            let assistantText = '';
            for await (const chunk of response.stream) {
                if (chunk instanceof vscode.LanguageModelTextPart) {
                    assistantText += chunk.value;
                    await this.postMessage({
                        command: 'requestDelta',
                        payload: {
                            requestId,
                            delta: chunk.value
                        }
                    });
                    continue;
                }

                if (chunk instanceof vscode.LanguageModelThinkingPart) {
                    const thinkingText = Array.isArray(chunk.value)
                        ? chunk.value.join('\n')
                        : chunk.value;
                    session.messages.push({
                        role: 'assistant',
                        content: thinkingText,
                        requestId,
                        kind: 'thinking'
                    });
                    await this.postMessage({
                        command: 'requestThinking',
                        payload: {
                            requestId,
                            thinking: thinkingText
                        }
                    });
                    continue;
                }

                if (chunk instanceof vscode.LanguageModelToolCallPart) {
                    const toolContent = JSON.stringify(chunk.input, null, 2);
                    session.messages.push({
                        role: 'assistant',
                        content: toolContent,
                        requestId,
                        kind: 'tool',
                        toolName: chunk.name,
                        toolCallId: chunk.callId
                    });
                    await this.postMessage({
                        command: 'requestToolCall',
                        payload: {
                            requestId,
                            toolCallId: chunk.callId,
                            toolName: chunk.name,
                            toolInput: chunk.input
                        }
                    });
                }
            }

            session.messages = session.messages.filter(
                (message) => !message.isStreaming
            );

            if (assistantText.trim().length > 0) {
                session.messages.push({
                    role: 'assistant',
                    content: assistantText,
                    requestId,
                    kind: 'text'
                });
            }

            await this.postMessage({
                command: 'requestComplete',
                payload: {
                    requestId,
                    providerId
                }
            });

            if (this.view) {
                const snapshot = await this.getProviderSnapshot(providerId);
                await this.postMessage({
                    command: 'providerSnapshot',
                    payload: snapshot
                });
            }
        } catch (error) {
            session.messages = snapshotBeforeRequest;
            const isCancelled =
                this.currentRequest?.token.isCancellationRequested;
            const message =
                error instanceof Error
                    ? error.message
                    : 'Failed to get a response.';

            await this.postMessage({
                command: 'requestFailed',
                payload: {
                    requestId,
                    message,
                    rollback: true,
                    cancelled: isCancelled
                }
            });

            if (this.view) {
                const snapshot = await this.getProviderSnapshot(providerId);
                await this.postMessage({
                    command: 'providerSnapshot',
                    payload: snapshot
                });
            }
        } finally {
            this.currentRequest?.dispose();
            this.currentRequest = undefined;
        }
    }

    private async postMessage(message: Record<string, unknown>): Promise<void> {
        if (!this.view) {
            return;
        }

        await this.view.webview.postMessage(message);
    }

    private collectWorkspaceContext(): WorkspaceContextSummary {
        const editor = vscode.window.activeTextEditor;
        const workspaceFolder = editor
            ? vscode.workspace.getWorkspaceFolder(editor.document.uri)
            : undefined;
        const selection = editor?.selection;
        const selectionText =
            editor && selection && !selection.isEmpty
                ? editor.document.getText(selection).slice(0, 6000)
                : undefined;

        return {
            workspaceName: workspaceFolder?.name,
            activeFile: editor
                ? vscode.workspace.asRelativePath(editor.document.uri, false)
                : undefined,
            activeFileLanguage: editor?.document.languageId,
            selection:
                selectionText && selectionText.trim().length > 0
                    ? selectionText
                    : undefined,
            selectionRange:
                editor && selection && !selection.isEmpty
                    ? `L${selection.start.line + 1}-L${selection.end.line + 1}`
                    : undefined
        };
    }

    private buildPromptWithContext(
        prompt: string,
        mode: PromptMode,
        workspaceContext?: WorkspaceContextSummary,
        selection?: string
    ): string {
        const sections: string[] = [];
        sections.push(`Mode: ${PROMPT_MODES[mode].label}`);
        sections.push(`Instruction: ${getModeInstruction(mode)}`);

        if (workspaceContext) {
            const formatted = formatWorkspaceContext(workspaceContext);
            if (formatted) {
                sections.push(`Workspace context:\n${formatted}`);
            }
        }

        if (selection && selection.trim().length > 0) {
            sections.push(`Selected text:\n${selection}`);
        }

        sections.push(`User request:\n${prompt}`);
        return sections.join('\n\n');
    }

    private getHtml(webview: vscode.Webview): string {
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Copilot ++ Chat</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' ${cspSource};" />
    <style>${chatViewCss}</style>
</head>
<body>
    <div class="chat-shell">
        <div id="app" class="chat-app"></div>
    </div>
    <script>
        ${chatViewJs}
        initializeChatView();
    </script>
</body>
</html>`;
    }
}

export function registerChatView(
    context: vscode.ExtensionContext
): vscode.Disposable[] {
    const provider = new ChatViewProvider(context);
    const viewDisposable = vscode.window.registerWebviewViewProvider(
        ChatViewProvider.viewId,
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );

    const openChatCommand = vscode.commands.registerCommand(
        'chp.openChat',
        async () => {
            await vscode.commands.executeCommand(
                'workbench.view.extension.copilotHelperChat'
            );
        }
    );

    return [viewDisposable, openChatCommand];
}

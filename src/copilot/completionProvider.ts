/*---------------------------------------------------------------------------------------------
 *  InlineCompletionProvider - Inline code completion suggestions
 *
 *  Implemented based on @vscode/chat-lib library
 *  Uses FIM / NES to provide inline editing suggestions
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    createInlineCompletionsProvider,
    createNESProvider,
    IActionItem,
    ICompletionsStatusChangedEvent,
    ICompletionsStatusHandler,
    IInlineCompletionsProvider,
    INESProvider,
    INESResult,
    INotificationSender,
    IURLOpener
} from '@vscode/chat-lib';
import { CancellationToken } from '@vscode/chat-lib/dist/src/_internal/util/vs/base/common/cancellation';

import { VersionManager } from '../utils';
import { WorkspaceAdapter } from './workspaceAdapter';
import { Fetcher } from './fetcher';
import { AuthenticationService, EndpointProvider, TelemetrySender } from './mockImpl';
import { CopilotLogTarget } from './logTarget';
import { DocumentManager } from './documentManager';
import { MutableObservableWorkspace } from '@vscode/chat-lib/dist/src/_internal/platform/inlineEdits/common/observableWorkspace';
import { CopilotTextDocument } from '@vscode/chat-lib/dist/src/_internal/extension/completions-core/vscode-node/lib/src/textDocument';
import { getCompletionLogger, getConfigManager } from './singletons';

// ========================================================================
// Type Definitions
// ========================================================================

/** Token collection */
interface CompletionTokens {
    coreToken?: vscode.CancellationToken;
    completionsCts?: vscode.CancellationTokenSource;
    nesCts: vscode.CancellationTokenSource;
}

/**
 * FIM / NES inline completion
 * FIM / NES inline completion suggestions based on @vscode/chat-lib
 */
export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    // ========================================================================
    // Completion provider (fimProvider and nesProvider use lazy loading)
    // ========================================================================
    private _fimProvider: IInlineCompletionsProvider | null = null;
    private _nesProvider: INESProvider<INESResult> | null = null;
    private nesWorkspaceAdapter: WorkspaceAdapter | null = null;

    // Lazy loading auxiliary variables
    private _fetcher: Fetcher | null = null;
    private _logTarget: CopilotLogTarget | null = null;
    private _authService: AuthenticationService | null = null;
    private _telemetrySender: TelemetrySender | null = null;

    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingDebounceRequest: {
        document: vscode.TextDocument;
        position: vscode.Position;
        context: vscode.InlineCompletionContext;
        token: vscode.CancellationToken;
        resolve: (result: vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined) => void;
    } | null = null;

    private invocationCount = 0;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.disposables.push(this.onDidChangeEmitter);
    }

    // ========================================================================
    // Lazy loading Getter
    // ========================================================================

    /** Lazy load FIM provider */
    private get fimProvider(): IInlineCompletionsProvider | null {
        if (!this._fimProvider) {
            this.initializeProviders();
        }
        return this._fimProvider;
    }

    /** Lazy load NES provider */
    private get nesProvider(): INESProvider<INESResult> | null {
        if (!this._nesProvider) {
            this.initializeProviders();
        }
        return this._nesProvider;
    }

    /** Initialize provider (called when lazy loading) */
    private initializeProviders(): void {
        if (this._fimProvider && this._nesProvider) {
            return; // Already initialized
        }

        const CompletionLogger = getCompletionLogger();
        CompletionLogger.trace('[InlineCompletionProvider] Lazy load initialization FIM/NES provider');

        try {
            // Initialize shared dependencies
            this._fetcher = new Fetcher();
            this._logTarget = new CopilotLogTarget();
            this._authService = new AuthenticationService();
            this._telemetrySender = new TelemetrySender();

            // Initialize WorkspaceAdapter (if not initialized)
            // WorkspaceAdapter constructor has automatically synchronized all opened documents' content and cursor position
            if (!this.nesWorkspaceAdapter) {
                this.nesWorkspaceAdapter = new WorkspaceAdapter();
                this.disposables.push(this.nesWorkspaceAdapter);
                CompletionLogger.trace(
                    '[InlineCompletionProvider] WorkspaceAdapter initialization complete (documents have been synchronized in constructor)'
                );
            }

            // Initialize FIM provider
            this._fimProvider = createInlineCompletionsProvider({
                fetcher: this._fetcher,
                authService: this._authService,
                telemetrySender: this._telemetrySender,
                logTarget: this._logTarget,
                isRunningInTest: false,
                contextProviderMatch: async () => 0,
                statusHandler: new (class implements ICompletionsStatusHandler {
                    didChange(_: ICompletionsStatusChangedEvent) {}
                })(),
                documentManager: new DocumentManager(),
                workspace: new MutableObservableWorkspace(),
                urlOpener: new (class implements IURLOpener {
                    async open(_url: string) {}
                })(),
                editorInfo: { name: 'vscode', version: vscode.version },
                editorPluginInfo: { name: 'copilot-helper-pro', version: VersionManager.getVersion() },
                relatedPluginInfo: [],
                editorSession: {
                    sessionId: `chp-session-${Date.now()}`,
                    machineId: `chp-machine-${Math.random().toString(36).substring(7)}`
                },
                notificationSender: new (class implements INotificationSender {
                    async showWarningMessage(_message: string, ..._items: IActionItem[]) {
                        return undefined;
                    }
                })(),
                endpointProvider: new EndpointProvider()
            });

            // Initialize NES provider
            this._nesProvider = createNESProvider({
                workspace: this.nesWorkspaceAdapter.getWorkspace(),
                fetcher: this._fetcher,
                copilotTokenManager: this._authService,
                telemetrySender: this._telemetrySender,
                logTarget: this._logTarget,
                waitForTreatmentVariables: false
            });

            CompletionLogger.info('[InlineCompletionProvider] FIM/NES provider lazy loading complete');
        } catch (error) {
            CompletionLogger.error('[InlineCompletionProvider] Lazy load initialization provider failed:', error);
            throw error;
        }
    }

    // ========================================================================
    // Activation and initialization
    // ========================================================================

    activate(): void {
        const CompletionLogger = getCompletionLogger();
        CompletionLogger.trace('[InlineCompletionProvider.activate] Activation started');

        try {
            // Register inline suggestion provider
            const provider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**/*' }, this);
            this.disposables.push(provider);

            CompletionLogger.info('[InlineCompletionProvider] Activated (using lazy loading)');
        } catch (error) {
            CompletionLogger.error('[InlineCompletionProvider.activate] Activation failed:', error);
            throw error;
        }
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
        const CompletionLogger = getCompletionLogger();
        const ConfigManager = getConfigManager();
        const fimConfig = ConfigManager.getFIMConfig();
        const nesConfig = ConfigManager.getNESConfig();
        if (!fimConfig.enabled && !nesConfig.enabled) {
            CompletionLogger.trace('[InlineCompletionProvider] Completion feature not enabled');
            return undefined;
        }

        const { triggerKind } = context as { triggerKind: vscode.InlineCompletionTriggerKind };

        const triggerDesc = triggerKind === vscode.InlineCompletionTriggerKind.Invoke ? 'Manual' : 'Auto';
        CompletionLogger.trace(
            `[InlineCompletionProvider] Completion request (${triggerDesc} trigger) - ${document.fileName}`
        );

        // Debounce processing: debounce auto triggers to prevent frequent requests
        if (triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
            return new Promise(resolve => {
                // Clear previous pending debounce request
                if (this.pendingDebounceRequest) {
                    this.pendingDebounceRequest.resolve(undefined);
                }

                // Clear existing debounce timer
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }

                // Save current request info
                this.pendingDebounceRequest = { document, position, context, token, resolve };

                // Prioritize FIM's debounce config, then use NES's debounce config
                const debounceMs = Math.min(fimConfig.debounceMs, nesConfig.debounceMs);

                // Set debounce delay
                this.debounceTimer = setTimeout(() => {
                    // Check if still the latest request
                    if (this.pendingDebounceRequest?.token === token) {
                        this.debounceTimer = null;
                        this.pendingDebounceRequest = null;

                        const invocationId = ++this.invocationCount;
                        CompletionLogger.trace(`[InlineCompletionProvider] Request #${invocationId} started`);

                        const completionsCts = new vscode.CancellationTokenSource();
                        const nesCts = new vscode.CancellationTokenSource();

                        // Link external token cancellation event
                        const tokenDisposable = token.onCancellationRequested(() => {
                            completionsCts.cancel();
                            nesCts.cancel();
                        });

                        this._provideInlineCompletionItems(document, position, {
                            coreToken: token,
                            completionsCts,
                            nesCts
                        })
                            .then(result => {
                                resolve(result);
                            })
                            .catch(() => {
                                resolve(undefined);
                            })
                            .finally(() => {
                                tokenDisposable.dispose();
                                completionsCts.dispose();
                                nesCts.dispose();
                                // Delayed notification that new suggestions may be available
                                setTimeout(() => this.onDidChangeEmitter.fire(), 200);
                            });
                    }
                }, debounceMs);
            });
        }

        // Manual trigger directly enters NES next edit suggestion processing
        const nesCts = new vscode.CancellationTokenSource();
        const tokenDisposable = token.onCancellationRequested(() => {
            nesCts.cancel();
        });
        try {
            const invocationId = ++this.invocationCount;
            CompletionLogger.trace(`[InlineCompletionProvider] Request #${invocationId} started`);
            // Manual trigger executes directly
            return this._invokeNESProvider(document, { nesCts });
        } finally {
            tokenDisposable.dispose();
            nesCts.dispose();

            // Delayed notification that new suggestions may be available
            setTimeout(() => this.onDidChangeEmitter.fire(), 200);
        }
    }

    private async _provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        tokens: CompletionTokens & {
            coreToken: vscode.CancellationToken;
            completionsCts: vscode.CancellationTokenSource;
        }
    ): Promise<vscode.InlineCompletionList | undefined> {
        const CompletionLogger = getCompletionLogger();
        const ConfigManager = getConfigManager();
        const fimConfig = ConfigManager.getFIMConfig();
        const nesConfig = ConfigManager.getNESConfig();

        // Case 1: Both FIM and NES are enabled
        if (fimConfig.enabled && nesConfig.enabled) {
            // NES manual trigger mode: only use FIM
            if (nesConfig.manualOnly) {
                CompletionLogger.trace(
                    '[InlineCompletionProvider] FIM and NES enabled, but NES manual trigger, use FIM'
                );
                return this._invokeFIMProvider(document, position, tokens);
            }

            // NES auto trigger mode: choose based on cursor position
            // Check if cursor is at end of line
            const cursorLine = document.lineAt(position.line).text;
            let lastNonWhitespaceChar = cursorLine.length - 1;
            while (lastNonWhitespaceChar >= 0 && /\s/.test(cursorLine[lastNonWhitespaceChar])) {
                lastNonWhitespaceChar--;
            }
            const isCursorAtEndOfLine = position.character >= lastNonWhitespaceChar + 1;

            if (isCursorAtEndOfLine) {
                CompletionLogger.trace('[InlineCompletionProvider] Cursor at end of line, use FIM');
                return this._invokeFIMProvider(document, position, tokens);
            } else {
                CompletionLogger.trace('[InlineCompletionProvider] Cursor not at end of line, use NES');
                const nesResult = await this._invokeNESProvider(document, tokens);
                if (nesResult) {
                    // Check if NES result is a meaningful edit
                    let isMeaningfulEdit = false;
                    if (nesResult.items.length > 0) {
                        for (const item of nesResult.items) {
                            // If no range info, consider it meaningful (could be command or other operation)
                            if (!item.range) {
                                isMeaningfulEdit = true;
                                break;
                            }
                            // If insert text is not string, consider it meaningful
                            if (typeof item.insertText !== 'string') {
                                isMeaningfulEdit = true;
                                break;
                            }
                            // Get original text within range
                            const originalText = document.getText(item.range);

                            // If insert text is same as original text, skip
                            if (originalText === item.insertText) {
                                continue;
                            }

                            // Check if it's "complete line replacement" (NES might misunderstand context)
                            // If replacement range includes entire line and insert text contains multiple lines, might be over-generation
                            const insertedLines = item.insertText.split('\n');
                            const originalLines = originalText.split('\n');

                            if (
                                item.range.start.character === 0 &&
                                item.range.end.character === document.lineAt(item.range.end.line).text.length &&
                                insertedLines.length > originalLines.length + 2
                            ) {
                                CompletionLogger.trace(
                                    `[InlineCompletionProvider] NES generated abnormal content (cross-multi-line replacement), might have misunderstood context:\r\nOriginal text=\r\n${originalText}\r\nInserted text=\r\n${item.insertText}`
                                );
                                // Consider this as meaningless edit, continue checking next item
                                continue;
                            }

                            // Consider it meaningful edit
                            CompletionLogger.trace(
                                `[InlineCompletionProvider] NES suggestion differs from original text, considered meaningful edit:\r\nOriginal text=\r\n${originalText}\r\nInserted text=\r\n${item.insertText}`
                            );
                            isMeaningfulEdit = true;
                            break;
                        }
                    }

                    if (isMeaningfulEdit) {
                        CompletionLogger.trace('[InlineCompletionProvider] NES meaningful result, return NES result');
                        return nesResult;
                    } else {
                        CompletionLogger.trace(
                            '[InlineCompletionProvider] NES result meaningless or over-generated, fallback to FIM'
                        );
                        return this._invokeFIMProvider(document, position, tokens);
                    }
                }
                // NES no result, fallback to FIM
                CompletionLogger.trace('[InlineCompletionProvider] NES no result, fallback to FIM');
                return this._invokeFIMProvider(document, position, tokens);
            }
        }

        // Case 2: Only FIM is enabled
        if (fimConfig.enabled) {
            CompletionLogger.trace('[InlineCompletionProvider] Only FIM enabled, use FIM');
            return this._invokeFIMProvider(document, position, tokens);
        }

        // Case 3: Only NES is enabled
        if (nesConfig.enabled) {
            // NES manual trigger mode, but this is auto trigger request, do not process
            if (nesConfig.manualOnly) {
                CompletionLogger.trace(
                    '[InlineCompletionProvider] Only NES enabled but manual trigger mode, ignore auto request'
                );
                return undefined;
            }

            CompletionLogger.trace('[InlineCompletionProvider] Only NES enabled, use NES');
            return this._invokeNESProvider(document, tokens);
        }

        // Case 4: Neither enabled
        CompletionLogger.trace('[InlineCompletionProvider] Neither FIM nor NES enabled');
        return undefined;
    }

    private async _invokeFIMProvider(
        document: vscode.TextDocument,
        position: vscode.Position,
        tokens: { completionsCts: vscode.CancellationTokenSource }
    ): Promise<vscode.InlineCompletionList | undefined> {
        const CompletionLogger = getCompletionLogger();
        const ConfigManager = getConfigManager();
        const config = ConfigManager.getFIMConfig();
        if (!config.enabled || !this.fimProvider) {
            return undefined;
        }

        CompletionLogger.trace('[InlineCompletionProvider] Call FIM');
        const startTime = Date.now();

        try {
            const textDoc = CopilotTextDocument.create(
                document.uri.toString(),
                document.languageId,
                document.version,
                document.getText()
            );

            // Create timeout Promise
            const timeoutPromise = new Promise<null>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`FIM request timeout (${config.timeoutMs}ms)`));
                }, config.timeoutMs);
            });

            // Get inline completion suggestions
            const fimPromise = this.fimProvider.getInlineCompletions(
                textDoc,
                { line: position.line, character: position.character },
                tokens.completionsCts.token
            );

            // Handle request and timeout
            const fimResult = await Promise.race([fimPromise, timeoutPromise]);

            const elapsed = Date.now() - startTime;
            CompletionLogger.trace(`[InlineCompletionProvider] FIM request completed, elapsed: ${elapsed}ms`);

            if (!fimResult || !fimResult.length) {
                return undefined;
            }

            const items = fimResult.map((completion, index) => {
                const range = new vscode.Range(
                    completion.range.start.line,
                    completion.range.start.character,
                    completion.range.end.line,
                    completion.range.end.character
                );
                CompletionLogger.info(
                    `[InlineCompletionProvider] Return FIM suggestion [${index}]: insertText=\r\n${completion.insertText}`
                );
                return new vscode.InlineCompletionItem(completion.insertText, range);
            });

            return new vscode.InlineCompletionList(items);
        } catch (error) {
            const elapsed = Date.now() - startTime;

            if (error instanceof Error && error.message.includes('timeout')) {
                CompletionLogger.warn(`[InlineCompletionProvider] ${error.message}`);
                return undefined;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                return undefined;
            }

            CompletionLogger.error(`[InlineCompletionProvider] FIM request exception (${elapsed}ms):`, error);
            return undefined;
        }
    }

    private async _invokeNESProvider(
        document: vscode.TextDocument,
        tokens: { nesCts: vscode.CancellationTokenSource }
    ): Promise<vscode.InlineCompletionList | undefined> {
        const CompletionLogger = getCompletionLogger();
        const ConfigManager = getConfigManager();
        const config = ConfigManager.getNESConfig();
        if (!config.enabled || !this.nesProvider || !this.nesWorkspaceAdapter) {
            return undefined;
        }

        CompletionLogger.trace('[InlineCompletionProvider] Call NES');
        const startTime = Date.now();

        try {
            // Sync document to NES workspace
            this.nesWorkspaceAdapter.syncDocument(document);

            // Create timeout Promise
            const timeoutPromise = new Promise<null>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`NES request timeout (${config.timeoutMs}ms)`));
                }, config.timeoutMs);
            });

            // Use chat-lib NES provider to get next edit suggestion
            const nesPromise = this.nesProvider.getNextEdit(
                document.uri,
                tokens.nesCts.token as unknown as CancellationToken
            );

            // Handle request and timeout
            const nesResult = await Promise.race([nesPromise, timeoutPromise]);

            const elapsed = Date.now() - startTime;
            CompletionLogger.trace(`[InlineCompletionProvider] NES request completed, elapsed: ${elapsed}ms`);

            if (!nesResult || !nesResult.result) {
                return undefined;
            }

            // Convert NES result to VS Code InlineCompletionItem
            const { newText, range } = nesResult.result;

            if (!newText) {
                return undefined;
            }

            // Convert character offset to VS Code Position
            const startPos = document.positionAt(range.start);
            const endPos = document.positionAt(range.endExclusive);
            const vscodeRange = new vscode.Range(startPos, endPos);

            const completionItem = new vscode.InlineCompletionItem(newText, vscodeRange);

            // Record suggestion has been shown
            this.nesProvider.handleShown(nesResult);

            CompletionLogger.info(
                `[InlineCompletionProvider] Return NES suggestion: insertText=\r\n${completionItem?.insertText}`
            );

            return new vscode.InlineCompletionList([completionItem]);
        } catch (error) {
            const elapsed = Date.now() - startTime;

            if (error instanceof Error && error.message.includes('timeout')) {
                CompletionLogger.warn(`[InlineCompletionProvider] ${error.message}`);
                return undefined;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                return undefined;
            }

            CompletionLogger.error(`[InlineCompletionProvider] NES request exception (${elapsed}ms):`, error);
            return undefined;
        }
    }

    // ========================================================================
    // Lifecycle management method documentation (draft methods - documentation only, not implemented)
    // ========================================================================
    //
    // Current status:
    // - These methods do not belong to the stable API of InlineCompletionItemProvider
    // - Implementing these methods will cause initialization errors, so only documentation is retained
    //
    // Future possible implementation methods:
    //
    // 1. handleDidShowCompletionItem(_completionItem: vscode.InlineCompletionItem): void
    //    - Handle callback when completion item is displayed
    //    - Called when completion item is actually displayed to user
    //    - Usage: telemetry, logging, analyzing user interactions, etc.
    //
    // 2. handleDidPartiallyAcceptCompletionItem(
    //      _completionItem: vscode.InlineCompletionItem,
    //      acceptedLength: number & vscode.PartialAcceptInfo
    //    ): void
    //    - Handle callback when completion item is partially accepted
    //    - Called when user only accepts first few characters
    //    - Usage: track user satisfaction, optimize completion length, etc.
    //
    // 3. handleEndOfLifetime(
    //      _completionItem: vscode.InlineCompletionItem,
    //      reason: vscode.InlineCompletionEndOfLifeReason
    //    ): void
    //    - Completion item lifecycle end callback
    //    - Reasons include: Accepted | Discarded | Ignored | Autocancelled | Unknown
    //    - Usage: record reasons for completion being accepted/rejected
    //
    // 4. handleListEndOfLifetime(
    //      list: vscode.InlineCompletionList,
    //      reason: vscode.InlineCompletionsDisposeReason
    //    ): void
    //    - Completion list lifecycle end callback
    //    - Reasons include: LostRace | NotTaken | TokenCancellation | Unknown
    //    - Usage: cleanup, resource release, final telemetry reports, etc.
    //
    // ========================================================================

    // ========================================================================
    // Resource cleanup
    // ========================================================================
    dispose(): void {
        const CompletionLogger = getCompletionLogger();
        CompletionLogger.trace('[InlineCompletionProvider.dispose] Start releasing resources');

        // Clear debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        // Clear debounce request
        if (this.pendingDebounceRequest) {
            this.pendingDebounceRequest.resolve(undefined);
            this.pendingDebounceRequest = null;
        }

        // Release FIM provider
        if (this._fimProvider) {
            this._fimProvider.dispose();
            this._fimProvider = null;
        }

        // Release NES provider
        if (this._nesProvider) {
            this._nesProvider.dispose();
            this._nesProvider = null;
        }

        // Clean up all disposables (includes onDidChangeEmitter, nesWorkspaceAdapter, provider and commands)
        this.disposables.forEach(d => {
            try {
                d.dispose();
            } catch (error) {
                CompletionLogger.warn('[InlineCompletionProvider.dispose] Error releasing resources:', error);
            }
        });
        this.disposables.length = 0;

        CompletionLogger.info('[InlineCompletionProvider] All resources released');
    }
}

/*---------------------------------------------------------------------------------------------
 *  InlineCompletionShim - Lightweight inline completion proxy
 *
 *  Responsibilities:
 *  - Provide switch detection and debounce processing
 *  - Lazy load the complete copilot module (@vscode/chat-lib)
 *  - Load heavy dependencies only on first completion trigger, optimizing extension startup time
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getCompletionLogger } from './singletons';

// ========================================================================
// Type definitions
// ========================================================================

/**
 * Interface definition of complete InlineCompletionProvider
 * Used for type inference after lazy loading
 */
interface IInlineCompletionProvider extends vscode.InlineCompletionItemProvider, vscode.Disposable {
    onDidChange: vscode.Event<void>;
    activate(): void;
}

/**
 * Copilot module export type
 */
interface CopilotModule {
    InlineCompletionProvider: new (context: vscode.ExtensionContext) => IInlineCompletionProvider;
}

/**
 * Lightweight inline completion proxy
 * Implements lazy loading strategy, loads complete copilot module only on first completion trigger
 */
export class InlineCompletionShim implements vscode.InlineCompletionItemProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    // Complete InlineCompletionProvider instance (lazy loaded)
    private _realProvider: IInlineCompletionProvider | null = null;
    private _loadingPromise: Promise<IInlineCompletionProvider | null> | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.disposables.push(this.onDidChangeEmitter);
        // WorkspaceAdapter lazy loading, avoid introducing chat-lib dependency in extension.js
    }

    // ========================================================================
    // Configuration detection
    // ========================================================================

    /**
     * Check if FIM is enabled
     */
    private isFIMEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('chp.fimCompletion');
        return config.get<boolean>('enabled', false);
    }

    /**
     * Check if NES is enabled
     */
    private isNESEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('chp.nesCompletion');
        return config.get<boolean>('enabled', false);
    }

    // ========================================================================
    // Lazy loading
    // ========================================================================

    /**
     * Lazy load the complete copilot module
     */
    private async loadRealProvider(): Promise<IInlineCompletionProvider | null> {
        if (this._realProvider) {
            return this._realProvider;
        }

        // Avoid duplicate loading
        if (this._loadingPromise) {
            return this._loadingPromise;
        }

        this._loadingPromise = (async () => {
            try {
                const CompletionLogger = getCompletionLogger();
                const startTime = Date.now();
                CompletionLogger.trace('[InlineCompletionShim] Starting to load copilot module...');

                // Dynamically load copilot module (using require because it's packaged as CommonJS)
                // Use path relative to current directory to avoid post-packaging path issues
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const copilotModule: CopilotModule = require('../dist/copilot.bundle.js');
                const { InlineCompletionProvider } = copilotModule;

                // Create and activate real provider
                this._realProvider = new InlineCompletionProvider(this.context);
                this._realProvider.activate();

                // Forward onDidChange events
                const forwardDisposable = this._realProvider.onDidChange(() => {
                    this.onDidChangeEmitter.fire();
                });
                this.disposables.push(forwardDisposable);

                const loadTime = Date.now() - startTime;
                CompletionLogger.info(
                    `[InlineCompletionShim] ✅ copilot module loading complete (elapsed: ${loadTime}ms)`
                );

                return this._realProvider;
            } catch (error) {
                const CompletionLogger = getCompletionLogger();
                CompletionLogger.error('[InlineCompletionShim] ❌ Failed to load copilot module:', error);
                this._loadingPromise = null;
                return null;
            }
        })();

        return this._loadingPromise;
    }

    // ========================================================================
    // Activation and initialization
    // ========================================================================

    activate(): void {
        const CompletionLogger = getCompletionLogger();
        CompletionLogger.trace('[InlineCompletionShim] Activate lightweight proxy (lazy loading mode)');

        try {
            // Register inline suggestion provider
            const provider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**/*' }, this);
            this.disposables.push(provider);

            // Register commands (these commands do not depend on chat-lib, handled directly in shim)
            this.disposables.push(
                vscode.commands.registerCommand('chp.nesCompletion.toggleManual', async () => {
                    const CompletionLogger = getCompletionLogger();
                    const config = vscode.workspace.getConfiguration('chp.nesCompletion');
                    const currentState = config.get('manualOnly', false);
                    const newState = !currentState;
                    await vscode.workspace
                        .getConfiguration('chp.nesCompletion')
                        .update('manualOnly', newState, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(
                        `Copilot ++: Next Edit Suggestion Trigger Mode: ${newState ? 'Manual Trigger' : 'Auto Trigger'}`
                    );
                    CompletionLogger.info(
                        `[InlineCompletionShim] NES manual trigger mode ${newState ? 'enabled' : 'disabled'}`
                    );
                })
            );

            CompletionLogger.info('[InlineCompletionShim] ✅ Activated (using lazy loading strategy)');
        } catch (error) {
            CompletionLogger.error('[InlineCompletionShim] Activation failed:', error);
            throw error;
        }
    }

    // ========================================================================
    // InlineCompletionItemProvider implementation
    // ========================================================================

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
        // Switch detection: if neither FIM nor NES is enabled, return directly
        if (!this.isFIMEnabled() && !this.isNESEnabled()) {
            return undefined;
        }

        // Load real provider and delegate to it
        // shim layer does not perform debouncing, debounce logic is handled by real InlineCompletionProvider
        const realProvider = await this.loadRealProvider();
        if (realProvider && !token.isCancellationRequested) {
            try {
                const result = await realProvider.provideInlineCompletionItems(document, position, context, token);
                return result ?? undefined;
            } catch (error) {
                const CompletionLogger = getCompletionLogger();
                CompletionLogger.error('[InlineCompletionShim] Completion request failed:', error);
                return undefined;
            }
        }
        return undefined;
    }

    // ========================================================================
    // Resource cleanup
    // ========================================================================

    dispose(): void {
        const CompletionLogger = getCompletionLogger();
        CompletionLogger.trace('[InlineCompletionShim] Start releasing resources');

        // Release real provider
        if (this._realProvider) {
            this._realProvider.dispose();
            this._realProvider = null;
        }

        // Clean up all disposables
        this.disposables.forEach(d => {
            try {
                d.dispose();
            } catch (error) {
                const CompletionLogger = getCompletionLogger();
                CompletionLogger.warn('[InlineCompletionShim] Error releasing resources:', error);
            }
        });
        this.disposables.length = 0;

        CompletionLogger.info('🧹 [InlineCompletionShim] All resources released');
    }

    /**
     * Create and activate Shim
     */
    static createAndActivate(context: vscode.ExtensionContext): {
        provider: InlineCompletionShim;
        disposables: vscode.Disposable[];
    } {
        const provider = new InlineCompletionShim(context);
        provider.activate();
        return { provider, disposables: provider.disposables };
    }
}

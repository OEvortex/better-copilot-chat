/*---------------------------------------------------------------------------------------------
 *  InlineCompletionContribution - VS Code registration layer for inline completions
 *
 *  Keeps VS Code-facing registration separate from the lightweight shim and the heavy
 *  completion implementation so completion/NES providers can be wired in one place.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { InlineCompletionShim } from './inlineCompletionShim';
import { getCompletionLogger } from './singletons';

const INLINE_COMPLETION_SELECTOR: vscode.DocumentSelector = { pattern: '**/*' };
const TOGGLE_NES_MANUAL_COMMAND = 'chp.nesCompletion.toggleManual';

function registerInlineCompletionCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand(TOGGLE_NES_MANUAL_COMMAND, async () => {
            const CompletionLogger = getCompletionLogger();
            const config = vscode.workspace.getConfiguration(
                'aether.nesCompletion'
            );
            const currentState = config.get('manualOnly', false);
            const newState = !currentState;

            await config.update(
                'manualOnly',
                newState,
                vscode.ConfigurationTarget.Global
            );

            vscode.window.showInformationMessage(
                'Aether: Next Edit Suggestion Trigger Mode: ' +
                    (newState ? 'Manual Trigger' : 'Auto Trigger')
            );
            CompletionLogger.info(
                `[InlineCompletionContribution] NES manual trigger mode ${newState ? 'enabled' : 'disabled'}`
            );
        })
    );

    return disposables;
}

export function createAndActivateInlineCompletionContribution(
    context: vscode.ExtensionContext
): {
    provider: InlineCompletionShim;
    disposables: vscode.Disposable[];
} {
    const CompletionLogger = getCompletionLogger();
    CompletionLogger.trace(
        '[InlineCompletionContribution] Registering inline completion contribution'
    );

    const provider = new InlineCompletionShim(context);
    const providerDisposable =
        vscode.languages.registerInlineCompletionItemProvider(
            INLINE_COMPLETION_SELECTOR,
            provider
        );
    const commandDisposables = registerInlineCompletionCommands();
    const disposables = [providerDisposable, ...commandDisposables];

    for (const disposable of disposables) {
        context.subscriptions.push(disposable);
    }

    CompletionLogger.info(
        '[InlineCompletionContribution] Inline completion contribution registered'
    );

    return { provider, disposables };
}

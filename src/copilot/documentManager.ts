/*---------------------------------------------------------------------------------------------
 *  Copilot Document Manager - Document Manager Implementation
 *  Implements ICompletionsTextDocumentManager interface
 *  Reference: TestDocumentManager in getInlineCompletions.spec.ts
 *--------------------------------------------------------------------------------------------*/

import type {
	ICompletionsTextDocumentManager,
	ICompletionsWorkspaceFolder,
} from "@vscode/chat-lib";
import type {
	ITextDocument,
	TextDocumentIdentifier,
} from "@vscode/chat-lib/dist/src/_internal/extension/completions-core/vscode-node/lib/src/textDocument";
import type {
	TextDocumentChangeEvent,
	TextDocumentCloseEvent,
	TextDocumentFocusedEvent,
	TextDocumentOpenEvent,
	WorkspaceFoldersChangeEvent,
} from "@vscode/chat-lib/dist/src/_internal/extension/completions-core/vscode-node/lib/src/textDocumentManager";
import { Emitter } from "@vscode/chat-lib/dist/src/_internal/util/vs/base/common/event";
import { Disposable } from "@vscode/chat-lib/dist/src/_internal/util/vs/base/common/lifecycle";

/**
 * Document manager implementation
 */
export class DocumentManager
	extends Disposable
	implements ICompletionsTextDocumentManager
{
	private readonly _onDidChangeTextDocument = this._register(
		new Emitter<TextDocumentChangeEvent>(),
	);
	readonly onDidChangeTextDocument = this._onDidChangeTextDocument.event;

	private readonly _onDidOpenTextDocument = this._register(
		new Emitter<TextDocumentOpenEvent>(),
	);
	readonly onDidOpenTextDocument = this._onDidOpenTextDocument.event;

	private readonly _onDidCloseTextDocument = this._register(
		new Emitter<TextDocumentCloseEvent>(),
	);
	readonly onDidCloseTextDocument = this._onDidCloseTextDocument.event;

	private readonly _onDidFocusTextDocument = this._register(
		new Emitter<TextDocumentFocusedEvent>(),
	);
	readonly onDidFocusTextDocument = this._onDidFocusTextDocument.event;

	private readonly _onDidChangeWorkspaceFolders = this._register(
		new Emitter<WorkspaceFoldersChangeEvent>(),
	);
	readonly onDidChangeWorkspaceFolders =
		this._onDidChangeWorkspaceFolders.event;

	getTextDocumentsUnsafe(): ITextDocument[] {
		return [];
	}

	findNotebook(_doc: TextDocumentIdentifier) {
		return undefined;
	}

	getWorkspaceFolders(): ICompletionsWorkspaceFolder[] {
		return [];
	}
}

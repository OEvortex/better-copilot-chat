import { DocumentId } from "@vscode/chat-lib/dist/src/_internal/platform/inlineEdits/common/dataTypes/documentId";
import { LanguageId } from "@vscode/chat-lib/dist/src/_internal/platform/inlineEdits/common/dataTypes/languageId";
import {
	type MutableObservableDocument,
	MutableObservableWorkspace,
} from "@vscode/chat-lib/dist/src/_internal/platform/inlineEdits/common/observableWorkspace";
import { URI } from "@vscode/chat-lib/dist/src/_internal/util/vs/base/common/uri";
import { OffsetRange } from "@vscode/chat-lib/dist/src/_internal/util/vs/editor/common/core/ranges/offsetRange";
import { StringText } from "@vscode/chat-lib/dist/src/_internal/util/vs/editor/common/core/text/abstractText";
import * as vscode from "vscode";
import { getCompletionLogger } from "./singletons";

/**
 * Adapter for VS Code documents to ObservableWorkspace
 * Manages MutableObservableWorkspace and document synchronization
 */
export class WorkspaceAdapter implements vscode.Disposable {
	private readonly workspace: MutableObservableWorkspace;
	private readonly documentMap = new Map<string, MutableObservableDocument>();
	private readonly disposables: vscode.Disposable[] = [];

	private pendingDocumentChanges = new Set<string>();
	private documentChangeTimer: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		this.workspace = new MutableObservableWorkspace();

		// // Listen to document changes
		// this.disposables.push(
		//     vscode.workspace.onDidChangeTextDocument(() => {
		//         // Do not handle document changes here, synchronize before triggering suggestions
		//     })
		// );

		// Listen to document opening
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((doc) => {
				this.syncDocument(doc);
			}),
		);

		// Listen to document closing
		this.disposables.push(
			vscode.workspace.onDidCloseTextDocument((doc) => {
				const CompletionLogger = getCompletionLogger();
				const uriStr = doc.uri.toString();
				const docToRemove = this.documentMap.get(uriStr);
				if (docToRemove) {
					docToRemove.dispose();
					this.documentMap.delete(uriStr);
					CompletionLogger.trace(
						`[VSCodeWorkspaceAdapter] Remove document: ${uriStr}`,
					);
				}
			}),
		);

		// Listen to selection changes
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((e) => {
				const doc = this.documentMap.get(e.textEditor.document.uri.toString());
				if (doc) {
					const offsetRanges = e.selections.map((sel) => {
						const startOffset = e.textEditor.document.offsetAt(sel.start);
						const endOffset = e.textEditor.document.offsetAt(sel.end);
						return new OffsetRange(startOffset, endOffset);
					});
					doc.setSelection(offsetRanges);
				}
			}),
		);

		// Synchronize already opened documents
		for (const doc of vscode.workspace.textDocuments) {
			this.syncDocument(doc);
		}
	}

	getWorkspace(): MutableObservableWorkspace {
		return this.workspace;
	}

	/**
	 * Synchronize VS Code documents to ObservableWorkspace
	 */
	syncDocument(vscodeDoc: vscode.TextDocument): MutableObservableDocument {
		const CompletionLogger = getCompletionLogger();
		const uriStr = vscodeDoc.uri.toString();

		// If document already exists, update content
		let doc = this.documentMap.get(uriStr);
		if (doc) {
			const newContent = vscodeDoc.getText();
			const currentValue = doc.value.get();
			if (currentValue.getValue() !== newContent) {
				doc.setValue(new StringText(newContent), undefined, vscodeDoc.version);
			}
			return doc;
		}

		// Create new ObservableDocument
		const documentId = DocumentId.create(uriStr);
		const languageId = LanguageId.create(vscodeDoc.languageId);
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscodeDoc.uri);

		doc = this.workspace.addDocument({
			id: documentId,
			workspaceRoot: workspaceFolder
				? URI.parse(workspaceFolder.uri.toString())
				: undefined,
			initialValue: vscodeDoc.getText(),
			initialVersionId: vscodeDoc.version,
			languageId: languageId,
		});

		this.documentMap.set(uriStr, doc);
		CompletionLogger.trace(
			`[VSCodeWorkspaceAdapter] Sync document: ${vscodeDoc.fileName}`,
		);

		return doc;
	}

	/**
	 * Get document ID
	 */
	getDocumentId(uri: vscode.Uri): DocumentId {
		return DocumentId.create(uri.toString());
	}

	dispose(): void {
		// Clear debounce timer
		if (this.documentChangeTimer) {
			clearTimeout(this.documentChangeTimer);
			this.documentChangeTimer = null;
		}
		this.pendingDocumentChanges.clear();

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;

		for (const doc of this.documentMap.values()) {
			doc.dispose();
		}
		this.documentMap.clear();
		this.workspace.clear();
	}
}

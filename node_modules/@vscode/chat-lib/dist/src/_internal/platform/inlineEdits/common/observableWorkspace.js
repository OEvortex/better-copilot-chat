"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.MutableObservableDocument = exports.MutableObservableWorkspace = exports.StringEditWithReason = exports.ObservableWorkspace = void 0;
const assert_1 = require("../../../util/vs/base/common/assert");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const observableInternal_1 = require("../../../util/vs/base/common/observableInternal");
const stringEdit_1 = require("../../../util/vs/editor/common/core/edits/stringEdit");
const offsetRange_1 = require("../../../util/vs/editor/common/core/ranges/offsetRange");
const abstractText_1 = require("../../../util/vs/editor/common/core/text/abstractText");
const languageId_1 = require("./dataTypes/languageId");
const editReason_1 = require("./editReason");
class ObservableWorkspace {
    constructor() {
        this._version = 0;
        /**
         * Is fired when any open document changes.
        */
        this.onDidOpenDocumentChange = (0, observableInternal_1.derivedHandleChanges)({
            owner: this,
            changeTracker: {
                createChangeSummary: () => ({ didChange: false }),
                handleChange: (ctx, changeSummary) => {
                    if (!ctx.didChange(this.openDocuments)) {
                        changeSummary.didChange = true; // A document changed
                    }
                    return true;
                }
            }
        }, (reader, changeSummary) => {
            const docs = this.openDocuments.read(reader);
            for (const d of docs) {
                d.value.read(reader); // add dependency
            }
            if (changeSummary.didChange) {
                this._version++; // to force a change
            }
            return this._version;
            // TODO@hediet make this work:
            /*
            const docs = this.openDocuments.read(reader);
            for (const d of docs) {
                if (reader.readChangesSinceLastRun(d.value).length > 0) {
                    reader.reportChange(d);
                }
            }
            return undefined;
            */
        });
        this.lastActiveDocument = (0, observableInternal_1.derivedWithStore)((_reader, store) => {
            const obs = (0, observableInternal_1.observableValue)('lastActiveDocument', undefined);
            store.add((0, observableInternal_1.autorunWithStore)((reader, store) => {
                const docs = this.openDocuments.read(reader);
                for (const d of docs) {
                    store.add((0, observableInternal_1.runOnChange)(d.value, () => {
                        obs.set(d, undefined);
                    }));
                }
            }));
            return obs;
        }).flatten();
    }
    getFirstOpenDocument() {
        return this.openDocuments.get()[0];
    }
    getDocument(documentId) {
        return this.openDocuments.get().find(d => d.id === documentId);
    }
}
exports.ObservableWorkspace = ObservableWorkspace;
class StringEditWithReason extends stringEdit_1.StringEdit {
    constructor(replacements, reason) {
        super(replacements);
        this.reason = reason;
    }
}
exports.StringEditWithReason = StringEditWithReason;
class MutableObservableWorkspace extends ObservableWorkspace {
    constructor() {
        super(...arguments);
        this._openDocuments = (0, observableInternal_1.observableValue)(this, []);
        this.openDocuments = this._openDocuments;
        this._documents = new Map();
    }
    /**
     * Dispose to remove.
    */
    addDocument(options, tx = undefined) {
        (0, assert_1.assert)(!this._documents.has(options.id));
        const document = new MutableObservableDocument(options.id, new abstractText_1.StringText(options.initialValue ?? ''), [], options.languageId ?? languageId_1.LanguageId.PlainText, () => {
            this._documents.delete(options.id);
            const docs = this._openDocuments.get();
            const filteredDocs = docs.filter(d => d.id !== document.id);
            if (filteredDocs.length !== docs.length) {
                this._openDocuments.set(filteredDocs, tx, { added: [], removed: [document] });
            }
        }, options.initialVersionId ?? 0, options.workspaceRoot);
        this._documents.set(options.id, document);
        this._openDocuments.set([...this._openDocuments.get(), document], tx, { added: [document], removed: [] });
        return document;
    }
    getDocument(id) {
        return this._documents.get(id);
    }
    clear() {
        this._openDocuments.set([], undefined, { added: [], removed: this._openDocuments.get() });
        for (const doc of this._documents.values()) {
            doc.dispose();
        }
        this._documents.clear();
    }
    getWorkspaceRoot(documentId) {
        return this._documents.get(documentId)?.workspaceRoot;
    }
}
exports.MutableObservableWorkspace = MutableObservableWorkspace;
class MutableObservableDocument extends lifecycle_1.Disposable {
    get value() { return this._value; }
    get selection() { return this._selection; }
    get visibleRanges() { return this._visibleRanges; }
    get languageId() { return this._languageId; }
    get version() { return this._version; }
    get diagnostics() { return this._diagnostics; }
    constructor(id, value, selection, languageId, onDispose, versionId, workspaceRoot) {
        super();
        this.id = id;
        this.workspaceRoot = workspaceRoot;
        this._value = (0, observableInternal_1.observableValue)(this, value);
        this._selection = (0, observableInternal_1.observableValue)(this, selection);
        this._visibleRanges = (0, observableInternal_1.observableValue)(this, []);
        this._languageId = (0, observableInternal_1.observableValue)(this, languageId);
        this._version = (0, observableInternal_1.observableValue)(this, versionId);
        this._diagnostics = (0, observableInternal_1.observableValue)(this, []);
        this._register((0, lifecycle_1.toDisposable)(onDispose));
    }
    setSelection(selection, tx = undefined) {
        this._selection.set(selection, tx);
    }
    setVisibleRange(visibleRanges, tx = undefined) {
        this._visibleRanges.set(visibleRanges, tx);
    }
    applyEdit(edit, tx = undefined, newVersion = undefined) {
        const newValue = edit.applyOnText(this.value.get());
        const e = edit instanceof StringEditWithReason ? edit : new StringEditWithReason(edit.replacements, editReason_1.EditReason.unknown);
        (0, observableInternal_1.subtransaction)(tx, tx => {
            this._value.set(newValue, tx, e);
            this._version.set(newVersion ?? this._version.get() + 1, tx);
        });
    }
    updateSelection(selection, tx = undefined) {
        this._selection.set(selection, tx);
    }
    setValue(value, tx = undefined, newVersion = undefined) {
        const reason = editReason_1.EditReason.unknown;
        const e = new StringEditWithReason([stringEdit_1.StringReplacement.replace(new offsetRange_1.OffsetRange(0, this.value.get().value.length), value.value)], reason);
        (0, observableInternal_1.subtransaction)(tx, tx => {
            this._value.set(value, tx, e);
            this._version.set(newVersion ?? this._version.get() + 1, tx);
        });
    }
    updateDiagnostics(diagnostics, tx = undefined) {
        this._diagnostics.set(diagnostics, tx);
    }
}
exports.MutableObservableDocument = MutableObservableDocument;
//# sourceMappingURL=observableWorkspace.js.map
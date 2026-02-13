"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugRecorder = void 0;
const editUtils_1 = require("../../../platform/inlineEdits/common/dataTypes/editUtils");
const debugRecorderBookmark_1 = require("../../../platform/inlineEdits/common/debugRecorderBookmark");
const observable_1 = require("../../../platform/inlineEdits/common/utils/observable");
const utils_1 = require("../../../platform/inlineEdits/common/utils/utils");
const arrays_1 = require("../../../util/vs/base/common/arrays");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const network_1 = require("../../../util/vs/base/common/network");
const observableInternal_1 = require("../../../util/vs/base/common/observableInternal");
const path_1 = require("../../../util/vs/base/common/path");
const uuid_1 = require("../../../util/vs/base/common/uuid");
const abstractText_1 = require("../../../util/vs/editor/common/core/text/abstractText");
class DebugRecorder extends lifecycle_1.Disposable {
    constructor(_workspace, getNow = utils_1.now) {
        super();
        this._workspace = _workspace;
        this.getNow = getNow;
        this._id = 0;
        this._documentHistories = new Map();
        (0, observableInternal_1.mapObservableArrayCached)(this, this._workspace.openDocuments, (doc, store) => {
            const root = this._workspace.getWorkspaceRoot(doc.id);
            if (!root) {
                return;
            }
            if (!this._workspaceRoot) {
                this._workspaceRoot = root;
            }
            else {
                if (this._workspaceRoot.toString() !== root.toString()) {
                    // document is from a different root -> ignore
                    return;
                }
            }
            const state = new DocumentHistory(root, doc.id, doc.value.get().value, this._id++, doc.languageId.get(), () => this.getTimestamp());
            this._documentHistories.set(state.docId, state);
            store.add((0, observable_1.autorunWithChanges)(this, {
                value: doc.value,
                selection: doc.selection,
                languageId: doc.languageId,
            }, (data) => {
                if (data.languageId.changes.length > 0) {
                    state.languageId = data.languageId.value;
                }
                for (const edit of data.value.changes) {
                    state.handleEdit(edit);
                }
                if (data.selection.changes.length > 0) {
                    state.handleSelections(data.selection.value);
                }
            }));
            store.add((0, lifecycle_1.toDisposable)(() => {
                // We might want to soft-delete the document
                this._documentHistories.delete(doc.id);
            }));
        }, d => d.id).recomputeInitiallyAndOnChange(this._store);
    }
    getTimestamp() {
        let newTimestamp = this.getNow();
        if (this._lastTimestamp !== undefined && newTimestamp <= this._lastTimestamp) { // we want total ordering on the events
            newTimestamp = this._lastTimestamp + 1;
        }
        this._lastTimestamp = newTimestamp;
        return newTimestamp;
    }
    getRecentLog(bookmark = undefined) {
        if (!this._workspaceRoot) { // possible if the open file doesn't belong to a workspace
            return undefined;
        }
        const log = [];
        log.push({ entry: { documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: this._workspaceRoot.toString(), time: this.getNow(), uuid: (0, uuid_1.generateUuid)() }, sortTime: 0 });
        for (const doc of this._documentHistories.values()) {
            log.push(...doc.getDocumentLog(bookmark));
        }
        log.sort((0, arrays_1.compareBy)(e => e.sortTime, arrays_1.numberComparator));
        return log.map(l => l.entry);
    }
    createBookmark() {
        return new debugRecorderBookmark_1.DebugRecorderBookmark(this.getNow());
    }
}
exports.DebugRecorder = DebugRecorder;
class DocumentHistory {
    constructor(workspaceUri, docId, initialValue, id, languageId, getNow) {
        this.workspaceUri = workspaceUri;
        this.docId = docId;
        this.id = id;
        this.languageId = languageId;
        this.getNow = getNow;
        /**
         * Stores edits and selection changes in the order they happened.
         */
        this._edits = [];
        this.relativePath = (() => {
            const basePath = (0, path_1.relative)(this.workspaceUri.path, this.docId.path);
            return this.docId.toUri().scheme === network_1.Schemas.vscodeNotebookCell ? `${basePath}#${this.docId.fragment}` : basePath;
        })();
        this._baseValue = new abstractText_1.StringText(initialValue);
        this.creationTime = this.getNow();
        this._baseValueTime = this.creationTime;
    }
    handleSelections(selections) {
        this._edits.push({ kind: 'selections', selections, instant: this.getNow() });
    }
    handleEdit(edit) {
        if (edit.isEmpty()) {
            return;
        }
        this._edits.push({ kind: 'edit', edit, instant: this.getNow() });
        this.cleanUpHistory();
    }
    cleanUpHistory() {
        const minuteMs = 60 * 1000;
        const earliestTime = this.getNow() - 10 * minuteMs;
        while (this._edits.length > 0 && this._edits[0].instant < earliestTime) {
            const edit = this._edits.shift();
            if (edit.kind === 'selections') {
                continue; // we drop selection changes
            }
            this._baseValue = edit.edit.applyOnText(this._baseValue);
            this._baseValueTime = edit.instant;
        }
    }
    getDocumentLog(bookmark) {
        this.cleanUpHistory();
        if (this._edits.length === 0) {
            return [];
        }
        const log = [];
        log.push({ entry: { kind: 'documentEncountered', id: this.id, relativePath: this.relativePath, time: this.creationTime }, sortTime: this.creationTime });
        let docVersion = 1;
        log.push({ entry: { kind: 'setContent', id: this.id, v: docVersion, content: this._baseValue.value, time: this._baseValueTime }, sortTime: this._baseValueTime });
        log.push({ entry: { kind: 'opened', id: this.id, time: this._baseValueTime }, sortTime: this._baseValueTime });
        for (const editOrSelectionChange of this._edits) {
            if (bookmark && editOrSelectionChange.instant > bookmark.timeMs) {
                // only considers edits that happened before the bookmark
                break;
            }
            docVersion++;
            if (editOrSelectionChange.kind === 'selections') {
                const serializedOffsetRange = editOrSelectionChange.selections.map(s => [s.start, s.endExclusive]);
                log.push({ entry: { kind: 'selectionChanged', id: this.id, selection: serializedOffsetRange, time: editOrSelectionChange.instant }, sortTime: editOrSelectionChange.instant });
            }
            else {
                log.push({ entry: { kind: 'changed', id: this.id, v: docVersion, edit: (0, editUtils_1.serializeStringEdit)(editOrSelectionChange.edit), time: editOrSelectionChange.instant }, sortTime: editOrSelectionChange.instant });
            }
        }
        return log;
    }
}
//# sourceMappingURL=debugRecorder.js.map
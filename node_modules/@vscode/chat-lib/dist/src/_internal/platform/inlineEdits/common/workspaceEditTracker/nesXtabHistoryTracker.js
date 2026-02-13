"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NesXtabHistoryTracker = void 0;
const assert_1 = require("../../../../util/vs/base/common/assert");
const lifecycle_1 = require("../../../../util/vs/base/common/lifecycle");
const linkedList_1 = require("../../../../util/vs/base/common/linkedList");
const observable_1 = require("../../../../util/vs/base/common/observable");
const edit_1 = require("../dataTypes/edit");
const observable_2 = require("../utils/observable");
class NesXtabHistoryTracker extends lifecycle_1.Disposable {
    /** Max # of entries in history */
    static { this.MAX_HISTORY_SIZE = 50; }
    constructor(workspace, maxHistorySize = NesXtabHistoryTracker.MAX_HISTORY_SIZE) {
        super();
        this.maxHistorySize = maxHistorySize;
        this.idToEntry = new Map();
        this.history = new linkedList_1.LinkedList();
        (0, observable_1.mapObservableArrayCached)(this, workspace.openDocuments, (doc, store) => {
            // add .value to all observables
            store.add((0, observable_2.autorunWithChanges)(this, {
                rootedEdits: doc.value,
                visibleRanges: doc.visibleRanges,
            }, (data) => {
                if (data.rootedEdits.changes.length > 0 && data.rootedEdits.previous !== undefined) {
                    this.handleEdits(doc, data.rootedEdits);
                }
                else {
                    this.handleVisibleRangesChange(doc, data.visibleRanges);
                }
            }));
        }, d => d.id).recomputeInitiallyAndOnChange(this._store);
    }
    getHistory() {
        return [...this.history];
    }
    /**
     * If the document isn't already in history, add it to the history.
     * If the document is in history either with an edit or selection entry, do not include it again.
     */
    handleVisibleRangesChange(doc, visibleRangesChange) {
        if (visibleRangesChange.value.length === 0) {
            return;
        }
        const previousRecord = this.idToEntry.get(doc.id);
        // if this's an already known file
        if (previousRecord !== undefined) {
            // if it's an edit entry, do not change anything
            if (previousRecord.entry.kind === 'edit') {
                return;
            }
            // else remove from history to update the visible ranges
            previousRecord.removeFromHistory();
        }
        const entry = { docId: doc.id, kind: 'visibleRanges', visibleRanges: visibleRangesChange.value, documentContent: doc.value.get() };
        const removeFromHistory = this.history.push(entry);
        this.idToEntry.set(doc.id, { entry, removeFromHistory });
        this.compactHistory();
    }
    handleEdits(doc, rootedEdits) {
        (0, assert_1.assert)(rootedEdits.previous !== undefined, `Document has previous version`);
        (0, assert_1.assert)(rootedEdits.changes.length === 1, `Expected 1 edit change but got ${rootedEdits.changes.length}`);
        const currentEdit = rootedEdits.changes[0];
        if (currentEdit.replacements.length === 0) {
            return;
        }
        const previousRecord = this.idToEntry.get(doc.id);
        // const currentBase = rootedEdits.value.apply(currentEdit.inverseOnString(rootedEdits.previous.value));
        const currentBase = rootedEdits.previous;
        const currentRootedEdit = new edit_1.RootedEdit(currentBase, currentEdit);
        if (previousRecord === undefined) {
            this.pushToHistory(doc.id, currentRootedEdit);
            return;
        }
        if (previousRecord.entry.kind === 'visibleRanges') {
            previousRecord.removeFromHistory();
            this.pushToHistory(doc.id, currentRootedEdit);
            return;
        }
        const lastRootedEdit = previousRecord.entry.edit;
        const lastLineEdit = edit_1.RootedEdit.toLineEdit(lastRootedEdit);
        const currentLineEdit = edit_1.RootedEdit.toLineEdit(currentRootedEdit);
        if (!currentLineEdit.isEmpty() && !lastLineEdit.isEmpty() && lastLineEdit.replacements[0].lineRange.startLineNumber === currentLineEdit.replacements[0].lineRange.startLineNumber) {
            // merge edits
            previousRecord.removeFromHistory();
            const composedEdit = lastRootedEdit.edit.compose(currentEdit);
            const edit = new edit_1.RootedEdit(lastRootedEdit.base, composedEdit);
            this.pushToHistory(doc.id, edit);
        }
        else {
            this.pushToHistory(doc.id, currentRootedEdit);
        }
    }
    pushToHistory(docId, edit) {
        const entry = { docId, kind: 'edit', edit };
        const removeFromHistory = this.history.push(entry);
        this.idToEntry.set(docId, { entry, removeFromHistory });
        this.compactHistory();
    }
    compactHistory() {
        if (this.history.size > this.maxHistorySize) {
            const removedEntry = this.history.shift();
            if (removedEntry !== undefined) {
                const lastRecord = this.idToEntry.get(removedEntry.docId);
                if (lastRecord !== undefined && removedEntry === lastRecord.entry) {
                    this.idToEntry.delete(removedEntry.docId);
                }
            }
        }
    }
}
exports.NesXtabHistoryTracker = NesXtabHistoryTracker;
//# sourceMappingURL=nesXtabHistoryTracker.js.map
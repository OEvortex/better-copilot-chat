"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NesHistoryContextProvider = void 0;
exports.sum = sum;
exports.editExtends = editExtends;
const lifecycle_1 = require("../../../../util/vs/base/common/lifecycle");
const observable_1 = require("../../../../util/vs/base/common/observable");
const types_1 = require("../../../../util/vs/base/common/types");
const stringEdit_1 = require("../../../../util/vs/editor/common/core/edits/stringEdit");
const textEdit_1 = require("../../../../util/vs/editor/common/core/edits/textEdit");
const abstractText_1 = require("../../../../util/vs/editor/common/core/text/abstractText");
const edit_1 = require("../dataTypes/edit");
const rootedLineEdit_1 = require("../dataTypes/rootedLineEdit");
const textEditLength_1 = require("../dataTypes/textEditLength");
const observable_2 = require("../utils/observable");
const utils_1 = require("../utils/utils");
const historyContextProvider_1 = require("./historyContextProvider");
class NesHistoryContextProvider extends lifecycle_1.Disposable {
    constructor(workspace, observableGit) {
        super();
        this._documentState = new Map();
        this._lastDocuments = new FifoSet(50);
        this._register((0, observable_1.autorun)(reader => {
            const branch = reader.readObservable(observableGit.branch);
            if (branch === undefined) {
                return; // probably git extension hasn't activated or no repository found, so don't do anything
            }
            this._lastGitCheckout = (0, utils_1.now)();
            this._documentState.forEach(d => d.applyAllEdits());
        }));
        (0, observable_1.mapObservableArrayCached)(this, workspace.openDocuments, (doc, store) => {
            const initialSelection = doc.selection.get().at(0);
            const state = new DocumentState(doc.id, doc.value.get().value, doc.languageId.get(), initialSelection);
            this._documentState.set(state.docId, state);
            if (initialSelection) {
                this._lastDocuments.push(state);
            }
            store.add((0, observable_2.autorunWithChanges)(this, {
                value: doc.value,
                selection: doc.selection,
                languageId: doc.languageId,
            }, (data) => {
                if (data.languageId.changes.length > 0) {
                    state.languageId = data.languageId.value;
                }
                const isInCooldown = this._isAwaitingGitCheckoutCooldown();
                for (const edit of data.value.changes) {
                    this._lastDocuments.push(state);
                    state.handleEdit(edit, isInCooldown);
                }
                if (data.selection.changes.length > 0) {
                    state.handleSelection(data.selection.value.at(0));
                    this._lastDocuments.push(state);
                }
            }));
            store.add((0, lifecycle_1.toDisposable)(() => {
                const state = this._documentState.get(doc.id);
                if (state) {
                    this._lastDocuments.remove(state);
                }
                this._documentState.delete(doc.id);
            }));
        }, d => d.id).recomputeInitiallyAndOnChange(this._store);
    }
    getHistoryContext(docId) {
        const state = this._documentState.get(docId);
        if (!state) {
            return undefined;
        }
        if (!this._lastDocuments.has(state)) {
            return undefined;
        }
        const docs = [];
        let hasProcessedCurrentDocument = false;
        let editCount = 5;
        for (const doc of this._lastDocuments.getItemsReversed()) {
            const result = doc.getRecentEdit(editCount);
            if (result === undefined) { // result is undefined if the document is not a user document
                continue;
            }
            if (result.editCount === 0 && hasProcessedCurrentDocument) {
                break;
            }
            if (doc.docId === docId) {
                hasProcessedCurrentDocument = true;
            }
            docs.push(result.history);
            editCount -= result.editCount;
            if (editCount <= 0) {
                break;
            }
        }
        docs.reverse();
        // Docs is sorted from least recent to most recent now
        if (!docs.some(d => d.docId === docId)) {
            return undefined;
        }
        return new historyContextProvider_1.HistoryContext(docs);
    }
    _isAwaitingGitCheckoutCooldown() {
        if (!this._lastGitCheckout) {
            return false;
        }
        const isInCooldown = (0, utils_1.now)() - this._lastGitCheckout < 2 * 1000 /* 2 seconds */;
        if (!isInCooldown) {
            this._lastGitCheckout = undefined;
        }
        return isInCooldown;
    }
}
exports.NesHistoryContextProvider = NesHistoryContextProvider;
class DocumentState {
    static { this.MAX_EDITED_LINES_PER_EDIT = 10; }
    static { this.MAX_EDITED_CHARS_PER_EDIT = 5000; }
    constructor(docId, initialValue, languageId, selection) {
        this.docId = docId;
        this.languageId = languageId;
        this._edits = [];
        this._isUserDocument = false;
        this._baseValue = new abstractText_1.StringText(initialValue);
        this._currentValue = this._baseValue;
        this.handleSelection(selection);
    }
    getSelection() {
        return this._selection;
    }
    handleSelection(selection) {
        if (selection) {
            this._isUserDocument = true;
        }
        this._selection = selection;
    }
    handleEdit(edit, isInCooldown) {
        if (edit.isEmpty()) {
            return;
        }
        this._currentValue = edit.applyOnText(this._currentValue);
        const textEdit = textEdit_1.TextEdit.fromStringEdit(edit, this._currentValue);
        const textLengthEdit = textEditLength_1.TextLengthEdit.fromTextEdit(textEdit);
        if (isInCooldown) {
            this._baseValue = this._currentValue;
            this._edits = [];
            return;
        }
        function editInsertSize(edit) {
            return sum(edit.replacements, e => e.newText.length);
        }
        const lastEdit = this._edits.at(-1);
        if (lastEdit && editInsertSize(lastEdit.edit) < 200 && editExtends(edit, lastEdit.edit)) {
            lastEdit.edit = lastEdit.edit.compose(edit);
            lastEdit.textLengthEdit = lastEdit.textLengthEdit.compose(textLengthEdit);
            lastEdit.instant = (0, utils_1.now)();
            if (lastEdit.edit.isEmpty()) {
                this._edits.pop();
            }
        }
        else {
            this._edits.push({ edit, textLengthEdit, instant: (0, utils_1.now)() });
        }
    }
    getRecentEdit(maxEditCount) {
        if (!this._isUserDocument) {
            return undefined;
        }
        // note that `editCount` may not match the actual number of edits in the history because it's computed by transforming to line edits
        const { editCount } = this._applyStaleEdits(maxEditCount);
        const edits = new edit_1.Edits(stringEdit_1.StringEdit, this._edits.map(e => e.edit));
        return {
            history: new historyContextProvider_1.DocumentHistory(this.docId, this.languageId, this._baseValue, edits, this._selection),
            editCount,
        };
    }
    applyAllEdits() {
        this._baseValue = this._currentValue;
        this._edits = [];
    }
    _applyStaleEdits(maxEditCount) {
        let lastValue = this._currentValue;
        let recentEdit = stringEdit_1.StringEdit.empty;
        let recentTextLengthEdit = textEditLength_1.TextLengthEdit.empty;
        let i;
        let editCount = 0;
        let mostRecentEdit = stringEdit_1.StringEdit.empty;
        for (i = this._edits.length - 1; i >= 0; i--) {
            const e = this._edits[i];
            if ((0, utils_1.now)() - e.instant > 10 * 60 * 1000) {
                break;
            }
            const potentialNewTextLengthEdit = e.textLengthEdit.compose(recentTextLengthEdit);
            const potentialNewRange = potentialNewTextLengthEdit.getRange();
            // FIXME@ulugbekna: the code below can actually throw if one edit cancels another one out
            (0, types_1.assertType)(potentialNewRange, 'we only compose non-empty Edits');
            if (potentialNewRange.endLineNumber - potentialNewRange.startLineNumber > 100) {
                break;
            }
            const changedLines = sum(e.textLengthEdit.edits, e => (e.range.endLineNumber - e.range.startLineNumber) + e.newLength.lineCount);
            if (changedLines > DocumentState.MAX_EDITED_LINES_PER_EDIT) { // 5k line long -- it should work for both deletion & insertion
                break;
            }
            const newCharacterCount = sum(e.edit.replacements, singleEdit => singleEdit.newText.length);
            if (newCharacterCount > DocumentState.MAX_EDITED_CHARS_PER_EDIT) {
                break;
            }
            const replacedCharacterCount = sum(e.edit.replacements, singleEdit => singleEdit.replaceRange.length);
            if (replacedCharacterCount > DocumentState.MAX_EDITED_CHARS_PER_EDIT) {
                break;
            }
            if (i === this._edits.length - 1) {
                mostRecentEdit = e.edit;
            }
            else {
                const swapResult = stringEdit_1.StringEdit.trySwap(e.edit, mostRecentEdit);
                if (swapResult) {
                    mostRecentEdit = swapResult.e1;
                }
                else {
                    if (changedLines >= 2) {
                        // If the most recent edit (transformed to the current state) intersects with the current edit
                        // and the current edit is too big, composing them would hide the effect of the most recent edit
                        // relative to current edit. So, we stop here.
                        break;
                    }
                    mostRecentEdit = e.edit.compose(mostRecentEdit);
                }
            }
            const inverseE = e.edit.inverse(lastValue.value);
            lastValue = inverseE.applyOnText(lastValue);
            const potentialRecentEdit = e.edit.compose(recentEdit);
            const potentialLineEdit = edit_1.RootedEdit.toLineEdit(new edit_1.RootedEdit(lastValue, potentialRecentEdit));
            const rootedLineEdit = new rootedLineEdit_1.RootedLineEdit(lastValue, potentialLineEdit).removeCommonSuffixPrefixLines(); // do not take into account no-op edits
            const editLineCount = rootedLineEdit.edit.replacements.length;
            if (editLineCount > maxEditCount) {
                break;
            }
            // We take the edit!
            editCount = editLineCount;
            recentEdit = potentialRecentEdit;
            recentTextLengthEdit = potentialNewTextLengthEdit;
        }
        // remove & apply the edits we didn't take
        for (let j = 0; j <= i; j++) {
            const e = this._edits[j];
            this._baseValue = e.edit.applyOnText(this._baseValue);
        }
        this._edits = this._edits.slice(i + 1);
        return { editCount };
    }
    toString() {
        return new edit_1.Edits(stringEdit_1.StringEdit, this._edits.map(e => e.edit)).toHumanReadablePatch(this._baseValue);
    }
}
function sum(arr, f) {
    let result = 0;
    for (const e of arr) {
        result += f(e);
    }
    return result;
}
function editExtends(edit, previousEdit) {
    const newRanges = previousEdit.getNewRanges();
    return edit.replacements.every(e => doesTouch(e.replaceRange, newRanges));
}
function doesTouch(range, sortedRanges) {
    return sortedRanges.some(r => range.start === r.endExclusive || range.endExclusive === r.start);
}
class FifoSet {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this._arr = [];
    }
    push(e) {
        const existing = this._arr.indexOf(e);
        if (existing !== -1) {
            this._arr.splice(existing, 1);
        }
        else if (this._arr.length >= this.maxSize) {
            this._arr.shift();
        }
        this._arr.push(e);
    }
    remove(e) {
        const existing = this._arr.indexOf(e);
        if (existing !== -1) {
            this._arr.splice(existing, 1);
        }
    }
    getItemsReversed() {
        const arr = [...this._arr];
        arr.reverse();
        return arr;
    }
    has(item) {
        return this._arr.indexOf(item) !== -1;
    }
}
//# sourceMappingURL=nesHistoryContextProvider.js.map
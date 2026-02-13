"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentHistory = exports.HistoryContext = void 0;
const assert_1 = require("../../../../util/vs/base/common/assert");
const edit_1 = require("../dataTypes/edit");
class HistoryContext {
    constructor(
    /**
     * Sorted by time, from least recent to most recent.
    */
    documents) {
        this.documents = documents;
        (0, assert_1.assert)(documents.length > 0);
    }
    getMostRecentDocument() {
        return this.documents.at(-1);
    }
    getDocument(docId) {
        return this.documents.find(d => d.docId === docId);
    }
    getDocumentAndIdx(docId) {
        const idx = this.documents.findIndex(d => d.docId === docId);
        if (idx === -1) {
            return undefined;
        }
        return { doc: this.documents[idx], idx };
    }
}
exports.HistoryContext = HistoryContext;
class DocumentHistory {
    constructor(docId, languageId, base, lastEdits, 
    /**
     * Refers to the state after edits
    */
    lastSelection) {
        this.docId = docId;
        this.languageId = languageId;
        this.base = base;
        this.lastEdits = lastEdits;
        this.lastSelection = lastSelection;
        this.lastEdit = new edit_1.RootedEdit(this.base, this.lastEdits.compose());
    }
}
exports.DocumentHistory = DocumentHistory;
//# sourceMappingURL=historyContextProvider.js.map
"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RejectionCollector = void 0;
const observable_1 = require("../../../platform/inlineEdits/common/utils/observable");
const tracing_1 = require("../../../util/common/tracing");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const observable_2 = require("../../../util/vs/base/common/observable");
class RejectionCollector extends lifecycle_1.Disposable {
    constructor(workspace, trace) {
        super();
        this.workspace = workspace;
        this._garbageCollector = this._register(new LRUGarbageCollector(20));
        this._documentCaches = new Map();
        this._tracer = (0, tracing_1.createTracer)(['NES', 'RejectionCollector'], trace);
        (0, observable_2.mapObservableArrayCached)(this, workspace.openDocuments, (doc, store) => {
            const state = new DocumentRejectionTracker(doc, this._garbageCollector, this._tracer);
            this._documentCaches.set(state.doc.id, state);
            store.add((0, observable_1.autorunWithChanges)(this, {
                value: doc.value,
                selection: doc.selection,
                languageId: doc.languageId,
            }, (data) => {
                for (const edit of data.value.changes) {
                    state.handleEdit(edit, data.value.value);
                }
            }));
            store.add((0, lifecycle_1.toDisposable)(() => {
                this._documentCaches.delete(doc.id);
            }));
        }).recomputeInitiallyAndOnChange(this._store);
    }
    reject(docId, edit) {
        const docCache = this._documentCaches.get(docId);
        if (!docCache) {
            this._tracer.trace(`Rejecting, no document cache: ${edit}`);
            return;
        }
        const e = edit.removeCommonSuffixAndPrefix(docCache.doc.value.get().value);
        this._tracer.trace(`Rejecting: ${e}`);
        docCache.reject(e);
    }
    isRejected(docId, edit) {
        const docCache = this._documentCaches.get(docId);
        if (!docCache) {
            this._tracer.trace(`Checking rejection, no document cache: ${edit}`);
            return false;
        }
        const e = edit.removeCommonSuffixAndPrefix(docCache.doc.value.get().value);
        const isRejected = docCache.isRejected(e);
        this._tracer.trace(`Checking rejection, ${isRejected ? 'rejected' : 'not rejected'}: ${e}`);
        return isRejected;
    }
    clear() {
        this._garbageCollector.clear();
    }
}
exports.RejectionCollector = RejectionCollector;
class DocumentRejectionTracker {
    constructor(doc, _garbageCollector, _tracer) {
        this.doc = doc;
        this._garbageCollector = _garbageCollector;
        this._tracer = _tracer;
        this._rejectedEdits = new Set();
    }
    handleEdit(edit, currentContent) {
        for (const r of [...this._rejectedEdits]) {
            r.handleEdit(edit, currentContent); // this can remove the rejected edit from the set
        }
    }
    reject(edit) {
        if (this.isRejected(edit)) {
            // already tracked
            return;
        }
        const r = new RejectedEdit(edit.toEdit(), () => {
            this._tracer.trace(`Evicting: ${edit}`);
            this._rejectedEdits.delete(r);
        });
        this._rejectedEdits.add(r);
        this._garbageCollector.put(r);
    }
    isRejected(edit) {
        for (const r of this._rejectedEdits) {
            if (r.isRejected(edit)) {
                return true;
            }
        }
        return false;
    }
}
class RejectedEdit {
    constructor(_edit, _onDispose) {
        this._edit = _edit;
        this._onDispose = _onDispose;
    }
    handleEdit(edit, currentContent) {
        const d = this._edit.tryRebase(edit);
        if (d) {
            this._edit = d.removeCommonSuffixAndPrefix(currentContent.value);
        }
        else {
            this.dispose();
        }
    }
    isRejected(edit) {
        return this._edit.equals(edit.toEdit());
    }
    dispose() {
        this._onDispose();
    }
}
class LRUGarbageCollector {
    constructor(_maxSize) {
        this._maxSize = _maxSize;
        this._disposables = [];
    }
    put(disposable) {
        this._disposables.push(disposable);
        if (this._disposables.length > this._maxSize) {
            this._disposables.shift().dispose();
        }
    }
    clear() {
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
    dispose() {
        this.clear();
    }
}
//# sourceMappingURL=rejectionCollector.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeTracker = void 0;
const textDocumentManager_1 = require("./textDocumentManager");
/**
 * A tracker which can take an arbitrary number of actions to run after a given timeout
 * When all pushed timeouts have been resolved, the tracker disposes of itself.
 */
let ChangeTracker = class ChangeTracker {
    get offset() {
        return this._offset;
    }
    constructor(fileURI, insertionOffset, documentManager) {
        this._referenceCount = 0;
        this._isDisposed = false;
        this._offset = insertionOffset;
        this._tracker = documentManager.onDidChangeTextDocument(e => {
            if (e.document.uri === fileURI) {
                for (const cc of e.contentChanges) {
                    if (cc.rangeOffset + cc.rangeLength <= this.offset) {
                        const delta = cc.text.length - cc.rangeLength;
                        this._offset = this._offset + delta;
                    }
                }
            }
        });
    }
    push(action, timeout) {
        if (this._isDisposed) {
            throw new Error('Unable to push new actions to a disposed ChangeTracker');
        }
        this._referenceCount++;
        setTimeout(() => {
            action();
            this._referenceCount--;
            if (this._referenceCount === 0) {
                this._tracker.dispose();
                this._isDisposed = true;
            }
        }, timeout);
    }
};
exports.ChangeTracker = ChangeTracker;
exports.ChangeTracker = ChangeTracker = __decorate([
    __param(2, textDocumentManager_1.ICompletionsTextDocumentManagerService)
], ChangeTracker);
//# sourceMappingURL=changeTracker.js.map
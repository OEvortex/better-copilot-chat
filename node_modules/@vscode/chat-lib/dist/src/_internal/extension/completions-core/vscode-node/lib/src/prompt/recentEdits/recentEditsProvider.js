"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
exports.FullRecentEditsProvider = exports.ICompletionsRecentEditsProviderService = void 0;
const observable_1 = require("../../../../../../../platform/inlineEdits/common/utils/observable");
const services_1 = require("../../../../../../../util/common/services");
const lifecycle_1 = require("../../../../../../../util/vs/base/common/lifecycle");
const observableInternal_1 = require("../../../../../../../util/vs/base/common/observableInternal");
const completionsObservableWorkspace_1 = require("../../completionsObservableWorkspace");
const recentEditsReducer_1 = require("./recentEditsReducer");
exports.ICompletionsRecentEditsProviderService = (0, services_1.createServiceIdentifier)('ICompletionsRecentEditsProviderService');
const RECENT_EDITS_DEFAULT_CONFIG = Object.freeze({
    maxFiles: 20,
    maxEdits: 8,
    diffContextLines: 3,
    editMergeLineDistance: 1,
    maxCharsPerEdit: 2000,
    debounceTimeout: 500,
    summarizationFormat: 'diff',
    removeDeletedLines: false,
    insertionsBeforeDeletions: true,
    appendNoReplyMarker: true,
    activeDocDistanceLimitFromCursor: 100,
    maxLinesPerEdit: 10,
});
let FullRecentEditsProvider = class FullRecentEditsProvider extends lifecycle_1.Disposable {
    constructor(config, observableWorkspace) {
        super();
        this.observableWorkspace = observableWorkspace;
        this._started = false;
        this.recentEditMap = {};
        this.recentEdits = [];
        this.recentEditSummaries = new WeakMap();
        this.debounceTimeouts = {};
        this._config = config ?? Object.assign({}, RECENT_EDITS_DEFAULT_CONFIG);
    }
    get config() {
        return this._config;
    }
    isEnabled() {
        return true;
    }
    getRecentEdits() {
        return this.recentEdits;
    }
    getEditSummary(edit) {
        return this.recentEditSummaries.get(edit) ?? null;
    }
    updateRecentEdits(docId, newContents) {
        this.recentEditMap = (0, recentEditsReducer_1.recentEditsReducer)(this.recentEditMap, docId, newContents, this._config);
        this.recentEdits = (0, recentEditsReducer_1.getAllRecentEditsByTimestamp)(this.recentEditMap);
        this.recentEdits.forEach(edit => {
            if (!this.recentEditSummaries.has(edit)) {
                // Generate a summary for the edit if it doesn't already exist
                const summary = (0, recentEditsReducer_1.summarizeEdit)(edit, this._config);
                this.recentEditSummaries.set(edit, summary);
            }
        });
    }
    start() {
        // By the default, the provider starts lazily on the first completion request.
        if (this._started) {
            return;
        }
        this._started = true;
        (0, observableInternal_1.mapObservableArrayCached)(this, this.observableWorkspace.openDocuments, (doc, store) => {
            store.add((0, observable_1.autorunWithChanges)(this, {
                value: doc.value,
                selection: doc.selection,
                languageId: doc.languageId,
            }, data => {
                if (data.value.changes.length > 0) {
                    const prevText = data.value.previous?.value;
                    const newText = data.value.value.value;
                    const docId = doc.id.toString();
                    // clear any existing debounce timeout for this document
                    // note that you can call clearTimeout on undefined, so we don't need to check if it exists
                    clearTimeout(this.debounceTimeouts[docId]);
                    if (!this.recentEditMap[docId] && prevText) {
                        // This is the first time the edit is being stored, but we also know what the previous text was.
                        // We need to add the previous text to the reducer so that we can get a diff.
                        this.updateRecentEdits(docId, prevText);
                    }
                    else if (this._config.debounceTimeout === 0) {
                        // allow setting debounce to 0 in experiments / settings for immediate updates
                        this.updateRecentEdits(docId, newText);
                    }
                    else {
                        // update in a few milliseconds
                        this.debounceTimeouts[docId] = setTimeout(() => {
                            this.updateRecentEdits(docId, newText);
                        }, this._config.debounceTimeout ?? 500);
                    }
                }
            }));
        }, d => d.id).recomputeInitiallyAndOnChange(this._store);
    }
};
exports.FullRecentEditsProvider = FullRecentEditsProvider;
exports.FullRecentEditsProvider = FullRecentEditsProvider = __decorate([
    __param(1, completionsObservableWorkspace_1.ICompletionsObservableWorkspace)
], FullRecentEditsProvider);
//# sourceMappingURL=recentEditsProvider.js.map
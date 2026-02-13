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
exports.OpenTabFiles = void 0;
const documentTracker_1 = require("../../documentTracker");
const textDocumentManager_1 = require("../../textDocumentManager");
const neighborFiles_1 = require("./neighborFiles");
let OpenTabFiles = class OpenTabFiles {
    constructor(docManager) {
        this.docManager = docManager;
    }
    truncateDocs(docs, uri, languageId, maxNumNeighborFiles) {
        const openFiles = new Map();
        let totalLen = 0;
        for (const doc of docs) {
            if (totalLen + doc.getText().length > neighborFiles_1.NeighborSource.MAX_NEIGHBOR_AGGREGATE_LENGTH) {
                continue;
            }
            if (doc.uri.startsWith('file:') &&
                uri.startsWith('file:') &&
                doc.uri !== uri &&
                (0, neighborFiles_1.considerNeighborFile)(languageId, doc.detectedLanguageId)) {
                openFiles.set(doc.uri.toString(), {
                    uri: doc.uri.toString(),
                    relativePath: this.docManager.getRelativePath(doc),
                    source: doc.getText(),
                });
                totalLen += doc.getText().length;
            }
            if (openFiles.size >= maxNumNeighborFiles) {
                break;
            }
        }
        return openFiles;
    }
    /**
     * Get the neighbor files. Current it supports open editors.
     * @param uri The uri of the current open file.
     * @param languageId The language id of the current open file.
     * @param maxNumNeighborFiles The max number of neighbor files to return.
     * @returns Include 2 items.
     *          1. The merged unique documents, which is not exceeding MAX_NEIGHBOR_FILES.
     *          2. For each neighbor type, the files that are included in the merged unique documents.
     */
    async getNeighborFiles(uri, languageId, maxNumNeighborFiles) {
        let neighborFiles = new Map();
        const neighborSource = new Map();
        neighborFiles = this.truncateDocs((0, documentTracker_1.sortByAccessTimes)(await this.docManager.textDocuments()), uri, languageId, maxNumNeighborFiles);
        neighborSource.set(neighborFiles_1.NeighboringFileType.OpenTabs, Array.from(neighborFiles.keys()).map(uri => uri.toString()));
        return {
            docs: neighborFiles,
            neighborSource: neighborSource,
        };
    }
};
exports.OpenTabFiles = OpenTabFiles;
exports.OpenTabFiles = OpenTabFiles = __decorate([
    __param(0, textDocumentManager_1.ICompletionsTextDocumentManagerService)
], OpenTabFiles);
//# sourceMappingURL=openTabFiles.js.map
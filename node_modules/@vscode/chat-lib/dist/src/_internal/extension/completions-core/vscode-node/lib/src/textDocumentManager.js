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
exports.TextDocumentManager = exports.ICompletionsTextDocumentManagerService = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../util/common/services");
const instantiation_1 = require("../../../../../util/vs/platform/instantiation/common/instantiation");
const fileSystem_1 = require("./fileSystem");
const documentEvaluation_1 = require("./util/documentEvaluation");
const uri_1 = require("./util/uri");
exports.ICompletionsTextDocumentManagerService = (0, services_1.createServiceIdentifier)('ICompletionsTextDocumentManagerService');
let TextDocumentManager = class TextDocumentManager {
    constructor(instantiationService, fileSystem) {
        this.instantiationService = instantiationService;
        this.fileSystem = fileSystem;
    }
    async textDocuments() {
        const documents = this.getTextDocumentsUnsafe();
        const filteredDocuments = [];
        for (const doc of documents) {
            const result = await this.instantiationService.invokeFunction(documentEvaluation_1.isDocumentValid, doc);
            // Only return valid documents
            if (result.status === 'valid') {
                filteredDocuments.push(doc);
            }
        }
        return filteredDocuments;
    }
    /**
     * Get the text document for the given URI, skipping content exclusions and other validations.
     */
    getTextDocumentUnsafe(docId) {
        const uri = (0, uri_1.normalizeUri)(docId.uri);
        return this.getTextDocumentsUnsafe().find(t => t.uri === uri);
    }
    /**
     * Get the text document for the given URI, checking content exclusions and other validations.
     */
    async getTextDocument(docId) {
        return this.getTextDocumentWithValidation(docId).then(result => {
            if (result.status === 'valid') {
                return result.document;
            }
            return undefined;
        });
    }
    async validateTextDocument(docId) {
        return await this.instantiationService.invokeFunction(documentEvaluation_1.isDocumentValid, docId);
    }
    /**
     * Get a TextDocumentValidation for the given document URI.  Unlike other methods, this supports reading the
     * document from disk.
     */
    async getTextDocumentValidation(docId) {
        try {
            return await this.validateTextDocument(docId);
        }
        catch (err) {
            return this.notFoundResult(docId);
        }
    }
    /**
     * Get a TextDocumentResult for the given document URI.
     */
    async getTextDocumentWithValidation(docId) {
        const document = this.getTextDocumentUnsafe(docId);
        if (!document) {
            return this.notFoundResult(docId);
        }
        const result = await this.validateTextDocument(docId);
        return result.status === 'valid' ? { status: 'valid', document } : result;
    }
    notFoundResult({ uri }) {
        return {
            status: 'notfound',
            message: `Document for URI could not be found: ${uri}`,
        };
    }
    /**
     * Implements ability to open a text document that is currently not open (and not tracked by the document manager).
     *
     * This is usually used with asychronous operations like the postInsertion callbacks that
     * analyze a document long time after the user interacted with it.
     */
    async readTextDocumentFromDisk(uri) {
        try {
            const fileStat = await this.fileSystem.stat(uri);
            if (fileStat.size > 5 * 1024 * 1024) {
                return undefined;
            }
        }
        catch (e) {
            // ignore if file does not exist
            return undefined;
        }
        return await this.fileSystem.readFileString(uri);
    }
    getWorkspaceFolder(doc) {
        const uri = (0, uri_1.normalizeUri)(doc.uri);
        return this.getWorkspaceFolders().find(f => uri.startsWith((0, uri_1.normalizeUri)(f.uri)));
    }
    /**
     * Get the path of the given document relative to one of the workspace folders,
     * or its basename if it is not under any of the workspace folders.
     * Returns `undefined` if the file is untitled.
     */
    getRelativePath(doc) {
        if (doc.uri.startsWith('untitled:')) {
            // matches the internal implementation of .isUntitled on vscode.TextDocument
            // and example URLs in the LSP spec
            return undefined;
        }
        const uri = (0, uri_1.normalizeUri)(doc.uri);
        for (const folder of this.getWorkspaceFolders()) {
            const parentURI = (0, uri_1.normalizeUri)(folder.uri)
                .replace(/[#?].*/, '')
                .replace(/\/?$/, '/');
            if (uri.startsWith(parentURI)) {
                return uri.slice(parentURI.length);
            }
        }
        return (0, uri_1.basename)(uri);
    }
};
exports.TextDocumentManager = TextDocumentManager;
exports.TextDocumentManager = TextDocumentManager = __decorate([
    __param(0, instantiation_1.IInstantiationService),
    __param(1, fileSystem_1.ICompletionsFileSystemService)
], TextDocumentManager);
//# sourceMappingURL=textDocumentManager.js.map
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
exports.FileReader = exports.ICompletionsFileReaderService = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../util/common/services");
const instantiation_1 = require("../../../../../util/vs/platform/instantiation/common/instantiation");
const fileSystem_1 = require("./fileSystem");
const textDocument_1 = require("./textDocument");
const textDocumentManager_1 = require("./textDocumentManager");
const documentEvaluation_1 = require("./util/documentEvaluation");
const uri_1 = require("./util/uri");
exports.ICompletionsFileReaderService = (0, services_1.createServiceIdentifier)('ICompletionsFileReaderService');
let FileReader = class FileReader {
    constructor(documentManagerService, instantiationService, fileSystemService) {
        this.documentManagerService = documentManagerService;
        this.instantiationService = instantiationService;
        this.fileSystemService = fileSystemService;
    }
    getRelativePath(doc) {
        return this.documentManagerService.getRelativePath(doc) ?? (0, uri_1.basename)(doc.uri);
    }
    getOrReadTextDocument(doc) {
        return this.readFile(doc.uri);
    }
    getOrReadTextDocumentWithFakeClientProperties(doc) {
        return this.readFile(doc.uri);
    }
    /**
     * @deprecated use `getOrReadTextDocument` instead
     */
    async readFile(uri) {
        const documentResult = await this.documentManagerService.getTextDocumentWithValidation({ uri });
        if (documentResult.status !== 'notfound') {
            return documentResult;
        }
        try {
            const fileSizeMB = await this.getFileSizeMB(uri);
            // Note: the real production behavior actually blocks files larger than 5MB
            if (fileSizeMB > 1) {
                // Using notfound instead of invalid because of the mapping in statusFromTextDocumentResult
                return { status: 'notfound', message: 'File too large' };
            }
            const text = await this.doReadFile(uri);
            // Note, that we check for blocked files even for empty files!
            const rcmResult = await this.instantiationService.invokeFunction(documentEvaluation_1.isDocumentValid, { uri });
            if (rcmResult.status === 'valid') {
                const doc = textDocument_1.CopilotTextDocument.create(uri, 'UNKNOWN', -1, text);
                return { status: 'valid', document: doc };
            }
            return rcmResult;
        }
        catch (e) {
            return { status: 'notfound', message: 'File not found' };
        }
    }
    async doReadFile(uri) {
        return await this.fileSystemService.readFileString(uri);
    }
    async getFileSizeMB(uri) {
        const stat = await this.fileSystemService.stat(uri);
        return stat.size / 1024 / 1024;
    }
};
exports.FileReader = FileReader;
exports.FileReader = FileReader = __decorate([
    __param(0, textDocumentManager_1.ICompletionsTextDocumentManagerService),
    __param(1, instantiation_1.IInstantiationService),
    __param(2, fileSystem_1.ICompletionsFileSystemService)
], FileReader);
//# sourceMappingURL=fileReader.js.map
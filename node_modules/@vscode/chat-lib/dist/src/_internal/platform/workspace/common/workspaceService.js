"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullWorkspaceService = exports.AbstractWorkspaceService = exports.IWorkspaceService = void 0;
exports.getWorkspaceFileDisplayPath = getWorkspaceFileDisplayPath;
const notebooks_1 = require("../../../util/common/notebooks");
const services_1 = require("../../../util/common/services");
const path = __importStar(require("../../../util/vs/base/common/path"));
const resources_1 = require("../../../util/vs/base/common/resources");
const uri_1 = require("../../../util/vs/base/common/uri");
const notebookDocumentSnapshot_1 = require("../../editing/common/notebookDocumentSnapshot");
const textDocumentSnapshot_1 = require("../../editing/common/textDocumentSnapshot");
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const event_1 = require("../../../util/vs/base/common/event");
exports.IWorkspaceService = (0, services_1.createServiceIdentifier)('IWorkspaceService');
class AbstractWorkspaceService {
    asRelativePath(pathOrUri, includeWorkspaceFolder) {
        // Copied from the implementation in vscode/extHostWorkspace.ts
        let resource;
        let path = '';
        if (typeof pathOrUri === 'string') {
            resource = uri_1.URI.file(pathOrUri);
            path = pathOrUri;
        }
        else if (typeof pathOrUri !== 'undefined') {
            resource = pathOrUri;
            path = pathOrUri.fsPath;
        }
        if (!resource) {
            return path;
        }
        const folder = this.getWorkspaceFolder(resource);
        if (!folder) {
            return path;
        }
        if (typeof includeWorkspaceFolder === 'undefined') {
            includeWorkspaceFolder = this.getWorkspaceFolders().length > 1;
        }
        let result = (0, resources_1.relativePath)(folder, resource);
        if (includeWorkspaceFolder) {
            const name = this.getWorkspaceFolderName(folder);
            result = `${name}/${result}`;
        }
        return result;
    }
    async openTextDocumentAndSnapshot(uri) {
        const doc = await this.openTextDocument(uri);
        return textDocumentSnapshot_1.TextDocumentSnapshot.create(doc);
    }
    async openNotebookDocumentAndSnapshot(uri, format) {
        // Possible we have an untitled file opened as a notebook.
        const doc = (0, notebooks_1.findNotebook)(uri, this.notebookDocuments) || await this.openNotebookDocument(uri);
        return notebookDocumentSnapshot_1.NotebookDocumentSnapshot.create(doc, format);
    }
    getWorkspaceFolder(resource) {
        return this.getWorkspaceFolders().find(folder => resources_1.extUriBiasedIgnorePathCase.isEqualOrParent(resource, folder));
    }
}
exports.AbstractWorkspaceService = AbstractWorkspaceService;
function getWorkspaceFileDisplayPath(workspaceService, file) {
    const workspaceUri = workspaceService.getWorkspaceFolder(file);
    return workspaceUri ? path.posix.relative(workspaceUri.path, file.path) : file.path;
}
class NullWorkspaceService extends AbstractWorkspaceService {
    constructor(workspaceFolders = [], textDocuments = [], notebookDocuments = []) {
        super();
        this.disposables = new lifecycle_1.DisposableStore();
        this.didOpenTextDocumentEmitter = this.disposables.add(new event_1.Emitter());
        this.didCloseTextDocumentEmitter = this.disposables.add(new event_1.Emitter());
        this.didOpenNotebookDocumentEmitter = this.disposables.add(new event_1.Emitter());
        this.didCloseNotebookDocumentEmitter = this.disposables.add(new event_1.Emitter());
        this.didChangeTextDocumentEmitter = this.disposables.add(new event_1.Emitter());
        this.didChangeWorkspaceFoldersEmitter = this.disposables.add(new event_1.Emitter());
        this.didChangeNotebookDocumentEmitter = this.disposables.add(new event_1.Emitter());
        this.didChangeTextEditorSelectionEmitter = this.disposables.add(new event_1.Emitter());
        this.onDidChangeTextDocument = this.didChangeTextDocumentEmitter.event;
        this.onDidCloseTextDocument = this.didCloseTextDocumentEmitter.event;
        this.onDidOpenNotebookDocument = this.didOpenNotebookDocumentEmitter.event;
        this.onDidCloseNotebookDocument = this.didCloseNotebookDocumentEmitter.event;
        this.onDidOpenTextDocument = this.didOpenTextDocumentEmitter.event;
        this.onDidChangeWorkspaceFolders = this.didChangeWorkspaceFoldersEmitter.event;
        this.onDidChangeNotebookDocument = this.didChangeNotebookDocumentEmitter.event;
        this.onDidChangeTextEditorSelection = this.didChangeTextEditorSelectionEmitter.event;
        this._textDocuments = [];
        this._notebookDocuments = [];
        this.workspaceFolder = workspaceFolders;
        this._textDocuments = textDocuments;
        this._notebookDocuments = notebookDocuments;
    }
    get textDocuments() {
        return this._textDocuments;
    }
    showTextDocument(document) {
        return Promise.resolve();
    }
    async openTextDocument(uri) {
        const doc = this.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (doc) {
            return doc;
        }
        throw new Error(`Unknown document: ${uri}`);
    }
    async openNotebookDocument(arg1, arg2) {
        if (typeof arg1 === 'string') {
            // Handle the overload for notebookType and content
            throw new Error('Not implemented');
        }
        else {
            const notebook = this.notebookDocuments.find(d => d.uri.toString() === arg1.toString());
            if (notebook) {
                return notebook;
            }
            throw new Error(`Unknown notebook: ${arg1}`);
        }
    }
    get notebookDocuments() {
        return this._notebookDocuments;
    }
    getWorkspaceFolders() {
        return this.workspaceFolder;
    }
    getWorkspaceFolderName(workspaceFolderUri) {
        return 'default';
    }
    ensureWorkspaceIsFullyLoaded() {
        // We aren't using virtual workspaces here, so we can just return
        return Promise.resolve();
    }
    showWorkspaceFolderPicker() {
        return Promise.resolve(undefined);
    }
    applyEdit() {
        return Promise.resolve(true);
    }
    dispose() {
        this.disposables.dispose();
    }
}
exports.NullWorkspaceService = NullWorkspaceService;
//# sourceMappingURL=workspaceService.js.map
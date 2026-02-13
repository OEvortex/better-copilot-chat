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
exports.RegisteredEditorPriority = void 0;
exports.findNotebook = findNotebook;
exports.findCell = findCell;
exports.getNotebookCellOutput = getNotebookCellOutput;
exports.getNotebookAndCellFromUri = getNotebookAndCellFromUri;
exports.isNotebookCellOrNotebookChatInput = isNotebookCellOrNotebookChatInput;
exports.isNotebookCell = isNotebookCell;
exports.isJupyterNotebookUri = isJupyterNotebookUri;
exports.isJupyterNotebook = isJupyterNotebook;
exports.serializeNotebookDocument = serializeNotebookDocument;
exports.extractNotebookOutline = extractNotebookOutline;
exports.isDocumentExcludePattern = isDocumentExcludePattern;
exports.isFilenamePattern = isFilenamePattern;
exports.isRelativePattern = isRelativePattern;
exports.isNotebookEditorContribution = isNotebookEditorContribution;
exports.extractEditorAssociation = extractEditorAssociation;
exports.notebookSelectorMatches = notebookSelectorMatches;
exports.getNotebookEditorAssociations = getNotebookEditorAssociations;
exports._hasSupportedNotebooks = _hasSupportedNotebooks;
const glob = __importStar(require("../vs/base/common/glob"));
const network_1 = require("../vs/base/common/network");
const path_1 = require("../vs/base/common/path");
const resources_1 = require("../vs/base/common/resources");
var RegisteredEditorPriority;
(function (RegisteredEditorPriority) {
    RegisteredEditorPriority["builtin"] = "builtin";
    RegisteredEditorPriority["option"] = "option";
    RegisteredEditorPriority["exclusive"] = "exclusive";
    RegisteredEditorPriority["default"] = "default";
})(RegisteredEditorPriority || (exports.RegisteredEditorPriority = RegisteredEditorPriority = {}));
/**
 * Find a notebook document by uri or cell uri.
 */
function findNotebook(uri, notebookDocuments) {
    return notebookDocuments.find(doc => (0, resources_1.isEqual)(doc.uri, uri) || doc.uri.path === uri.path || findCell(uri, doc));
}
function findCell(cellUri, notebook) {
    if (cellUri.scheme === network_1.Schemas.vscodeNotebookCell || cellUri.scheme === network_1.Schemas.vscodeNotebookCellOutput) {
        // Fragment is not unique to a notebook, hence ensure we compaure the path as well.
        const index = notebook.getCells().findIndex(cell => (0, resources_1.isEqual)(cell.document.uri, cellUri) || (cell.document.uri.fragment === cellUri.fragment && cell.document.uri.path === cellUri.path));
        if (index !== -1) {
            return notebook.getCells()[index];
        }
    }
}
function getNotebookCellOutput(outputUri, notebookDocuments) {
    if (outputUri.scheme !== network_1.Schemas.vscodeNotebookCellOutput) {
        return undefined;
    }
    const params = new URLSearchParams(outputUri.query);
    const [notebook, cell] = getNotebookAndCellFromUri(outputUri, notebookDocuments);
    if (!cell || !cell.outputs.length) {
        return undefined;
    }
    const outputIndex = (params.get('outputIndex') ? parseInt(params.get('outputIndex') || '', 10) : undefined) || 0;
    if (outputIndex > (cell.outputs.length - 1)) {
        return;
    }
    return [notebook, cell, cell.outputs[outputIndex]];
}
function getNotebookAndCellFromUri(uri, notebookDocuments) {
    const notebook = findNotebook(uri, notebookDocuments) || notebookDocuments.find(doc => doc.uri.path === uri.path);
    if (!notebook) {
        return [undefined, undefined];
    }
    const cell = findCell(uri, notebook);
    if (cell === undefined) {
        // Possible the cell has since been deleted.
        return [notebook, undefined];
    }
    return [notebook, cell];
}
function isNotebookCellOrNotebookChatInput(uri) {
    return uri.scheme === network_1.Schemas.vscodeNotebookCell
        // Support the experimental cell chat widget
        || (uri.scheme === 'untitled' && uri.fragment.startsWith('notebook-chat-input'));
}
function isNotebookCell(uri) {
    return uri.scheme === network_1.Schemas.vscodeNotebookCell;
}
function isJupyterNotebookUri(uri) {
    return uri.path.endsWith('.ipynb');
}
function isJupyterNotebook(notebook) {
    return notebook.notebookType === 'jupyter-notebook';
}
function serializeNotebookDocument(document, features = {}) {
    return JSON.stringify({
        cells: document.getCells().map(cell => ({
            uri_fragment: features.cell_uri_fragment ? cell.document.uri.fragment : undefined,
            cell_type: cell.kind,
            source: cell.document.getText().split(/\r?\n/),
        }))
    });
}
function extractNotebookOutline(response) {
    try {
        const trimmedResponse = response.replace(/\n/g, '');
        const regex = /```(?:json)?(.+)/g;
        const match = regex.exec(trimmedResponse);
        if (match) {
            const prefixTrimed = match[1];
            // remove content after ```
            const suffixBacktick = prefixTrimed.indexOf('```');
            const json = suffixBacktick === -1 ? prefixTrimed : prefixTrimed.substring(0, suffixBacktick);
            return JSON.parse(json);
        }
    }
    catch (ex) { }
    return undefined;
}
/**
 * Checks if the provided pattern is a document exclude pattern
 */
function isDocumentExcludePattern(pattern) {
    const arg = pattern;
    // Check if it has include property (exclude is optional)
    return typeof arg === 'object' && arg !== null &&
        (typeof arg.include === 'string' || isRelativePattern(arg.include));
}
/**
 * Checks if the provided pattern is a filename pattern
 */
function isFilenamePattern(pattern) {
    const arg = pattern;
    // Check if it has filenamePattern property
    return typeof arg === 'object' && arg !== null && typeof arg.filenamePattern === 'string';
}
/**a
 * Checks if the provided object is a RelativePattern
 */
function isRelativePattern(obj) {
    const rp = obj;
    if (!rp) {
        return false;
    }
    return typeof rp.base === 'string' && typeof rp.pattern === 'string';
}
/**
 * Checks if the provided object is a valid INotebookEditorContribution
 */
function isNotebookEditorContribution(contrib) {
    const candidate = contrib;
    return !!candidate && !!candidate.type && !!candidate.displayName && !!candidate.selector;
}
/**
 * Extracts editor associations from the raw editor association config object
 *
 * @param raw The raw editor association config object
 * @returns An array of EditorAssociation objects
 */
function extractEditorAssociation(raw) {
    const associations = [];
    for (const [filenamePattern, viewType] of Object.entries(raw)) {
        if (viewType) {
            associations.push({ filenamePattern, viewType });
        }
    }
    return associations;
}
/**
 * Checks if a resource matches a selector
 */
function notebookSelectorMatches(resource, selector) {
    if (typeof selector === 'string') {
        // selector as string
        if (glob.match(selector.toLowerCase(), (0, path_1.basename)(resource.fsPath).toLowerCase())) {
            return true;
        }
    }
    if (isDocumentExcludePattern(selector)) {
        // selector as INotebookExclusiveDocumentFilter
        const filenamePattern = selector.include;
        const excludeFilenamePattern = selector.exclude;
        if (!filenamePattern) {
            return false;
        }
        if (glob.match(filenamePattern, (0, path_1.basename)(resource.fsPath).toLowerCase())) {
            if (excludeFilenamePattern && glob.match(excludeFilenamePattern, (0, path_1.basename)(resource.fsPath).toLowerCase())) {
                return false;
            }
            return true;
        }
    }
    if (isFilenamePattern(selector)) {
        // selector as INotebookFilenamePattern
        if (glob.match(selector.filenamePattern, (0, path_1.basename)(resource.fsPath).toLowerCase())) {
            if (selector.excludeFileNamePattern && glob.match(selector.excludeFileNamePattern, (0, path_1.basename)(resource.fsPath).toLowerCase())) {
                return false;
            }
            return true;
        }
    }
    return false;
}
/**
 * Returns all associations that match the glob of the provided resource
 */
function getNotebookEditorAssociations(resource, editorAssociations) {
    const validAssociations = [];
    for (const a of editorAssociations) {
        if (a.filenamePattern && glob.match(a.filenamePattern.toLowerCase(), (0, path_1.basename)(resource.fsPath).toLowerCase())) {
            validAssociations.push({ filenamePattern: a.filenamePattern, viewType: a.viewType });
        }
    }
    return validAssociations;
}
/**
 * Checks if the provided resource has a supported notebook provider
 */
function _hasSupportedNotebooks(uri, workspaceNotebookDocuments, notebookEditorContributions, editorAssociations) {
    if (findNotebook(uri, workspaceNotebookDocuments)) {
        return true;
    }
    const validNotebookEditorContribs = notebookEditorContributions.filter(notebookEditorContrib => notebookEditorContrib.selector.some(selector => notebookSelectorMatches(uri, selector)));
    if (validNotebookEditorContribs.length === 0) {
        return false;
    }
    const validAssociations = getNotebookEditorAssociations(uri, editorAssociations);
    for (const association of validAssociations) {
        if (validNotebookEditorContribs.some(notebookEditorContrib => notebookEditorContrib.type === association.viewType)) {
            return true;
        }
    }
    // often users won't have associations that take priority, so check the priority of our valid providers
    // a provider with priority !default will only be chosen if there is an association that matches, so we need default at this point
    // In VS Code, if priority is empty, it defaults to `default`, vscode/main/src/vs/workbench/contrib/notebook/browser/notebookExtensionPoint.ts#L110
    if (validNotebookEditorContribs.some(notebookEditorContrib => (notebookEditorContrib.priority ?? RegisteredEditorPriority.default) === RegisteredEditorPriority.default)) {
        return true;
    }
    else {
        return false;
    }
}
//# sourceMappingURL=notebooks.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotTextDocument = exports.LocationFactory = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const languageDetection_1 = require("./language/languageDetection");
const uri_1 = require("./util/uri");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
class LocationFactory {
    static { this.range = vscode_languageserver_types_1.Range.create.bind(vscode_languageserver_types_1.Range); }
    static { this.position = vscode_languageserver_types_1.Position.create.bind(vscode_languageserver_types_1.Position); }
}
exports.LocationFactory = LocationFactory;
class CopilotTextDocument {
    constructor(uri, _textDocument, detectedLanguageId) {
        this.uri = uri;
        this._textDocument = _textDocument;
        this.detectedLanguageId = detectedLanguageId;
    }
    /**
     * Return a copy of a document with a new version number and changes applied. Used when a document is changed
     * canonically (e.g., synced via textDocument/didChange).
     */
    static withChanges(textDocument, changes, version) {
        const lspDoc = vscode_languageserver_textdocument_1.TextDocument.create(textDocument.clientUri, textDocument.clientLanguageId, version, textDocument.getText());
        vscode_languageserver_textdocument_1.TextDocument.update(lspDoc, changes, version);
        return new CopilotTextDocument(textDocument.uri, lspDoc, textDocument.detectedLanguageId);
    }
    /**
     * Return a copy of a document with the same version number and edits applied.
     * Used when the changes *aren't* canonical (e.g., a speculative completion request).
     */
    applyEdits(edits) {
        const lspDoc = vscode_languageserver_textdocument_1.TextDocument.create(this.clientUri, this.clientLanguageId, this.version, this.getText());
        vscode_languageserver_textdocument_1.TextDocument.update(lspDoc, edits.map(c => ({ text: c.newText, range: c.range })), this.version);
        return new CopilotTextDocument(this.uri, lspDoc, this.detectedLanguageId);
    }
    static create(uri, languageId, version, text, detectedLanguageId = (0, languageDetection_1.detectLanguage)({ uri, languageId })) {
        return new CopilotTextDocument((0, uri_1.normalizeUri)(uri), vscode_languageserver_textdocument_1.TextDocument.create(uri, languageId, version, text), detectedLanguageId);
    }
    get clientUri() {
        return this._textDocument.uri;
    }
    get clientLanguageId() {
        return this._textDocument.languageId;
    }
    get languageId() {
        return this._textDocument.languageId;
    }
    get version() {
        return this._textDocument.version;
    }
    get lineCount() {
        return this._textDocument.lineCount;
    }
    getText(range) {
        return this._textDocument.getText(range);
    }
    positionAt(offset) {
        return this._textDocument.positionAt(offset);
    }
    offsetAt(position) {
        return this._textDocument.offsetAt(position);
    }
    lineAt(position) {
        const lineNumber = typeof position === 'number' ? position : position.line;
        if (lineNumber < 0 || lineNumber >= this.lineCount) {
            throw new RangeError('Illegal value for lineNumber');
        }
        const rangeWithNewline = vscode_languageserver_types_1.Range.create(lineNumber, 0, lineNumber + 1, 0);
        const text = this.getText(rangeWithNewline).replace(/\r\n$|\r$|\n$/g, '');
        const range = vscode_languageserver_types_1.Range.create(vscode_languageserver_types_1.Position.create(lineNumber, 0), vscode_languageserver_types_1.Position.create(lineNumber, text.length));
        const isEmptyOrWhitespace = text.trim().length === 0;
        return { text, range, isEmptyOrWhitespace };
    }
}
exports.CopilotTextDocument = CopilotTextDocument;
//# sourceMappingURL=textDocument.js.map
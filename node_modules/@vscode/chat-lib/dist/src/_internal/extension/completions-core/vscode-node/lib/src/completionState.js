"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionState = void 0;
exports.createCompletionState = createCompletionState;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const src_1 = require("../../types/src");
class CompletionState {
    constructor(_textDocument, _position, edits = [], originalPosition, originalVersion, originalOffset) {
        this._textDocument = _textDocument;
        this._position = _position;
        this.originalPosition = originalPosition ?? src_1.Position.create(_position.line, _position.character);
        this.originalVersion = originalVersion ?? _textDocument.version;
        this.originalOffset = originalOffset ?? _textDocument.offsetAt(this.originalPosition);
        this._editsWithPosition = [...edits];
    }
    get textDocument() {
        return this._textDocument;
    }
    get position() {
        return this._position;
    }
    get editsWithPosition() {
        return [...this._editsWithPosition];
    }
    updateState(textDocument, position, edits) {
        return new CompletionState(textDocument, position, edits ?? this.editsWithPosition, this.originalPosition, this.originalVersion, this.originalOffset);
    }
    updatePosition(position) {
        return this.updateState(this._textDocument, position);
    }
    addSelectedCompletionInfo(selectedCompletionInfo) {
        if (this.editsWithPosition.find(edit => edit.source === 'selectedCompletionInfo')) {
            throw new Error('Selected completion info already applied');
        }
        const edit = {
            range: selectedCompletionInfo.range,
            newText: selectedCompletionInfo.text,
        };
        return this.applyEdits([edit], true);
    }
    applyEdits(edits, isSelectedCompletionInfo = false) {
        if (isSelectedCompletionInfo && edits.length > 1) {
            throw new Error('Selected completion info should be a single edit');
        }
        let textDocument = this._textDocument;
        let position = this._position;
        let offset = textDocument.offsetAt(position);
        const newEdits = this.editsWithPosition;
        for (const { range, newText } of edits) {
            const oldText = textDocument.getText(range);
            const oldEndOffset = textDocument.offsetAt(range.end);
            textDocument = textDocument.applyEdits([{ range, newText }]);
            // We err on the side of updating the position if it's exactly aligned with the start of the range.  This is
            // what we want in the context of applying a completion, but it does make some operations impossible, like
            // preserving a position at the start of the document (line 0 column 0).
            if (offset < textDocument.offsetAt(range.start)) {
                const edit = {
                    range,
                    newText,
                    positionAfterEdit: src_1.Position.create(position.line, position.character),
                };
                if (isSelectedCompletionInfo) {
                    edit.source = 'selectedCompletionInfo';
                }
                newEdits.push(edit);
                continue;
            }
            if (offset < oldEndOffset) {
                offset = oldEndOffset;
            }
            offset += newText.length - oldText.length;
            position = textDocument.positionAt(offset);
            const edit = {
                range,
                newText,
                positionAfterEdit: src_1.Position.create(position.line, position.character),
            };
            if (isSelectedCompletionInfo) {
                edit.source = 'selectedCompletionInfo';
            }
            newEdits.push(edit);
        }
        return this.updateState(textDocument, position, newEdits);
    }
}
exports.CompletionState = CompletionState;
function createCompletionState(textDocument, position) {
    return new CompletionState(textDocument, position);
}
//# sourceMappingURL=completionState.js.map
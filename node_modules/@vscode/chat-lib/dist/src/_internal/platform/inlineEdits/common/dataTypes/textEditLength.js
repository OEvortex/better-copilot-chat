"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SingleTextEditLength = exports.TextLengthEdit = void 0;
const range_1 = require("../../../../util/vs/editor/common/core/range");
const textLength_1 = require("../../../../util/vs/editor/common/core/text/textLength");
const combineTextEditInfos_1 = require("./textEditLengthHelper/combineTextEditInfos");
const length_1 = require("./textEditLengthHelper/length");
const textEditInfo_1 = require("./textEditLengthHelper/textEditInfo");
class TextLengthEdit {
    static { this.empty = new TextLengthEdit([]); }
    static fromTextEdit(textEdit) {
        const edits = textEdit.replacements.map(e => new SingleTextEditLength(e.range, textLength_1.TextLength.ofText(e.text)));
        return new TextLengthEdit(edits);
    }
    static _fromTextEditInfo(info) {
        const edits = info.map(e => {
            const newLen = (0, length_1.lengthToObj)(e.newLength);
            return new SingleTextEditLength((0, length_1.lengthsToRange)(e.startOffset, e.endOffset), new textLength_1.TextLength(newLen.lineCount, newLen.columnCount));
        });
        return new TextLengthEdit(edits);
    }
    constructor(edits) {
        this.edits = edits;
    }
    _toTextEditInfo() {
        return this.edits.map(e => new textEditInfo_1.TextEditInfo((0, length_1.toLength)(e.range.startLineNumber - 1, e.range.startColumn - 1), (0, length_1.toLength)(e.range.endLineNumber - 1, e.range.endColumn - 1), (0, length_1.toLength)(e.newLength.lineCount, e.newLength.columnCount)));
    }
    compose(other) {
        const self = this._toTextEditInfo();
        const o = other._toTextEditInfo();
        const result = (0, combineTextEditInfos_1.combineTextEditInfos)(self, o);
        return TextLengthEdit._fromTextEditInfo(result);
    }
    /**
     * Returns the range of the edit, or undefined if the edit is empty.
     */
    getRange() {
        if (this.edits.length === 0) {
            return undefined;
        }
        return range_1.Range.fromPositions(this.edits[0].range.getStartPosition(), this.edits.at(-1).range.getEndPosition());
    }
    toString() {
        return `[${this.edits.join(', ')}]`;
    }
}
exports.TextLengthEdit = TextLengthEdit;
class SingleTextEditLength {
    constructor(range, newLength) {
        this.range = range;
        this.newLength = newLength;
    }
    toString() {
        return `{ range: ${this.range}, newLength: ${this.newLength} }`;
    }
}
exports.SingleTextEditLength = SingleTextEditLength;
//# sourceMappingURL=textEditLength.js.map
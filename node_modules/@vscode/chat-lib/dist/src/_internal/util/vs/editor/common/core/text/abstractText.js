"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringText = exports.ArrayText = exports.LineBasedText = exports.AbstractText = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const assert_1 = require("../../../../base/common/assert");
const strings_1 = require("../../../../base/common/strings");
const position_1 = require("../position");
const range_1 = require("../range");
const textLength_1 = require("./textLength");
const positionToOffsetImpl_1 = require("./positionToOffsetImpl");
class AbstractText {
    constructor() {
        this._transformer = undefined;
    }
    get endPositionExclusive() {
        return this.length.addToPosition(new position_1.Position(1, 1));
    }
    get lineRange() {
        return this.length.toLineRange();
    }
    getValue() {
        return this.getValueOfRange(this.length.toRange());
    }
    getValueOfOffsetRange(range) {
        return this.getValueOfRange(this.getTransformer().getRange(range));
    }
    getLineLength(lineNumber) {
        return this.getValueOfRange(new range_1.Range(lineNumber, 1, lineNumber, Number.MAX_SAFE_INTEGER)).length;
    }
    getTransformer() {
        if (!this._transformer) {
            this._transformer = new positionToOffsetImpl_1.PositionOffsetTransformer(this.getValue());
        }
        return this._transformer;
    }
    getLineAt(lineNumber) {
        return this.getValueOfRange(new range_1.Range(lineNumber, 1, lineNumber, Number.MAX_SAFE_INTEGER));
    }
    getLines() {
        const value = this.getValue();
        return (0, strings_1.splitLines)(value);
    }
    getLinesOfRange(range) {
        return range.mapToLineArray(lineNumber => this.getLineAt(lineNumber));
    }
    equals(other) {
        if (this === other) {
            return true;
        }
        return this.getValue() === other.getValue();
    }
}
exports.AbstractText = AbstractText;
class LineBasedText extends AbstractText {
    constructor(_getLineContent, _lineCount) {
        (0, assert_1.assert)(_lineCount >= 1);
        super();
        this._getLineContent = _getLineContent;
        this._lineCount = _lineCount;
    }
    getValueOfRange(range) {
        if (range.startLineNumber === range.endLineNumber) {
            return this._getLineContent(range.startLineNumber).substring(range.startColumn - 1, range.endColumn - 1);
        }
        let result = this._getLineContent(range.startLineNumber).substring(range.startColumn - 1);
        for (let i = range.startLineNumber + 1; i < range.endLineNumber; i++) {
            result += '\n' + this._getLineContent(i);
        }
        result += '\n' + this._getLineContent(range.endLineNumber).substring(0, range.endColumn - 1);
        return result;
    }
    getLineLength(lineNumber) {
        return this._getLineContent(lineNumber).length;
    }
    get length() {
        const lastLine = this._getLineContent(this._lineCount);
        return new textLength_1.TextLength(this._lineCount - 1, lastLine.length);
    }
}
exports.LineBasedText = LineBasedText;
class ArrayText extends LineBasedText {
    constructor(lines) {
        super(lineNumber => lines[lineNumber - 1], lines.length);
    }
}
exports.ArrayText = ArrayText;
class StringText extends AbstractText {
    constructor(value) {
        super();
        this.value = value;
        this._t = new positionToOffsetImpl_1.PositionOffsetTransformer(this.value);
    }
    getValueOfRange(range) {
        return this._t.getOffsetRange(range).substring(this.value);
    }
    get length() {
        return this._t.textLength;
    }
    // Override the getTransformer method to return the cached transformer
    getTransformer() {
        return this._t;
    }
}
exports.StringText = StringText;
//# sourceMappingURL=abstractText.js.map
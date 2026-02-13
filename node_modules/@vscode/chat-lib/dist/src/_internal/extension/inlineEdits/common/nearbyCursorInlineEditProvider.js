"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.LineWithTokens = exports.Token = void 0;
exports.getOrDeduceSelectionFromLastEdit = getOrDeduceSelectionFromLastEdit;
exports.clipTokensToRange = clipTokensToRange;
exports.clipTokensToRangeAndAdjustOffsets = clipTokensToRangeAndAdjustOffsets;
exports.removeTokensInRangeAndAdjustOffsets = removeTokensInRangeAndAdjustOffsets;
exports.getTokensFromLogProbs = getTokensFromLogProbs;
exports.getTokensFromLinesWithTokens = getTokensFromLinesWithTokens;
exports.mergeOffsetRangesAtDistance = mergeOffsetRangesAtDistance;
const errors_1 = require("../../../util/vs/base/common/errors");
const offsetRange_1 = require("../../../util/vs/editor/common/core/ranges/offsetRange");
/**
 * Read the selection from the document, otherwise deduce it from the last edit.
 */
function getOrDeduceSelectionFromLastEdit(activeDoc) {
    const origin = new offsetRange_1.OffsetRange(0, 0);
    if (activeDoc.lastSelectionInAfterEdit && !activeDoc.lastSelectionInAfterEdit.equals(origin)) {
        return activeDoc.documentAfterEdits.getTransformer().getRange(activeDoc.lastSelectionInAfterEdit);
    }
    const selectionRange = deduceSelectionFromLastEdit(activeDoc);
    return selectionRange;
}
function deduceSelectionFromLastEdit(activeDoc) {
    const mostRecentEdit = activeDoc.recentEdits.edits.at(-1);
    if (mostRecentEdit === undefined) {
        return null;
    }
    const mostRecentSingleEdit = mostRecentEdit.replacements.at(-1);
    if (mostRecentSingleEdit === undefined) {
        return null;
    }
    const offsetRange = mostRecentSingleEdit.replaceRange;
    const newText = mostRecentSingleEdit.newText;
    const change = newText.length - offsetRange.length;
    const newOffset = offsetRange.endExclusive + change;
    const selectionRange = activeDoc.documentAfterEdits.getTransformer().getRange(new offsetRange_1.OffsetRange(newOffset, newOffset));
    return selectionRange;
}
class Token {
    get id() {
        return this.text + '_' + this.range.toString();
    }
    constructor(text, value, offset) {
        this.text = text;
        this.value = value;
        this.range = new offsetRange_1.OffsetRange(offset, offset + text.length);
    }
    equals(other) {
        return this.range.equals(other.range) && this.text === other.text;
    }
    deltaOffset(offset) {
        return new Token(this.text, this.value, this.range.start + offset);
    }
}
exports.Token = Token;
function clipTokensToRange(tokens, range) {
    return tokens.filter(token => range.intersects(token.range));
}
function clipTokensToRangeAndAdjustOffsets(tokens, range) {
    return clipTokensToRange(tokens, range).map(token => token.deltaOffset(-range.start));
}
function removeTokensInRangeAndAdjustOffsets(tokens, range) {
    const adjustedTokens = [];
    for (let token of tokens) {
        // remove tokens inside the range
        if (range.containsRange(token.range)) {
            continue;
        }
        // adjust the token offset
        if (token.range.start > range.start) {
            token = token.deltaOffset(-range.length);
        }
        adjustedTokens.push(token);
    }
    return adjustedTokens;
}
function getTokensFromLogProbs(logProbs, offset) {
    let acc = offset;
    return logProbs.content.map(tokenContent => {
        const token = new Token(tokenContent.token, tokenContent.logprob, acc);
        acc += token.range.length;
        return token;
    });
}
class LineWithTokens {
    static stringEquals(a, b) {
        return a._text === b._text;
    }
    static fromText(text, tokens) {
        tokens = tokens ?? [];
        const lines = [];
        while (true) {
            const eolIdxWith = text.indexOf('\r\n');
            const eolIdxWithout = text.indexOf('\n');
            const eolIdx = (eolIdxWith === -1 ? eolIdxWithout : (eolIdxWithout === -1 ? eolIdxWith : Math.min(eolIdxWith, eolIdxWithout)));
            const eol = (eolIdxWith !== -1 ? '\r\n' : (eolIdxWithout === -1 ? undefined : '\n'));
            if (eol === undefined) {
                lines.push(new LineWithTokens(text, tokens, '\n'));
                break;
            }
            const lineLength = eolIdx + eol.length;
            const line = text.substring(0, eolIdx);
            const lineTokensWithBoundary = tokens.filter(t => t.range.start < lineLength && t.range.endExclusive > 0);
            lines.push(new LineWithTokens(line, lineTokensWithBoundary, eol));
            text = text.substring(lineLength);
            tokens = tokens.map(t => t.deltaOffset(-lineLength)).filter(t => t.range.endExclusive > 0);
        }
        return lines;
    }
    get text() { return this._text; }
    get tokens() { return this._tokens; }
    get length() { return this._text.length; }
    get lengthWithEOL() { return this._text.length + this._eol.length; }
    get eol() { return this._eol; }
    constructor(_text, _tokens, _eol) {
        this._text = _text;
        this._tokens = _tokens;
        this._eol = _eol;
    }
    trim() {
        return this.trimStart().trimEnd();
    }
    trimStart() {
        const lineStartTrimmed = this._text.trimStart();
        const trimmedLength = this._text.length - lineStartTrimmed.length;
        const tokensUpdated = this._tokens.map(t => t.deltaOffset(-trimmedLength)).filter(t => t.range.endExclusive > 0);
        return new LineWithTokens(lineStartTrimmed, tokensUpdated, this._eol);
    }
    trimEnd() {
        const lineEndTrimmed = this._text.trimEnd();
        const tokensUpdated = this._tokens.filter(t => t.range.start < lineEndTrimmed.length);
        return new LineWithTokens(lineEndTrimmed, tokensUpdated, this._eol);
    }
    substring(start, end) {
        const lineSubstring = this._text.substring(start, end);
        const tokensUpdated = this._tokens.map(t => t.deltaOffset(-start)).filter(t => t.range.endExclusive > 0 && t.range.start < lineSubstring.length);
        return new LineWithTokens(lineSubstring, tokensUpdated, this._eol);
    }
    stringEquals(other) {
        return LineWithTokens.stringEquals(this, other);
    }
    equals(other) {
        return this._text === other.text
            && this._tokens.length === other.tokens.length
            && this._tokens.every((t, i) => t.equals(other.tokens[i]));
    }
    dropTokens(tokens) {
        return new LineWithTokens(this._text, this._tokens.filter(t => !tokens.some(token => t.equals(token))), this._eol);
    }
    findTokens(fn) {
        return this._tokens.filter(fn);
    }
}
exports.LineWithTokens = LineWithTokens;
function getTokensFromLinesWithTokens(lines) {
    let offset = 0;
    const tokens = [];
    for (const line of lines) {
        const textLine = line.text + line.eol;
        tokens.push(...line.tokens.map(t => t.deltaOffset(offset)));
        offset += textLine.length;
    }
    const tokensDeduplicated = [];
    const tokensSeen = new Set();
    for (const token of tokens) {
        if (!tokensSeen.has(token.id)) {
            tokensSeen.add(token.id);
            tokensDeduplicated.push(token);
        }
    }
    return tokensDeduplicated;
}
function mergeOffsetRangesAtDistance(ranges, distance) {
    if (distance < 0) {
        throw new errors_1.BugIndicatingError('Distance must be positive');
    }
    const rangesGrown = ranges.map(r => new offsetRange_1.OffsetRange(r.start - distance, r.endExclusive + distance));
    const set = new offsetRange_1.OffsetRangeSet();
    for (const range of rangesGrown) {
        set.addRange(range);
    }
    return set.ranges.map(r => new offsetRange_1.OffsetRange(r.start + distance, r.endExclusive - distance));
}
//# sourceMappingURL=nearbyCursorInlineEditProvider.js.map
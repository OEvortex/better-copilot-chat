"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.lengthZero = void 0;
exports.lengthDiff = lengthDiff;
exports.lengthIsZero = lengthIsZero;
exports.toLength = toLength;
exports.lengthToObj = lengthToObj;
exports.lengthGetLineCount = lengthGetLineCount;
exports.lengthGetColumnCountIfZeroLineCount = lengthGetColumnCountIfZeroLineCount;
exports.lengthAdd = lengthAdd;
exports.sumLengths = sumLengths;
exports.lengthEquals = lengthEquals;
exports.lengthDiffNonNegative = lengthDiffNonNegative;
exports.lengthLessThan = lengthLessThan;
exports.lengthLessThanEqual = lengthLessThanEqual;
exports.lengthGreaterThanEqual = lengthGreaterThanEqual;
exports.lengthToPosition = lengthToPosition;
exports.positionToLength = positionToLength;
exports.lengthsToRange = lengthsToRange;
exports.lengthOfRange = lengthOfRange;
exports.lengthCompare = lengthCompare;
exports.lengthOfString = lengthOfString;
exports.lengthOfStringObj = lengthOfStringObj;
exports.lengthHash = lengthHash;
exports.lengthMax = lengthMax;
const strings_1 = require("../../../../../util/vs/base/common/strings");
const position_1 = require("../../../../../util/vs/editor/common/core/position");
const range_1 = require("../../../../../util/vs/editor/common/core/range");
const textLength_1 = require("../../../../../util/vs/editor/common/core/text/textLength");
/**
 * The end must be greater than or equal to the start.
*/
function lengthDiff(startLineCount, startColumnCount, endLineCount, endColumnCount) {
    return (startLineCount !== endLineCount)
        ? toLength(endLineCount - startLineCount, endColumnCount)
        : toLength(0, endColumnCount - startColumnCount);
}
exports.lengthZero = 0;
function lengthIsZero(length) {
    return length === 0;
}
/*
 * We have 52 bits available in a JS number.
 * We use the upper 26 bits to store the line and the lower 26 bits to store the column.
 */
///*
const factor = 2 ** 26;
/*/
const factor = 1000000;
// */
function toLength(lineCount, columnCount) {
    // llllllllllllllllllllllllllcccccccccccccccccccccccccc (52 bits)
    //       line count (26 bits)    column count (26 bits)
    // If there is no overflow (all values/sums below 2^26 = 67108864),
    // we have `toLength(lns1, cols1) + toLength(lns2, cols2) = toLength(lns1 + lns2, cols1 + cols2)`.
    return (lineCount * factor + columnCount);
}
function lengthToObj(length) {
    const l = length;
    const lineCount = Math.floor(l / factor);
    const columnCount = l - lineCount * factor;
    return new textLength_1.TextLength(lineCount, columnCount);
}
function lengthGetLineCount(length) {
    return Math.floor(length / factor);
}
/**
 * Returns the amount of columns of the given length, assuming that it does not span any line.
*/
function lengthGetColumnCountIfZeroLineCount(length) {
    return length;
}
function lengthAdd(l1, l2) {
    let r = l1 + l2;
    if (l2 >= factor) {
        r = r - (l1 % factor);
    }
    return r;
}
function sumLengths(items, lengthFn) {
    return items.reduce((a, b) => lengthAdd(a, lengthFn(b)), exports.lengthZero);
}
function lengthEquals(length1, length2) {
    return length1 === length2;
}
/**
 * Returns a non negative length `result` such that `lengthAdd(length1, result) = length2`, or zero if such length does not exist.
 */
function lengthDiffNonNegative(length1, length2) {
    const l1 = length1;
    const l2 = length2;
    const diff = l2 - l1;
    if (diff <= 0) {
        // line-count of length1 is higher than line-count of length2
        // or they are equal and column-count of length1 is higher than column-count of length2
        return exports.lengthZero;
    }
    const lineCount1 = Math.floor(l1 / factor);
    const lineCount2 = Math.floor(l2 / factor);
    const colCount2 = l2 - lineCount2 * factor;
    if (lineCount1 === lineCount2) {
        const colCount1 = l1 - lineCount1 * factor;
        return toLength(0, colCount2 - colCount1);
    }
    else {
        return toLength(lineCount2 - lineCount1, colCount2);
    }
}
function lengthLessThan(length1, length2) {
    // First, compare line counts, then column counts.
    return length1 < length2;
}
function lengthLessThanEqual(length1, length2) {
    return length1 <= length2;
}
function lengthGreaterThanEqual(length1, length2) {
    return length1 >= length2;
}
function lengthToPosition(length) {
    const l = length;
    const lineCount = Math.floor(l / factor);
    const colCount = l - lineCount * factor;
    return new position_1.Position(lineCount + 1, colCount + 1);
}
function positionToLength(position) {
    return toLength(position.lineNumber - 1, position.column - 1);
}
function lengthsToRange(lengthStart, lengthEnd) {
    const l = lengthStart;
    const lineCount = Math.floor(l / factor);
    const colCount = l - lineCount * factor;
    const l2 = lengthEnd;
    const lineCount2 = Math.floor(l2 / factor);
    const colCount2 = l2 - lineCount2 * factor;
    return new range_1.Range(lineCount + 1, colCount + 1, lineCount2 + 1, colCount2 + 1);
}
function lengthOfRange(range) {
    if (range.startLineNumber === range.endLineNumber) {
        return new textLength_1.TextLength(0, range.endColumn - range.startColumn);
    }
    else {
        return new textLength_1.TextLength(range.endLineNumber - range.startLineNumber, range.endColumn - 1);
    }
}
function lengthCompare(length1, length2) {
    const l1 = length1;
    const l2 = length2;
    return l1 - l2;
}
function lengthOfString(str) {
    const lines = (0, strings_1.splitLines)(str);
    return toLength(lines.length - 1, lines[lines.length - 1].length);
}
function lengthOfStringObj(str) {
    const lines = (0, strings_1.splitLines)(str);
    return new textLength_1.TextLength(lines.length - 1, lines[lines.length - 1].length);
}
/**
 * Computes a numeric hash of the given length.
*/
function lengthHash(length) {
    return length;
}
function lengthMax(length1, length2) {
    return length1 > length2 ? length1 : length2;
}
//# sourceMappingURL=length.js.map
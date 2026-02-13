"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDiff = computeDiff;
exports.computeDiffSync = computeDiffSync;
const defaultLinesDiffComputer_1 = require("../../../util/vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer");
async function computeDiff(original, modified, options) {
    return computeDiffSync(original, modified, options);
}
function computeDiffSync(original, modified, options) {
    const originalLines = original.split(/\r\n|\r|\n/);
    const modifiedLines = modified.split(/\r\n|\r|\n/);
    const diffComputer = new defaultLinesDiffComputer_1.DefaultLinesDiffComputer();
    const result = diffComputer.computeDiff(originalLines, modifiedLines, options);
    const identical = (result.changes.length > 0 ? false : original === modified);
    function getLineChanges(changes) {
        return changes.map(m => ([m.original.startLineNumber, m.original.endLineNumberExclusive, m.modified.startLineNumber, m.modified.endLineNumberExclusive, m.innerChanges?.map(m => [
                m.originalRange.startLineNumber,
                m.originalRange.startColumn,
                m.originalRange.endLineNumber,
                m.originalRange.endColumn,
                m.modifiedRange.startLineNumber,
                m.modifiedRange.startColumn,
                m.modifiedRange.endLineNumber,
                m.modifiedRange.endColumn,
            ])]));
    }
    return {
        identical,
        quitEarly: result.hitTimeout,
        changes: getLineChanges(result.changes),
        moves: result.moves.map(m => ([
            m.lineRangeMapping.original.startLineNumber,
            m.lineRangeMapping.original.endLineNumberExclusive,
            m.lineRangeMapping.modified.startLineNumber,
            m.lineRangeMapping.modified.endLineNumberExclusive,
            getLineChanges(m.changes)
        ])),
    };
}
//# sourceMappingURL=diffWorker.js.map
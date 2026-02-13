"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArrayMap = exports.ResponseProcessor = void 0;
const errors_1 = require("../../../util/vs/base/common/errors");
const lineEdit_1 = require("../../../util/vs/editor/common/core/edits/lineEdit");
const lineRange_1 = require("../../../util/vs/editor/common/core/ranges/lineRange");
var ResponseProcessor;
(function (ResponseProcessor) {
    ResponseProcessor.DEFAULT_DIFF_PARAMS = {
        emitFastCursorLineChange: false,
        nSignificantLinesToConverge: 2,
        nLinesToConverge: 3,
    };
    /**
     *
     * @param originalLines
     * @param modifiedLines
     * @param cursorOriginalLinesOffset offset of cursor within original lines
     */
    async function* diff(originalLines, modifiedLines, cursorOriginalLinesOffset, params) {
        const lineToIdxs = new ArrayMap();
        for (const [i, line] of originalLines.entries()) {
            lineToIdxs.add(line, i);
        }
        let editWindowIdx = 0;
        let updatedEditWindowIdx = -1;
        let state = { k: 'aligned' };
        for await (const line of modifiedLines) {
            ++updatedEditWindowIdx;
            // handle modifiedLines.length > originalLines.length
            if (editWindowIdx >= originalLines.length) {
                switch (state.k) {
                    case 'aligned': {
                        state = { k: 'diverged', startLineIdx: editWindowIdx, newLines: [line] };
                        break;
                    }
                    case 'diverged': {
                        state.newLines.push(line);
                    }
                }
                continue;
            }
            if (state.k === 'aligned') {
                if (originalLines[editWindowIdx] === line) { // if line is the same as in originalLines, skip over it
                    ++editWindowIdx;
                    continue;
                }
                state = { k: 'diverged', startLineIdx: editWindowIdx, newLines: [] };
            }
            state.newLines.push(line);
            const convergenceResult = checkForConvergence(originalLines, cursorOriginalLinesOffset, lineToIdxs, state, editWindowIdx, params);
            if (convergenceResult) {
                yield convergenceResult.singleLineEdit;
                editWindowIdx = convergenceResult.convergenceEndIdx;
                state = { k: 'aligned' };
            }
        }
        switch (state.k) {
            case 'diverged': {
                const lineRange = new lineRange_1.LineRange(state.startLineIdx + 1, originalLines.length + 1);
                yield new lineEdit_1.LineReplacement(lineRange, state.newLines);
                break;
            }
            case 'aligned': {
                if (editWindowIdx < originalLines.length) {
                    const lineRange = new lineRange_1.LineRange(editWindowIdx + 1, originalLines.length + 1);
                    yield new lineEdit_1.LineReplacement(lineRange, []);
                }
                break;
            }
        }
    }
    ResponseProcessor.diff = diff;
    function isSignificant(s) {
        return !!s.match(/[a-zA-Z1-9]+/);
    }
    function checkForConvergence(originalLines, cursorOriginalLinesOffset, lineToIndexes, state, editWindowIdx, params) {
        if (state.newLines.length === 0) {
            throw (0, errors_1.illegalArgument)('Cannot check for convergence without new lines');
        }
        let newLinesIdx = state.newLines.length - 1;
        let candidates = lineToIndexes.get(state.newLines[newLinesIdx]).map((idx) => [idx, idx]);
        if (candidates.length === 0) {
            if (!params.emitFastCursorLineChange ||
                editWindowIdx !== cursorOriginalLinesOffset || state.newLines.length > 1) {
                return;
            }
            // we detected that line with the cursor has changed, so we immediately emit an edit for it
            const zeroBasedLineRange = [editWindowIdx, editWindowIdx + 1];
            const lineRange = new lineRange_1.LineRange(zeroBasedLineRange[0] + 1, zeroBasedLineRange[1] + 1);
            return {
                singleLineEdit: new lineEdit_1.LineReplacement(lineRange, state.newLines),
                convergenceEndIdx: editWindowIdx + 1,
            };
        }
        // we don't have enough lines even for significant-lines convergence which's less than non-significant
        if (state.newLines.length < params.nSignificantLinesToConverge) {
            return;
        }
        let nNonSigMatches = 1;
        let nSigMatches = isSignificant(state.newLines[newLinesIdx]) ? 1 : 0;
        --newLinesIdx;
        let result;
        let match = candidates[0];
        // if several lines are being just replaced and we found a convergence right after, we want to treat this as a significant match
        // original  |  modified
        //    a      |     a
        //    b      |     b'
        //    c      |     c'
        //    d      |     d    <-- match here should allow convergence
        //    e      |     e
        if (nNonSigMatches > 0 && (match[0] - state.startLineIdx) === state.newLines.length - 1 /* to discount for converging line */) {
            result = 'found_significant_matches';
        }
        for (; newLinesIdx >= 0; --newLinesIdx) {
            candidates = candidates.map(([convEndIdx, convIdx]) => [convEndIdx, convIdx - 1]);
            candidates = candidates.filter(([_, currentIdx]) => currentIdx >= 0 && editWindowIdx <= currentIdx);
            candidates = candidates.filter(([_, currentIdx]) => originalLines[currentIdx] === state.newLines[newLinesIdx]);
            // count in matches for current batch
            if (candidates.length === 0) {
                break;
            }
            else {
                ++nNonSigMatches;
                if (isSignificant(state.newLines[newLinesIdx])) {
                    ++nSigMatches;
                }
            }
            if (nSigMatches === params.nSignificantLinesToConverge) {
                result = 'found_significant_matches';
                match = candidates[0];
            }
            if (nNonSigMatches === params.nLinesToConverge) {
                result = 'found_matches';
                match = candidates[0];
                break;
            }
        }
        if (!result) {
            return;
        }
        const originalLinesConvIdx = match[1];
        const originalLinesConvEndIdx = match[0];
        const nLinesToConverge = originalLinesConvEndIdx - originalLinesConvIdx + 1;
        const nLinesRemoved = originalLinesConvIdx - state.startLineIdx;
        const linesInserted = state.newLines.slice(0, state.newLines.length - nLinesToConverge);
        const nLinesInserted = linesInserted.length;
        if (nLinesRemoved - nLinesInserted > 1 && nLinesInserted > 0) {
            return;
        }
        const zeroBasedLineRange = [state.startLineIdx, originalLinesConvIdx];
        const lineRange = new lineRange_1.LineRange(zeroBasedLineRange[0] + 1, zeroBasedLineRange[1] + 1);
        const singleLineEdit = new lineEdit_1.LineReplacement(lineRange, linesInserted);
        return {
            singleLineEdit,
            convergenceEndIdx: originalLinesConvEndIdx + 1,
        };
    }
})(ResponseProcessor || (exports.ResponseProcessor = ResponseProcessor = {}));
class ArrayMap {
    constructor() {
        this.map = new Map();
    }
    /**
     * Appends a value to the array of values for the given key.
     */
    add(key, value) {
        const values = this.map.get(key);
        if (values) {
            values.push(value);
        }
        else {
            this.map.set(key, [value]);
        }
    }
    /**
     * Gets the array of values for the given key.
     * Returns an empty array if the key does not exist.
     */
    get(key) {
        return this.map.get(key) || [];
    }
}
exports.ArrayMap = ArrayMap;
//# sourceMappingURL=responseProcessor.js.map
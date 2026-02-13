"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultLinesDiffComputer = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const arrays_1 = require("../../../../base/common/arrays");
const assert_1 = require("../../../../base/common/assert");
const lineRange_1 = require("../../core/ranges/lineRange");
const offsetRange_1 = require("../../core/ranges/offsetRange");
const range_1 = require("../../core/range");
const abstractText_1 = require("../../core/text/abstractText");
const linesDiffComputer_1 = require("../linesDiffComputer");
const rangeMapping_1 = require("../rangeMapping");
const diffAlgorithm_1 = require("./algorithms/diffAlgorithm");
const dynamicProgrammingDiffing_1 = require("./algorithms/dynamicProgrammingDiffing");
const myersDiffAlgorithm_1 = require("./algorithms/myersDiffAlgorithm");
const computeMovedLines_1 = require("./computeMovedLines");
const heuristicSequenceOptimizations_1 = require("./heuristicSequenceOptimizations");
const lineSequence_1 = require("./lineSequence");
const linesSliceCharSequence_1 = require("./linesSliceCharSequence");
class DefaultLinesDiffComputer {
    constructor() {
        this.dynamicProgrammingDiffing = new dynamicProgrammingDiffing_1.DynamicProgrammingDiffing();
        this.myersDiffingAlgorithm = new myersDiffAlgorithm_1.MyersDiffAlgorithm();
    }
    computeDiff(originalLines, modifiedLines, options) {
        if (originalLines.length <= 1 && (0, arrays_1.equals)(originalLines, modifiedLines, (a, b) => a === b)) {
            return new linesDiffComputer_1.LinesDiff([], [], false);
        }
        if (originalLines.length === 1 && originalLines[0].length === 0 || modifiedLines.length === 1 && modifiedLines[0].length === 0) {
            return new linesDiffComputer_1.LinesDiff([
                new rangeMapping_1.DetailedLineRangeMapping(new lineRange_1.LineRange(1, originalLines.length + 1), new lineRange_1.LineRange(1, modifiedLines.length + 1), [
                    new rangeMapping_1.RangeMapping(new range_1.Range(1, 1, originalLines.length, originalLines[originalLines.length - 1].length + 1), new range_1.Range(1, 1, modifiedLines.length, modifiedLines[modifiedLines.length - 1].length + 1))
                ])
            ], [], false);
        }
        const timeout = options.maxComputationTimeMs === 0 ? diffAlgorithm_1.InfiniteTimeout.instance : new diffAlgorithm_1.DateTimeout(options.maxComputationTimeMs);
        const considerWhitespaceChanges = !options.ignoreTrimWhitespace;
        const perfectHashes = new Map();
        function getOrCreateHash(text) {
            let hash = perfectHashes.get(text);
            if (hash === undefined) {
                hash = perfectHashes.size;
                perfectHashes.set(text, hash);
            }
            return hash;
        }
        const originalLinesHashes = originalLines.map((l) => getOrCreateHash(l.trim()));
        const modifiedLinesHashes = modifiedLines.map((l) => getOrCreateHash(l.trim()));
        const sequence1 = new lineSequence_1.LineSequence(originalLinesHashes, originalLines);
        const sequence2 = new lineSequence_1.LineSequence(modifiedLinesHashes, modifiedLines);
        const lineAlignmentResult = (() => {
            if (sequence1.length + sequence2.length < 1700) {
                // Use the improved algorithm for small files
                return this.dynamicProgrammingDiffing.compute(sequence1, sequence2, timeout, (offset1, offset2) => originalLines[offset1] === modifiedLines[offset2]
                    ? modifiedLines[offset2].length === 0
                        ? 0.1
                        : 1 + Math.log(1 + modifiedLines[offset2].length)
                    : 0.99);
            }
            return this.myersDiffingAlgorithm.compute(sequence1, sequence2, timeout);
        })();
        let lineAlignments = lineAlignmentResult.diffs;
        let hitTimeout = lineAlignmentResult.hitTimeout;
        lineAlignments = (0, heuristicSequenceOptimizations_1.optimizeSequenceDiffs)(sequence1, sequence2, lineAlignments);
        lineAlignments = (0, heuristicSequenceOptimizations_1.removeVeryShortMatchingLinesBetweenDiffs)(sequence1, sequence2, lineAlignments);
        const alignments = [];
        const scanForWhitespaceChanges = (equalLinesCount) => {
            if (!considerWhitespaceChanges) {
                return;
            }
            for (let i = 0; i < equalLinesCount; i++) {
                const seq1Offset = seq1LastStart + i;
                const seq2Offset = seq2LastStart + i;
                if (originalLines[seq1Offset] !== modifiedLines[seq2Offset]) {
                    // This is because of whitespace changes, diff these lines
                    const characterDiffs = this.refineDiff(originalLines, modifiedLines, new diffAlgorithm_1.SequenceDiff(new offsetRange_1.OffsetRange(seq1Offset, seq1Offset + 1), new offsetRange_1.OffsetRange(seq2Offset, seq2Offset + 1)), timeout, considerWhitespaceChanges, options);
                    for (const a of characterDiffs.mappings) {
                        alignments.push(a);
                    }
                    if (characterDiffs.hitTimeout) {
                        hitTimeout = true;
                    }
                }
            }
        };
        let seq1LastStart = 0;
        let seq2LastStart = 0;
        for (const diff of lineAlignments) {
            (0, assert_1.assertFn)(() => diff.seq1Range.start - seq1LastStart === diff.seq2Range.start - seq2LastStart);
            const equalLinesCount = diff.seq1Range.start - seq1LastStart;
            scanForWhitespaceChanges(equalLinesCount);
            seq1LastStart = diff.seq1Range.endExclusive;
            seq2LastStart = diff.seq2Range.endExclusive;
            const characterDiffs = this.refineDiff(originalLines, modifiedLines, diff, timeout, considerWhitespaceChanges, options);
            if (characterDiffs.hitTimeout) {
                hitTimeout = true;
            }
            for (const a of characterDiffs.mappings) {
                alignments.push(a);
            }
        }
        scanForWhitespaceChanges(originalLines.length - seq1LastStart);
        const original = new abstractText_1.ArrayText(originalLines);
        const modified = new abstractText_1.ArrayText(modifiedLines);
        const changes = (0, rangeMapping_1.lineRangeMappingFromRangeMappings)(alignments, original, modified);
        let moves = [];
        if (options.computeMoves) {
            moves = this.computeMoves(changes, originalLines, modifiedLines, originalLinesHashes, modifiedLinesHashes, timeout, considerWhitespaceChanges, options);
        }
        // Make sure all ranges are valid
        (0, assert_1.assertFn)(() => {
            function validatePosition(pos, lines) {
                if (pos.lineNumber < 1 || pos.lineNumber > lines.length) {
                    return false;
                }
                const line = lines[pos.lineNumber - 1];
                if (pos.column < 1 || pos.column > line.length + 1) {
                    return false;
                }
                return true;
            }
            function validateRange(range, lines) {
                if (range.startLineNumber < 1 || range.startLineNumber > lines.length + 1) {
                    return false;
                }
                if (range.endLineNumberExclusive < 1 || range.endLineNumberExclusive > lines.length + 1) {
                    return false;
                }
                return true;
            }
            for (const c of changes) {
                if (!c.innerChanges) {
                    return false;
                }
                for (const ic of c.innerChanges) {
                    const valid = validatePosition(ic.modifiedRange.getStartPosition(), modifiedLines) && validatePosition(ic.modifiedRange.getEndPosition(), modifiedLines) &&
                        validatePosition(ic.originalRange.getStartPosition(), originalLines) && validatePosition(ic.originalRange.getEndPosition(), originalLines);
                    if (!valid) {
                        return false;
                    }
                }
                if (!validateRange(c.modified, modifiedLines) || !validateRange(c.original, originalLines)) {
                    return false;
                }
            }
            return true;
        });
        return new linesDiffComputer_1.LinesDiff(changes, moves, hitTimeout);
    }
    computeMoves(changes, originalLines, modifiedLines, hashedOriginalLines, hashedModifiedLines, timeout, considerWhitespaceChanges, options) {
        const moves = (0, computeMovedLines_1.computeMovedLines)(changes, originalLines, modifiedLines, hashedOriginalLines, hashedModifiedLines, timeout);
        const movesWithDiffs = moves.map(m => {
            const moveChanges = this.refineDiff(originalLines, modifiedLines, new diffAlgorithm_1.SequenceDiff(m.original.toOffsetRange(), m.modified.toOffsetRange()), timeout, considerWhitespaceChanges, options);
            const mappings = (0, rangeMapping_1.lineRangeMappingFromRangeMappings)(moveChanges.mappings, new abstractText_1.ArrayText(originalLines), new abstractText_1.ArrayText(modifiedLines), true);
            return new linesDiffComputer_1.MovedText(m, mappings);
        });
        return movesWithDiffs;
    }
    refineDiff(originalLines, modifiedLines, diff, timeout, considerWhitespaceChanges, options) {
        const lineRangeMapping = toLineRangeMapping(diff);
        const rangeMapping = lineRangeMapping.toRangeMapping2(originalLines, modifiedLines);
        const slice1 = new linesSliceCharSequence_1.LinesSliceCharSequence(originalLines, rangeMapping.originalRange, considerWhitespaceChanges);
        const slice2 = new linesSliceCharSequence_1.LinesSliceCharSequence(modifiedLines, rangeMapping.modifiedRange, considerWhitespaceChanges);
        const diffResult = slice1.length + slice2.length < 500
            ? this.dynamicProgrammingDiffing.compute(slice1, slice2, timeout)
            : this.myersDiffingAlgorithm.compute(slice1, slice2, timeout);
        const check = false;
        let diffs = diffResult.diffs;
        if (check) {
            diffAlgorithm_1.SequenceDiff.assertSorted(diffs);
        }
        diffs = (0, heuristicSequenceOptimizations_1.optimizeSequenceDiffs)(slice1, slice2, diffs);
        if (check) {
            diffAlgorithm_1.SequenceDiff.assertSorted(diffs);
        }
        diffs = (0, heuristicSequenceOptimizations_1.extendDiffsToEntireWordIfAppropriate)(slice1, slice2, diffs, (seq, idx) => seq.findWordContaining(idx));
        if (check) {
            diffAlgorithm_1.SequenceDiff.assertSorted(diffs);
        }
        if (options.extendToSubwords) {
            diffs = (0, heuristicSequenceOptimizations_1.extendDiffsToEntireWordIfAppropriate)(slice1, slice2, diffs, (seq, idx) => seq.findSubWordContaining(idx), true);
            if (check) {
                diffAlgorithm_1.SequenceDiff.assertSorted(diffs);
            }
        }
        diffs = (0, heuristicSequenceOptimizations_1.removeShortMatches)(slice1, slice2, diffs);
        if (check) {
            diffAlgorithm_1.SequenceDiff.assertSorted(diffs);
        }
        diffs = (0, heuristicSequenceOptimizations_1.removeVeryShortMatchingTextBetweenLongDiffs)(slice1, slice2, diffs);
        if (check) {
            diffAlgorithm_1.SequenceDiff.assertSorted(diffs);
        }
        const result = diffs.map((d) => new rangeMapping_1.RangeMapping(slice1.translateRange(d.seq1Range), slice2.translateRange(d.seq2Range)));
        if (check) {
            rangeMapping_1.RangeMapping.assertSorted(result);
        }
        // Assert: result applied on original should be the same as diff applied to original
        return {
            mappings: result,
            hitTimeout: diffResult.hitTimeout,
        };
    }
}
exports.DefaultLinesDiffComputer = DefaultLinesDiffComputer;
function toLineRangeMapping(sequenceDiff) {
    return new rangeMapping_1.LineRangeMapping(new lineRange_1.LineRange(sequenceDiff.seq1Range.start + 1, sequenceDiff.seq1Range.endExclusive + 1), new lineRange_1.LineRange(sequenceDiff.seq2Range.start + 1, sequenceDiff.seq2Range.endExclusive + 1));
}
//# sourceMappingURL=defaultLinesDiffComputer.js.map
"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixedWindowSizeJaccardMatcher = void 0;
exports.computeScore = computeScore;
const cursorContext_1 = require("./cursorContext");
const selectRelevance_1 = require("./selectRelevance");
const windowDelineations_1 = require("./windowDelineations");
class FixedWindowSizeJaccardMatcher extends selectRelevance_1.WindowedMatcher {
    constructor(referenceDoc, windowLength) {
        super(referenceDoc);
        this.windowLength = windowLength;
    }
    static { this.FACTORY = (windowLength) => {
        return {
            to: (referenceDoc) => new FixedWindowSizeJaccardMatcher(referenceDoc, windowLength),
        };
    }; }
    id() {
        return 'fixed:' + this.windowLength;
    }
    getWindowsDelineations(lines) {
        return (0, windowDelineations_1.getBasicWindowDelineations)(this.windowLength, lines);
    }
    _getCursorContextInfo(referenceDoc) {
        return (0, cursorContext_1.getCursorContext)(referenceDoc, {
            maxLineCount: this.windowLength,
        });
    }
    similarityScore(a, b) {
        return computeScore(a, b);
    }
}
exports.FixedWindowSizeJaccardMatcher = FixedWindowSizeJaccardMatcher;
/**
 * Compute the Jaccard metric of number of elements in the intersection
 * divided by number of elements in the union
 */
function computeScore(a, b) {
    const intersection = new Set();
    a.forEach(x => {
        if (b.has(x)) {
            intersection.add(x);
        }
    });
    return intersection.size / (a.size + b.size - intersection.size);
}
//# sourceMappingURL=jaccardMatching.js.map
"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Permutation = void 0;
const errors_1 = require("../../../../util/vs/base/common/errors");
/**
 * Represents a re-arrangement of items in an array.
 */
class Permutation {
    /**
     * The index map describes the index in the original array.
     *
     * @example
     * ```typescript
     * const arr = [20, 10, 30];
     *
     * const arrSortedPermutation = new Permutation([1, 0, 2]);
     * // though consider using `Permutation.createSortPermutation(arr, (a, b) => a - b)` for sorting permutations
     * ```
     */
    constructor(_indexMap) {
        this._indexMap = _indexMap;
    }
    get arrayLength() {
        return this._indexMap.length;
    }
    /**
     * Returns a permutation that sorts the given array according to the given compare function.
     */
    static createSortPermutation(arr, compareFn) {
        const sortIndices = Array.from(arr.keys()).sort((index1, index2) => compareFn(arr[index1], arr[index2]));
        return new Permutation(sortIndices);
    }
    /**
     * Returns a new array with the elements of the given array re-arranged according to this permutation.
     */
    apply(arr) {
        if (arr.length !== this.arrayLength) {
            throw (0, errors_1.illegalArgument)(`Permutation must be applied on an array of same length. Received length: ${arr.length}. Expected length: ${this.arrayLength}`);
        }
        return arr.map((_, index) => arr[this._indexMap[index]]);
    }
    /**
     * Given an index after permutation is, returns the index in the original array.
     */
    mapIndexBack(indexAfterShuffling) {
        const originalArrIdx = this._indexMap.at(indexAfterShuffling);
        if (originalArrIdx === undefined) {
            throw (0, errors_1.illegalArgument)(`Given index must be within original array length. Received: ${indexAfterShuffling}. Expected: 0 <= x < ${this.arrayLength}`);
        }
        return originalArrIdx;
    }
    /**
     * Returns a new permutation that undoes the re-arrangement of this permutation.
    */
    inverse() {
        const inverseIndexMap = this._indexMap.slice();
        for (let i = 0; i < this._indexMap.length; i++) {
            inverseIndexMap[this._indexMap[i]] = i;
        }
        return new Permutation(inverseIndexMap);
    }
}
exports.Permutation = Permutation;
//# sourceMappingURL=permutation.js.map
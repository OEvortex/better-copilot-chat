"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.count = count;
exports.findInsertionIndexInSortedArray = findInsertionIndexInSortedArray;
exports.max = max;
exports.filterMap = filterMap;
exports.min = min;
/**
 * Counts the number of elements in an array that satisfy a given predicate.
 */
function count(array, predicate) {
    let count = 0;
    for (const value of array) {
        if (predicate(value)) {
            count++;
        }
    }
    return count;
}
function findInsertionIndexInSortedArray(array, value, isBeforeFunction) {
    let low = 0;
    let high = array.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (isBeforeFunction(array[mid], value)) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
/**
 * Returns the maximum element in the array according to the given sort callback.
 * @param arr - The array to search for the maximum element.
 * @param compare - The sort callback to use for comparing elements.
 * @returns The maximum element in the array according to the given sort callback.
 */
function max(arr, compare) {
    if (arr.length === 0) {
        return undefined;
    }
    let maxElement = arr[0];
    for (let i = 1; i < arr.length; i++) {
        const currentElement = arr[i];
        if (compare(currentElement, maxElement) > 0) {
            maxElement = currentElement;
        }
    }
    return maxElement;
}
function filterMap(array, map) {
    const result = [];
    for (const element of array) {
        const mapped = map(element);
        if (mapped !== undefined && mapped !== null) {
            result.push(mapped);
        }
    }
    return result;
}
/**
 * Behaves just like `Math.min`, so it will return Infinity for an empty array.
 */
function min(array) {
    if (array.length === 0) {
        return Infinity;
    }
    let min = array[0];
    for (let i = 1; i < array.length; i++) {
        min = Math.min(min, array[i]);
    }
    return min;
}
//# sourceMappingURL=arrays.js.map
"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncIterableMap = asyncIterableMap;
exports.asyncIterableFilter = asyncIterableFilter;
exports.asyncIterableMapFilter = asyncIterableMapFilter;
exports.asyncIterableFromArray = asyncIterableFromArray;
exports.asyncIterableToArray = asyncIterableToArray;
exports.asyncIterableConcat = asyncIterableConcat;
exports.asyncIterableCount = asyncIterableCount;
exports.iterableMap = iterableMap;
exports.iterableMapFilter = iterableMapFilter;
async function* asyncIterableMap(source, selector) {
    for await (const item of source) {
        yield selector(item);
    }
}
async function* asyncIterableFilter(source, predicate) {
    for await (const item of source) {
        if (await predicate(item)) {
            yield item;
        }
    }
}
async function* asyncIterableMapFilter(source, selector) {
    for await (const item of source) {
        const result = await selector(item);
        if (result !== undefined) {
            yield result;
        }
    }
}
async function* asyncIterableFromArray(source) {
    for (const item of source) {
        yield Promise.resolve(item);
    }
}
async function asyncIterableToArray(source) {
    const result = [];
    for await (const item of source) {
        result.push(item);
    }
    return result;
}
async function* asyncIterableConcat(...sources) {
    for (const source of sources) {
        yield* source;
    }
}
async function asyncIterableCount(source) {
    let count = 0;
    for await (const _ of source) {
        count++;
    }
    return count;
}
function* iterableMap(source, selector) {
    for (const item of source) {
        yield selector(item);
    }
}
function* iterableMapFilter(source, selector) {
    for (const item of source) {
        const result = selector(item);
        if (result !== undefined) {
            yield result;
        }
    }
}
//# sourceMappingURL=iterableHelpers.js.map
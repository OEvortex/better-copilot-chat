"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventToPromise = eventToPromise;
exports.isArrayOfT = isArrayOfT;
exports.resolveAll = resolveAll;
const async_1 = require("../util/async");
/**
 * Converts an event to a Promise that resolves when the event is fired
 * @param subscribe A function that takes a listener and returns a Disposable for cleanup
 * @returns A Promise that resolves with the event data when the event fires
 */
async function eventToPromise(subscribe) {
    const deferred = new async_1.Deferred();
    const disposable = subscribe((event) => {
        deferred.resolve(event);
        disposable.dispose();
    });
    return deferred.promise;
}
/**
 * Converts a CancellationToken to a Promise that resolves when cancellation is requested
 * @param token The CancellationToken to observe
 * @returns A Promise that resolves when the token is canceled
 */
async function cancellationTokenToPromise(token) {
    if (token.isCancellationRequested) {
        return;
    }
    const deferred = new async_1.Deferred();
    const disposable = token.onCancellationRequested(() => {
        deferred.resolve();
        disposable.dispose();
    });
    await deferred.promise;
}
async function raceCancellation(promise, token) {
    if (token) {
        const cancellationPromise = cancellationTokenToPromise(token);
        await Promise.race([promise, cancellationPromise]);
    }
    else {
        await promise;
    }
}
// Workaround for https://github.com/microsoft/TypeScript/issues/17002
function isArrayOfT(value) {
    return Array.isArray(value);
}
/**
 * Resolves concurrently all given promises or async iterables, returning a map of their results.
 *
 * Given a collection of either promises resolving to single elements, arrays or async iterables,
 * this function will resolve them all to arrays and return a map of the results.
 * If a cancellation token is provided, when it is triggered, the function will stop resolving
 * and return the results collected so far, with the async iterables potentially returning partial results.
 *
 * @param resolvables A map of keys to promises or async iterables.
 * @param cancellation An optional cancellation promise.
 * @returns A promise that resolves to a map of the results.
 */
async function resolveAll(resolvables, cancellationToken) {
    const results = new Map();
    const promises = [];
    for (const [key, resolvable] of resolvables.entries()) {
        const promise = (async () => {
            const result = await resolve(resolvable, cancellationToken);
            results.set(key, result);
        })();
        promises.push(promise);
    }
    await Promise.allSettled(promises.values());
    return results;
}
async function resolve(resolvable, cancellationToken) {
    let result;
    if (resolvable instanceof Promise) {
        result = await resolvePromise(resolvable, cancellationToken);
    }
    else {
        result = await resolveIterable(resolvable, cancellationToken);
    }
    return result;
}
/** Resolves a promise until cancelled, and possibly converts result to array
 */
async function resolvePromise(promise, cancellationToken) {
    const startTime = performance.now();
    let resolved = { status: 'none', resolutionTime: 0, value: null };
    const collectPromise = (async () => {
        try {
            const result = await promise;
            if (cancellationToken?.isCancellationRequested) {
                return;
            }
            resolved = { status: 'full', resolutionTime: 0, value: isArrayOfT(result) ? [...result] : [result] };
        }
        catch (e) {
            if (cancellationToken?.isCancellationRequested) {
                return;
            }
            resolved = { status: 'error', resolutionTime: 0, reason: e };
        }
    })();
    await raceCancellation(collectPromise, cancellationToken);
    resolved.resolutionTime = performance.now() - startTime;
    return resolved;
}
/** Resolves an async iterable until cancelled
 */
async function resolveIterable(iterable, cancellationToken) {
    const startTime = performance.now();
    let resolved = { status: 'none', resolutionTime: 0, value: null };
    const collectPromise = (async () => {
        try {
            for await (const item of iterable) {
                if (cancellationToken?.isCancellationRequested) {
                    return;
                }
                if (resolved.status !== 'partial') {
                    resolved = { status: 'partial', resolutionTime: 0, value: [] };
                }
                resolved.value.push(item);
            }
            if (!cancellationToken?.isCancellationRequested) {
                if (resolved.status !== 'partial') {
                    resolved = { status: 'full', resolutionTime: 0, value: [] };
                }
                else {
                    resolved.status = 'full';
                }
            }
        }
        catch (e) {
            if (cancellationToken?.isCancellationRequested) {
                return;
            }
            resolved = { status: 'error', resolutionTime: 0, reason: e };
        }
    })();
    await raceCancellation(collectPromise, cancellationToken);
    resolved.resolutionTime = performance.now() - startTime;
    return resolved;
}
//# sourceMappingURL=asyncUtils.js.map
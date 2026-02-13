"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deferred = void 0;
exports.delay = delay;
/**
 * Deferred promise implementation to enable delayed promise resolution.
 * Note: in Node 22+ this can be replaced with Promise.withResolvers.
 */
class Deferred {
    constructor() {
        this.resolve = () => { };
        this.reject = () => { };
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
exports.Deferred = Deferred;
function delay(ms, value = undefined) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
//# sourceMappingURL=async.js.map
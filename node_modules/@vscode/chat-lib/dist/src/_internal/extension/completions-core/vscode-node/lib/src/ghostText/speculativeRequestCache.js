"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeculativeRequestCache = exports.ICompletionsSpeculativeRequestCache = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../../util/common/services");
const cache_1 = require("../helpers/cache");
exports.ICompletionsSpeculativeRequestCache = (0, services_1.createServiceIdentifier)('ICompletionsSpeculativeRequestCache');
class SpeculativeRequestCache {
    constructor() {
        this.cache = new cache_1.LRUCacheMap(100);
    }
    set(completionId, requestFunction) {
        this.cache.set(completionId, requestFunction);
    }
    async request(completionId) {
        const fn = this.cache.get(completionId);
        if (fn === undefined) {
            return;
        }
        this.cache.delete(completionId);
        await fn();
    }
}
exports.SpeculativeRequestCache = SpeculativeRequestCache;
//# sourceMappingURL=speculativeRequestCache.js.map
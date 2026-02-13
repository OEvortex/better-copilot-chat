"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionsCache = exports.ICompletionsCacheService = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const services_1 = require("../../../../../../util/common/services");
const radix_1 = require("../helpers/radix");
exports.ICompletionsCacheService = (0, services_1.createServiceIdentifier)('ICompletionsCacheService');
/** Caches recent completions by document prefix. */
class CompletionsCache {
    constructor() {
        this.cache = new radix_1.LRURadixTrie(100);
    }
    /** Given a document prefix and suffix, return all of the completions that match. */
    findAll(prefix, suffix) {
        return this.cache.findAll(prefix).flatMap(({ remainingKey, value }) => value.content
            .filter(c => c.suffix === suffix &&
            c.choice.completionText.startsWith(remainingKey) &&
            c.choice.completionText.length > remainingKey.length)
            .map(c => ({
            ...c.choice,
            completionText: c.choice.completionText.slice(remainingKey.length),
            telemetryData: c.choice.telemetryData.extendedBy({}, { foundOffset: remainingKey.length }),
        })));
    }
    /** Add cached completions for a given prefix. */
    append(prefix, suffix, choice) {
        const existing = this.cache.findAll(prefix);
        // Append to an existing array if there is an exact match.
        if (existing.length > 0 && existing[0].remainingKey === '') {
            const content = existing[0].value.content;
            this.cache.set(prefix, { content: [...content, { suffix, choice }] });
        }
        else {
            // Otherwise, add a new value.
            this.cache.set(prefix, { content: [{ suffix, choice }] });
        }
    }
    clear() {
        this.cache = new radix_1.LRURadixTrie(100);
    }
}
exports.CompletionsCache = CompletionsCache;
//# sourceMappingURL=completionsCache.js.map
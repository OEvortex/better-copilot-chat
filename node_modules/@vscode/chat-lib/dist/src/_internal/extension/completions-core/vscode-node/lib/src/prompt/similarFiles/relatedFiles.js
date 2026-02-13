"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RelatedFilesProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelatedFilesProvider = exports.ICompletionsRelatedFilesProviderService = exports.relatedFilesLogger = exports.PromiseExpirationCacheMap = exports.EmptyRelatedFilesResponse = void 0;
exports.getRelatedFilesAndTraits = getRelatedFilesAndTraits;
const ignoreService_1 = require("../../../../../../../platform/ignore/common/ignoreService");
const services_1 = require("../../../../../../../util/common/services");
const uri_1 = require("../../../../../../../util/vs/base/common/uri");
const instantiation_1 = require("../../../../../../../util/vs/platform/instantiation/common/instantiation");
const fileSystem_1 = require("../../fileSystem");
const cache_1 = require("../../helpers/cache");
const logger_1 = require("../../logger");
const telemetry_1 = require("../../telemetry");
const shortCircuit_1 = require("../../util/shortCircuit");
exports.EmptyRelatedFilesResponse = { entries: [], traits: [] };
const EmptyRelatedFiles = {
    entries: new Map(),
    traits: [],
};
// A map with an expiration time for each key. Keys are removed upon get() time.
// Note: the size() function is not being used, but if it does, be aware that it is
// counting expired keys. This ensures a constant time execution time.
class PromiseExpirationCacheMap extends cache_1.LRUCacheMap {
    constructor(size, defaultEvictionTimeMs = 2 * 60 * 1000 // 2 minutes
    ) {
        super(size);
        this.defaultEvictionTimeMs = defaultEvictionTimeMs;
        // Hold the time an entry is cached the first time. The entries in this map are only removed
        // upon a get() call when the eviction time elapsed.
        this._cacheTimestamps = new Map();
    }
    bumpRetryCount(key) {
        const ts = this._cacheTimestamps.get(key);
        if (ts) {
            return ++ts.retryCount;
        }
        else {
            this._cacheTimestamps.set(key, { timestamp: Date.now(), retryCount: 0 });
            return 0;
        }
    }
    has(key) {
        if (this.isValid(key)) {
            return super.has(key);
        }
        else {
            this.deleteExpiredEntry(key);
            return false;
        }
    }
    get(key) {
        const entry = super.get(key);
        if (this.isValid(key)) {
            return entry;
        }
        else {
            this.deleteExpiredEntry(key);
            return undefined;
        }
    }
    set(key, value) {
        const ret = super.set(key, value);
        if (!this.isValid(key)) {
            this._cacheTimestamps.set(key, { timestamp: Date.now(), retryCount: 0 });
        }
        return ret;
    }
    clear() {
        super.clear();
        this._cacheTimestamps.clear();
    }
    // A cache entry is considered valid if its lifetime is less than the default cache eviction time.
    isValid(key) {
        const ts = this._cacheTimestamps.get(key);
        return ts !== undefined && Date.now() - ts.timestamp < this.defaultEvictionTimeMs;
    }
    deleteExpiredEntry(key) {
        if (this._cacheTimestamps.has(key)) {
            this._cacheTimestamps.delete(key);
        }
        super.delete(key);
    }
}
exports.PromiseExpirationCacheMap = PromiseExpirationCacheMap;
exports.relatedFilesLogger = new logger_1.Logger('relatedFiles');
const lruCacheSize = 1000;
class RelatedFilesProviderFailure extends Error {
    constructor() {
        super('The provider failed providing the list of relatedFiles');
    }
}
exports.ICompletionsRelatedFilesProviderService = (0, services_1.createServiceIdentifier)('ICompletionsRelatedFilesProviderService');
/**
 * Class for getting the related files to the current active file (implemented in the extension or the agent).
 */
let RelatedFilesProvider = RelatedFilesProvider_1 = class RelatedFilesProvider {
    constructor(instantiationService, ignoreService, logTarget, fileSystemService) {
        this.instantiationService = instantiationService;
        this.ignoreService = ignoreService;
        this.logTarget = logTarget;
        this.fileSystemService = fileSystemService;
    }
    async getRelatedFiles(docInfo, telemetryData, cancellationToken) {
        // Try/catch-ing around getRelatedFilesResponse is not useful: it is up to the
        // concrete implementation of getRelatedFilesResponse to handle exceptions. If
        // they are thrown at this point, let them pass through up to the memoize() to
        // handle cache eviction.
        const response = await this.getRelatedFilesResponse(docInfo, telemetryData, cancellationToken);
        if (response === undefined) {
            return undefined;
        }
        const result = {
            entries: new Map(),
            traits: response.traits ?? [],
        };
        for (const entry of response.entries) {
            let uriToContentMap = result.entries.get(entry.type);
            if (!uriToContentMap) {
                uriToContentMap = new Map();
                result.entries.set(entry.type, uriToContentMap);
            }
            for (const uri of entry.uris) {
                try {
                    exports.relatedFilesLogger.debug(this.logTarget, `Processing ${uri}`);
                    let content = await this.getFileContent(uri);
                    if (!content || content.length === 0) {
                        exports.relatedFilesLogger.debug(this.logTarget, `Skip ${uri} due to empty content or loading issue.`);
                        continue;
                    }
                    if (await this.isContentExcluded(uri, content)) {
                        exports.relatedFilesLogger.debug(this.logTarget, `Skip ${uri} due content exclusion.`);
                        continue;
                    }
                    content = RelatedFilesProvider_1.dropBOM(content);
                    uriToContentMap.set(uri, content);
                }
                catch (e) {
                    exports.relatedFilesLogger.warn(this.logTarget, e);
                }
            }
        }
        return result;
    }
    async getFileContent(uri) {
        try {
            return this.fileSystemService.readFileString(uri);
        }
        catch (e) {
            exports.relatedFilesLogger.debug(this.logTarget, e);
        }
        return undefined;
    }
    async isContentExcluded(uri, content) {
        try {
            return this.ignoreService.isCopilotIgnored(uri_1.URI.parse(uri));
        }
        catch (e) {
            this.instantiationService.invokeFunction(acc => exports.relatedFilesLogger.exception(acc, e, 'isContentExcluded'));
        }
        // Default to being excluded if encountered error
        return true;
    }
    static dropBOM(content) {
        // Note: charCodeAt() converts the UTF8 BOM to UTF16 BOM (`0xefbbbf` to `0xfeff`),
        // so only the latter must be checked.
        if (content.charCodeAt(0) === 0xfeff) {
            return content.slice(1);
        }
        return content;
    }
};
exports.RelatedFilesProvider = RelatedFilesProvider;
exports.RelatedFilesProvider = RelatedFilesProvider = RelatedFilesProvider_1 = __decorate([
    __param(0, instantiation_1.IInstantiationService),
    __param(1, ignoreService_1.IIgnoreService),
    __param(2, logger_1.ICompletionsLogTargetService),
    __param(3, fileSystem_1.ICompletionsFileSystemService)
], RelatedFilesProvider);
const defaultMaxRetryCount = 3; // times the cache may be evicted and refreshed (e.g. a retry)
const lruCache = new PromiseExpirationCacheMap(lruCacheSize);
/**
 * Given a document, gets a list of related files which are cached (memoized).
 * If the result is not already cached, then the lookup is made based purely upon docInfo and then cached.
 * */
async function getRelatedFiles(accessor, docInfo, telemetryData, cancellationToken, relatedFilesProvider) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const startTime = performance.now();
    let result;
    try {
        result = await relatedFilesProvider.getRelatedFiles(docInfo, telemetryData, cancellationToken);
    }
    catch (error) {
        instantiationService.invokeFunction(acc => exports.relatedFilesLogger.exception(acc, error, '.getRelatedFiles'));
        result = undefined;
    }
    if (result === undefined) {
        const retryCount = lruCache.bumpRetryCount(docInfo.uri);
        if (retryCount >= defaultMaxRetryCount) {
            // Retry limit reached, cache and return an empty list.
            result = EmptyRelatedFiles;
        }
        else {
            result = undefined;
        }
    }
    const elapsedTime = performance.now() - startTime;
    exports.relatedFilesLogger.debug(logTarget, result !== undefined
        ? `Fetched ${[...result.entries.values()]
            .map(value => value.size)
            .reduce((total, current) => total + current, 0)} related files for '${docInfo.uri}' in ${elapsedTime}ms.`
        : `Failing fetching files for '${docInfo.uri}' in ${elapsedTime}ms.`);
    // If the provider failed, throwing will let memoize() evict the key from the cache, and will be tried again.
    if (result === undefined) {
        throw new RelatedFilesProviderFailure();
    }
    return result;
}
let getRelatedFilesWithCacheAndTimeout = function (accessor, docInfo, telemetryData, cancellationToken, relatedFilesProvider) {
    const id = `${docInfo.uri}`;
    if (lruCache.has(id)) {
        return lruCache.get(id);
    }
    let result = getRelatedFiles(accessor, docInfo, telemetryData, cancellationToken, relatedFilesProvider);
    if (result instanceof Promise) {
        result = result.catch(error => {
            lruCache.delete(id);
            throw error;
        });
    }
    lruCache.set(id, result);
    return result;
};
getRelatedFilesWithCacheAndTimeout = (0, shortCircuit_1.shortCircuit)(getRelatedFilesWithCacheAndTimeout, 200, // max milliseconds
EmptyRelatedFiles);
/**
 * For a given document, it provides a list of related files and traits
 * @param ctx The context.
 * @param doc The document information.
 * @param telemetryData Object used to send telemetry and check experimentation options.
 * @param cancellationToken The cancellation token.
 * @param data Additional arbitrary data to be passed to the provider.
 * @param forceComputation Set true to force computation by skipping cache and timeout.
 * @returns Related files and traits.
 */
async function getRelatedFilesAndTraits(accessor, doc, telemetryData, cancellationToken, data, forceComputation = false) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const relatedFilesProvider = accessor.get(exports.ICompletionsRelatedFilesProviderService);
    let relatedFiles = EmptyRelatedFiles;
    try {
        const docInfo = {
            uri: doc.uri,
            clientLanguageId: doc.clientLanguageId,
            data: data,
        };
        relatedFiles = forceComputation
            ? await instantiationService.invokeFunction(getRelatedFiles, docInfo, telemetryData, cancellationToken, relatedFilesProvider)
            : await instantiationService.invokeFunction(getRelatedFilesWithCacheAndTimeout, docInfo, telemetryData, cancellationToken, relatedFilesProvider);
    }
    catch (error) {
        relatedFiles = EmptyRelatedFiles;
        if (error instanceof RelatedFilesProviderFailure) {
            instantiationService.invokeFunction(telemetry_1.telemetry, 'getRelatedFilesList', telemetryData);
        }
    }
    exports.relatedFilesLogger.debug(logTarget, relatedFiles !== null && relatedFiles !== undefined
        ? `Fetched following traits ${relatedFiles.traits
            .map(trait => `{${trait.name} : ${trait.value}}`)
            .join('')} for '${doc.uri}'`
        : `Failing fecthing traits for '${doc.uri}'.`);
    return relatedFiles;
}
//# sourceMappingURL=relatedFiles.js.map
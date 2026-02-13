"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerCompletionContextProviderStatistics = exports.ContextProviderStatistics = exports.ICompletionsContextProviderService = void 0;
exports.componentStatisticsToPromptMatcher = componentStatisticsToPromptMatcher;
const services_1 = require("../../../../../../util/common/services");
const cache_1 = require("../helpers/cache");
exports.ICompletionsContextProviderService = (0, services_1.createServiceIdentifier)('ICompletionsContextProviderService');
class ContextProviderStatistics {
    constructor(createStatistics = () => new PerCompletionContextProviderStatistics()) {
        this.createStatistics = createStatistics;
        this.statistics = new cache_1.LRUCacheMap(25);
    }
    getStatisticsForCompletion(completionId) {
        const statistics = this.statistics.get(completionId);
        if (statistics) {
            return statistics;
        }
        const newStatistics = this.createStatistics();
        this.statistics.set(completionId, newStatistics);
        return newStatistics;
    }
    getPreviousStatisticsForCompletion(completionId) {
        const keys = Array.from(this.statistics.keys());
        for (let i = keys.length - 1; i >= 0; i--) {
            const key = keys[i];
            if (key !== completionId) {
                return this.statistics.peek(key);
            }
        }
        return undefined;
    }
}
exports.ContextProviderStatistics = ContextProviderStatistics;
class PerCompletionContextProviderStatistics {
    constructor() {
        // Keyed by the providerId, contains an array of tuples [context item, expectation]
        this._expectations = new Map();
        this._lastResolution = new Map();
        this._statistics = new Map();
        this.opportunityId = undefined;
    }
    addExpectations(providerId, expectations) {
        const providerExpectations = this._expectations.get(providerId) ?? [];
        this._expectations.set(providerId, [...providerExpectations, ...expectations]);
    }
    clearExpectations() {
        this._expectations.clear();
    }
    setLastResolution(providerId, resolution) {
        this._lastResolution.set(providerId, resolution);
    }
    setOpportunityId(opportunityId) {
        this.opportunityId = opportunityId;
    }
    get(providerId) {
        return this._statistics.get(providerId);
    }
    getAllUsageStatistics() {
        return this._statistics.entries();
    }
    computeMatch(promptMatchers) {
        try {
            for (const [providerId, expectations] of this._expectations) {
                if (expectations.length === 0) {
                    continue;
                }
                const resolution = this._lastResolution.get(providerId) ?? 'none';
                if (resolution === 'none' || resolution === 'error') {
                    this._statistics.set(providerId, {
                        usage: 'none',
                        resolution,
                    });
                    continue;
                }
                const providerUsageDetails = [];
                for (const [item, expectation] of expectations) {
                    const itemDetails = {
                        id: item.id,
                        type: item.type,
                    };
                    if (item.origin) {
                        itemDetails.origin = item.origin;
                    }
                    if (expectation === 'content_excluded') {
                        providerUsageDetails.push({
                            ...itemDetails,
                            usage: 'none_content_excluded',
                        });
                        continue;
                    }
                    const itemStatistics = promptMatchers.find(component => component.source === item);
                    if (itemStatistics === undefined) {
                        providerUsageDetails.push({
                            ...itemDetails,
                            // In this case, the item didn't make to elision, despite being expected.
                            usage: 'error',
                        });
                    }
                    else {
                        providerUsageDetails.push({
                            ...itemDetails,
                            usage: itemStatistics.expectedTokens > 0 &&
                                itemStatistics.expectedTokens === itemStatistics.actualTokens
                                ? 'full'
                                : itemStatistics.actualTokens > 0
                                    ? 'partial'
                                    : 'none',
                            expectedTokens: itemStatistics.expectedTokens,
                            actualTokens: itemStatistics.actualTokens,
                        });
                    }
                }
                const usedItems = providerUsageDetails.reduce((acc, item) => {
                    if (item.usage === 'full') {
                        return acc + 1;
                    }
                    else if (item.usage === 'partial') {
                        return acc + 0.5;
                    }
                    return acc;
                }, 0);
                const usedPercentage = usedItems / expectations.length;
                const usage = usedPercentage === 1 ? 'full' : usedPercentage === 0 ? 'none' : 'partial';
                this._statistics.set(providerId, {
                    resolution,
                    usage,
                    usageDetails: providerUsageDetails,
                });
            }
        }
        finally {
            // Remove expectations and resolutions no matter what happens
            this.clearExpectations();
            this._lastResolution.clear();
        }
    }
}
exports.PerCompletionContextProviderStatistics = PerCompletionContextProviderStatistics;
function componentStatisticsToPromptMatcher(promptComponentStatistics) {
    return promptComponentStatistics
        .map(component => {
        if (component.source === undefined ||
            component.expectedTokens === undefined ||
            component.actualTokens === undefined) {
            return;
        }
        return {
            source: component.source,
            expectedTokens: component.expectedTokens,
            actualTokens: component.actualTokens,
        };
    })
        .filter(p => p !== undefined);
}
//# sourceMappingURL=contextProviderStatistics.js.map
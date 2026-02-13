"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TS_CONTEXT_PROVIDER_ID = void 0;
exports.fillInTsActiveExperiments = fillInTsActiveExperiments;
const featuresService_1 = require("../experiments/featuresService");
const logger_1 = require("../logger");
exports.TS_CONTEXT_PROVIDER_ID = 'typescript-ai-context-provider';
function fillInTsActiveExperiments(accessor, matchedContextProviders, activeExperiments, telemetryData) {
    if (!((matchedContextProviders.length === 1 && matchedContextProviders[0] === '*') ||
        matchedContextProviders.includes(exports.TS_CONTEXT_PROVIDER_ID))) {
        return false;
    }
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    try {
        const tsContextProviderParams = featuresService.tsContextProviderParams(telemetryData);
        if (tsContextProviderParams) {
            const params = JSON.parse(tsContextProviderParams);
            for (const [key, value] of Object.entries(params)) {
                activeExperiments.set(key, value);
            }
        }
        else {
            const params = featuresService.getContextProviderExpSettings('typescript')?.params;
            if (params) {
                for (const [key, value] of Object.entries(params)) {
                    activeExperiments.set(key, value);
                }
            }
        }
    }
    catch (e) {
        logger_1.logger.debug(logTarget, `Failed to get the active TypeScript experiments for the Context Provider API`, e);
        return false;
    }
    return true;
}
//# sourceMappingURL=contextProviderRegistryTs.js.map
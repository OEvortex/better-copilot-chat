"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillInCppVSCodeActiveExperiments = fillInCppVSCodeActiveExperiments;
const featuresService_1 = require("../experiments/featuresService");
const logger_1 = require("../logger");
const cppContextProviderParamsDefault = {
    maxSnippetLength: 3000,
    maxSnippetCount: 7,
    enabledFeatures: 'Deferred',
    timeBudgetMs: 7,
    doAggregateSnippets: true,
};
const VSCodeCppContextProviderId = 'ms-vscode.cpptools';
function fillInCppVSCodeActiveExperiments(accessor, matchedContextProviders, activeExperiments, telemetryData) {
    if ((matchedContextProviders.length === 1 && matchedContextProviders[0] === '*') ||
        matchedContextProviders.includes(VSCodeCppContextProviderId)) {
        addActiveExperiments(accessor, activeExperiments, telemetryData);
    }
}
function addActiveExperiments(accessor, activeExperiments, telemetryData) {
    try {
        const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
        const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
        let params = cppContextProviderParamsDefault;
        const cppContextProviderParams = featuresService.cppContextProviderParams(telemetryData);
        if (cppContextProviderParams) {
            try {
                params = JSON.parse(cppContextProviderParams);
            }
            catch (e) {
                logger_1.logger.error(logTarget, 'Failed to parse cppContextProviderParams', e);
            }
        }
        else {
            const langSpecific = featuresService.getContextProviderExpSettings('cpp')?.params;
            if (langSpecific) {
                params = { ...langSpecific };
            }
        }
        for (const [key, value] of Object.entries(params)) {
            activeExperiments.set(key, value);
        }
    }
    catch (e) {
        logger_1.logger.exception(accessor, e, 'fillInCppActiveExperiments');
    }
}
//# sourceMappingURL=contextProviderRegistryCpp.js.map
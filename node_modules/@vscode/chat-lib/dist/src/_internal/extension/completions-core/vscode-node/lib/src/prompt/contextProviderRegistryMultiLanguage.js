"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiLanguageContextProviderParamsDefault = void 0;
exports.fillInMultiLanguageActiveExperiments = fillInMultiLanguageActiveExperiments;
exports.getMultiLanguageContextProviderParamsFromActiveExperiments = getMultiLanguageContextProviderParamsFromActiveExperiments;
const featuresService_1 = require("../experiments/featuresService");
const logger_1 = require("../logger");
const MULTI_LANGUAGE_CONTEXT_PROVIDER_ID = 'fallbackContextProvider';
exports.multiLanguageContextProviderParamsDefault = {
    mlcpMaxContextItems: 20,
    mlcpMaxSymbolMatches: 20,
    mlcpEnableImports: false,
};
function fillInMultiLanguageActiveExperiments(accessor, matchedContextProviders, activeExperiments, telemetryData) {
    if ((matchedContextProviders.length === 1 && matchedContextProviders[0] === '*') ||
        matchedContextProviders.includes(MULTI_LANGUAGE_CONTEXT_PROVIDER_ID)) {
        addActiveExperiments(accessor, activeExperiments, telemetryData);
    }
}
function addActiveExperiments(accessor, activeExperiments, telemetryData) {
    try {
        const params = getMultiLanguageContextProviderParamsFromExp(accessor, telemetryData);
        for (const [key, value] of Object.entries(params)) {
            activeExperiments.set(key, value);
        }
    }
    catch (e) {
        logger_1.logger.exception(accessor, e, 'fillInMultiLanguageActiveExperiments');
    }
}
function getMultiLanguageContextProviderParamsFromExp(accessor, telemetryData) {
    let params = exports.multiLanguageContextProviderParamsDefault;
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const multiLanguageContextProviderParams = featuresService.multiLanguageContextProviderParams(telemetryData);
    if (multiLanguageContextProviderParams) {
        try {
            params = JSON.parse(multiLanguageContextProviderParams);
        }
        catch (e) {
            logger_1.logger.error(logTarget, 'Failed to parse multiLanguageContextProviderParams', e);
        }
    }
    return params;
}
function getMultiLanguageContextProviderParamsFromActiveExperiments(activeExperiments) {
    const params = { ...exports.multiLanguageContextProviderParamsDefault };
    if (activeExperiments.has('mlcpMaxContextItems')) {
        params.mlcpMaxContextItems = Number(activeExperiments.get('mlcpMaxContextItems'));
    }
    if (activeExperiments.has('mlcpMaxSymbolMatches')) {
        params.mlcpMaxSymbolMatches = Number(activeExperiments.get('mlcpMaxSymbolMatches'));
    }
    if (activeExperiments.has('mlcpEnableImports')) {
        params.mlcpEnableImports = String(activeExperiments.get('mlcpEnableImports')) === 'true';
    }
    return params;
}
//# sourceMappingURL=contextProviderRegistryMultiLanguage.js.map
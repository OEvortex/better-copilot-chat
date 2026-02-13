"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillInCSharpActiveExperiments = fillInCSharpActiveExperiments;
const featuresService_1 = require("../experiments/featuresService");
const logger_1 = require("../logger");
function fillInCSharpActiveExperiments(accessor, activeExperiments, telemetryData) {
    const featuresService = accessor.get(featuresService_1.ICompletionsFeaturesService);
    const logTarget = accessor.get(logger_1.ICompletionsLogTargetService);
    try {
        const csharpContextProviderParams = featuresService.csharpContextProviderParams(telemetryData);
        if (csharpContextProviderParams) {
            const params = JSON.parse(csharpContextProviderParams);
            for (const [key, value] of Object.entries(params)) {
                activeExperiments.set(key, value);
            }
        }
        else {
            const params = featuresService.getContextProviderExpSettings('csharp')?.params;
            if (params) {
                for (const [key, value] of Object.entries(params)) {
                    activeExperiments.set(key, value);
                }
            }
        }
    }
    catch (e) {
        logger_1.logger.debug(logTarget, `Failed to get the active C# experiments for the Context Provider API`, e);
        return false;
    }
    return true;
}
//# sourceMappingURL=contextProviderRegistryCSharp.js.map
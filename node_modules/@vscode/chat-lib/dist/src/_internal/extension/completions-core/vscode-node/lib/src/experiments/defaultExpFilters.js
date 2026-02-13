"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCompletionsExperimentationService = setupCompletionsExperimentationService;
exports.createCompletionsFilters = createCompletionsFilters;
const authentication_1 = require("../../../../../../platform/authentication/common/authentication");
const nullExperimentationService_1 = require("../../../../../../platform/telemetry/common/nullExperimentationService");
const instantiation_1 = require("../../../../../../util/vs/platform/instantiation/common/instantiation");
const orgs_1 = require("../auth/orgs");
const config_1 = require("../config");
const config_2 = require("../openai/config");
const filters_1 = require("./filters");
function setupCompletionsExperimentationService(accessor) {
    const authService = accessor.get(authentication_1.IAuthenticationService);
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const disposable = authService.onDidAccessTokenChange(() => {
        authService.getCopilotToken()
            .then(t => instantiationService.invokeFunction(updateCompletionsFilters, t))
            .catch(err => { });
    });
    updateCompletionsFilters(accessor, authService.copilotToken);
    return disposable;
}
function getPluginRelease(accessor) {
    if (config_1.BuildInfo.getBuildType() === config_1.BuildType.NIGHTLY) {
        return filters_1.Release.Nightly;
    }
    return filters_1.Release.Stable;
}
function updateCompletionsFilters(accessor, token) {
    const exp = accessor.get(nullExperimentationService_1.IExperimentationService);
    const filters = createCompletionsFilters(accessor, token);
    exp.setCompletionsFilters(filters);
}
function createCompletionsFilters(accessor, token) {
    const filters = new Map();
    filters.set(filters_1.Filter.ExtensionRelease, getPluginRelease(accessor));
    filters.set(filters_1.Filter.CopilotOverrideEngine, (0, config_1.getConfig)(accessor, config_1.ConfigKey.DebugOverrideEngine) || (0, config_1.getConfig)(accessor, config_1.ConfigKey.DebugOverrideEngineLegacy));
    filters.set(filters_1.Filter.CopilotClientVersion, config_1.BuildInfo.isProduction() ? config_1.BuildInfo.getVersion() : '1.999.0');
    if (token) {
        const userKind = (0, orgs_1.getUserKind)(token);
        const customModel = token.getTokenValue('ft') ?? '';
        const orgs = token.getTokenValue('ol') ?? '';
        const customModelNames = token.getTokenValue('cml') ?? '';
        const copilotTrackingId = token.getTokenValue('tid') ?? '';
        filters.set(filters_1.Filter.CopilotUserKind, userKind);
        filters.set(filters_1.Filter.CopilotCustomModel, customModel);
        filters.set(filters_1.Filter.CopilotOrgs, orgs);
        filters.set(filters_1.Filter.CopilotCustomModelNames, customModelNames);
        filters.set(filters_1.Filter.CopilotTrackingId, copilotTrackingId);
        filters.set(filters_1.Filter.CopilotUserKind, (0, orgs_1.getUserKind)(token));
    }
    const model = (0, config_2.getEngineRequestInfo)(accessor).modelId;
    filters.set(filters_1.Filter.CopilotEngine, model);
    return filters;
}
//# sourceMappingURL=defaultExpFilters.js.map
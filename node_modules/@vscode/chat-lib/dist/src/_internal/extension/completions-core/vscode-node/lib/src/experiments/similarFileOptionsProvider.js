"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSimilarFilesOptions = getSimilarFilesOptions;
exports.getNumberOfSnippets = getNumberOfSnippets;
exports.useSubsetMatching = useSubsetMatching;
const prompt_1 = require("../../../prompt/src/prompt");
const similarFiles_1 = require("../../../prompt/src/snippetInclusion/similarFiles");
const config_1 = require("../config");
const expConfig_1 = require("./expConfig");
const similarFileOptionsProviderCpp_1 = require("./similarFileOptionsProviderCpp");
// Add here for more options for other language ids.
const languageSimilarFilesOptions = new Map([['cpp', similarFileOptionsProviderCpp_1.getCppSimilarFilesOptions]]);
function getSimilarFilesOptions(accessor, exp, langId) {
    const optionsProvider = languageSimilarFilesOptions.get(langId);
    if (optionsProvider) {
        return optionsProvider(accessor, exp);
    }
    else {
        return {
            ...similarFiles_1.defaultSimilarFilesOptions,
            useSubsetMatching: useSubsetMatching(accessor, exp),
        };
    }
}
// Add here for more values for other language ids.
const numberOfSnippets = new Map([
    ['cpp', similarFileOptionsProviderCpp_1.getCppNumberOfSnippets],
]);
function getNumberOfSnippets(exp, langId) {
    const provider = numberOfSnippets.get(langId);
    return provider ? provider(exp) : prompt_1.DEFAULT_NUM_SNIPPETS;
}
function useSubsetMatching(accessor, telemetryWithExp) {
    return ((telemetryWithExp.filtersAndExp.exp.variables[expConfig_1.ExpTreatmentVariables.UseSubsetMatching] ||
        (0, config_1.getConfig)(accessor, config_1.ConfigKey.UseSubsetMatching)) ??
        false);
}
//# sourceMappingURL=similarFileOptionsProvider.js.map
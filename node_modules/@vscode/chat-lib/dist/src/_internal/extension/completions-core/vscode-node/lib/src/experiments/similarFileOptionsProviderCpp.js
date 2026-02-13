"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCppSimilarFilesOptions = getCppSimilarFilesOptions;
exports.getCppNumberOfSnippets = getCppNumberOfSnippets;
const similarFiles_1 = require("../../../prompt/src/snippetInclusion/similarFiles");
const similarFileOptionsProvider_1 = require("./similarFileOptionsProvider");
function getCppSimilarFilesOptions(accessor, telemetryWithExp) {
    return {
        ...similarFiles_1.defaultCppSimilarFilesOptions,
        useSubsetMatching: (0, similarFileOptionsProvider_1.useSubsetMatching)(accessor, telemetryWithExp),
    };
}
function getCppNumberOfSnippets(telemetryWithExp) {
    return similarFiles_1.defaultCppSimilarFilesOptions.maxTopSnippets;
}
//# sourceMappingURL=similarFileOptionsProviderCpp.js.map
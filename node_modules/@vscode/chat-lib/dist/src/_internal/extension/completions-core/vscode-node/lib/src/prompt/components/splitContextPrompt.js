"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitContextCompletionsPrompt = splitContextCompletionsPrompt;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
const instantiation_1 = require("../../../../../../../util/vs/platform/instantiation/common/instantiation");
const textDocumentManager_1 = require("../../textDocumentManager");
const recentEditsProvider_1 = require("../recentEdits/recentEditsProvider");
const codeSnippets_1 = require("./codeSnippets");
const completionsContext_1 = require("./completionsContext");
const currentFile_1 = require("./currentFile");
const marker_1 = require("./marker");
const recentEdits_1 = require("./recentEdits");
const similarFiles_1 = require("./similarFiles");
const traits_1 = require("./traits");
/**
 * Function that returns the prompt structure for a code completion request following the split context prompt design
 * that optimizes for cache hits.
 */
function splitContextCompletionsPrompt(accessor) {
    const instantiationService = accessor.get(instantiation_1.IInstantiationService);
    const tdms = accessor.get(textDocumentManager_1.ICompletionsTextDocumentManagerService);
    const recentEditsProvider = accessor.get(recentEditsProvider_1.ICompletionsRecentEditsProviderService);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)(completionsContext_1.StableCompletionsContext, { children: [(0, jsx_runtime_1.jsx)(marker_1.DocumentMarker, { tdms: tdms, weight: 0.7 }), (0, jsx_runtime_1.jsx)(traits_1.Traits, { weight: 0.6 }), (0, jsx_runtime_1.jsx)(codeSnippets_1.CodeSnippets, { tdms: tdms, weight: 0.9 }), (0, jsx_runtime_1.jsx)(similarFiles_1.SimilarFiles, { tdms: tdms, instantiationService: instantiationService, weight: 0.8 })] }), (0, jsx_runtime_1.jsx)(currentFile_1.DocumentSuffix, { weight: 1 }), (0, jsx_runtime_1.jsx)(completionsContext_1.AdditionalCompletionsContext, { children: (0, jsx_runtime_1.jsx)(recentEdits_1.RecentEdits, { tdms: tdms, recentEditsProvider: recentEditsProvider, weight: 0.99 }) }), (0, jsx_runtime_1.jsx)(currentFile_1.DocumentPrefix, { weight: 1 })] }));
}
//# sourceMappingURL=splitContextPrompt.js.map
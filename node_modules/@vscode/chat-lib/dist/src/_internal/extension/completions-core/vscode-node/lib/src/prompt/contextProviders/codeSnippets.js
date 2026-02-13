"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCodeSnippetsFromContextItems = getCodeSnippetsFromContextItems;
exports.addRelativePathToCodeSnippets = addRelativePathToCodeSnippets;
const textDocumentManager_1 = require("../../textDocumentManager");
const contextProviderStatistics_1 = require("../contextProviderStatistics");
const contextItemSchemas_1 = require("./contextItemSchemas");
const CONTENT_EXCLUDED_EXPECTATION = 'content_excluded';
async function getCodeSnippetsFromContextItems(accessor, completionId, resolvedContextItems, languageId) {
    const codeSnippetContextItems = (0, contextItemSchemas_1.filterContextItemsByType)(resolvedContextItems, 'CodeSnippet');
    if (codeSnippetContextItems.length === 0) {
        return [];
    }
    // Expand snippets and collect URIs
    const allUris = new Set();
    const mappedSnippets = codeSnippetContextItems.flatMap(item => item.data.map(data => {
        allUris.add(data.uri);
        data.additionalUris?.forEach(uri => allUris.add(uri));
        return { providerId: item.providerId, data };
    }));
    // Validate all URIs at once: we already know they are distinct
    const contextProviderStatistics = accessor.get(contextProviderStatistics_1.ICompletionsContextProviderService);
    const tdm = accessor.get(textDocumentManager_1.ICompletionsTextDocumentManagerService);
    const validationMap = new Map();
    await Promise.all(Array.from(allUris).map(async (uri) => {
        validationMap.set(uri, await tdm.getTextDocumentValidation({ uri }));
    }));
    // Process only valid snippets
    const statistics = contextProviderStatistics.getStatisticsForCompletion(completionId);
    return mappedSnippets
        .filter(snippet => {
        const urisToCheck = [snippet.data.uri, ...(snippet.data.additionalUris ?? [])];
        const isValid = urisToCheck.every(uri => validationMap.get(uri)?.status === 'valid');
        // Set expectations regardless of validity
        if (isValid) {
            statistics.addExpectations(snippet.providerId, [[snippet.data, 'included']]);
        }
        else {
            statistics.addExpectations(snippet.providerId, [[snippet.data, CONTENT_EXCLUDED_EXPECTATION]]);
        }
        return isValid;
    })
        .map(snippet => snippet.data);
}
function addRelativePathToCodeSnippets(tdm, codeSnippets) {
    return codeSnippets.map(codeSnippet => {
        return {
            snippet: codeSnippet,
            relativePath: tdm.getRelativePath(codeSnippet),
        };
    });
}
//# sourceMappingURL=codeSnippets.js.map
"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnippetSemantics = exports.SnippetProviderType = void 0;
exports.announceSnippet = announceSnippet;
/** Indicates what provider produced a given snippet. */
var SnippetProviderType;
(function (SnippetProviderType) {
    SnippetProviderType["SimilarFiles"] = "similar-files";
    SnippetProviderType["Path"] = "path";
})(SnippetProviderType || (exports.SnippetProviderType = SnippetProviderType = {}));
/**
 * The semantics of a snippet. For example, some providers
 * might always produce a snippet that is a complete function
 * whereas others might produce a snippet that are inherhently
 * partial.
 */
var SnippetSemantics;
(function (SnippetSemantics) {
    /** The contents of the snippet is a function. */
    SnippetSemantics["Function"] = "function";
    /** The contents of the snippet is an unspecified snippet. */
    SnippetSemantics["Snippet"] = "snippet";
    /** Contains multiple snippets of type snippet */
    SnippetSemantics["Snippets"] = "snippets";
    /** The following are from hover text */
    SnippetSemantics["Variable"] = "variable";
    SnippetSemantics["Parameter"] = "parameter";
    SnippetSemantics["Method"] = "method";
    SnippetSemantics["Class"] = "class";
    SnippetSemantics["Module"] = "module";
    SnippetSemantics["Alias"] = "alias";
    SnippetSemantics["Enum"] = "enum member";
    SnippetSemantics["Interface"] = "interface";
})(SnippetSemantics || (exports.SnippetSemantics = SnippetSemantics = {}));
/**
 * A map from semantics enum to a human / LLM-readable label that we
 * include when announcing a snippet.
 */
const snippetSemanticsToString = {
    [SnippetSemantics.Function]: 'function',
    [SnippetSemantics.Snippet]: 'snippet',
    [SnippetSemantics.Snippets]: 'snippets',
    [SnippetSemantics.Variable]: 'variable',
    [SnippetSemantics.Parameter]: 'parameter',
    [SnippetSemantics.Method]: 'method',
    [SnippetSemantics.Class]: 'class',
    [SnippetSemantics.Module]: 'module',
    [SnippetSemantics.Alias]: 'alias',
    [SnippetSemantics.Enum]: 'enum member',
    [SnippetSemantics.Interface]: 'interface',
};
/**
 * Formats a snippet for inclusion in the prompt.
 */
function announceSnippet(snippet) {
    const semantics = snippetSemanticsToString[snippet.semantics];
    const pluralizedSemantics = [SnippetSemantics.Snippets].includes(snippet.semantics) ? 'these' : 'this';
    const headline = snippet.relativePath
        ? `Compare ${pluralizedSemantics} ${semantics} from ${snippet.relativePath}:`
        : `Compare ${pluralizedSemantics} ${semantics}:`;
    return { headline, snippet: snippet.snippet };
}
//# sourceMappingURL=snippets.js.map
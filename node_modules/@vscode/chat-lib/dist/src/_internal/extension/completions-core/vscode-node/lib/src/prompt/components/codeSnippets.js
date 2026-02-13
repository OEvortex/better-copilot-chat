"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeSnippets = void 0;
const jsx_runtime_1 = require("../../../../prompt/jsx-runtime//jsx-runtime");
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
const components_1 = require("../../../../prompt/src/components/components");
const componentsCompletionsPromptFactory_1 = require("../completionsPromptFactory/componentsCompletionsPromptFactory");
const codeSnippets_1 = require("../contextProviders/codeSnippets");
const CodeSnippets = (props, context) => {
    const [snippets, setSnippets] = context.useState();
    const [document, setDocument] = context.useState();
    context.useData(componentsCompletionsPromptFactory_1.isCompletionRequestData, request => {
        if (request.codeSnippets !== snippets) {
            setSnippets(request.codeSnippets);
        }
        if (request.document.uri !== document?.uri) {
            setDocument(request.document);
        }
    });
    if (!snippets || snippets.length === 0 || !document) {
        return;
    }
    const codeSnippetsWithRelativePath = (0, codeSnippets_1.addRelativePathToCodeSnippets)(props.tdms, snippets);
    // Snippets with the same URI should appear together as a single snippet.
    const snippetsByUri = new Map();
    for (const snippet of codeSnippetsWithRelativePath) {
        const uri = snippet.relativePath ?? snippet.snippet.uri;
        let groupedSnippets = snippetsByUri.get(uri);
        if (groupedSnippets === undefined) {
            groupedSnippets = [];
            snippetsByUri.set(uri, groupedSnippets);
        }
        groupedSnippets.push(snippet);
    }
    const codeSnippetChunks = [];
    for (const [uri, snippets] of snippetsByUri.entries()) {
        const validSnippets = snippets.filter(s => s.snippet.value.length > 0);
        if (validSnippets.length > 0) {
            codeSnippetChunks.push({
                chunkElements: validSnippets.map(s => s.snippet),
                // The importance is the maximum importance of the snippets in this group.
                importance: Math.max(...validSnippets.map(snippet => snippet.snippet.importance ?? 0)),
                uri,
            });
        }
    }
    if (codeSnippetChunks.length === 0) {
        return;
    }
    // Sort by importance, with the most important first
    codeSnippetChunks.sort((a, b) => b.importance - a.importance);
    // Reverse the order so the most important snippet is last. Note, that we don't directly
    // sort in ascending order to handle importance 0 correctly.
    codeSnippetChunks.reverse();
    return codeSnippetChunks.map(chunk => {
        const elements = [];
        elements.push((0, jsx_runtime_1.jsx)(components_1.Text, { children: `Compare ${chunk.chunkElements.length > 1 ? 'these snippets' : 'this snippet'} from ${chunk.uri}:` }));
        chunk.chunkElements.forEach((element, index) => {
            elements.push((0, jsx_runtime_1.jsx)(components_1.Text, { source: element, children: element.value }, element.id));
            if (chunk.chunkElements.length > 1 && index < chunk.chunkElements.length - 1) {
                elements.push((0, jsx_runtime_1.jsx)(components_1.Text, { children: "---" }));
            }
        });
        // TODO: change Chunk for KeepTogether
        return (0, jsx_runtime_1.jsx)(components_1.Chunk, { children: elements });
    });
};
exports.CodeSnippets = CodeSnippets;
//# sourceMappingURL=codeSnippets.js.map
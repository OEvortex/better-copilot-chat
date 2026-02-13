"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionsContext = CompletionsContext;
exports.StableCompletionsContext = StableCompletionsContext;
exports.AdditionalCompletionsContext = AdditionalCompletionsContext;
exports.isContextNode = isContextNode;
/**
 * A component that marks the context part of the prompt
 */
function CompletionsContext(props) {
    return props.children;
}
/**
 * A component that marks the context part of the prompt that is stable across requests,
 * and should be located earlier in the prompt to maximize cache hits.
 */
function StableCompletionsContext(props) {
    return props.children;
}
/**
 * A component that marks the context part of the prompt that is subject to change quickly across requests,
 * and should be located further down in the prompt.
 */
function AdditionalCompletionsContext(props) {
    return props.children;
}
function isContextNode(node) {
    return (node.name === CompletionsContext.name ||
        node.name === StableCompletionsContext.name ||
        node.name === AdditionalCompletionsContext.name);
}
//# sourceMappingURL=completionsContext.js.map
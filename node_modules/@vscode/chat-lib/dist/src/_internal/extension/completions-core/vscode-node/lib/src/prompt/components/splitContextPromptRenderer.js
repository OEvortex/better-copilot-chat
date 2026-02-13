"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SplitContextPromptRenderer = void 0;
const walker_1 = require("../../../../prompt/src/components/walker");
const completionsContext_1 = require("./completionsContext");
const completionsPromptRenderer_1 = require("./completionsPromptRenderer");
const currentFile_1 = require("./currentFile");
const elision_1 = require("./elision");
let contextIndex = 0;
function resetContextIndex() {
    contextIndex = 0;
}
function getNextContextIndex() {
    return contextIndex++;
}
class SplitContextPromptRenderer extends completionsPromptRenderer_1.CompletionsPromptRenderer {
    constructor() {
        super(...arguments);
        this.formatPrefix = elision_1.makePrefixPrompt;
        this.formatContext = elision_1.makeContextPrompt;
    }
    processSnapshot(snapshot, delimiter) {
        const prefixBlocks = [];
        const suffixBlocks = [];
        const componentStatistics = [];
        // Store the status of the required prefix node
        let foundPrefix = false;
        resetContextIndex();
        const walker = new walker_1.SnapshotWalker(snapshot, splitContextTransformers);
        walker.walkSnapshot((node, _parent, context) => {
            if (node === snapshot) {
                return true;
            }
            if (node.statistics.updateDataTimeMs && node.statistics.updateDataTimeMs > 0) {
                componentStatistics.push({
                    componentPath: node.path,
                    updateDataTimeMs: node.statistics.updateDataTimeMs,
                });
            }
            // Check for the presence of required prefix node
            if (node.name === currentFile_1.BeforeCursor.name) {
                foundPrefix = true;
            }
            if (node.value === undefined || node.value === '') {
                // No need to process this node as it only adds whitespace
                return true;
            }
            const chunks = context.chunks;
            const type = context.type;
            if (type === 'suffix') {
                // Suffix handling: Mark the child node with content as suffix
                suffixBlocks.push({
                    value: (0, completionsPromptRenderer_1.normalizeLineEndings)(node.value),
                    type: 'suffix',
                    weight: context.weight,
                    componentPath: node.path,
                    nodeStatistics: node.statistics,
                    chunks,
                    source: context.source,
                });
            }
            else {
                const isPrefix = type === 'prefix';
                // Add delimiter to non-prefix nodes
                const nodeValueWithDelimiter = isPrefix || node.value.endsWith(delimiter) ? node.value : node.value + delimiter;
                prefixBlocks.push({
                    type: isPrefix ? 'prefix' : 'context',
                    value: (0, completionsPromptRenderer_1.normalizeLineEndings)(nodeValueWithDelimiter),
                    weight: context.weight,
                    componentPath: node.path,
                    nodeStatistics: node.statistics,
                    chunks,
                    source: context.source,
                    index: isPrefix ? undefined : context.index, // index only set for context nodes
                });
            }
            return true;
        });
        if (!foundPrefix) {
            throw new Error(`Node of type ${currentFile_1.BeforeCursor.name} not found`);
        }
        if (suffixBlocks.length > 1) {
            throw new Error(`Only one suffix is allowed`);
        }
        const suffixBlock = suffixBlocks.length === 1
            ? suffixBlocks[0]
            : {
                componentPath: '',
                value: '',
                weight: 1,
                nodeStatistics: {},
                type: 'suffix',
            };
        return { prefixBlocks, suffixBlock, componentStatistics };
    }
}
exports.SplitContextPromptRenderer = SplitContextPromptRenderer;
const splitContextTransformers = [
    ...completionsPromptRenderer_1.transformers,
    (node, _, context) => {
        if ((0, completionsContext_1.isContextNode)(node)) {
            return { ...context, index: getNextContextIndex() };
        }
        return context;
    },
];
//# sourceMappingURL=splitContextPromptRenderer.js.map
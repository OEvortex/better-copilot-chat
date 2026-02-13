"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformers = exports.CompletionsPromptRenderer = void 0;
exports.normalizeLineEndings = normalizeLineEndings;
const walker_1 = require("../../../../prompt/src/components/walker");
const languageMarker_1 = require("../../../../prompt/src/languageMarker");
const tokenization_1 = require("../../../../prompt/src/tokenization");
const completionsContext_1 = require("./completionsContext");
const currentFile_1 = require("./currentFile");
const elision_1 = require("./elision");
const TOKENS_RESERVED_FOR_SUFFIX_ENCODING = 5;
class CompletionsPromptRenderer {
    constructor() {
        this.renderId = 0;
        /**
         * Function used to format the prefix blocks into a string.
         * If implementing a renderer subclass, override this to control how the prefix is formatted, otherwise defaults to `makePrompt`.
         */
        this.formatPrefix = elision_1.makePrompt;
    }
    render(snapshot, options, cancellationToken) {
        const id = this.renderId++;
        const renderStart = performance.now();
        try {
            if (cancellationToken?.isCancellationRequested) {
                return { status: 'cancelled' };
            }
            // Default options
            const delimiter = options.delimiter ?? '';
            const tokenizer = options.tokenizer ?? tokenization_1.TokenizerName.o200k;
            // Process the snapshot to get the prefix and suffix and adjust the token limits accordingly
            const { prefixBlocks, suffixBlock, componentStatistics } = this.processSnapshot(snapshot, delimiter, options.languageId);
            const { prefixTokenLimit, suffixTokenLimit } = this.getPromptLimits(suffixBlock, options);
            const elisionStart = performance.now();
            const elisionStrategy = new elision_1.WishlistElision();
            // The first element is always the suffix
            const { blocks: [elidedSuffix, ...elidedPrefix], } = elisionStrategy.elide(prefixBlocks, prefixTokenLimit, suffixBlock, suffixTokenLimit, (0, tokenization_1.getTokenizer)(tokenizer));
            const elisionEnd = performance.now();
            const prefix = this.formatPrefix(elidedPrefix);
            const context = this.formatContext ? this.formatContext(elidedPrefix) : undefined;
            const suffix = elidedSuffix.elidedValue;
            const prefixTokens = elidedPrefix.reduce((acc, block) => acc + block.elidedTokens, 0);
            componentStatistics.push(...computeComponentStatistics([...elidedPrefix, elidedSuffix]));
            return {
                prefix,
                prefixTokens,
                suffix,
                suffixTokens: elidedSuffix.elidedTokens,
                context,
                status: 'ok',
                metadata: {
                    renderId: id,
                    rendererName: 'c',
                    tokenizer: tokenizer,
                    elisionTimeMs: elisionEnd - elisionStart,
                    renderTimeMs: performance.now() - renderStart,
                    componentStatistics,
                    updateDataTimeMs: componentStatistics.reduce((acc, component) => acc + (component.updateDataTimeMs ?? 0), 0),
                },
            };
        }
        catch (e) {
            return { status: 'error', error: e };
        }
    }
    // Defaults are hardcoded for now, but we can use EXP flags like PromptOptions does
    // by passing the context
    getPromptLimits(suffixBlock, options) {
        const suffix = suffixBlock?.value ?? '';
        let availableTokens = options.promptTokenLimit;
        const suffixPercent = options.suffixPercent;
        if (suffix.length === 0 || suffixPercent === 0) {
            return { prefixTokenLimit: availableTokens, suffixTokenLimit: 0 };
        }
        // If there is a suffix, we need to reserve some tokens for the suffix encoding
        availableTokens = suffix.length > 0 ? availableTokens - TOKENS_RESERVED_FOR_SUFFIX_ENCODING : availableTokens;
        const suffixTokenLimit = Math.ceil(availableTokens * (suffixPercent / 100));
        const prefixTokenLimit = availableTokens - suffixTokenLimit;
        return {
            prefixTokenLimit,
            suffixTokenLimit,
        };
    }
    processSnapshot(snapshot, delimiter, languageId) {
        const prefixBlocks = [];
        const suffixBlocks = [];
        const componentStatistics = [];
        // Store the status of the required nodes
        let foundDocument = false;
        const walker = new walker_1.SnapshotWalker(snapshot, exports.transformers);
        walker.walkSnapshot((node, _parent, context) => {
            if (node === snapshot) {
                return true;
            }
            // Check for the presence of required node
            if (node.name === currentFile_1.CurrentFile.name) {
                foundDocument = true;
            }
            if (node.statistics.updateDataTimeMs && node.statistics.updateDataTimeMs > 0) {
                componentStatistics.push({
                    componentPath: node.path,
                    updateDataTimeMs: node.statistics.updateDataTimeMs,
                });
            }
            if (node.value === undefined || node.value === '') {
                // No need to process this node as it only adds whitespace
                return true;
            }
            const chunks = context.chunks;
            if (context.type === 'suffix') {
                // Everything after the cursor is part of the suffix
                suffixBlocks.push({
                    value: normalizeLineEndings(node.value),
                    type: 'suffix',
                    weight: context.weight,
                    componentPath: node.path,
                    nodeStatistics: node.statistics,
                    chunks,
                    source: context.source,
                });
            }
            else {
                // Add a delimiter for all nodes, that are not the beforeCursor if not already present
                const nodeValueWithDelimiter = node.value.endsWith(delimiter) ? node.value : node.value + delimiter;
                let value = nodeValueWithDelimiter;
                if (context.type === 'prefix') {
                    value = node.value;
                }
                else if ((0, languageMarker_1.isShebangLine)(node.value)) {
                    value = nodeValueWithDelimiter;
                }
                else {
                    value = (0, languageMarker_1.commentBlockAsSingles)(nodeValueWithDelimiter, languageId);
                }
                prefixBlocks.push({
                    type: context.type === 'prefix' ? 'prefix' : 'context',
                    value: normalizeLineEndings(value),
                    weight: context.weight,
                    componentPath: node.path,
                    nodeStatistics: node.statistics,
                    chunks,
                    source: context.source,
                });
            }
            return true;
        });
        if (!foundDocument) {
            throw new Error(`Node of type ${currentFile_1.CurrentFile.name} not found`);
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
exports.CompletionsPromptRenderer = CompletionsPromptRenderer;
exports.transformers = [
    ...(0, walker_1.defaultTransformers)(),
    // Context transformer
    (node, _, context) => {
        if ((0, completionsContext_1.isContextNode)(node)) {
            return { ...context, type: 'context' };
        }
        return context;
    },
    // Prefix transformer
    (node, _, context) => {
        if (node.name === currentFile_1.BeforeCursor.name) {
            return {
                ...context,
                type: 'prefix',
            };
        }
        return context;
    },
    // Suffix transformer
    (node, _, context) => {
        if (node.name === currentFile_1.AfterCursor.name) {
            return {
                ...context,
                type: 'suffix',
            };
        }
        return context;
    },
];
function computeComponentStatistics(elidedBlocks) {
    return elidedBlocks.map(block => {
        const result = {
            componentPath: block.componentPath,
        };
        if (block.tokens !== 0) {
            result.expectedTokens = block.tokens;
            result.actualTokens = block.elidedTokens;
        }
        if (block.nodeStatistics.updateDataTimeMs !== undefined) {
            result.updateDataTimeMs = block.nodeStatistics.updateDataTimeMs;
        }
        if (block.source) {
            result.source = block.source;
        }
        return result;
    });
}
function normalizeLineEndings(text) {
    return text.replace(/\r\n?/g, '\n');
}
//# sourceMappingURL=completionsPromptRenderer.js.map
"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCursorContext = getCursorContext;
const tokenization_1 = require("../tokenization");
const defaultCursorContextOptions = {
    tokenizerName: tokenization_1.TokenizerName.o200k,
};
function cursorContextOptions(options) {
    return { ...defaultCursorContextOptions, ...options };
}
/**
 * Return a cursor context corresponding to this document info.
 * This is essentially a trimmed-down version of a prompt.
 *
 * If maxLineCount or maxTokenLength are 0, an empty context is returned
 * If exactly one of `maxLineCount` or `maxTokenLength` is defined, the limit is applied for that one only
 * If both are defined, we apply both conditions so end up using the shorter of the two constraints
 * If both are undefined, the entire document up to the cursor is returned
 */
function getCursorContext(doc, options = {}) {
    const completeOptions = cursorContextOptions(options);
    const tokenizer = (0, tokenization_1.getTokenizer)(completeOptions.tokenizerName);
    if (completeOptions.maxLineCount !== undefined && completeOptions.maxLineCount < 0) {
        throw new Error('maxLineCount must be non-negative if defined');
    }
    if (completeOptions.maxTokenLength !== undefined && completeOptions.maxTokenLength < 0) {
        throw new Error('maxTokenLength must be non-negative if defined');
    }
    if (completeOptions.maxLineCount === 0 || completeOptions.maxTokenLength === 0) {
        return {
            context: '',
            lineCount: 0,
            tokenLength: 0,
            tokenizerName: completeOptions.tokenizerName,
        };
    }
    let context = doc.source.slice(0, doc.offset); // Trim to cursor location, offset is a character location
    if (completeOptions.maxLineCount !== undefined) {
        context = context.split('\n').slice(-completeOptions.maxLineCount).join('\n');
    }
    if (completeOptions.maxTokenLength !== undefined) {
        context = tokenizer.takeLastLinesTokens(context, completeOptions.maxTokenLength);
    }
    return {
        context,
        lineCount: context.split('\n').length,
        tokenLength: tokenizer.tokenLength(context),
        tokenizerName: completeOptions.tokenizerName,
    };
}
//# sourceMappingURL=cursorContext.js.map
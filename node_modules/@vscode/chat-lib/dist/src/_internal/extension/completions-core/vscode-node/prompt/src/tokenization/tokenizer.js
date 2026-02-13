"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeTokenizers = exports.ApproximateTokenizer = exports.TTokenizer = exports.TokenizerName = void 0;
exports.getTokenizer = getTokenizer;
const tiktokenizer_1 = require("@microsoft/tiktokenizer");
const parseTikTokens_1 = require("../../../../../../platform/tokenizer/node/parseTikTokens");
const error_1 = require("../error");
const fileLoader_1 = require("../fileLoader");
var TokenizerName;
(function (TokenizerName) {
    TokenizerName["cl100k"] = "cl100k_base";
    TokenizerName["o200k"] = "o200k_base";
    TokenizerName["mock"] = "mock";
})(TokenizerName || (exports.TokenizerName = TokenizerName = {}));
const tokenizers = new Map();
function getTokenizer(name = TokenizerName.o200k) {
    let tokenizer = tokenizers.get(name);
    if (tokenizer !== undefined) {
        return tokenizer;
    }
    // Fallback to o200k
    tokenizer = tokenizers.get(TokenizerName.o200k);
    if (tokenizer !== undefined) {
        return tokenizer;
    }
    // Fallback to approximate tokenizer
    return new ApproximateTokenizer();
}
class TTokenizer {
    constructor(_tokenizer) {
        this._tokenizer = _tokenizer;
    }
    static async create(encoder) {
        try {
            const tokenizer = (0, tiktokenizer_1.createTokenizer)((0, parseTikTokens_1.parseTikTokenBinary)((0, fileLoader_1.locateFile)(`${encoder}.tiktoken`)), (0, tiktokenizer_1.getSpecialTokensByEncoder)(encoder), (0, tiktokenizer_1.getRegexByEncoder)(encoder), 32768);
            return new TTokenizer(tokenizer);
        }
        catch (e) {
            if (e instanceof Error) {
                throw new error_1.CopilotPromptLoadFailure(`Could not load tokenizer`, e);
            }
            throw e;
        }
    }
    tokenize(text) {
        return this._tokenizer.encode(text);
    }
    detokenize(tokens) {
        return this._tokenizer.decode(tokens);
    }
    tokenLength(text) {
        return this.tokenize(text).length;
    }
    tokenizeStrings(text) {
        const tokens = this.tokenize(text);
        return tokens.map(token => this.detokenize([token]));
    }
    takeLastTokens(text, n) {
        if (n <= 0) {
            return { text: '', tokens: [] };
        }
        // Find long enough suffix of text that has >= n + 2 tokens
        // We add the 2 extra tokens to avoid the edge case where
        // we cut at exactly n tokens and may get an odd tokenization.
        const CHARS_PER_TOKENS_START = 4;
        const CHARS_PER_TOKENS_ADD = 1;
        let chars = Math.min(text.length, n * CHARS_PER_TOKENS_START); //First guess
        let suffix = text.slice(-chars);
        let suffixT = this.tokenize(suffix);
        while (suffixT.length < n + 2 && chars < text.length) {
            chars = Math.min(text.length, chars + n * CHARS_PER_TOKENS_ADD);
            suffix = text.slice(-chars);
            suffixT = this.tokenize(suffix);
        }
        if (suffixT.length < n) {
            // text must be <= n tokens long
            return { text, tokens: suffixT };
        }
        // Return last n tokens
        suffixT = suffixT.slice(-n);
        return { text: this.detokenize(suffixT), tokens: suffixT };
    }
    takeFirstTokens(text, n) {
        if (n <= 0) {
            return { text: '', tokens: [] };
        }
        // Find long enough suffix of text that has >= n + 2 tokens
        // We add the 2 extra tokens to avoid the edge case where
        // we cut at exactly n tokens and may get an odd tokenization.
        const CHARS_PER_TOKENS_START = 4;
        const CHARS_PER_TOKENS_ADD = 1;
        let chars = Math.min(text.length, n * CHARS_PER_TOKENS_START); //First guess
        let prefix = text.slice(0, chars);
        let prefix_t = this.tokenize(prefix);
        while (prefix_t.length < n + 2 && chars < text.length) {
            chars = Math.min(text.length, chars + n * CHARS_PER_TOKENS_ADD);
            prefix = text.slice(0, chars);
            prefix_t = this.tokenize(prefix);
        }
        if (prefix_t.length < n) {
            // text must be <= n tokens long
            return {
                text: text,
                tokens: prefix_t,
            };
        }
        // Return first n tokens
        // This implicit "truncate final tokens" text processing algorithm
        // could be extracted into a generic snippet text processing function managed by the SnippetTextProcessor class.
        prefix_t = prefix_t.slice(0, n);
        return {
            text: this.detokenize(prefix_t),
            tokens: prefix_t,
        };
    }
    takeLastLinesTokens(text, n) {
        const { text: suffix } = this.takeLastTokens(text, n);
        if (suffix.length === text.length || text[text.length - suffix.length - 1] === '\n') {
            // Edge case: We already took whole lines
            return suffix;
        }
        const newline = suffix.indexOf('\n');
        return suffix.substring(newline + 1);
    }
}
exports.TTokenizer = TTokenizer;
class MockTokenizer {
    constructor() {
        this.hash = (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = (hash << 5) - hash + char;
                hash &= hash & 0xffff;
            }
            return hash;
        };
    }
    tokenize(text) {
        return this.tokenizeStrings(text).map(this.hash);
    }
    detokenize(tokens) {
        // Note because this is using hashing to mock tokenization, it is not
        // reversible, so detokenize will not return the original input.
        return tokens.map(token => token.toString()).join(' ');
    }
    tokenizeStrings(text) {
        return text.split(/\b/);
    }
    tokenLength(text) {
        return this.tokenizeStrings(text).length;
    }
    takeLastTokens(text, n) {
        const tokens = this.tokenizeStrings(text).slice(-n);
        return { text: tokens.join(''), tokens: tokens.map(this.hash) };
    }
    takeFirstTokens(text, n) {
        const tokens = this.tokenizeStrings(text).slice(0, n);
        return { text: tokens.join(''), tokens: tokens.map(this.hash) };
    }
    takeLastLinesTokens(text, n) {
        const { text: suffix } = this.takeLastTokens(text, n);
        if (suffix.length === text.length || text[text.length - suffix.length - 1] === '\n') {
            // Edge case: We already took whole lines
            return suffix;
        }
        const newline = suffix.indexOf('\n');
        return suffix.substring(newline + 1);
    }
}
// These are the effective token lengths for each language. They are based on empirical data to balance the risk of accidental overflow and overeager elision.
// Note: These may need to be recalculated in the future if typical prompt lengths are significantly changed.
const EFFECTIVE_TOKEN_LENGTH = {
    [TokenizerName.cl100k]: {
        python: 3.99,
        typescript: 4.54,
        typescriptreact: 4.58,
        javascript: 4.76,
        csharp: 5.13,
        java: 4.86,
        cpp: 3.85,
        php: 4.1,
        html: 4.57,
        vue: 4.22,
        go: 3.93,
        dart: 5.66,
        javascriptreact: 4.81,
        css: 3.37,
    },
    [TokenizerName.o200k]: {
        python: 4.05,
        typescript: 4.12,
        typescriptreact: 5.01,
        javascript: 4.47,
        csharp: 5.47,
        java: 4.86,
        cpp: 3.8,
        php: 4.35,
        html: 4.86,
        vue: 4.3,
        go: 4.21,
        dart: 5.7,
        javascriptreact: 4.83,
        css: 3.33,
    },
};
/** Max decimals per code point for ApproximateTokenizer mock tokenization. */
const MAX_CODE_POINT_SIZE = 4;
/** A best effort tokenizer computing the length of the text by dividing the
 * number of characters by estimated constants near the number 4.
 * It is not a real tokenizer. */
class ApproximateTokenizer {
    constructor(tokenizerName = TokenizerName.o200k, languageId) {
        this.languageId = languageId;
        this.tokenizerName = tokenizerName;
    }
    tokenize(text) {
        return this.tokenizeStrings(text).map(substring => {
            let charCode = 0;
            for (let i = 0; i < substring.length; i++) {
                charCode = charCode * Math.pow(10, MAX_CODE_POINT_SIZE) + substring.charCodeAt(i);
            }
            return charCode;
        });
    }
    detokenize(tokens) {
        return tokens
            .map(token => {
            const chars = [];
            let charCodes = token.toString();
            while (charCodes.length > 0) {
                const charCode = charCodes.slice(-MAX_CODE_POINT_SIZE);
                const char = String.fromCharCode(parseInt(charCode));
                chars.unshift(char);
                charCodes = charCodes.slice(0, -MAX_CODE_POINT_SIZE);
            }
            return chars.join('');
        })
            .join('');
    }
    tokenizeStrings(text) {
        // Mock tokenize by defaultETL
        return text.match(/.{1,4}/g) ?? [];
    }
    getEffectiveTokenLength() {
        // Our default is 4, used for tail languages and error handling
        const defaultETL = 4;
        if (this.tokenizerName && this.languageId) {
            // Use our calculated effective token length for head languages
            return EFFECTIVE_TOKEN_LENGTH[this.tokenizerName]?.[this.languageId] ?? defaultETL;
        }
        return defaultETL;
    }
    tokenLength(text) {
        return Math.ceil(text.length / this.getEffectiveTokenLength());
    }
    takeLastTokens(text, n) {
        if (n <= 0) {
            return { text: '', tokens: [] };
        }
        // Return the last characters approximately. It doesn't matter what we return as token, just that it has the correct length.
        const suffix = text.slice(-Math.floor(n * this.getEffectiveTokenLength()));
        return { text: suffix, tokens: Array.from({ length: this.tokenLength(suffix) }, (_, i) => i) };
    }
    takeFirstTokens(text, n) {
        if (n <= 0) {
            return { text: '', tokens: [] };
        }
        // Return the first characters approximately.
        const prefix = text.slice(0, Math.floor(n * this.getEffectiveTokenLength()));
        return { text: prefix, tokens: Array.from({ length: this.tokenLength(prefix) }, (_, i) => i) };
    }
    takeLastLinesTokens(text, n) {
        const { text: suffix } = this.takeLastTokens(text, n);
        if (suffix.length === text.length || text[text.length - suffix.length - 1] === '\n') {
            // Edge case: We already took whole lines
            return suffix;
        }
        const newline = suffix.indexOf('\n');
        return suffix.substring(newline + 1);
    }
}
exports.ApproximateTokenizer = ApproximateTokenizer;
async function setTokenizer(name) {
    try {
        const tokenizer = await TTokenizer.create(name);
        tokenizers.set(name, tokenizer);
    }
    catch {
        // Ignore errors loading tokenizer
    }
}
/** Load tokenizers on start. Export promise for to be awaited by initialization. */
exports.initializeTokenizers = (async () => {
    tokenizers.set(TokenizerName.mock, new MockTokenizer());
    await Promise.all([setTokenizer(TokenizerName.cl100k), setTokenizer(TokenizerName.o200k)]);
})();
//# sourceMappingURL=tokenizer.js.map
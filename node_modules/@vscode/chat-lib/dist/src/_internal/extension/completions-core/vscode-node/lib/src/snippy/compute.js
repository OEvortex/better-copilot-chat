"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinTokenLength = void 0;
exports.lexemeLength = lexemeLength;
exports.offsetLastLexemes = offsetLastLexemes;
exports.hasMinLexemeLength = hasMinLexemeLength;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// This should be kept in sync with snippy at /pkg/fingerprint/compute.go#L20
const SnippyLexemeRegex = new RegExp('[_\\p{L}\\p{Nd}]+|====+|----+|####+|////+|\\*\\*\\*\\*+|[\\p{P}\\p{S}]', 'gu');
// This should be kept in sync with snippy at /pkg/fingerprint/settings.go#L108
exports.MinTokenLength = 65;
function lexemeLength(text) {
    let i = 0;
    let m;
    SnippyLexemeRegex.lastIndex = 0;
    do {
        m = SnippyLexemeRegex.exec(text);
        if (m) {
            i += 1;
        }
        if (i >= exports.MinTokenLength) {
            break;
        }
    } while (m);
    return i;
}
/** Return the offset after the first `n` lexemes of `text`, counted in Snippy lexemes */
function offsetFirstLexemes(text, n) {
    let i = 0;
    let m;
    SnippyLexemeRegex.lastIndex = 0;
    do {
        m = SnippyLexemeRegex.exec(text);
        if (m) {
            i += 1;
            if (i >= n) {
                return SnippyLexemeRegex.lastIndex;
            }
        }
    } while (m);
    // The whole text is less than n tokens
    return text.length;
}
/** Return the offset at the beginning of the last `n` lexemes of `text`, counted in Snippy lexemes */
function offsetLastLexemes(text, n) {
    const textRev = text.split('').reverse().join('');
    const offsetRev = offsetFirstLexemes(textRev, n);
    return textRev.length - offsetRev;
}
function hasMinLexemeLength(text) {
    return lexemeLength(text) >= exports.MinTokenLength;
}
//# sourceMappingURL=compute.js.map
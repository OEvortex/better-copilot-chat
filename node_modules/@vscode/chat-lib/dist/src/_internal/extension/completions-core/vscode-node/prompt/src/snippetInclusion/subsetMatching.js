"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockTokenSubsetMatcher = void 0;
const parse_1 = require("../parse");
const cursorContext_1 = require("./cursorContext");
const selectRelevance_1 = require("./selectRelevance");
const windowDelineations_1 = require("./windowDelineations");
/**
 * Implements an evolution of the FixedWindowSizeJaccardMatcher that is different in two ways.
 * 1. The source tokens window is the enclosing class member, as determined by Tree-Sitter.
 * 2. The scoring algorithm is a unidirectional set membership check (count of items from A that exist in B)
 *    rather than a set difference.
 */
class BlockTokenSubsetMatcher extends selectRelevance_1.WindowedMatcher {
    constructor(referenceDoc, windowLength) {
        super(referenceDoc);
        this.windowLength = windowLength;
    }
    static { this.FACTORY = (windowLength) => {
        return {
            to: (referenceDoc) => new BlockTokenSubsetMatcher(referenceDoc, windowLength),
        };
    }; }
    id() {
        return 'fixed:' + this.windowLength;
    }
    getWindowsDelineations(lines) {
        return (0, windowDelineations_1.getBasicWindowDelineations)(this.windowLength, lines);
    }
    _getCursorContextInfo(referenceDoc) {
        return (0, cursorContext_1.getCursorContext)(referenceDoc, {
            maxLineCount: this.windowLength,
        });
    }
    get referenceTokens() {
        return this.createReferenceTokensForLanguage();
    }
    async createReferenceTokensForLanguage() {
        if (this.referenceTokensCache) {
            return this.referenceTokensCache;
        }
        // Syntax aware reference tokens uses tree-sitter based parsing to identify the bounds of the current
        // method and extracts tokens from just that span for use as the reference set.
        this.referenceTokensCache = BlockTokenSubsetMatcher.syntaxAwareSupportsLanguage(this.referenceDoc.languageId)
            ? await this.syntaxAwareReferenceTokens()
            : await super.referenceTokens;
        return this.referenceTokensCache;
    }
    async syntaxAwareReferenceTokens() {
        // See if there is an enclosing class or type member.
        const start = (await this.getEnclosingMemberStart(this.referenceDoc.source, this.referenceDoc.offset))
            ?.startIndex;
        const end = this.referenceDoc.offset;
        // If not, fallback to the 60-line chunk behavior.
        const text = start
            ? this.referenceDoc.source.slice(start, end)
            : (0, cursorContext_1.getCursorContext)(this.referenceDoc, {
                maxLineCount: this.windowLength,
            }).context;
        // Extract the tokens.
        return this.tokenizer.tokenize(text);
    }
    static syntaxAwareSupportsLanguage(languageId) {
        switch (languageId) {
            case 'csharp':
                return true;
            default:
                return false;
        }
    }
    similarityScore(a, b) {
        return computeScore(a, b);
    }
    async getEnclosingMemberStart(text, offset) {
        let tree;
        try {
            tree = await (0, parse_1.parseTreeSitter)(this.referenceDoc.languageId, text);
            let nodeAtPos = tree.rootNode.namedDescendantForIndex(offset);
            while (nodeAtPos) {
                // For now, hard code for C#.
                if (BlockTokenSubsetMatcher.isMember(nodeAtPos) || BlockTokenSubsetMatcher.isBlock(nodeAtPos)) {
                    break;
                }
                nodeAtPos = nodeAtPos.parent ?? undefined;
            }
            return nodeAtPos;
        }
        finally {
            tree?.delete();
        }
    }
    static isMember(node) {
        // For now, hard code for C#.
        switch (node?.type) {
            case 'method_declaration':
            case 'property_declaration':
            case 'field_declaration':
            case 'constructor_declaration':
                return true;
            default:
                return false;
        }
    }
    static isBlock(node) {
        // For now, hard code for C#.
        switch (node?.type) {
            case 'class_declaration':
            case 'struct_declaration':
            case 'record_declaration':
            case 'enum_declaration':
            case 'interface_declaration':
                return true;
            default:
                return false;
        }
    }
}
exports.BlockTokenSubsetMatcher = BlockTokenSubsetMatcher;
/**
 * Count the number of unique tokens from B that are also in A.
 */
function computeScore(a, b) {
    const subsetOverlap = new Set();
    b.forEach(x => {
        if (a.has(x)) {
            subsetOverlap.add(x);
        }
    });
    return subsetOverlap.size;
}
//# sourceMappingURL=subsetMatching.js.map
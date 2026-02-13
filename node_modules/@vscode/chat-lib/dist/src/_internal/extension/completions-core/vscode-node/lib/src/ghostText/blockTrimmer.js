"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockPositionType = exports.TerseBlockTrimmer = exports.VerboseBlockTrimmer = exports.BlockTrimmer = void 0;
exports.getBlockPositionType = getBlockPositionType;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const statementTree_1 = require("./statementTree");
/**
 * BlockTrimmer base class.
 */
class BlockTrimmer {
    static isSupported(languageId) {
        return statementTree_1.StatementTree.isSupported(languageId);
    }
    /** Tests for the subset of supported languages that are trimmed by default */
    static isTrimmedByDefault(languageId) {
        return statementTree_1.StatementTree.isTrimmedByDefault(languageId);
    }
    constructor(languageId, prefix, completion) {
        this.languageId = languageId;
        this.prefix = prefix;
        this.completion = completion;
    }
    async withParsedStatementTree(fn) {
        const tree = statementTree_1.StatementTree.create(this.languageId, this.prefix + this.completion, this.prefix.length, this.prefix.length + this.completion.length);
        await tree.build();
        try {
            return await fn(tree);
        }
        finally {
            tree[Symbol.dispose]();
        }
    }
    trimmedCompletion(offset) {
        return offset === undefined ? this.completion : this.completion.substring(0, offset);
    }
    /**
     * Gets the statement at the cursor position.
     * If the cursor is not within a statement (e.g. it's on an error node),
     * returns the first statement from the tree (if any).
     */
    getStatementAtCursor(tree) {
        return tree.statementAt(Math.max(this.prefix.length - 1, 0)) ?? tree.statements[0];
    }
    getContainingBlockOffset(stmt) {
        let trimTo;
        if (stmt && this.isCompoundStatement(stmt)) {
            // for compound statement types, trim to the current statement
            trimTo = stmt;
        }
        else if (stmt) {
            // for non-compound statement types, trim to the closest compound ancestor
            let parent = stmt.parent;
            while (parent && !this.isCompoundStatement(parent)) {
                parent = parent.parent;
            }
            trimTo = parent;
        }
        if (trimTo) {
            const newOffset = this.asCompletionOffset(trimTo.node.endIndex);
            // don't trim trailing whitespace as that will terminate the completion prematurely
            if (newOffset && this.completion.substring(newOffset).trim() !== '') {
                return newOffset;
            }
        }
        return undefined;
    }
    hasNonStatementContentAfter(stmt) {
        if (!stmt || !stmt.nextSibling) {
            return false;
        }
        const spanStart = this.asCompletionOffset(stmt.node.endIndex);
        const spanEnd = this.asCompletionOffset(stmt.nextSibling.node.startIndex);
        const content = this.completion.substring(Math.max(0, spanStart ?? 0), Math.max(0, spanEnd ?? 0));
        return content.trim() !== '';
    }
    asCompletionOffset(offset) {
        return offset === undefined ? undefined : offset - this.prefix.length;
    }
    isCompoundStatement(stmt) {
        return stmt.isCompoundStatementType || stmt.children.length > 0;
    }
}
exports.BlockTrimmer = BlockTrimmer;
/**
 * A block trimmer that tries to obtain the longest reasonable completion
 * within its line limit. This results in a more verbose completion.
 *
 * Don't delete it is used in tests.
 */
class VerboseBlockTrimmer extends BlockTrimmer {
    constructor(languageId, prefix, completion, lineLimit = 10) {
        super(languageId, prefix, completion);
        this.lineLimit = lineLimit;
        // determine the end of the lineLimit line as an offset into the completion
        const completionLineEnds = [...this.completion.matchAll(/\n/g)];
        if (completionLineEnds.length >= this.lineLimit && this.lineLimit > 0) {
            this.offsetLimit = completionLineEnds[this.lineLimit - 1].index;
        }
        else {
            this.offsetLimit = undefined;
        }
    }
    async getCompletionTrimOffset() {
        return await this.withParsedStatementTree(tree => {
            const stmt = this.getStatementAtCursor(tree);
            // do not go past the containing block
            let offset = this.getContainingBlockOffset(stmt);
            // first try trimming at a blank line
            if (!this.isWithinLimit(offset)) {
                offset = this.trimToBlankLine(offset);
            }
            // then try trimming at a statement
            if (!this.isWithinLimit(offset)) {
                offset = this.trimToStatement(stmt, offset);
            }
            return offset;
        });
    }
    isWithinLimit(offset) {
        return this.offsetLimit === undefined || (offset !== undefined && offset <= this.offsetLimit);
    }
    trimToBlankLine(offset) {
        const blankLines = [...this.trimmedCompletion(offset).matchAll(/\r?\n\s*\r?\n/g)].reverse();
        while (blankLines.length > 0 && !this.isWithinLimit(offset)) {
            const match = blankLines.pop();
            offset = match.index;
        }
        return offset;
    }
    trimToStatement(stmt, offset) {
        const min = this.prefix.length;
        const max = this.prefix.length + (this.offsetLimit ?? this.completion.length);
        let s = stmt;
        let next = stmt?.nextSibling;
        while (next && next.node.endIndex <= max && !this.hasNonStatementContentAfter(s)) {
            s = next;
            next = next.nextSibling;
        }
        if (s && s === stmt && s.node.endIndex <= min) {
            s = next;
        }
        if (s && s.node.endIndex > max) {
            // break at an internal statement if possible
            return this.trimToStatement(s.children[0], this.asCompletionOffset(s.node.endIndex));
        }
        return this.asCompletionOffset(s?.node?.endIndex) ?? offset;
    }
}
exports.VerboseBlockTrimmer = VerboseBlockTrimmer;
/**
 * A block trimmer that stops when it's likely the end of a logical section has
 * been reached, such as the start of a new compound statement. This results in
 * a more terse completion.
 */
class TerseBlockTrimmer extends BlockTrimmer {
    constructor(languageId, prefix, completion, lineLimit = 3, lookAhead = 7) {
        super(languageId, prefix, completion);
        this.lineLimit = lineLimit;
        this.lookAhead = lookAhead;
        // determine the end of the lineLimit line as an offset into the completion
        const completionLineEnds = [...this.completion.matchAll(/\n/g)];
        const limitAndLookAhead = this.lineLimit + this.lookAhead;
        if (completionLineEnds.length >= this.lineLimit && this.lineLimit > 0) {
            this.limitOffset = completionLineEnds[this.lineLimit - 1].index;
        }
        if (completionLineEnds.length >= limitAndLookAhead && limitAndLookAhead > 0) {
            this.lookAheadOffset = completionLineEnds[limitAndLookAhead - 1].index;
        }
    }
    async getCompletionTrimOffset() {
        return await this.withParsedStatementTree(tree => {
            const stmt = tree.statementAt(this.stmtStartPos());
            // do not go past the containing block
            let offset = this.getContainingBlockOffset(stmt);
            // trim at any blank lines
            offset = this.trimAtFirstBlankLine(offset);
            // trim at new blocks starts or areas of comments
            if (stmt) {
                offset = this.trimAtStatementChange(stmt, offset);
            }
            // hard trim at the line limit if we have enough context
            if (this.limitOffset && this.lookAheadOffset && (offset === undefined || offset > this.lookAheadOffset)) {
                return this.limitOffset;
            }
            return offset;
        });
    }
    /**
     * Return the position of the first non-whitespace character to the right
     * of the cursor, or the start of the completion if it is blank.
     */
    stmtStartPos() {
        const match = this.completion.match(/\S/);
        if (match && match.index !== undefined) {
            return this.prefix.length + match.index;
        }
        return Math.max(this.prefix.length - 1, 0);
    }
    trimAtFirstBlankLine(offset) {
        const blankLines = [...this.trimmedCompletion(offset).matchAll(/\r?\n\s*\r?\n/g)];
        while (blankLines.length > 0 && (offset === undefined || offset > blankLines[0].index)) {
            const match = blankLines.shift();
            if (this.completion.substring(0, match.index).trim() !== '') {
                return match.index;
            }
        }
        return offset;
    }
    trimAtStatementChange(stmt, offset) {
        const min = this.prefix.length;
        const max = this.prefix.length + (offset ?? this.completion.length);
        // if the first statement is a compound statement, trim to the first statement
        if (stmt.node.endIndex > min && this.isCompoundStatement(stmt)) {
            // if we have a next sibling, the statement is likely finished
            if (stmt.nextSibling && stmt.node.endIndex < max) {
                return this.asCompletionOffset(stmt.node.endIndex);
            }
            return offset;
        }
        // otherwise, stop at the first compound statement or non-statement content
        let s = stmt;
        let next = stmt.nextSibling;
        while (next &&
            next.node.endIndex <= max &&
            !this.hasNonStatementContentAfter(s) &&
            !this.isCompoundStatement(next)) {
            s = next;
            next = next.nextSibling;
        }
        if (next && s.node.endIndex > min && s.node.endIndex < max) {
            return this.asCompletionOffset(s.node.endIndex);
        }
        return offset;
    }
}
exports.TerseBlockTrimmer = TerseBlockTrimmer;
var BlockPositionType;
(function (BlockPositionType) {
    BlockPositionType["NonBlock"] = "non-block";
    BlockPositionType["EmptyBlock"] = "empty-block";
    BlockPositionType["BlockEnd"] = "block-end";
    BlockPositionType["MidBlock"] = "mid-block";
})(BlockPositionType || (exports.BlockPositionType = BlockPositionType = {}));
async function getBlockPositionType(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const tree = statementTree_1.StatementTree.create(document.detectedLanguageId, text, 0, text.length);
    try {
        await tree.build();
        const stmt = tree.statementAt(offset);
        if (!stmt) {
            return BlockPositionType.NonBlock;
        }
        if (!stmt.isCompoundStatementType && stmt.children.length === 0) {
            if (stmt.parent && !stmt.nextSibling && stmt.node.endPosition.row <= position.line) {
                return BlockPositionType.BlockEnd;
            }
            else if (stmt.parent) {
                return BlockPositionType.MidBlock;
            }
            return BlockPositionType.NonBlock;
        }
        if (stmt.children.length === 0) {
            return BlockPositionType.EmptyBlock;
        }
        const lastChild = stmt.children[stmt.children.length - 1];
        if (offset < lastChild.node.startIndex) {
            return BlockPositionType.MidBlock;
        }
        return BlockPositionType.BlockEnd;
    }
    finally {
        tree[Symbol.dispose]();
    }
}
//# sourceMappingURL=blockTrimmer.js.map
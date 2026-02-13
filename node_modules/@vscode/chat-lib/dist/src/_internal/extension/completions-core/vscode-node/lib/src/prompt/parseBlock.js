"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsingBlockFinished = parsingBlockFinished;
exports.isEmptyBlockStartUtil = isEmptyBlockStartUtil;
exports.getNodeStartUtil = getNodeStartUtil;
exports.contextIndentation = contextIndentation;
exports.contextIndentationFromText = contextIndentationFromText;
exports.indentationBlockFinished = indentationBlockFinished;
const parseBlock_1 = require("../../../prompt/src/parseBlock");
const textDocument_1 = require("../textDocument");
function parsingBlockFinished(doc, position) {
    const prefix = doc.getText(textDocument_1.LocationFactory.range(textDocument_1.LocationFactory.position(0, 0), position));
    const offset = doc.offsetAt(position);
    const languageId = doc.detectedLanguageId;
    return completion => (0, parseBlock_1.isBlockBodyFinished)(languageId, prefix, completion, offset);
}
function isEmptyBlockStartUtil(doc, position) {
    return (0, parseBlock_1.isEmptyBlockStart)(doc.detectedLanguageId, doc.getText(), doc.offsetAt(position));
}
async function getNodeStartUtil(doc, position, completion) {
    const prefix = doc.getText(textDocument_1.LocationFactory.range(textDocument_1.LocationFactory.position(0, 0), position));
    const text = prefix + completion;
    const offset = await (0, parseBlock_1.getNodeStart)(doc.detectedLanguageId, text, doc.offsetAt(position));
    if (offset) {
        return doc.positionAt(offset);
    }
}
// TODO: This should probably be language specific
const continuations = [
    // Brace control
    '\\{',
    '\\}',
    '\\[',
    '\\]',
    '\\(',
    '\\)',
].concat([
    // Separators in a multi-line list
    // ",", ";", "\\|",
    // Multi-line comments
    // None
    // Keywords for same-level control flow
    'then',
    'else',
    'elseif',
    'elif',
    'catch',
    'finally',
    // End keywords
    'fi',
    'done',
    'end',
    'loop',
    'until',
    'where',
    'when',
].map(s => s + '\\b'));
const continuationRegex = new RegExp(`^(${continuations.join('|')})`);
/**
 * Returns true if the given line is a line where we continue completion where
 * the indentation level equals the current indentation level.
 *
 * TODO: Should probably be language specific
 */
function isContinuationLine(line) {
    return continuationRegex.test(line.trimLeft().toLowerCase());
}
/**
 * Return the indentation level of a given single line.
 *
 * If the line is blank, return undefined.
 *
 * TODO: Possibly support tabs specially?
 */
function indentationOfLine(line) {
    // [^] is used to match any character include '`r', otherwise this regex never matches on
    // a file containing Windows newlines.
    // TODO this is a bit of hack and ideally we would be using the "right" newline character at the
    // point where we split/join lines.
    const match = /^(\s*)([^]*)$/.exec(line);
    if (match && match[2] && match[2].length > 0) {
        return match[1].length;
    }
    else {
        return undefined;
    }
}
/**
 * Return the context indentation corresponding to a given position.
 */
function contextIndentation(doc, position) {
    const source = doc.getText();
    const offset = doc.offsetAt(position);
    return contextIndentationFromText(source, offset, doc.detectedLanguageId);
}
/**
 * Return the context indentation corresponding to a given offset in text.
 */
function contextIndentationFromText(source, offset, languageId) {
    const prevLines = source.slice(0, offset).split('\n');
    const nextLines = source.slice(offset).split('\n');
    function seekNonBlank(lines, start, direction) {
        let i = start;
        let ind, indIdx = undefined;
        while (ind === undefined && i >= 0 && i < lines.length) {
            ind = indentationOfLine(lines[i]);
            indIdx = i;
            i += direction;
        }
        if (languageId === 'python' && direction === -1) {
            // HACK: special case to support multi-statement completions after Python doc comments.
            // The logic looks for comments formatted as described in PEP 257.
            // The final iteration of the indentation loop will have got us to one before the "current line".
            i++;
            const trimmedLine = lines[i].trim();
            if (trimmedLine.endsWith(`"""`)) {
                const isSingleLineDocString = trimmedLine.startsWith(`"""`) && trimmedLine !== `"""`;
                if (!isSingleLineDocString) {
                    // Look backwards for the opening """"
                    i--;
                    while (i >= 0 && !lines[i].trim().startsWith(`"""`)) {
                        i--;
                    }
                }
                // i should point to the line with the opening """, if found.
                // If i is negative then we never found the opening """". Give up and use the indentation
                // we originally calculated.
                if (i >= 0) {
                    ind = undefined;
                    i--;
                    // This is the same loop as above but specialised for direction = -1
                    while (ind === undefined && i >= 0) {
                        ind = indentationOfLine(lines[i]);
                        indIdx = i;
                        i--;
                    }
                }
            }
        }
        return [ind, indIdx];
    }
    const [current, currentIdx] = seekNonBlank(prevLines, prevLines.length - 1, -1);
    const prev = (() => {
        if (current === undefined || currentIdx === undefined) {
            return undefined;
        }
        for (let i = currentIdx - 1; i >= 0; i--) {
            const ind = indentationOfLine(prevLines[i]);
            if (ind !== undefined && ind < current) {
                return ind;
            }
        }
    })();
    const [next] = seekNonBlank(nextLines, 1, 1); // Skip the current line.
    return {
        prev,
        current: current ?? 0,
        next,
    };
}
// If the model thinks we are at the end of a line, do we want to offer a completion
// for the next line? For now (05 Oct 2021) we leave it as false to minimise behaviour
// changes between parsing and indentation mode.
const OfferNextLineCompletion = false;
/**
 * Return an offset where the completion ends its current context, or
 * "continue" if it has not yet ended.
 *
 * A completion should be continued if it is:
 *  - A very long line that did not yet end; or
 *  - A multi-line context that is not yet ended.
 *
 * We use indentation with continuation patterns to determine whether a context
 * is ended.
 */
function completionCutOrContinue(completion, contextIndentation, previewText) {
    const completionLines = completion.split('\n');
    const isContinuation = previewText !== undefined;
    const lastLineOfPreview = previewText?.split('\n').pop();
    let startLine = 0;
    if (isContinuation) {
        if (lastLineOfPreview?.trim() !== '' && completionLines[0].trim() !== '') {
            // If we're in the middle of a line after the preview, we should at least finish it.
            startLine++;
        }
    }
    if (!isContinuation && OfferNextLineCompletion && completionLines[0].trim() === '') {
        // See the comment on `OfferNextLineCompletion` for why we might do this.
        startLine++;
    }
    if (!isContinuation) {
        // We want to offer at least one line.
        startLine++;
    }
    if (completionLines.length === startLine) {
        // A single line that did not yet end.
        return 'continue';
    }
    const breakIndentation = Math.max(contextIndentation.current, contextIndentation.next ?? 0);
    for (let i = startLine; i < completionLines.length; i++) {
        let line = completionLines[i];
        if (i === 0 && lastLineOfPreview !== undefined) {
            line = lastLineOfPreview + line;
        }
        const ind = indentationOfLine(line);
        if (ind !== undefined && (ind < breakIndentation || (ind === breakIndentation && !isContinuationLine(line)))) {
            return completionLines.slice(0, i).join('\n').length;
        }
    }
    return 'continue';
}
/**
 * Returns a callback appropriate as `finishedCb` for
 * `CompletionStream.streamChoices` that terminates a block according to
 * indentation-logic.
 */
function indentationBlockFinished(contextIndentation, previewText) {
    // NOTE: The returned callback is only async because streamChoices needs an
    // async callback
    return (completion) => {
        const res = completionCutOrContinue(completion, contextIndentation, previewText);
        // streamChoices needs a callback with bad type signature where
        // undefined really means "continue".
        return res === 'continue' ? undefined : res;
    };
}
//# sourceMappingURL=parseBlock.js.map
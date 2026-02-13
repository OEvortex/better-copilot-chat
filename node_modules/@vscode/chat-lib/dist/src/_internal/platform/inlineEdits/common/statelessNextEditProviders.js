"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.IgnoreWhitespaceOnlyChanges = exports.IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges = void 0;
exports.editWouldDeleteWhatWasJustInserted = editWouldDeleteWhatWasJustInserted;
exports.editIsDeletion = editIsDeletion;
exports.editWouldDeleteWhatWasJustInserted2 = editWouldDeleteWhatWasJustInserted2;
class IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges {
    static filterEdit(resultDocument, singleEdits) {
        const filteredEdits = singleEdits.filter(e => !IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges._isWhitespaceOnlyChange(e, resultDocument.documentAfterEditsLines));
        return filteredEdits;
    }
    static _isWhitespaceOnlyChange(edit, baseLines) {
        const originalLines = edit.lineRange.toOffsetRange().slice(baseLines);
        const newLines = edit.newLines;
        const isRemoval = newLines.length === 0;
        // is removing empty lines
        if (isRemoval && originalLines.every(line => line.trim() === '')) {
            return true;
        }
        // is adding empty lines
        if (!isRemoval && newLines.every(line => line.trim() === '')) {
            return true;
        }
        if (originalLines.length !== newLines.length) {
            return false;
        }
        for (let i = 0; i < originalLines.length; i++) {
            const originalLine = originalLines[i];
            const newLine = newLines[i];
            if (originalLine.trim() !== newLine.trim()) {
                return false;
            }
        }
        return true;
    }
}
exports.IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges = IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges;
class IgnoreWhitespaceOnlyChanges {
    static filterEdit(resultDocument, singleEdits) {
        return singleEdits.filter(e => !IgnoreWhitespaceOnlyChanges._isFormattingOnlyChange(resultDocument.documentAfterEditsLines, e));
    }
    /**
     * @remarks public only for testing
     */
    static _isFormattingOnlyChange(baseLines, singleEdit) {
        const originalLines = singleEdit.lineRange.toOffsetRange().slice(baseLines).join('').replace(/\s/g, '');
        const newLines = singleEdit.newLines.join('').replace(/\s/g, '');
        return originalLines === newLines;
    }
}
exports.IgnoreWhitespaceOnlyChanges = IgnoreWhitespaceOnlyChanges;
function editWouldDeleteWhatWasJustInserted(activeDocument, lineEdit) {
    let edit = lineEdit.toEdit(activeDocument.documentAfterEdits);
    // ! important: reduce it to the minimal set of changes
    edit = edit.normalizeOnSource(activeDocument.documentAfterEdits.value);
    if (!editIsDeletion(edit)) {
        return false;
    }
    // We are deleting something. Is it what was just inserted?
    for (let i = activeDocument.recentEdits.edits.length - 1; i >= 0; i--) {
        const recentEdit = activeDocument.recentEdits.edits[i];
        const rebaseResult = edit.tryRebase(recentEdit);
        if (!rebaseResult) {
            // the edit we want to do cannot be rebased, which indicates that it would interfere with a recent edit
            return true;
        }
        edit = rebaseResult;
    }
    return false;
}
function editIsDeletion(edit) {
    const deletedChars = edit.replacements.reduce((acc, singleEdit) => acc + singleEdit.replaceRange.length, 0);
    const insertedChars = edit.replacements.reduce((acc, singleEdit) => acc + singleEdit.newText.length, 0);
    return insertedChars === 0 && deletedChars > 0;
}
function editWouldDeleteWhatWasJustInserted2(activeDocument, lineEdit) {
    let edit = lineEdit.toEdit(activeDocument.documentAfterEdits);
    // ! important: reduce it to the minimal set of changes
    edit = edit.normalizeOnSource(activeDocument.documentAfterEdits.value);
    if (!editIsDeletion(edit)) {
        return false;
    }
    let documentContents = activeDocument.documentAfterEdits.value;
    for (let i = activeDocument.recentEdits.edits.length - 1; i >= 0; i--) {
        const recentEdit = activeDocument.recentEdits.edits[i];
        const recentEditInverse = recentEdit.inverse(documentContents);
        if (recentEditInverse.equals(edit)) {
            return true;
        }
        documentContents = recentEditInverse.apply(documentContents);
    }
    return false;
}
//# sourceMappingURL=statelessNextEditProviders.js.map
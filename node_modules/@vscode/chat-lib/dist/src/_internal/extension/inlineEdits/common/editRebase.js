"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.maxImperfectAgreementLength = exports.maxAgreementOffset = exports.EditDataWithIndex = void 0;
exports.tryRebase = tryRebase;
exports.checkEditConsistency = checkEditConsistency;
exports.tryRebaseStringEdits = tryRebaseStringEdits;
const edit_1 = require("../../../platform/inlineEdits/common/dataTypes/edit");
const errors = __importStar(require("../../../util/common/errors"));
const stringEdit_1 = require("../../../util/vs/editor/common/core/edits/stringEdit");
const offsetRange_1 = require("../../../util/vs/editor/common/core/ranges/offsetRange");
const abstractText_1 = require("../../../util/vs/editor/common/core/text/abstractText");
const defaultLinesDiffComputer_1 = require("../../../util/vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer");
const TROUBLESHOOT_EDIT_CONSISTENCY = false;
class EditDataWithIndex {
    constructor(index) {
        this.index = index;
    }
    join(data) {
        if (this.index !== data.index) {
            return undefined;
        }
        return this;
    }
}
exports.EditDataWithIndex = EditDataWithIndex;
function tryRebase(originalDocument, editWindow, originalEdits, detailedEdits, userEditSince, currentDocumentContent, currentSelection, resolution, tracer, nesConfigs = {}) {
    const start = Date.now();
    try {
        return _tryRebase(originalDocument, editWindow, originalEdits, detailedEdits, userEditSince, currentDocumentContent, currentSelection, resolution, tracer, nesConfigs);
    }
    catch (err) {
        tracer.trace(`Rebase error: ${errors.toString(err)}`);
        return 'error';
    }
    finally {
        tracer.trace(`Rebase duration: ${Date.now() - start}ms`);
    }
}
function _tryRebase(originalDocument, editWindow, originalEdits, detailedEdits, userEditSinceOrig, currentDocumentContent, currentSelection, resolution, tracer, nesConfigs) {
    if (!checkEditConsistency(originalDocument, userEditSinceOrig, currentDocumentContent, tracer, true)) {
        return 'inconsistentEdits';
    }
    const userEditSince = userEditSinceOrig.removeCommonSuffixAndPrefix(originalDocument);
    const cursorRange = currentSelection[0];
    if (editWindow && cursorRange) {
        const updatedEditWindow = userEditSince.applyToOffsetRangeOrUndefined(editWindow);
        if (!updatedEditWindow?.containsRange(cursorRange)) {
            return 'outsideEditWindow';
        }
    }
    if (detailedEdits.length < originalEdits.length) {
        let intermediateDocument = originalDocument;
        for (let index = 0; index < detailedEdits.length; index++) {
            const edit = originalEdits[index];
            intermediateDocument = stringEdit_1.StringEdit.single(edit).apply(intermediateDocument);
        }
        for (let index = detailedEdits.length; index < originalEdits.length; index++) {
            const edit = originalEdits[index];
            const editData = new EditDataWithIndex(index);
            detailedEdits[index] = computeDiff(edit.replaceRange.substring(intermediateDocument), edit.newText, edit.replaceRange.start, editData, {
                ignoreTrimWhitespace: false,
                computeMoves: false,
                extendToSubwords: true,
                maxComputationTimeMs: 500,
            }) || [new stringEdit_1.AnnotatedStringReplacement(edit.replaceRange, edit.newText, editData)];
            intermediateDocument = stringEdit_1.StringEdit.single(edit).apply(intermediateDocument);
        }
    }
    const diffedEdit = stringEdit_1.AnnotatedStringEdit.compose(detailedEdits.map(edits => stringEdit_1.AnnotatedStringEdit.create(edits)));
    const rebasedEdit = tryRebaseEdits(originalDocument, diffedEdit, userEditSince, resolution, nesConfigs);
    if (!rebasedEdit) {
        return 'rebaseFailed';
    }
    const grouped = rebasedEdit.replacements.reduce((acc, item) => {
        (acc[item.data.index] ||= []).push(item);
        return acc;
    }, []);
    const resultEdits = [];
    for (let index = 0; index < grouped.length; index++) {
        const group = grouped[index];
        if (!group) {
            continue;
        }
        const range = offsetRange_1.OffsetRange.fromTo(group[0].replaceRange.start, group[group.length - 1].replaceRange.endExclusive);
        const newText = group.map((edit, i, a) => {
            if (i > 0) {
                return currentDocumentContent.substring(a[i - 1].replaceRange.endExclusive, edit.replaceRange.start) + edit.newText;
            }
            else {
                return edit.newText;
            }
        }).join('');
        const resultEdit = stringEdit_1.StringReplacement.replace(range, newText);
        if (!resultEdit.removeCommonSuffixAndPrefix(currentDocumentContent).isEmpty) {
            resultEdits.push({ rebasedEdit: resultEdit, rebasedEditIndex: index });
        }
    }
    if (resolution === 'strict' && resultEdits.length > 0 && new edit_1.SingleEdits(originalEdits).apply(originalDocument) !== stringEdit_1.StringEdit.create(resultEdits.map(r => r.rebasedEdit)).apply(currentDocumentContent)) {
        tracer.trace('Result consistency check failed.');
        return 'inconsistentEdits';
    }
    return resultEdits;
}
function checkEditConsistency(original, edit, current, tracer, enabled = TROUBLESHOOT_EDIT_CONSISTENCY) {
    if (!enabled) {
        return true;
    }
    const consistent = edit.apply(original) === current;
    if (!consistent) {
        tracer.trace('Edit consistency check failed.');
    }
    return consistent;
}
function tryRebaseStringEdits(content, ours, base, resolution, nesConfigs = {}) {
    return tryRebaseEdits(content, ours.mapData(r => new stringEdit_1.VoidEditData()), base, resolution, nesConfigs)?.toStringEdit();
}
function tryRebaseEdits(content, ours, baseOrig, resolution, nesConfigs) {
    const base = baseOrig.removeCommonSuffixAndPrefix(content);
    const newEdits = [];
    let baseIdx = 0;
    let ourIdx = 0;
    let offset = 0;
    while (ourIdx < ours.replacements.length || baseIdx < base.replacements.length) {
        // take the edit that starts first
        const baseEdit = base.replacements[baseIdx];
        const ourEdit = ours.replacements[ourIdx];
        if (!ourEdit) {
            if (resolution === 'strict') {
                // baseEdit does not match but interleaves
                return undefined;
            }
            // We processed all our edits
            break;
        }
        else if (!baseEdit) {
            // no more edits from base
            newEdits.push(ourEdit.delta(offset));
            ourIdx++;
        }
        else {
            let ourE = ourEdit;
            if (!ourE.replaceRange.containsRange(baseEdit.replaceRange)) {
                // Try to shift our edit to include the base edit.
                if (ourE.replaceRange.start > baseEdit.replaceRange.start) {
                    // Expand our edit to the left to include the base edit.
                    const added = content.substring(baseEdit.replaceRange.start, ourE.replaceRange.start);
                    const updated = added + ourE.newText;
                    // Remove the same text from the right.
                    if (updated.endsWith(added)) {
                        ourE = new stringEdit_1.AnnotatedStringReplacement(offsetRange_1.OffsetRange.fromTo(baseEdit.replaceRange.start, ourE.replaceRange.endExclusive - added.length), updated.substring(0, updated.length - added.length), ourE.data);
                    }
                }
                // Skipping the case where there is another edit for now because we might have to merge with it first.
                else if (ourIdx === ours.replacements.length - 1 && ourE.replaceRange.endExclusive < baseEdit.replaceRange.endExclusive) {
                    // Expand our edit to the right to include the base edit.
                    const added = content.substring(ourE.replaceRange.endExclusive, baseEdit.replaceRange.endExclusive);
                    const updated = ourE.newText + added;
                    // Remove the same text from the left.
                    if (updated.startsWith(added)) {
                        ourE = new stringEdit_1.AnnotatedStringReplacement(offsetRange_1.OffsetRange.fromTo(ourE.replaceRange.start + added.length, baseEdit.replaceRange.endExclusive), updated.substring(added.length), ourE.data);
                    }
                }
            }
            if (ourE.replaceRange.intersectsOrTouches(baseEdit.replaceRange)) {
                if (ourE.replaceRange.containsRange(baseEdit.replaceRange) && ourE.newText.length >= baseEdit.newText.length) {
                    let delta = 0;
                    let ourNewTextOffset = 0;
                    let baseE = baseEdit;
                    let previousBaseE;
                    while (baseE && ourE.replaceRange.containsRange(baseE.replaceRange)) {
                        ourNewTextOffset = agreementIndexOf(content, ourE, baseE, previousBaseE, ourNewTextOffset, resolution, nesConfigs);
                        if (ourNewTextOffset === -1) {
                            // Conflicting
                            return undefined;
                        }
                        delta += baseE.newText.length - baseE.replaceRange.length;
                        previousBaseE = baseE;
                        baseE = base.replacements[++baseIdx];
                    }
                    newEdits.push(new stringEdit_1.AnnotatedStringReplacement(new offsetRange_1.OffsetRange(ourE.replaceRange.start + offset, ourE.replaceRange.endExclusive + offset + delta), ourE.newText, ourE.data));
                    ourIdx++;
                    offset += delta;
                }
                else {
                    // Conflicting
                    return undefined;
                }
            }
            else if (ourEdit.replaceRange.start < baseEdit.replaceRange.start) {
                // Our edit starts first
                newEdits.push(new stringEdit_1.AnnotatedStringReplacement(ourEdit.replaceRange.delta(offset), ourEdit.newText, ourEdit.data));
                ourIdx++;
            }
            else {
                if (resolution === 'strict') {
                    // baseEdit does not match but interleaves
                    return undefined;
                }
                baseIdx++;
                offset += baseEdit.newText.length - baseEdit.replaceRange.length;
            }
        }
    }
    return stringEdit_1.AnnotatedStringEdit.create(newEdits);
}
exports.maxAgreementOffset = 10; // If the user's typing is more than this into the suggestion we consider it a miss.
exports.maxImperfectAgreementLength = 5; // If the user's typing is longer than this and the suggestion is not a perfect match we consider it a miss.
function agreementIndexOf(content, ourE, baseE, previousBaseE, ourNewTextOffset, resolution, nesConfigs) {
    const minStart = previousBaseE ? previousBaseE.replaceRange.endExclusive : ourE.replaceRange.start;
    if (minStart < baseE.replaceRange.start) {
        baseE = new stringEdit_1.StringReplacement(offsetRange_1.OffsetRange.fromTo(minStart, baseE.replaceRange.endExclusive), content.substring(minStart, baseE.replaceRange.start) + baseE.newText);
    }
    const j = ourE.newText.indexOf(baseE.newText, ourNewTextOffset);
    if (resolution === 'strict' && j > exports.maxAgreementOffset) {
        return -1;
    }
    if (resolution === 'strict' && j > 0 && baseE.newText.length > exports.maxImperfectAgreementLength) {
        return -1;
    }
    return j !== -1 ? j + baseE.newText.length : -1;
}
function computeDiff(original, modified, offset, editData, options) {
    const originalLines = original.split(/\r\n|\r|\n/);
    const modifiedLines = modified.split(/\r\n|\r|\n/);
    const diffComputer = new defaultLinesDiffComputer_1.DefaultLinesDiffComputer();
    const result = diffComputer.computeDiff(originalLines, modifiedLines, options);
    if (result.hitTimeout) {
        return undefined;
    }
    const originalText = new abstractText_1.StringText(original);
    const modifiedText = new abstractText_1.StringText(modified);
    return result.changes.map(change => (change.innerChanges || []).map(innerChange => {
        const range = originalText.getTransformer().getOffsetRange(innerChange.originalRange);
        const newText = modifiedText.getValueOfRange(innerChange.modifiedRange);
        return new stringEdit_1.AnnotatedStringReplacement(range.delta(offset), newText, editData);
    })).flat();
}
//# sourceMappingURL=editRebase.js.map
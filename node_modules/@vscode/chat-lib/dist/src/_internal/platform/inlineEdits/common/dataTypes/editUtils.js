"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeStringEdit = serializeStringEdit;
exports.serializeSingleEdit = serializeSingleEdit;
exports.deserializeStringEdit = deserializeStringEdit;
exports.decomposeStringEdit = decomposeStringEdit;
const errors_1 = require("../../../../util/vs/base/common/errors");
const stringEdit_1 = require("../../../../util/vs/editor/common/core/edits/stringEdit");
const offsetRange_1 = require("../../../../util/vs/editor/common/core/ranges/offsetRange");
const edit_1 = require("./edit");
function serializeStringEdit(edit) {
    return edit.replacements.map(e => serializeSingleEdit(e));
}
function serializeSingleEdit(edit) {
    return [edit.replaceRange.start, edit.replaceRange.endExclusive, edit.newText];
}
function deserializeStringEdit(serialized) {
    return new stringEdit_1.StringEdit(serialized.map(e => deserializeSingleEdit(e)));
}
function deserializeSingleEdit(serialized) {
    return new stringEdit_1.StringReplacement(new offsetRange_1.OffsetRange(serialized[0], serialized[1]), serialized[2]);
}
/**
 * For every single text edit, it creates a new edit.
 * If permutation is not given, decomposed in-order.
 */
function decomposeStringEdit(edit, permutation) {
    if (permutation === undefined) {
        const result = [];
        let offset = 0;
        for (const e of edit.replacements) {
            result.push(e.delta(offset));
            offset += e.newText.length - e.replaceRange.length;
        }
        return new edit_1.SingleEdits(result);
    }
    if (edit.replacements.length !== permutation.arrayLength) {
        throw (0, errors_1.illegalArgument)(`Number of edits ${edit.replacements.length} does not match ${permutation.arrayLength}`);
    }
    const result = [];
    const sortedSingleEdits = edit.replacements.slice();
    for (let i = 0; i < edit.replacements.length; ++i) {
        const idxInEdits = permutation.mapIndexBack(i);
        const singleEdit = sortedSingleEdits[idxInEdits];
        result.push(singleEdit);
        // move all edits that occur after `singleEdit`
        for (let j = idxInEdits; j < sortedSingleEdits.length; ++j) {
            const offsetDelta = singleEdit.newText.length - singleEdit.replaceRange.length;
            const e = sortedSingleEdits[j];
            sortedSingleEdits[j] = e.delta(offsetDelta);
        }
    }
    return new edit_1.SingleEdits(result);
}
//# sourceMappingURL=editUtils.js.map
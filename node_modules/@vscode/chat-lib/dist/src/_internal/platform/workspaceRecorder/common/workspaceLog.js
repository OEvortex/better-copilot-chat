"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentLogEntry = void 0;
exports.serializeOffsetRange = serializeOffsetRange;
exports.deserializeOffsetRange = deserializeOffsetRange;
exports.serializeEdit = serializeEdit;
exports.deserializeEdit = deserializeEdit;
const stringEdit_1 = require("../../../util/vs/editor/common/core/edits/stringEdit");
const offsetRange_1 = require("../../../util/vs/editor/common/core/ranges/offsetRange");
var DocumentLogEntry;
(function (DocumentLogEntry) {
    function is(entry) {
        return !!entry && typeof entry === 'object' && 'id' in entry && 'time' in entry;
    }
    DocumentLogEntry.is = is;
})(DocumentLogEntry || (exports.DocumentLogEntry = DocumentLogEntry = {}));
function serializeOffsetRange(offsetRange) {
    return [offsetRange.start, offsetRange.endExclusive];
}
function deserializeOffsetRange(serialized) {
    return new offsetRange_1.OffsetRange(serialized[0], serialized[1]);
}
function serializeEdit(edit) {
    return edit.replacements.map(e => [e.replaceRange.start, e.replaceRange.endExclusive, e.newText]);
}
function deserializeEdit(serialized) {
    return stringEdit_1.StringEdit.create(serialized.map(e => stringEdit_1.StringReplacement.replace(new offsetRange_1.OffsetRange(e[0], e[1]), e[2])));
}
//# sourceMappingURL=workspaceLog.js.map
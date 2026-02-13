"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.IgnoreImportChangesAspect = void 0;
const arrays_1 = require("../../../util/vs/base/common/arrays");
const importStatement_1 = require("../../prompt/common/importStatement");
class IgnoreImportChangesAspect {
    static isImportChange(edit, languageId, lines) {
        return edit.newLines.some(l => (0, importStatement_1.isImportStatement)(l, languageId)) || getOldLines(edit, lines).some(l => (0, importStatement_1.isImportStatement)(l, languageId));
    }
    static filterEdit(resultDocument, singleEdits) {
        const languageId = resultDocument.languageId;
        const filteredEdits = singleEdits.filter(e => !IgnoreImportChangesAspect.isImportChange(e, languageId, resultDocument.documentLinesBeforeEdit));
        return filteredEdits;
    }
}
exports.IgnoreImportChangesAspect = IgnoreImportChangesAspect;
function getOldLines(edit, lines) {
    return (0, arrays_1.coalesce)(edit.lineRange.mapToLineArray(l => lines[l - 1]));
}
//# sourceMappingURL=importFiltering.js.map
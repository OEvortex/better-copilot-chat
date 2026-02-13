"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RootedLineEdit = void 0;
const lineEdit_1 = require("../../../../util/vs/editor/common/core/edits/lineEdit");
const positionToOffset_1 = require("../../../../util/vs/editor/common/core/text/positionToOffset");
const edit_1 = require("./edit");
(0, positionToOffset_1.ensureDependenciesAreSet)();
class RootedLineEdit {
    static fromEdit(edit) {
        const lineEdit = lineEdit_1.LineEdit.fromStringEdit(edit.edit, edit.base);
        return new RootedLineEdit(edit.base, lineEdit);
    }
    constructor(base, edit) {
        this.base = base;
        this.edit = edit;
    }
    toString() {
        return this.edit.humanReadablePatch(this.base.getLines());
    }
    toEdit() {
        return this.edit.toEdit(this.base);
    }
    toRootedEdit() {
        return new edit_1.RootedEdit(this.base, this.toEdit());
    }
    getEditedState() {
        const lines = this.base.getLines();
        const newLines = this.edit.apply(lines);
        return newLines;
    }
    removeCommonSuffixPrefixLines() {
        const isNotEmptyEdit = (edit) => !edit.lineRange.isEmpty || edit.newLines.length > 0;
        const newEdit = this.edit.replacements.map(e => e.removeCommonSuffixPrefixLines(this.base)).filter(e => isNotEmptyEdit(e));
        return new RootedLineEdit(this.base, new lineEdit_1.LineEdit(newEdit));
    }
}
exports.RootedLineEdit = RootedLineEdit;
//# sourceMappingURL=rootedLineEdit.js.map
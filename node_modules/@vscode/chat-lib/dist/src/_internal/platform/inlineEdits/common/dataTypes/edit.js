"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Edits = exports.SingleEdits = exports.RootedEdit = void 0;
const assert_1 = require("../../../../util/vs/base/common/assert");
const lineEdit_1 = require("../../../../util/vs/editor/common/core/edits/lineEdit");
const stringEdit_1 = require("../../../../util/vs/editor/common/core/edits/stringEdit");
const editUtils_1 = require("./editUtils");
const rootedLineEdit_1 = require("./rootedLineEdit");
class RootedEdit {
    static toLineEdit(edit) {
        return lineEdit_1.LineEdit.fromStringEdit(edit.edit, edit.base);
    }
    constructor(base, edit) {
        this.base = base;
        this.edit = edit;
    }
    getEditedState() {
        return this.edit.applyOnText(this.base);
    }
    /**
     * Creates a rooted edit `r`, such that
     * * `r.initialState.equals(this.initialState.apply(onto))`
     * * `(r.initialState.apply(r.edit)).equals(this.initialState.apply(onto).apply(this.edit))`
    */
    rebase(onto) {
        const result = null;
        // TODO implement
        (0, assert_1.assertFn)(() => result.base.equals(onto.applyOnText(this.base)));
        (0, assert_1.assertFn)(() => result.edit.applyOnText(result.base).equals(this.edit.applyOnText(onto.applyOnText(this.base))));
        return result;
    }
    toString() {
        const e = rootedLineEdit_1.RootedLineEdit.fromEdit(this);
        return e.toString();
    }
    /**
     * If `r.base.equals(this.base)` and `r.getEditedState().equals(this.getEditedState())`, then `r.normalize().equals(this.normalize())`.
    */
    normalize() {
        return new RootedEdit(this.base, this.edit.normalizeOnSource(this.base.value));
    }
    equals(other) {
        return this.base.equals(other.base) && this.edit.equals(other.edit);
    }
}
exports.RootedEdit = RootedEdit;
/**
 * Represents a sequence of single edits.
*/
class SingleEdits {
    constructor(
    /**
     * The edits are applied in order and don't have to be sorted.
    */
    edits) {
        this.edits = edits;
    }
    compose() {
        return stringEdit_1.StringEdit.compose(this.edits.map(e => e.toEdit()));
    }
    apply(value) {
        return this.compose().apply(value);
    }
    isEmpty() {
        return this.edits.length === 0;
    }
    toEdits() {
        return new Edits(stringEdit_1.StringEdit, this.edits.map(e => e.toEdit()));
    }
}
exports.SingleEdits = SingleEdits;
/**
 * Represents a sequence of edits.
*/
class Edits {
    static single(edit) {
        return new Edits(stringEdit_1.StringEdit, [edit]);
    }
    constructor(_editType, 
    /**
     * The edits are applied in given order and don't have to be sorted.
     * Least to most recent.
     */
    edits) {
        this._editType = _editType;
        this.edits = edits;
    }
    compose() {
        let edit = new this._editType([]);
        for (const e of this.edits) {
            edit = edit.compose(e);
        }
        return edit;
    }
    add(edit) {
        return new Edits(this._editType, [...this.edits, edit]);
    }
    apply(value) {
        return this.compose().apply(value);
    }
    isEmpty() {
        return this.edits.length === 0;
    }
    swap(editFirst) {
        let eM = editFirst;
        const newEdits = [];
        for (const e of this.edits) {
            const e_ = stringEdit_1.BaseStringEdit.trySwap(eM, e);
            if (!e_) {
                return undefined;
            }
            newEdits.push(e_.e1);
            eM = e_.e2;
        }
        return { edits: new Edits(stringEdit_1.StringEdit, newEdits), editLast: eM };
    }
    /*mapData<T2 extends IEditData<T2> | void = void>(f: (data: T) => T2): Edits<T2> {
        return new Edits(this.edits.map(e => e.mapData(f)));
    }*/
    serialize() {
        return this.edits.map(e => (0, editUtils_1.serializeStringEdit)(e));
    }
    static deserialize(v) {
        return new Edits(stringEdit_1.StringEdit, v.map(e => (0, editUtils_1.deserializeStringEdit)(e)));
    }
    toHumanReadablePatch(base) {
        let curBase = base;
        const result = [];
        for (const edit of this.edits) {
            const lineEdit = RootedEdit.toLineEdit(new RootedEdit(curBase, edit));
            result.push(lineEdit.humanReadablePatch(curBase.getLines()));
            curBase = edit.applyOnText(curBase);
        }
        return result.join('\n---\n');
    }
}
exports.Edits = Edits;
//# sourceMappingURL=edit.js.map
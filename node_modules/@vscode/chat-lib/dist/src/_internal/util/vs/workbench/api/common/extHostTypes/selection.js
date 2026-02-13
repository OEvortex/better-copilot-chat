"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var Selection_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Selection = void 0;
exports.getDebugDescriptionOfSelection = getDebugDescriptionOfSelection;
const es5ClassCompat_1 = require("./es5ClassCompat");
const position_1 = require("./position");
const range_1 = require("./range");
let Selection = Selection_1 = class Selection extends range_1.Range {
    static isSelection(thing) {
        if (thing instanceof Selection_1) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return range_1.Range.isRange(thing)
            && position_1.Position.isPosition(thing.anchor)
            && position_1.Position.isPosition(thing.active)
            && typeof thing.isReversed === 'boolean';
    }
    get anchor() {
        return this._anchor;
    }
    get active() {
        return this._active;
    }
    constructor(anchorLineOrAnchor, anchorColumnOrActive, activeLine, activeColumn) {
        let anchor;
        let active;
        if (typeof anchorLineOrAnchor === 'number' && typeof anchorColumnOrActive === 'number' && typeof activeLine === 'number' && typeof activeColumn === 'number') {
            anchor = new position_1.Position(anchorLineOrAnchor, anchorColumnOrActive);
            active = new position_1.Position(activeLine, activeColumn);
        }
        else if (position_1.Position.isPosition(anchorLineOrAnchor) && position_1.Position.isPosition(anchorColumnOrActive)) {
            anchor = position_1.Position.of(anchorLineOrAnchor);
            active = position_1.Position.of(anchorColumnOrActive);
        }
        if (!anchor || !active) {
            throw new Error('Invalid arguments');
        }
        super(anchor, active);
        this._anchor = anchor;
        this._active = active;
    }
    get isReversed() {
        return this._anchor === this._end;
    }
    toJSON() {
        return {
            start: this.start,
            end: this.end,
            active: this.active,
            anchor: this.anchor
        };
    }
    [Symbol.for('debug.description')]() {
        return getDebugDescriptionOfSelection(this);
    }
};
exports.Selection = Selection;
exports.Selection = Selection = Selection_1 = __decorate([
    es5ClassCompat_1.es5ClassCompat
], Selection);
function getDebugDescriptionOfSelection(selection) {
    let rangeStr = (0, range_1.getDebugDescriptionOfRange)(selection);
    if (!selection.isEmpty) {
        if (selection.active.isEqual(selection.start)) {
            rangeStr = `|${rangeStr}`;
        }
        else {
            rangeStr = `${rangeStr}|`;
        }
    }
    return rangeStr;
}
//# sourceMappingURL=selection.js.map
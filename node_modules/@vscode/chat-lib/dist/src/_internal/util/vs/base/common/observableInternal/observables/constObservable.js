"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.constObservable = constObservable;
const baseObservable_1 = require("./baseObservable");
/**
 * Represents an efficient observable whose value never changes.
 */
function constObservable(value) {
    return new ConstObservable(value);
}
class ConstObservable extends baseObservable_1.ConvenientObservable {
    constructor(value) {
        super();
        this.value = value;
    }
    get debugName() {
        return this.toString();
    }
    get() {
        return this.value;
    }
    addObserver(observer) {
        // NO OP
    }
    removeObserver(observer) {
        // NO OP
    }
    log() {
        return this;
    }
    toString() {
        return `Const: ${this.value}`;
    }
}
//# sourceMappingURL=constObservable.js.map
"use strict";
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservableSet = void 0;
const observableValueOpts_1 = require("./observables/observableValueOpts");
class ObservableSet {
    constructor() {
        this._data = new Set();
        this._obs = (0, observableValueOpts_1.observableValueOpts)({ equalsFn: () => false }, this);
        this.observable = this._obs;
    }
    get size() {
        return this._data.size;
    }
    has(value) {
        return this._data.has(value);
    }
    add(value, tx) {
        const hadValue = this._data.has(value);
        if (!hadValue) {
            this._data.add(value);
            this._obs.set(this, tx);
        }
        return this;
    }
    delete(value, tx) {
        const result = this._data.delete(value);
        if (result) {
            this._obs.set(this, tx);
        }
        return result;
    }
    clear(tx) {
        if (this._data.size > 0) {
            this._data.clear();
            this._obs.set(this, tx);
        }
    }
    forEach(callbackfn, thisArg) {
        this._data.forEach((value, value2, _set) => {
            // eslint-disable-next-line local/code-no-any-casts
            callbackfn.call(thisArg, value, value2, this);
        });
    }
    *entries() {
        for (const value of this._data) {
            yield [value, value];
        }
    }
    *keys() {
        yield* this._data.keys();
    }
    *values() {
        yield* this._data.values();
    }
    [Symbol.iterator]() {
        return this.values();
    }
    get [Symbol.toStringTag]() {
        return 'ObservableSet';
    }
}
exports.ObservableSet = ObservableSet;
//# sourceMappingURL=set.js.map